import { getAllPosts, updatePostStatus } from "../notion";

const LIKES_THRESHOLD    = 100;
const COMMENTS_THRESHOLD = 100;

(async () => {
  console.log("📊 Fetching all posts from Notion...");
  const posts = await getAllPosts();
  console.log(`📄 Found ${posts.length} posts total.`);

  let likedCount    = 0;
  let commentedCount = 0;
  let skipped       = 0;

  for (const post of posts) {
    const isHighLikes    = post.likes    >= LIKES_THRESHOLD;
    const isHighComments = post.comments >= COMMENTS_THRESHOLD;

    // Determine the target status (comments take priority if both qualify)
    let targetStatus: string | null = null;

    if (isHighComments && post.status !== "Most commented") {
      targetStatus = "Most commented";
    } else if (isHighLikes && !isHighComments && post.status !== "Most liked") {
      targetStatus = "Most liked";
    }

    if (!targetStatus) {
      skipped++;
      continue;
    }

    try {
      console.log(`✅ [${targetStatus}] likes=${post.likes} comments=${post.comments} → ${post.pageId}`);
      await updatePostStatus(post.pageId, targetStatus);

      if (targetStatus === "Most liked")    likedCount++;
      if (targetStatus === "Most commented") commentedCount++;

      // Rate limiting
      await new Promise(r => setTimeout(r, 300));
    } catch (err: any) {
      console.error(`❌ Failed to update ${post.pageId}: ${err.message}`);
    }
  }

  console.log("\n🎉 ANALYSIS DONE\n");
  console.log(`  • Marked as "Most liked":    ${likedCount}`);
  console.log(`  • Marked as "Most commented": ${commentedCount}`);
  console.log(`  • Already correct / skipped: ${skipped}`);
  process.exit(0);
})();
