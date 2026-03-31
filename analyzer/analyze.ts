import { getAllPosts, updatePostStatus } from "../notion";

(async () => {
  console.log("📊 Fetching all posts from Notion...");
  const posts = await getAllPosts();
  console.log(`📄 Found ${posts.length} posts total.`);

  if (posts.length === 0) {
    console.log("No posts found.");
    process.exit(0);
  }

  // Calculate top 50% thresholds (median)
  const sortedLikes = posts.map((p) => p.likes).sort((a, b) => a - b);
  const sortedComments = posts.map((p) => p.comments).sort((a, b) => a - b);

  const likesThreshold = Math.max(sortedLikes[Math.floor(sortedLikes.length / 2)], 1);
  const commentsThreshold = Math.max(sortedComments[Math.floor(sortedComments.length / 2)], 1);

  console.log(`📈 Top 50% Thresholds -> Likes >= ${likesThreshold}, Comments >= ${commentsThreshold}`);

  let likedCount = 0;
  let commentedCount = 0;
  let skipped = 0;

  for (const post of posts) {
    const isHighLikes = post.likes >= likesThreshold;
    const isHighComments = post.comments >= commentsThreshold;

    // Determine which metric it outperformed more relative to its median
    let targetStatus: string | null = null;

    if (isHighLikes && isHighComments) {
      const likesRatio = post.likes / Math.max(likesThreshold, 1);
      const commentsRatio = post.comments / Math.max(commentsThreshold, 1);
      
      if (likesRatio >= commentsRatio) {
        if (post.status !== "Most liked") targetStatus = "Most liked";
      } else {
        if (post.status !== "Most commented") targetStatus = "Most commented";
      }
    } else if (isHighComments && post.status !== "Most commented") {
      targetStatus = "Most commented";
    } else if (isHighLikes && post.status !== "Most liked") {
      targetStatus = "Most liked";
    }

    if (!targetStatus) {
      skipped++;
      continue;
    }

    try {
      console.log(`✅ [${targetStatus}] likes=${post.likes} comments=${post.comments} → ${post.pageId}`);
      await updatePostStatus(post.pageId, targetStatus);

      if (targetStatus === "Most liked") likedCount++;
      if (targetStatus === "Most commented") commentedCount++;

      // Rate limiting
      await new Promise((r) => setTimeout(r, 300));
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
