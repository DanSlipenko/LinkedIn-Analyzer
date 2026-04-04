const fs = require("fs");
const { extractBlocks } = require("./extractor");
const { processWithDeepSeek } = require("./deepseek");
const { saveSelectedContent } = require("./fileIo");
const { fetchEpiserverContent } = require("./episerverApi");

/**
 * Delay standard helper for rate-limiting
 */
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

/**
 * Main controller function that runs everything.
 */
async function runEverything(inputPath, outputPath) {
  const apiKey = "sk-ffef5a075cd8402cb5cb114e7437e59d";
  if (!apiKey) {
    console.error("ERROR: DEEPSEEK_API_KEY environment variable is not set.");
    console.log('Please run with: DEEPSEEK_API_KEY="your_key" node index.js');
    process.exit(1);
  }

  console.log(`Phase 1: Loading and parsing ${inputPath}...`);
  let rawData;
  try {
    const fileContent = fs.readFileSync(inputPath, "utf8");
    rawData = JSON.parse(fileContent);
  } catch (err) {
    console.error("Error reading or parsing input JSON:", err);
    process.exit(1);
  }

  console.log(`Phase 2: Extracting unique ID$$numbers...`);
  const blocks = extractBlocks(rawData);
  // Deduplicate and ignore invalid IDs
  const uniqueIds = [...new Set(blocks.map((b) => b["ID$$number"]).filter((id) => id && id > 0))];
  console.log(`Extracted ${uniqueIds.length} unique IDs to process.`);

  console.log(`Phase 3: Fetching from Episerver API & Processing with DeepSeek (this might take a while)...`);

  const matchedBlocks = [];

  for (let i = 0; i < uniqueIds.length; i++) {
    const id = uniqueIds[i];
    console.log(`\n[${i + 1}/${uniqueIds.length}] Processing ID: ${id}...`);

    // Fetch content from API
    const fetchedContent = await fetchEpiserverContent(id);
    if (!fetchedContent) {
      console.log(` => Skipped: No API content found or error fetching.`);
      await delay(300); // Prevent spamming external API
      continue;
    }

    // Attach ID$$number so that deepseek.js format remains intact
    fetchedContent["ID$$number"] = id;

    // Call DeepSeek with the newly fetched content
    const result = await processWithDeepSeek(fetchedContent, apiKey);

    if (result.isMatch) {
      console.log(` => ✓ MATCH! Confidence: ${result.confidence}. Reason: ${result.reasoning}`);
      matchedBlocks.push(result);
    } else {
      if (!result.error) {
        console.log(` => x No match. Confidence: ${result.confidence}. Reason: ${result.reasoning}`);
      }
    }

    // Wait ~1 second between DeepSeek requests to be safe with limits
    await delay(1000);
  }

  console.log(`Phase 4: Saving selected content...`);
  if (matchedBlocks.length > 0) {
    saveSelectedContent(matchedBlocks, outputPath);

    const matchedIds = matchedBlocks.map((b) => b.blockID);
    console.log(`\nDONE! The ID numbers that fit the criteria are: ${matchedIds.join(", ")}`);
  } else {
    console.log("\nDONE! No blocks matched the criteria. Nothing was saved.");
  }
}

// Ensure it's callable from the CLI
if (require.main === module) {
  const path = require("path");
  const inputPath = process.argv[2] || path.join(__dirname, "text.json");
  const outputPath = process.argv[3] || path.join(__dirname, "matched_blocks.json");
  
  console.log("==========================================");
  console.log("DeepSeek Analyzer Starting...");
  console.log(`Input: ${inputPath}`);
  console.log(`Output: ${outputPath}\n`);

  runEverything(inputPath, outputPath);
}

module.exports = { runEverything };
