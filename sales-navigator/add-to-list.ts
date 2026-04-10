import "dotenv/config";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { chromium, Browser, Page } from "playwright";

interface Lead {
  name: string;
  company: string;
  status?: string;
  reason?: string;
}

const CDP_URL = "http://localhost:9222";
const DIR = __dirname;
const TARGET_LIST = process.env.TARGET_LIST || "Q2 Leads";

function normalize(s: string): string {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Matches "works" / "Works" but NOT "don't work" / "Not work".
function isWorks(status?: string): boolean {
  const s = normalize(status || "");
  return s === "works" || s === "work";
}

function loadWorksLeads(): Map<string, { lead: Lead; file: string }> {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));
  const map = new Map<string, { lead: Lead; file: string }>();

  for (const file of files) {
    let data: unknown;
    try {
      data = JSON.parse(readFileSync(join(DIR, file), "utf8"));
    } catch {
      continue;
    }
    if (!Array.isArray(data)) continue;

    const leads = data as Lead[];
    const worksCount = leads.filter((l) => isWorks(l.status)).length;
    console.log(`📖 ${file}: ${worksCount}/${leads.length} marked "works"`);

    for (const lead of leads) {
      if (!lead.name || !isWorks(lead.status)) continue;
      map.set(normalize(lead.name), { lead, file });
    }
  }
  return map;
}

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

// Sales Nav virtualizes the list — items unmount once scrolled out of view.
// Scroll top-to-bottom and accumulate names as they render, so we capture
// every lead on the page even though no single DOM snapshot contains them all.
// Then scroll back to the top so subsequent per-lead scroll-into-view starts
// from a consistent position.
async function collectAllLeadNames(page: Page): Promise<string[]> {
  const script = `(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const namesSet = new Set();

    // The result list might live inside an inner scrollable container instead
    // of the window. Find the nearest scrollable ancestor of a list item once.
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
      // Loop until scroll stops changing — handles lazy re-layout that
      // re-expands content above us after we hit the top once.
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
      document.querySelectorAll("li.artdeco-list__item").forEach((el) => {
        const n = el.querySelector('[data-anonymize="person-name"]');
        if (n && n.innerText) namesSet.add(n.innerText.trim());
      });
    };

    await scrollToTop();
    await sleep(400);
    collect();

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

    // One more pass at the very bottom, then all the way back to top.
    scrollToBottom();
    await sleep(400);
    collect();
    await scrollToTop();
    await sleep(400);
    collect();

    return Array.from(namesSet);
  })()`;
  return (await page.evaluate(script)) as string[];
}

// Scroll until a lead with the given name is actually mounted in the DOM,
// then center it in the viewport so its action buttons are clickable.
async function scrollLeadIntoView(page: Page, leadName: string): Promise<boolean> {
  const body =
    `(async (leadName) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const norm = (s) => (s || "").trim().toLowerCase().replace(/\\s+/g, " ");
    const target = norm(leadName);

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
    const atBottom = () => {
      if (container) {
        return container.scrollTop + container.clientHeight >= container.scrollHeight - 10;
      }
      return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 10;
    };

    const findRow = () => {
      const items = Array.from(document.querySelectorAll("li.artdeco-list__item"));
      return items.find((el) => {
        const n = el.querySelector('[data-anonymize="person-name"]');
        return n && norm(n.innerText) === target;
      });
    };

    // Fast path: already rendered.
    let row = findRow();
    if (row) {
      row.scrollIntoView({ block: "center" });
      await sleep(400);
      return true;
    }

    // Start from the very top and scroll down until the row appears.
    await scrollToTop();
    await sleep(400);

    for (let i = 0; i < 80; i++) {
      row = findRow();
      if (row) {
        row.scrollIntoView({ block: "center" });
        await sleep(400);
        return true;
      }

      const beforeY = scrollY();
      scrollBy(500);
      await sleep(350);

      if (atBottom()) {
        row = findRow();
        if (row) {
          row.scrollIntoView({ block: "center" });
          await sleep(400);
          return true;
        }
        return false;
      }
      if (scrollY() === beforeY) return false; // couldn't scroll further
    }
    return false;
  })(` +
    JSON.stringify(leadName) +
    `)`;
  return (await page.evaluate(body)) as boolean;
}

// Opens the lead's "Save" / more-actions menu and clicks the target custom list.
// Sales Navigator exposes saving via a few different controls depending on the
// lead state — try them in order, falling back to more-actions.
async function addLeadToList(
  page: Page,
  leadName: string,
  targetList: string,
): Promise<{ ok: boolean; alreadyAdded?: boolean; reason?: string }> {
  const body =
    `(async (leadName, targetList) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const norm = (s) => (s || "").trim().toLowerCase().replace(/\\s+/g, " ");

    const items = Array.from(document.querySelectorAll("li.artdeco-list__item"));
    const row = items.find((el) => {
      const n = el.querySelector('[data-anonymize="person-name"]');
      return n && norm(n.innerText) === norm(leadName);
    });
    if (!row) return { ok: false, reason: "row-not-found" };

    row.scrollIntoView({ block: "center" });
    await sleep(250);

    const closePopover = () => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    };

    // Find the "Save" / more-actions trigger on the row to open the list popover.
    const trigger =
      row.querySelector('button[aria-haspopup][aria-label*="Save" i]') ||
      row.querySelector('button[aria-label*="Add to list" i]') ||
      row.querySelector('button[aria-label*="More actions" i]') ||
      row.querySelector('button[aria-label*="Open menu" i]') ||
      row.querySelector('button[aria-label*="Saved" i]') ||
      row.querySelector('button[aria-label*="Save" i]');

    if (!trigger) return { ok: false, reason: "trigger-not-found" };

    trigger.click();
    await sleep(700);

    // Locate the list popover that just opened. LinkedIn's Hue menu uses ids
    // starting with "hue-menu"; fall back to role="menu" containers that hold
    // list-option buttons.
    const popovers = Array.from(
      document.querySelectorAll('[id^="hue-menu"], [role="menu"]')
    );
    const popover = popovers.find((p) => {
      if (p.getAttribute("aria-hidden") === "true") return false;
      return !!p.querySelector('button[aria-label*="list with" i]');
    });
    if (!popover) {
      closePopover();
      return { ok: false, reason: "popover-not-found" };
    }

    // Every list-option button has an aria-label of the shape:
    //   "Add <person> to <ListName> list with N leads"     (not yet in list)
    //   "Remove <person> from <ListName> list with N leads" (already in list)
    // The inner span with class "_list-name_..." holds the raw list name,
    // which is the stable way to match (CSS-module hash suffixes can change).
    const listButtons = Array.from(
      popover.querySelectorAll('button[aria-label*="list with" i]')
    );
    const targetNorm = norm(targetList);

    const matching = listButtons.filter((btn) => {
      const nameSpan = btn.querySelector('[class*="list-name"]');
      if (nameSpan && norm(nameSpan.textContent) === targetNorm) return true;
      // Fallback: check the aria-label text directly.
      const label = norm(btn.getAttribute("aria-label") || "");
      return (
        label.includes(" to " + targetNorm + " list") ||
        label.includes(" from " + targetNorm + " list")
      );
    });

    if (matching.length === 0) {
      closePopover();
      return { ok: false, reason: "list-option-not-found" };
    }

    // The target list may appear twice (once under "Recently used list", once
    // under "Your custom lists") — both toggle the same state, so either works.
    const option = matching[0];
    const ariaLabel = option.getAttribute("aria-label") || "";

    // "Remove ..." = the lead is already in this list and the checkmark is
    // showing. DO NOT click, or we'd toggle it back off.
    if (/^\\s*Remove\\b/i.test(ariaLabel)) {
      closePopover();
      return { ok: true, alreadyAdded: true };
    }

    // "Add ..." = safe to click.
    if (/^\\s*Add\\b/i.test(ariaLabel)) {
      option.click();
      await sleep(500);
      closePopover();
      return { ok: true, alreadyAdded: false };
    }

    // Anything else: unknown state — bail rather than clicking blindly.
    closePopover();
    return { ok: false, reason: "unknown-button-state" };
  })(` +
    JSON.stringify(leadName) +
    `, ` +
    JSON.stringify(targetList) +
    `)`;

  return (await page.evaluate(body)) as { ok: boolean; alreadyAdded?: boolean; reason?: string };
}

async function goToNextPage(page: Page): Promise<boolean> {
  const script = `(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const nextBtn = document.querySelector('button[aria-label="Next"]');
    if (!nextBtn || nextBtn.disabled) return false;
    nextBtn.scrollIntoView({ block: "center" });
    await sleep(200);
    nextBtn.click();
    await sleep(1800);
    return true;
  })()`;
  return (await page.evaluate(script)) as boolean;
}

(async () => {
  const worksMap = loadWorksLeads();
  console.log(`\n🎯 Target list: "${TARGET_LIST}"`);
  console.log(`📋 Total unique "works" leads loaded: ${worksMap.size}`);

  if (worksMap.size === 0) {
    console.error('❌ No leads with status "works" found in any JSON file. Exiting.');
    process.exit(1);
  }

  const { page } = await connectToSalesNav();

  let pageNum = 1;
  let totalScanned = 0;
  let totalMatched = 0;
  let totalAdded = 0;
  let totalAlreadyAdded = 0;
  let totalFailed = 0;

  while (true) {
    console.log(`\n📄 Page ${pageNum}`);

    // Pass 1: scroll through the whole page and collect every lead name.
    // The list is virtualized, so this is the only reliable way to see all of them.
    const names = await collectAllLeadNames(page);
    console.log(`   Found ${names.length} leads on page (full scroll)`);
    totalScanned += names.length;

    let pageMatched = 0;
    let pageAdded = 0;
    let pageAlreadyAdded = 0;

    // Pass 2: for each matching lead, scroll it back into view and save it.
    // We must re-mount the row before clicking — it may have been unmounted
    // when we scrolled past it during collection.
    for (const name of names) {
      const entry = worksMap.get(normalize(name));
      if (!entry) continue;
      pageMatched++;

      const scrolled = await scrollLeadIntoView(page, name);
      if (!scrolled) {
        totalFailed++;
        console.log(`   ❌ Failed (could-not-scroll-into-view): ${name}`);
        continue;
      }

      const result = await addLeadToList(page, name, TARGET_LIST);
      if (result.ok && result.alreadyAdded) {
        pageAlreadyAdded++;
        console.log(`   ⏭️  Already in list: ${name}`);
      } else if (result.ok) {
        pageAdded++;
        console.log(`   ✅ Added: ${name}`);
      } else {
        totalFailed++;
        console.log(`   ❌ Failed (${result.reason}): ${name}`);
      }
      await new Promise((r) => setTimeout(r, 600)); // gentle rate-limit
    }

    console.log(
      `   📊 Page ${pageNum}: ${pageAdded} added, ${pageAlreadyAdded} already in list, out of ${names.length} (${pageMatched} matched JSON)`,
    );
    totalMatched += pageMatched;
    totalAdded += pageAdded;
    totalAlreadyAdded += pageAlreadyAdded;

    const hasNext = await goToNextPage(page);
    if (!hasNext) {
      console.log("\n🏁 No more pages.");
      break;
    }
    pageNum++;
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(
    `\n📈 Summary: ${totalAdded} added to "${TARGET_LIST}", ${totalAlreadyAdded} already in list, ` +
      `out of ${totalScanned} scanned (${totalMatched} matched "works" in JSON, ${totalFailed} failed)`,
  );
  process.exit(0);
})();
