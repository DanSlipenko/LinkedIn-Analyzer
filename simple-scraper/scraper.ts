import { connectToChrome } from "./connect";
import { extractPosts } from "./extract";
import { saveToNotion } from "./save-notion";
import { saveToFile } from "./save-local";

(async () => {
  // 1. function that connects to the chrome
  const { activePage } = await connectToChrome();

  // 2. function that gets the posts
  const uniquePosts = await extractPosts(activePage);

  // 3. Function that connects to notion
  const savedPosts = await saveToNotion(uniquePosts);

  // 4. function that saves the posts to a file
  await saveToFile(uniquePosts);

  // 5. Stop
  console.log("\n🎉 FINAL RESULTS:\n");
  console.log(`Successfully added ${savedPosts.length} posts to Notion.\n`);
  console.log("👋 Done.");
  process.exit(0);
})();
