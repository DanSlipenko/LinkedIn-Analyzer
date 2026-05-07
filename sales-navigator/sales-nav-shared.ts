import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { chromium, Browser, Page } from "playwright";

export interface Lead {
  name: string;
  company: string;
  status?: string;
  reason?: string;
  linkedIn?: { status?: string };
}

export const CDP_URL = "http://localhost:9222";

export function normalize(s: string): string {
  return (s || "")
    .trim()
    .toLowerCase()
    // Normalize curly/smart apostrophes to a plain ASCII apostrophe so
    // "Doesn't Work" and "Doesn't Work" compare equal.
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/\s+/g, " ");
}

export function isWorks(status?: string): boolean {
  return normalize(status || "") === "works";
}

export function isDoesntWork(status?: string): boolean {
  const s = normalize(status || "");
  return (
    s === "doesn't work" ||
    s === "does not work" ||
    s === "don't work" ||
    s === "do not work" ||
    s === "not work" ||
    s === "not works"
  );
}

export function loadWorksLeadsFromJsonFiles(dir: string): Map<string, { lead: Lead; file: string }> {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const map = new Map<string, { lead: Lead; file: string }>();

  for (const file of files) {
    let data: unknown;
    try {
      data = JSON.parse(readFileSync(join(dir, file), "utf8"));
    } catch {
      continue;
    }
    if (!Array.isArray(data)) continue;

    const leads = data as Lead[];
    let worksCount = 0;
    let doesntWorkCount = 0;
    const unknownStatuses = new Map<string, number>();

    for (const lead of leads) {
      if (isWorks(lead.status)) {
        worksCount++;
      } else if (isDoesntWork(lead.status)) {
        doesntWorkCount++;
      } else {
        const key = (lead.status || "<empty>").trim();
        unknownStatuses.set(key, (unknownStatuses.get(key) || 0) + 1);
      }
    }

    console.log(
      `📖 ${file}: ${worksCount} works, ${doesntWorkCount} doesn't work, ` +
        `${leads.length - worksCount - doesntWorkCount} other / ${leads.length} total`,
    );
    if (unknownStatuses.size > 0) {
      const summary = Array.from(unknownStatuses.entries())
        .map(([s, n]) => `"${s}"×${n}`)
        .join(", ");
      console.log(`   ⚠️  Unrecognized statuses in ${file}: ${summary}`);
    }

    for (const lead of leads) {
      if (!lead.name || !isWorks(lead.status)) continue;
      map.set(normalize(lead.name), { lead, file });
    }
  }
  return map;
}

export function loadPastLeadNames(dir: string): Set<string> {
  const file = "past-leads.json";
  const path = join(dir, file);
  const names = new Set<string>();

  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    console.log(`⚠️  ${file} not found or invalid JSON; continuing without past-lead skipping.`);
    return names;
  }
  if (!Array.isArray(data)) {
    console.log(`⚠️  ${file} is not an array; continuing without past-lead skipping.`);
    return names;
  }

  for (const lead of data as Lead[]) {
    if (!lead.name) continue;
    names.add(normalize(lead.name));
  }
  console.log(`🗂️  Loaded ${names.size} past lead names from ${file}`);
  return names;
}

/** Names marked `linkedIn.status: "added"` in any JSON file in the directory. */
export function loadLinkedInAddedNames(dir: string): Set<string> {
  const names = new Set<string>();
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    let data: unknown;
    try {
      data = JSON.parse(readFileSync(join(dir, file), "utf8"));
    } catch {
      continue;
    }
    if (!Array.isArray(data)) continue;

    for (const lead of data as Lead[]) {
      if (!lead.name) continue;
      if (normalize(lead.linkedIn?.status || "") === "added") {
        names.add(normalize(lead.name));
      }
    }
  }

  console.log(`📌 Loaded ${names.size} names with linkedIn.status=added (all JSON files)`);
  return names;
}

export async function connectToSalesNav(): Promise<{ browser: Browser; page: Page }> {
  console.log(`🔌 Connecting to Chrome at ${CDP_URL}...`);
  let browser: Browser;
  try {
    browser = await chromium.connectOverCDP(CDP_URL);
  } catch {
    console.error("❌ Could not connect to Chrome.");
    console.error("   Start Chrome with: --remote-debugging-port=9222");
    process.exit(1);
  }

  const allPages = browser.contexts().flatMap((c) => c.pages());
  const salesPages = allPages.filter((p) => p.url().includes("linkedin.com/sales"));
  if (salesPages.length === 0) {
    console.error("❌ No Sales Navigator tab found. Open Sales Navigator in Chrome first.");
    process.exit(1);
  }

  const page = salesPages[0];
  console.log(`✅ Using tab: ${page.url()}`);
  return { browser, page };
}

export async function collectAllLeadNames(page: Page): Promise<string[]> {
  const script = `(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const namesSet = new Set();

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

export async function scrollLeadIntoView(page: Page, leadName: string): Promise<boolean> {
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

    let row = findRow();
    if (row) {
      row.scrollIntoView({ block: "center" });
      await sleep(400);
      return true;
    }

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
      if (scrollY() === beforeY) return false;
    }
    return false;
  })(` +
    JSON.stringify(leadName) +
    `)`;
  return (await page.evaluate(body)) as boolean;
}

export async function addLeadToList(
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

    const listButtons = Array.from(
      popover.querySelectorAll('button[aria-label*="list with" i]')
    );
    const targetNorm = norm(targetList);

    const matching = listButtons.filter((btn) => {
      const nameSpan = btn.querySelector('[class*="list-name"]');
      if (nameSpan && norm(nameSpan.textContent) === targetNorm) return true;
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

    const option = matching[0];
    const ariaLabel = option.getAttribute("aria-label") || "";

    if (/^\\s*Remove\\b/i.test(ariaLabel)) {
      closePopover();
      return { ok: true, alreadyAdded: true };
    }

    if (/^\\s*Add\\b/i.test(ariaLabel)) {
      option.click();
      await sleep(500);
      closePopover();
      return { ok: true, alreadyAdded: false };
    }

    closePopover();
    return { ok: false, reason: "unknown-button-state" };
  })(` +
    JSON.stringify(leadName) +
    `, ` +
    JSON.stringify(targetList) +
    `)`;

  return (await page.evaluate(body)) as { ok: boolean; alreadyAdded?: boolean; reason?: string };
}

export interface LeadSuggestion {
  index: number;
  name: string;
  headline: string;
}

/**
 * Focus Sales Nav's global search input, clear any prior value, and
 * type `query`. Leaves the dropdown open and returns every PERSON
 * suggestion in the "Matching Leads & Accounts" section (skipping
 * company suggestions). Each suggestion's `index` is its position
 * inside that <ul> so the caller can re-target it for clicking.
 */
export async function typeSearchAndPeekLeads(
  page: Page,
  query: string,
): Promise<
  | { ok: true; suggestions: LeadSuggestion[] }
  | { ok: false; reason: "input-not-found" | "no-suggestions" }
> {
  // Real Playwright click on the global search input — JS focus alone
  // doesn't always reopen Sales Nav's typeahead on a profile page.
  const inputSelector =
    'input.search-global-typeahead__input, ' +
    'input[role="combobox"][placeholder*="Search" i], ' +
    'input[aria-label*="Search" i][type="text"], ' +
    'input[placeholder*="Search" i]';
  const input = page.locator(inputSelector).first();

  try {
    await input.waitFor({ state: "visible", timeout: 8_000 });
    await input.click({ timeout: 5_000 });
    await input.fill("");
  } catch {
    return { ok: false, reason: "input-not-found" };
  }

  await page.keyboard.type(query, { delay: 25 });
  await new Promise((r) => setTimeout(r, 1500));

  const peekScript = `(function() {
    ${SUGGESTION_LIST_FINDER}
    const items = findSuggestionItems();
    const out = [];
    for (let i = 0; i < items.length; i++) {
      const li = items[i];
      // Skip company suggestions — they have data-anonymize="company-name"
      // instead of "person-name".
      const nameEl = li.querySelector('[data-anonymize="person-name"]');
      if (!nameEl) continue;
      const headlineEl = li.querySelector('[data-anonymize="headline"]');
      out.push({
        index: i,
        name: (nameEl.textContent || '').replace(/\\s+/g, ' ').trim(),
        headline: headlineEl ? (headlineEl.textContent || '').replace(/\\s+/g, ' ').trim() : '',
      });
    }
    return out;
  })()`;
  const suggestions = (await page.evaluate(peekScript)) as LeadSuggestion[];
  if (!suggestions || suggestions.length === 0) {
    return { ok: false, reason: "no-suggestions" };
  }
  return { ok: true, suggestions };
}

/**
 * Click the suggestion at `index` inside the "Matching Leads & Accounts"
 * <ul>, then wait until the URL is on a /sales/lead/... profile page.
 *
 * The dropdown <li> has no <a> — Sales Nav's Ember view binds the click
 * via event delegation. Synthetic `el.click()` calls don't always
 * trigger that handler, so we use:
 *   1) Playwright's real mouse click on the row (preferred), then
 *   2) a keyboard fallback (ArrowDown × index+1 → Enter) if the click
 *      doesn't navigate within a short window.
 */
export async function clickLeadSuggestion(
  page: Page,
  index: number,
): Promise<{ ok: boolean; reason?: "suggestion-missing" | "click-failed" | "navigation-timeout" }> {
  const liSelector =
    'section.leadaccount-suggestions ul[role="listbox"] li[role="option"], ' +
    'ul.global-typeahead__leadaccount-suggestions-list li[role="option"], ' +
    'ul[role="listbox"][aria-label*="Matching" i] li[role="option"]';
  const li = page.locator(liSelector).nth(index);

  try {
    await li.waitFor({ state: "visible", timeout: 5_000 });
  } catch {
    return { ok: false, reason: "suggestion-missing" };
  }

  // Capture the URL BEFORE clicking. We may already be on /sales/lead/...
  // (i.e. on the previous lead's profile), so a plain waitForURL with the
  // /sales/lead/ regex would resolve instantly. Wait for the URL to
  // CHANGE to a different /sales/lead/ profile.
  const beforeUrl = page.url();
  const waitForUrlChange = () =>
    page.waitForFunction(
      (prev) =>
        location.href !== prev && /\/sales\/lead\//.test(location.href),
      beforeUrl,
      { timeout: 30_000 },
    );

  const navPromise = waitForUrlChange()
    .then(() => "ok" as const)
    .catch(() => "timeout" as const);

  try {
    await li.click({ timeout: 8_000 });
  } catch {
    // Click target may not be what Ember binds to — fall through to the
    // keyboard fallback below.
  }

  const settled = await Promise.race([
    navPromise,
    new Promise<"still-waiting">((r) => setTimeout(() => r("still-waiting"), 4_000)),
  ]);

  if (settled === "still-waiting") {
    try {
      const inputSelector =
        'input.search-global-typeahead__input, ' +
        'input[role="combobox"][placeholder*="Search" i], ' +
        'input[aria-label*="Search" i][type="text"]';
      await page.locator(inputSelector).first().focus({ timeout: 2_000 });
      // ArrowDown × (index+1) lands selection on `items[index]`, then Enter.
      for (let i = 0; i <= index; i++) {
        await page.keyboard.press("ArrowDown");
      }
      await page.keyboard.press("Enter");
    } catch {
      return { ok: false, reason: "click-failed" };
    }
  }

  const final = await navPromise;
  if (final === "timeout") return { ok: false, reason: "navigation-timeout" };
  return { ok: true };
}

/**
 * Shared snippet (string-injected; tsx adds helpers to function values
 * passed to evaluate which break in the page). Returns the ordered
 * <li role="option"> elements inside the typeahead's
 * "Matching Leads & Accounts" section. Companies and leads share the
 * same <li> shell — caller filters by data-anonymize attribute.
 */
const SUGGESTION_LIST_FINDER = `
  function findSuggestionItems() {
    // Prefer the named section to scope the listbox tightly.
    const ul =
      document.querySelector('section.leadaccount-suggestions ul[role="listbox"]') ||
      document.querySelector('ul.global-typeahead__leadaccount-suggestions-list') ||
      document.querySelector('ul[role="listbox"][aria-label*="Matching" i]');
    if (!ul) return [];
    return Array.from(ul.querySelectorAll('li[role="option"]'));
  }
`;

/**
 * On a Sales Nav lead PROFILE page, open the "Save to list" menu and
 * select the target list. Mirrors `addLeadToList` but scoped to the
 * full page (no row context).
 */
export async function addCurrentProfileToList(
  page: Page,
  targetList: string,
): Promise<{ ok: boolean; alreadyAdded?: boolean; reason?: string }> {
  const body =
    `(async (targetList) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const norm = (s) => (s || "").trim().toLowerCase().replace(/\\s+/g, " ");

    const closePopover = () => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    };

    const visible = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };

    // Scan the whole page for a Save / Saved / Add-to-list trigger.
    // Prefer buttons with aria-haspopup, since those open the list menu.
    const allButtons = Array.from(document.querySelectorAll('button'));
    const triggerCandidates = allButtons.filter((b) => {
      if (!visible(b)) return false;
      const label = (b.getAttribute("aria-label") || "").toLowerCase();
      const text = (b.textContent || "").trim().toLowerCase();
      const haspopup = b.hasAttribute("aria-haspopup");
      return (
        haspopup && (
          label.includes("save") || label.includes("saved") || label.includes("add to list")
        ) ||
        text === "save" || text === "saved" ||
        label.includes("save to") || label.includes("saved to")
      );
    });

    // Order: prefer buttons visibly near the top of the profile.
    triggerCandidates.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    const trigger = triggerCandidates[0];
    if (!trigger) return { ok: false, reason: "trigger-not-found" };

    trigger.click();
    await sleep(800);

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

    const listButtons = Array.from(
      popover.querySelectorAll('button[aria-label*="list with" i]')
    );
    const targetNorm = norm(targetList);

    const matching = listButtons.filter((btn) => {
      const nameSpan = btn.querySelector('[class*="list-name"]');
      if (nameSpan && norm(nameSpan.textContent) === targetNorm) return true;
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

    const option = matching[0];
    const ariaLabel = option.getAttribute("aria-label") || "";

    if (/^\\s*Remove\\b/i.test(ariaLabel)) {
      closePopover();
      return { ok: true, alreadyAdded: true };
    }

    if (/^\\s*Add\\b/i.test(ariaLabel)) {
      option.click();
      await sleep(500);
      closePopover();
      return { ok: true, alreadyAdded: false };
    }

    closePopover();
    return { ok: false, reason: "unknown-button-state" };
  })(` +
    JSON.stringify(targetList) +
    `)`;

  return (await page.evaluate(body)) as { ok: boolean; alreadyAdded?: boolean; reason?: string };
}

/** Sales Navigator people search URL using the KEYWORDS filter (same shape as in-app share links). */
export function buildSalesNavPeopleKeywordSearchUrl(keywords: string): string {
  const text = keywords
    // Replace punctuation with spaces so the KEYWORDS filter matches loosely.
    // Sales Nav treats this as an AND of tokens — leftover periods/dashes
    // (e.g. "INC.", "El-Hoseiny") create dead tokens that no profile contains.
    // Curly/smart apostrophes are normalized to ASCII; ASCII apostrophes are
    // kept so names like "O'Connell" stay a single token.
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[(),.\-/&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const query = `(spellCorrectionEnabled:true,filters:List((type:KEYWORDS,values:List((text:${text},selectionType:INCLUDED)))))`;
  return `https://www.linkedin.com/sales/search/people?query=${encodeURIComponent(query)}`;
}
