import fs from "fs/promises";
import path from "path";
import { LinkedInPost } from "../notion";

export async function saveToFile(posts: LinkedInPost[]): Promise<void> {
    const filePath = path.resolve(__dirname, "posts.json");
    try {
        await fs.writeFile(filePath, JSON.stringify(posts, null, 2), "utf-8");
        console.log(`✅ Saved ${posts.length} posts to local file: ${filePath}`);
    } catch (error: any) {
        console.error(`❌ Failed to save to local file: ${error.message}`);
    }
}
