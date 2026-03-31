import { LinkedInPost, addPostToNotion } from "../notion";

export async function saveToNotion(posts: LinkedInPost[]): Promise<LinkedInPost[]> {
    console.log("💾 Saving to Notion...");
    const savedPosts = [];
    for (const post of posts) {
        try {
            console.log(`➡️ Saving post by ${post.authorName} to Notion...`);
            await addPostToNotion(post);
            savedPosts.push(post);
            // Rate limiting
            await new Promise((r) => setTimeout(r, 400));
        } catch (error: any) {
            console.error(`❌ Failed to save to Notion: ${error.message}`);
        }
    }
    return savedPosts;
}
