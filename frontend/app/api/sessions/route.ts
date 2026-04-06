import { getDb } from "@/lib/mongodb";

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
  let parsed: any;
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

  const posts = parsed.posts.map((p: any) => ({
    id: p.id || Math.random().toString(36).substring(7),
    persona: p.persona || "",
    postNumber: p.postNumber || "",
    description: p.description || "",
    imageDescription: p.imageDescription || "",
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
