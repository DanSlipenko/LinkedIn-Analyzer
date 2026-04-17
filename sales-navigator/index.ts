import "dotenv/config";
import { writeFileSync } from "fs";
import { join } from "path";
import { chromium, Browser, Page } from "playwright";
import { Client } from "@notionhq/client";

interface Lead {
  name: string;
  company: string;
  status: string;
}

const CDP_URL = "http://localhost:9222";
const OUTPUT_FILE = join(__dirname, "leads.json");

const NOTION_DB_ID = process.env.NOTION_DB_ID;
const notion = process.env.NOTION_API ? new Client({ auth: process.env.NOTION_API }) : null;

async function connectToSalesNav(): Promise<{ browser: Browser; page: Page }> {
  console.log(`🔌 Connecting to Chrome at ${CDP_URL}...`);
  let browser: Browser;
  try {
    browser = await chromium.connectOverCDP(CDP_URL);
  } catch (err) {
    console.error("❌ Could not connect to Chrome.");
    console.error("   Start Chrome with: --remote-debugging-port=9222");
    process.exit(1);
  }

  const allPages = browser.contexts().flatMap((c) => c.pages());
  const salesPages = allPages.filter((p) => p.url().includes("linkedin.com/sales"));

  if (salesPages.length === 0) {
    console.error("❌ No Sales Navigator tab found. Open a Sales Navigator search first.");
    process.exit(1);
  }

  const page = salesPages[0];
  console.log(`✅ Using tab: ${page.url()}`);
  return { browser, page };
}

async function getNotionPropertyNames(): Promise<{ titleProp: string; descriptionProp: string | null }> {
  if (!notion || !NOTION_DB_ID) throw new Error("Notion not configured");

  let properties: Record<string, any> | undefined;

  // Old API (pre-2025-09-03): properties live directly on the database.
  const db: any = await (notion as any).databases.retrieve({ database_id: NOTION_DB_ID });
  if (db && db.properties) {
    properties = db.properties;
  } else if (db && Array.isArray(db.data_sources) && db.data_sources.length > 0) {
    // New API (@notionhq/client v5): properties live on data sources, not the database.
    const dsId = db.data_sources[0].id;
    const ds: any = await (notion as any).dataSources.retrieve({ data_source_id: dsId });
    properties = ds?.properties;
  }

  if (!properties) {
    throw new Error("Could not locate properties on database or its data sources");
  }

  let titleProp = "";
  let descriptionProp: string | null = null;

  for (const [name, prop] of Object.entries<any>(properties)) {
    if (prop.type === "title") titleProp = name;
    if (prop.type === "rich_text") {
      // Prefer a property literally called "Description" if present.
      if (name.toLowerCase() === "description") descriptionProp = name;
      else if (!descriptionProp) descriptionProp = name;
    }
  }

  return { titleProp, descriptionProp };
}

async function addLeadToNotion(lead: Lead, titleProp: string, descriptionProp: string | null): Promise<void> {
  if (!notion || !NOTION_DB_ID) return;

  const properties: Record<string, any> = {
    [titleProp]: { title: [{ text: { content: lead.name } }] },
  };
  if (descriptionProp) {
    properties[descriptionProp] = {
      rich_text: [{ text: { content: lead.company } }],
    };
  }

  await notion.pages.create({
    parent: { database_id: NOTION_DB_ID },
    properties,
  });
}

// NOTE: page.evaluate bodies are passed as strings, not functions.
// tsx/esbuild injects `__name()` helpers around compiled functions, and those
// references get serialized into the browser context where `__name` doesn't
// exist — causing a `ReferenceError: __name is not defined`. Passing a string
// skips serialization entirely. See scraper.js for the same workaround.

// Sales Navigator virtualizes the list — items unmount when scrolled out of
// view, so we must collect lead data incrementally while scrolling, not after.
// Also, the list may live inside an inner scrollable container rather than the
// window, so we detect that first (matching the approach in add-to-list.ts).
async function scrapeAllLeadsOnPage(page: Page): Promise<Lead[]> {
  const script = `(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const leadsMap = new Map(); // keyed by name to dedupe

    const findScrollContainer = () => {
      const anyItem = document.querySelector("li.artdeco-list__item");
      let el = anyItem ? anyItem.parentElement : null;
      while (el && el !== document.body) {
        const style = getComputedStyle(el);
        const canScroll = /(auto|scroll)/.test(style.overflowY + style.overflow);
        if (canScroll && el.scrollHeight > el.clientHeight + 10) return el;
        el = el.parentElement;
      }
      return null;
    };
    const container = findScrollContainer();
    const scrollY = () => (container ? container.scrollTop : window.scrollY);
    const scrollBy = (dy) => {
      if (container) container.scrollTop += dy;
      else window.scrollBy(0, dy);
    };
    const scrollToTop = async () => {
      for (let i = 0; i < 15; i++) {
        if (container) container.scrollTop = 0;
        window.scrollTo(0, 0);
        await sleep(200);
        if (scrollY() === 0) break;
      }
    };
    const scrollToBottom = () => {
      if (container) container.scrollTop = container.scrollHeight;
      else window.scrollTo(0, document.documentElement.scrollHeight);
    };
    const atBottom = () => {
      if (container) {
        return container.scrollTop + container.clientHeight >= container.scrollHeight - 10;
      }
      return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 10;
    };

    const collect = () => {
      document.querySelectorAll("li.artdeco-list__item").forEach((item) => {
        const nameEl = item.querySelector('[data-anonymize="person-name"]');
        if (!nameEl) return;
        const name = nameEl.innerText.trim();
        if (!name || leadsMap.has(name)) return;

        let company = "";
        const companyEl = item.querySelector('[data-anonymize="company-name"]');
        if (companyEl && companyEl.innerText) {
          company = companyEl.innerText.trim();
        }
        if (!company) {
          const hovercardBtn = item.querySelector('button[aria-label^="See more about"]');
          if (hovercardBtn) {
            const label = hovercardBtn.getAttribute("aria-label") || "";
            company = label.replace(/^See more about\\s*/i, "").trim();
          }
        }
        if (!company) {
          const subtitle = item.querySelector('.artdeco-entity-lockup__subtitle');
          if (subtitle) {
            const clone = subtitle.cloneNode(true);
            const titleSpan = clone.querySelector('[data-anonymize="title"]');
            if (titleSpan) titleSpan.remove();
            const btns = clone.querySelectorAll('button');
            btns.forEach((b) => b.remove());
            company = (clone.textContent || "").replace(/\\s+/g, " ").replace(/^[·•\\s]+/, "").trim();
          }
        }

        leadsMap.set(name, { name, company, status: "in progress" });
      });
    };

    // Start from top
    await scrollToTop();
    await sleep(400);
    collect();

    // Scroll down incrementally, collecting as we go
    let stable = 0;
    let lastY = -1;
    for (let i = 0; i < 60 && stable < 3; i++) {
      scrollBy(600);
      await sleep(400);
      collect();

      const y = scrollY();
      if (atBottom() || y === lastY) stable++;
      else stable = 0;
      lastY = y;
    }

    // Final pass at bottom
    scrollToBottom();
    await sleep(400);
    collect();

    // Scroll back to top
    await scrollToTop();
    await sleep(400);
    collect();

    return Array.from(leadsMap.values());
  })()`;
  return (await page.evaluate(script)) as Lead[];
}

async function goToNextPage(page: Page): Promise<boolean> {
  const script = `(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // Find the current page number from the active pagination button.
    const activeBtn = document.querySelector(
      'li.artdeco-pagination__indicator--number.active button,' +
      'li.artdeco-pagination__indicator--number.selected button'
    );
    if (!activeBtn) return false;

    const currentLabel = activeBtn.getAttribute("aria-label") || "";
    const currentNum = parseInt(currentLabel.replace(/\\D/g, ""), 10);
    if (!currentNum) return false;

    const nextNum = currentNum + 1;

    // Look for a button with aria-label="Page N+1" anywhere in the pagination.
    const nextBtn = document.querySelector(
      'button[aria-label="Page ' + nextNum + '"]'
    );
    if (!nextBtn) return false;

    nextBtn.scrollIntoView({ block: "center" });
    await sleep(200);
    nextBtn.click();
    await sleep(2500);
    return true;
  })()`;
  return (await page.evaluate(script)) as boolean;
}

(async () => {
  const { page } = await connectToSalesNav();

  let titleProp = "Name";
  let descriptionProp: string | null = "Description";

  if (notion && NOTION_DB_ID) {
    try {
      const props = await getNotionPropertyNames();
      titleProp = props.titleProp || titleProp;
      descriptionProp = props.descriptionProp;
      console.log(`📝 Notion DB — title: "${titleProp}", description: "${descriptionProp ?? "(none)"}"`);
    } catch (err) {
      console.error("⚠️ Couldn't fetch Notion schema:", (err as Error).message);
    }
  } else {
    console.warn("⚠️ Notion not configured (missing NOTION_API or NOTION_DB_ID). JSON only.");
  }

  const allLeads: Lead[] = [];
  let pageNum = 1;

  while (true) {
    console.log(`\n📄 Scraping page ${pageNum}...`);

    // Scroll through the page collecting leads incrementally (virtualized list)
    const leads = await scrapeAllLeadsOnPage(page);
    console.log(`   Found ${leads.length} leads on page ${pageNum}.`);

    // Step 3: Add leads to Notion
    for (const lead of leads) {
      if (notion && NOTION_DB_ID) {
        try {
          await addLeadToNotion(lead, titleProp, descriptionProp);
          console.log(`   ✅ ${lead.name} — ${lead.company}`);
          await new Promise((r) => setTimeout(r, 350)); // rate-limit
        } catch (err) {
          console.log(`   ❌ Notion failed for ${lead.name}: ${(err as Error).message}`);
        }
      } else {
        console.log(`   • ${lead.name} — ${lead.company}`);
      }
    }

    allLeads.push(...leads);

    // Step 4: Go to next page
    console.log(`\n➡️ Going to page ${pageNum + 1}...`);
    const hasNext = await goToNextPage(page);
    if (!hasNext) {
      console.log("\n📍 No more pages.");
      break;
    }
    pageNum++;
  }

  writeFileSync(OUTPUT_FILE, JSON.stringify(allLeads, null, 2));
  console.log(`\n💾 Saved ${allLeads.length} leads (${pageNum} pages) → ${OUTPUT_FILE}`);
  console.log("🎉 Done.");
  process.exit(0);
})();
