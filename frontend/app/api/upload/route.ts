import { parsePosts } from "@/lib/parse-posts";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  const text = await file.text();
  const posts = parsePosts(text);

  return Response.json({ posts });
}
