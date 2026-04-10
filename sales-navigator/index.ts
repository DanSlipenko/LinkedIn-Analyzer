import "dotenv/config";
import { writeFileSync } from "fs";
import { join } from "path";
import { chromium, Browser, Page } from "playwright";
import { Client } from "@notionhq/client";

interface Lead {
  name: string;
  company: string;
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

// Sales Navigator lazy-loads each lead as it scrolls into view.
// Scroll incrementally until the count of rendered leads stops growing.
async function scrollToLoadAllLeads(page: Page): Promise<void> {
  const scrollScript = `(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let stable = 0;
    let lastCount = 0;
    for (let i = 0; i < 30 && stable < 3; i++) {
      window.scrollBy(0, 700);
      await sleep(350);
      const count = document.querySelectorAll("li.artdeco-list__item").length;
      if (count === lastCount) stable++;
      else {
        stable = 0;
        lastCount = count;
      }
    }
    window.scrollTo(0, 0);
    await sleep(300);
  })()`;
  await page.evaluate(scrollScript);
}

async function scrapeLeadsOnPage(page: Page): Promise<Lead[]> {
  await scrollToLoadAllLeads(page);

  // Company extraction has three tiers:
  //   1) <a data-anonymize="company-name"> — present when LinkedIn has a
  //      company page (e.g. "ISA" in the Ashley example).
  //   2) hovercard button aria-label="See more about <Company>" — present for
  //      unlinked companies too (e.g. "SLUNKS clothing" in the Sharon example).
  //   3) Subtitle text after the middot — last-ditch fallback when neither of
  //      the above exists.
  const extractScript = `(() => {
    const items = Array.from(document.querySelectorAll("li.artdeco-list__item"));
    const leads = [];
    for (const item of items) {
      const nameEl = item.querySelector('[data-anonymize="person-name"]');
      if (!nameEl) continue;
      const name = nameEl.innerText.trim();
      if (!name) continue;

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
          // Clone so we can strip the role <span data-anonymize="title"> first.
          const clone = subtitle.cloneNode(true);
          const titleSpan = clone.querySelector('[data-anonymize="title"]');
          if (titleSpan) titleSpan.remove();
          const btns = clone.querySelectorAll('button');
          btns.forEach((b) => b.remove());
          company = (clone.textContent || "").replace(/\\s+/g, " ").replace(/^[·•\\s]+/, "").trim();
        }
      }

      leads.push({ name, company });
    }
    return leads;
  })()`;

  return (await page.evaluate(extractScript)) as Lead[];
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

  console.log("\n📄 Scraping current page...");
  const leads = await scrapeLeadsOnPage(page);
  console.log(`   Rendered ${leads.length} leads.`);

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

  writeFileSync(OUTPUT_FILE, JSON.stringify(leads, null, 2));
  console.log(`\n💾 Saved ${leads.length} leads → ${OUTPUT_FILE}`);
  console.log("🎉 Done.");
  process.exit(0);
})();
