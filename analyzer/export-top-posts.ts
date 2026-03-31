import fs from "fs/promises";
import path from "path";
import { getAllPosts, getPostContent, NotionPost } from "../notion";

const TOP_STATUSES = ["Most liked", "Most commented"];
const OUTPUT_FILE  = path.resolve(__dirname, "top-posts.txt");

(async () => {
  console.log("📊 Fetching all posts from Notion...");
  const allPosts = await getAllPosts();

  const topPosts = allPosts.filter((p: NotionPost) => TOP_STATUSES.includes(p.status));
  console.log(`⭐ Found ${topPosts.length} top posts (Most liked / Most commented).`);

  const sections: string[] = [];

  // Group by status
  const byStatus: Record<string, NotionPost[]> = {
    "Most commented": [],
    "Most liked":     [],
  };

  for (const p of topPosts) {
    if (byStatus[p.status]) byStatus[p.status].push(p);
  }

  for (const [status, posts] of Object.entries(byStatus)) {
    if (posts.length === 0) continue;

    // Sort descending by the relevant metric
    const sorted = [...posts].sort((a, b) =>
      status === "Most commented" ? b.comments - a.comments : b.likes - a.likes
    );

    sections.push(`${"=".repeat(60)}`);
    sections.push(`📌 ${status.toUpperCase()} (${posts.length} posts)`);
    sections.push(`${"=".repeat(60)}\n`);

    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i];
      console.log(`  [${i + 1}/${sorted.length}] Fetching content for ${p.pageId}...`);

      const content = await getPostContent(p.pageId);

      sections.push(`--- Post ${i + 1} ---`);
      sections.push(`Likes:    ${p.likes}`);
      sections.push(`Comments: ${p.comments}\n`);
      sections.push(content || "(No content available)");
      sections.push("\n");

      // Rate limiting
      await new Promise(r => setTimeout(r, 200));
    }
  }

  const output = sections.join("\n");
  await fs.writeFile(OUTPUT_FILE, output, "utf-8");
  console.log(`\n✅ Exported to: ${OUTPUT_FILE}`);
  process.exit(0);
})();
