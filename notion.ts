import "dotenv/config";
import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_API });

const NOTION_DB_ID = process.env.NOTION_DB_ID;
if (!NOTION_DB_ID) {
  console.warn("⚠️ NOTION_DB_ID is not defined in .env");
}

export interface LinkedInPost {
  authorName: string;
  authorHeadline: string;
  authorProfileUrl: string;
  content: string;
  postUrl: string;
  date: string;
  isRepost: boolean;
  repostedFrom: string | null;
  repostAuthorUrl: string | null;
  likes: number;
  comments: number;
  reposts: number;
  imageUrl: string | null;
}

export async function addPostToNotion(post: LinkedInPost) {
  if (!NOTION_DB_ID) throw new Error("NOTION_DB_ID is required to add posts");

  try {
    // Basic text truncation for Title (Notion limits title property text length)
    const titleText = post.content ? post.content.substring(0, 50) + "..." : "No text content";

    await notion.pages.create({
      parent: { database_id: NOTION_DB_ID as string },
      properties: {
        "Project name": {
          title: [
            {
              text: {
                content: titleText,
              },
            },
          ],
        },
        Author: {
          rich_text: post.authorName ? [{ text: { content: post.authorName } }] : [],
        },
        "Author Headline": {
          rich_text: post.authorHeadline ? [{ text: { content: post.authorHeadline } }] : [],
        },
        "Post Link": {
          url: post.postUrl || null,
        },
        "Author Profile": {
          url: post.authorProfileUrl || null,
        },
        Date: {
          rich_text: post.date ? [{ text: { content: post.date } }] : [],
        },
        "Is Repost": {
          checkbox: post.isRepost || false,
        },
        "Reposted From": {
          rich_text: post.repostedFrom ? [{ text: { content: post.repostedFrom } }] : [],
        },
        Likes: {
          number: post.likes || 0,
        },
        Comments: {
          number: post.comments || 0,
        },
        Reposts: {
          number: post.reposts || 0,
        },
        "Image URL": {
          url: post.imageUrl || null,
        },
        Status: {
          status: {
            name: "Not started",
          },
        },
        Platform: {
          select: {
            name: "LinkedIn",
          },
        },
      },
      children: [
        {
          object: "block",
          type: "heading_3",
          heading_3: {
            rich_text: [{ type: "text", text: { content: "Post Content" } }],
          },
        },
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: post.content?.slice(0, 2000) || "No text content available.",
                },
              },
            ],
          },
        },
      ],
    });
  } catch (error) {
    console.error("❌ Failed to add to Notion:", error);
    throw error;
  }
}

export async function checkIfPostExists(postUrl: string): Promise<boolean> {
  if (!NOTION_DB_ID) return false;
  if (!postUrl) return false;

  try {
    // Use search filtered to this DB and find by Post Link
    const response = await (notion as any).search({
      filter: { value: "page", property: "object" },
      query: postUrl,
    });
    const found = response.results.some(
      (p: any) => p.parent?.database_id?.replace(/-/g, "") === (NOTION_DB_ID as string).replace(/-/g, "") &&
                  p.properties?.["Post Link"]?.url === postUrl
    );
    return found;
  } catch (error) {
    console.error("Failed to query Notion for duplicates:", error);
    return false;
  }
}

export interface NotionPost {
  pageId: string;
  likes: number;
  comments: number;
  status: string;
}

/** Fetch every page from the Notion DB (handles pagination) */
export async function getAllPosts(): Promise<NotionPost[]> {
  if (!NOTION_DB_ID) return [];
  const results: NotionPost[] = [];
  let cursor: string | undefined = undefined;
  const dbIdNormalized = (NOTION_DB_ID as string).replace(/-/g, "");

  do {
    const params: any = {
      filter: { value: "page", property: "object" },
      page_size: 100,
    };
    if (cursor) params.start_cursor = cursor;

    const response: any = await (notion as any).search(params);

    for (const page of response.results) {
      // Only include pages belonging to our database
      if (page.parent?.database_id?.replace(/-/g, "") !== dbIdNormalized) continue;
      const props = page.properties;
      const likes    = props["Likes"]?.number ?? 0;
      const comments = props["Comments"]?.number ?? 0;
      const status   = props["Status"]?.status?.name ?? "";
      results.push({ pageId: page.id, likes, comments, status });
    }

    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  return results;
}

/** Update the Status property of a single Notion page */
export async function updatePostStatus(pageId: string, status: string): Promise<void> {
  await notion.pages.update({
    page_id: pageId,
    properties: {
      Status: { status: { name: status } },
    },
  });
}

/** Get the full markdown content of a Notion page */
export async function getPostContent(pageId: string): Promise<string> {
  try {
    const result: any = await (notion.pages as any).retrieveMarkdown({ page_id: pageId });
    if (typeof result === "string") return result;
    if (result?.markdown) return result.markdown;
    if (result?.content) return result.content;
    return "";
  } catch {
    return "";
  }
}

