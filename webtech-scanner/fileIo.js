const fs = require("fs");

/**
 * Input the selected content (matches) into a separate file.
 */
function saveSelectedContent(matches, outputPath) {
  try {
    fs.writeFileSync(outputPath, JSON.stringify(matches, null, 2), "utf8");
    console.log(`\nSuccessfully saved ${matches.length} matching blocks to ${outputPath}`);
  } catch (error) {
    console.error(`Error saving content to ${outputPath}:`, error);
  }
}

module.exports = { saveSelectedContent };
