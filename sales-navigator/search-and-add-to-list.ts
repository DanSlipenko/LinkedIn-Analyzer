import "dotenv/config";
import { join } from "path";
import { Page } from "playwright";
import {
  type Lead,
  connectToSalesNav,
  typeSearchAndPeekLeads,
  clickLeadSuggestion,
  addCurrentProfileToList,
  loadWorksLeadsFromJsonFiles,
  loadLinkedInAddedNames,
  markLeadLinkedInAddedInFile,
  normalize,
} from "./sales-nav-shared";

const DIR = __dirname;
const TARGET_LIST = process.env.TARGET_LIST || "2Q2 Leads";

/** Optional cap for one run, e.g. MAX_SEARCH_ADD_LEADS=20 */
const MAX_SEARCH_ADD_LEADS = process.env.MAX_SEARCH_ADD_LEADS
  ? parseInt(process.env.MAX_SEARCH_ADD_LEADS, 10)
  : undefined;

/** Strip noise that hurts typeahead matching ("Inc.", commas, parens, dashes). */
function buildSearchQuery(lead: Lead): string {
  return `${lead.name} ${lead.company}`
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[(),.\-/&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Loose name match: tolerates middle names, initials ("Casey D." vs
 * "Casey Dee"), hyphens, periods, and curly apostrophes.
 *
 * Run in Node (not the page), since this just compares two strings.
 */
function looseNameMatch(rowName: string, leadName: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[\u2018\u2019\u02BC]/g, "'")
      .replace(/[.,\-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const tokensOf = (s: string): string[] =>
    norm(s)
      .split(" ")
      .map((t) => t.replace(/[^a-z']/g, ""))
      .filter((t) => t.length >= 1);
  const tokenStrength = (a: string, b: string): "strong" | "weak" | null => {
    if (a === b) return "strong";
    if (a.startsWith(b) || b.startsWith(a)) {
      const minLen = Math.min(a.length, b.length);
      if (minLen >= 3) return "strong";
      if (minLen >= 1) return "weak";
    }
    return null;
  };

  const rowToks = tokensOf(rowName);
  const leadToks = tokensOf(leadName);
  if (rowToks.length === 0 || leadToks.length === 0) return false;

  const used = new Array(rowToks.length).fill(false);
  let strong = 0;
  let any = 0;
  for (const lt of leadToks) {
    let bestK = -1;
    let bestStrength: "strong" | "weak" | null = null;
    for (let k = 0; k < rowToks.length; k++) {
      if (used[k]) continue;
      const s = tokenStrength(lt, rowToks[k]);
      if (s === "strong") {
        bestK = k;
        bestStrength = "strong";
        break;
      }
      if (s === "weak" && bestStrength == null) {
        bestK = k;
        bestStrength = "weak";
      }
    }
    if (bestK >= 0) {
      used[bestK] = true;
      any++;
      if (bestStrength === "strong") strong++;
    }
  }

  if (leadToks.length === 1 || rowToks.length === 1) return strong >= 1;
  return strong >= 1 && any >= 2;
}

async function ensureSalesNavHome(page: Page): Promise<void> {
  // The global search input lives in the top nav on every Sales Nav page,
  // but isn't always present on intermediate redirect URLs. Make sure we're
  // on a Sales Nav page that has the nav by going to /sales/home if needed.
  const url = page.url();
  if (url.includes("linkedin.com/sales")) return;
  await page.goto("https://www.linkedin.com/sales/home", { waitUntil: "domcontentloaded" });
}

(async () => {
  const worksMap = loadWorksLeadsFromJsonFiles(DIR);
  const linkedInAdded = loadLinkedInAddedNames(DIR);

  const queue: Lead[] = [];
  for (const { lead } of worksMap.values()) {
    if (linkedInAdded.has(normalize(lead.name))) continue;
    queue.push(lead);
  }

  const cap =
    typeof MAX_SEARCH_ADD_LEADS === "number" && !Number.isNaN(MAX_SEARCH_ADD_LEADS)
      ? MAX_SEARCH_ADD_LEADS
      : undefined;
  const toProcess = cap !== undefined ? queue.slice(0, cap) : queue;

  console.log(`\n🎯 Target list: "${TARGET_LIST}"`);
  console.log(`📋 Works leads (unique names): ${worksMap.size}`);
  console.log(`📌 Already marked linkedIn added: ${linkedInAdded.size}`);
  console.log(
    `🔎 Queue (works, not yet linkedIn-added): ${queue.length}` +
      (cap !== undefined ? ` → processing ${toProcess.length} (MAX_SEARCH_ADD_LEADS)` : ""),
  );

  if (toProcess.length === 0) {
    console.log("Nothing to do. Exiting.");
    process.exit(0);
  }

  const { page } = await connectToSalesNav();
  await ensureSalesNavHome(page);

  let totalAdded = 0;
  let totalAlreadyInList = 0;
  let totalSkippedNoMatch = 0;
  let totalFailed = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const lead = toProcess[i];
    const query = buildSearchQuery(lead);
    console.log(`\n[${i + 1}/${toProcess.length}] 🔍 ${lead.name} — ${lead.company}`);

    let peek = await typeSearchAndPeekLeads(page, query);
    // Long company strings (e.g. "STONED IMMACULATE VINTAGE INC") AND-narrow
    // the typeahead to zero hits. Retry with just the lead's name.
    if (!peek.ok && peek.reason === "no-suggestions") {
      console.log(`   ↻ No hits for full query — retrying with name only`);
      peek = await typeSearchAndPeekLeads(page, lead.name);
    }
    if (!peek.ok) {
      totalFailed++;
      console.log(`   ❌ Search failed (${peek.reason})`);
      await new Promise((r) => setTimeout(r, 800));
      continue;
    }

    // Loose-match every person suggestion in the dropdown. Among those that
    // match, prefer one whose headline mentions the lead's company; fall
    // back to the first.
    const companyNorm = normalize(lead.company);
    const nameMatches = peek.suggestions.filter((s) => looseNameMatch(s.name, lead.name));

    if (nameMatches.length === 0) {
      const top = peek.suggestions[0];
      totalSkippedNoMatch++;
      console.log(
        `   ⏭️  No suggestion matches "${lead.name}". Top was "${top.name}" — skipping`,
      );
      await page.keyboard.press("Escape").catch(() => {});
      await new Promise((r) => setTimeout(r, 600));
      continue;
    }

    const withCompany = companyNorm.length >= 3
      ? nameMatches.find((s) => normalize(s.headline).includes(companyNorm))
      : undefined;
    const chosen = withCompany ?? nameMatches[0];
    const tag = withCompany ? " ✓ company in headline" : "";
    console.log(`   ▶︎ Picking "${chosen.name}" (#${chosen.index})${tag} — clicking`);

    const clicked = await clickLeadSuggestion(page, chosen.index);
    if (!clicked.ok) {
      totalFailed++;
      console.log(`   ❌ Click failed (${clicked.reason})`);
      await ensureSalesNavHome(page);
      await new Promise((r) => setTimeout(r, 800));
      continue;
    }

    // Profile page is loaded — give the Save button a moment to render.
    await new Promise((r) => setTimeout(r, 1500));

    const result = await addCurrentProfileToList(page, TARGET_LIST);
    if (result.ok && result.alreadyAdded) {
      totalAlreadyInList++;
      console.log(`   ⏭️  Already in list`);
    } else if (result.ok) {
      totalAdded++;
      console.log(`   ✅ Added`);
    } else {
      totalFailed++;
      console.log(`   ❌ Failed (${result.reason})`);
    }

    if (result.ok) {
      const entry = worksMap.get(normalize(lead.name));
      if (entry) {
        const saved = markLeadLinkedInAddedInFile(join(DIR, entry.file), lead);
        if (saved) {
          console.log(`   💾 Updated linkedIn.status=added → ${entry.file}`);
        } else {
          console.log(`   ⚠️  Could not persist linkedIn added (no matching row in ${entry.file})`);
        }
      }
    }

    // The search input is in the global nav on every Sales Nav page,
    // so we can search the next lead directly from this profile page.
    await new Promise((r) => setTimeout(r, 600));
  }

  console.log(
    `\n📈 Summary (typeahead flow): ${totalAdded} added, ${totalAlreadyInList} already in list, ` +
      `${totalSkippedNoMatch} top-suggestion didn't match, ${totalFailed} other failures — ` +
      `out of ${toProcess.length} searches.`,
  );
  process.exit(0);
})();
