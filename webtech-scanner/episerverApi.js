/**
 * Fetch the content from the Moody Bible API using the ID extracted from text.json
 */
async function fetchEpiserverContent(id) {
  const url = `https://www.moodybible.org/api/episerver/v3.0/content/${id}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      // It's normal for some IDs (e.g. 0 or broken links) to 404, we just skip them
      if (response.status !== 404) {
        console.error(`[API] Failed to fetch ID ${id}: ${response.status} ${response.statusText}`);
      }
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(`[API] Network error fetching ID ${id}:`, error.message);
    return null;
  }
}

module.exports = { fetchEpiserverContent };
