import "dotenv/config";
import { Page } from "playwright";
import {
  connectToSalesNav,
  collectAllLeadNames,
  scrollLeadIntoView,
  addLeadToList,
  loadWorksLeadsFromJsonFiles,
  loadPastLeadNames,
  normalize,
} from "./sales-nav-shared";

const DIR = __dirname;
const TARGET_LIST = process.env.TARGET_LIST || "2Q2 Leads";

async function goToNextPage(page: Page): Promise<boolean> {
  const script = `(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    const activeBtn = document.querySelector(
      'li.artdeco-pagination__indicator--number.active button,' +
      'li.artdeco-pagination__indicator--number.selected button'
    );
    if (!activeBtn) return false;

    const currentLabel = activeBtn.getAttribute("aria-label") || "";
    const currentNum = parseInt(currentLabel.replace(/\\D/g, ""), 10);
    if (!currentNum) return false;

    const nextNum = currentNum + 1;

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
  const worksMap = loadWorksLeadsFromJsonFiles(DIR);
  const pastLeadNames = loadPastLeadNames(DIR);
  const uniqueWorksNotInPast = Array.from(worksMap.keys()).filter((name) => !pastLeadNames.has(name)).length;
  console.log(`\n🎯 Target list: "${TARGET_LIST}"`);
  console.log(`📋 Total unique "works" leads loaded: ${worksMap.size}`);
  console.log(`🆕 Unique "works" leads not in past leads: ${uniqueWorksNotInPast}`);

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
  let totalSkippedPast = 0;

  while (true) {
    console.log(`\n📄 Page ${pageNum}`);

    const names = await collectAllLeadNames(page);
    console.log(`   Found ${names.length} leads on page (full scroll)`);
    totalScanned += names.length;

    let pageMatched = 0;
    let pageAdded = 0;
    let pageAlreadyAdded = 0;
    let pageSkippedPast = 0;

    for (const name of names) {
      const entry = worksMap.get(normalize(name));
      if (!entry) continue;
      pageMatched++;

      if (pastLeadNames.has(normalize(name))) {
        pageSkippedPast++;
        totalSkippedPast++;
        console.log(`   ⏭️  Skipped (already targeted in past leads): ${name}`);
        continue;
      }

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
      await new Promise((r) => setTimeout(r, 600));
    }

    console.log(
      `   📊 Page ${pageNum}: ${pageAdded} added, ${pageAlreadyAdded} already in list, ${pageSkippedPast} skipped (past leads), out of ${names.length} (${pageMatched} matched JSON)`,
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
    `\n📈 Summary: ${totalAdded} added to "${TARGET_LIST}", ${totalAlreadyAdded} already in list, ${totalSkippedPast} skipped (past leads), ` +
      `out of ${totalScanned} scanned (${totalMatched} matched "works" in JSON, ${totalFailed} failed). ` +
      `Unique "works" not in past leads: ${uniqueWorksNotInPast}`,
  );
  process.exit(0);
})();
