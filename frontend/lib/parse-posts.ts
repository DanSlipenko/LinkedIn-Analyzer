export type PostStatus = "draft" | "in_progress" | "posted" | "flagged";

export interface Post {
  id: string;
  persona: string;
  postNumber: string;
  description: string;
  imageDescription: string;
  status: PostStatus;
  hasImage?: boolean;
  imageFileName?: string;
  isEdited?: boolean;
}

/**
 * Parses the text file format:
 *
 * Post ID 001
 * Persona 2 — Post 1
 * ----------...
 * [description text]
 *
 * Image description:
 * [image description text]
 */
export function parsePosts(text: string): Post[] {
  const posts: Post[] = [];

  // Split into post blocks by "Post ID" lines
  const blocks = text.split(/(?=^Post ID\s)/m).filter((b) => b.trim());

  for (const block of blocks) {
    const lines = block.split("\n");

    // Line 1: Post ID
    const idMatch = lines[0]?.match(/^Post ID\s+(.+)/i);
    if (!idMatch) continue;
    const id = idMatch[1].trim();

    // Line 2: Persona X — Post Y
    const personaLine = lines[1]?.trim() || "";
    const personaMatch = personaLine.match(
      /^Persona\s+(\d+)\s*[—–-]\s*Post\s+(\d+)/i
    );
    const persona = personaMatch ? personaMatch[1] : "";
    const postNumber = personaMatch ? personaMatch[2] : "";

    // Find where the separator line is (dashes)
    let contentStart = 2;
    for (let i = 2; i < lines.length; i++) {
      if (/^-{5,}/.test(lines[i].trim())) {
        contentStart = i + 1;
        break;
      }
    }

    // Find "Image description:" separator
    let imageDescStart = -1;
    for (let i = contentStart; i < lines.length; i++) {
      if (/^Image description:/i.test(lines[i].trim())) {
        imageDescStart = i;
        break;
      }
    }

    let description: string;
    let imageDescription: string;

    if (imageDescStart !== -1) {
      description = lines
        .slice(contentStart, imageDescStart)
        .join("\n")
        .trim();
      imageDescription = lines
        .slice(imageDescStart + 1)
        .join("\n")
        .trim();
    } else {
      description = lines.slice(contentStart).join("\n").trim();
      imageDescription = "";
    }

    posts.push({ id, persona, postNumber, description, imageDescription, status: "draft" });
  }

  return posts;
}
