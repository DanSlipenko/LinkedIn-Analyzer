/**
 * Recursively traverse the parsed JSON data to find any object containing "ID$$number".
 * Each such object is isolated and treated as a distinct "block".
 */
function extractBlocks(data, blocksArray = []) {
  if (Array.isArray(data)) {
    for (const item of data) {
      extractBlocks(item, blocksArray);
    }
  } else if (data !== null && typeof data === "object") {
    // Check if the current object contains the specific key
    if ("ID$$number" in data) {
      // Add a copy of this block so we don't accidentally mutate while traversing
      blocksArray.push(data);
    }
    // Recursively check all properties of the object
    for (const key in data) {
      if (Object.hasOwn(data, key)) {
        extractBlocks(data[key], blocksArray);
      }
    }
  }
  return blocksArray;
}

module.exports = { extractBlocks };
