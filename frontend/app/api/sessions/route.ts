import { getDb } from "@/lib/mongodb";

interface UploadedPostInput {
  id?: unknown;
  persona?: unknown;
  postNumber?: unknown;
  description?: unknown;
  imageDescription?: unknown;
}

interface UploadedPostsFile {
  posts?: unknown;
}

// GET /api/sessions — list all sessions
export async function GET() {
  const db = await getDb();
  const sessions = await db
    .collection("sessions")
    .find({}, { projection: { posts: 0 } })
    .sort({ createdAt: -1 })
    .toArray();

  return Response.json({ sessions });
}

// POST /api/sessions — create a new session from uploaded JSON file
export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const name = (formData.get("name") as string) || "Untitled Session";

  if (!file) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  const text = await file.text();
  let parsed: UploadedPostsFile;
  try {
    parsed = JSON.parse(text);
  } catch {
    return Response.json({ error: "Invalid JSON file" }, { status: 400 });
  }

  if (!parsed || !Array.isArray(parsed.posts) || parsed.posts.length === 0) {
    return Response.json(
      { error: 'JSON must have a "posts" array with at least one post' },
      { status: 400 }
    );
  }

  const posts = parsed.posts.map((p: UploadedPostInput) => ({
    id: String(p.id || Math.random().toString(36).substring(7)),
    persona: String(p.persona || ""),
    postNumber: String(p.postNumber || ""),
    description: String(p.description || ""),
    imageDescription: String(p.imageDescription || ""),
    status: "draft",
  }));

  const db = await getDb();
  const session = {
    name,
    fileName: file.name,
    postCount: posts.length,
    posts,
    createdAt: new Date(),
  };

  const result = await db.collection("sessions").insertOne(session);

  return Response.json({
    sessionId: result.insertedId.toString(),
    postCount: posts.length,
  });
}
