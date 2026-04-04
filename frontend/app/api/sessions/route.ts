import { getDb } from "@/lib/mongodb";
import { parsePosts } from "@/lib/parse-posts";

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

// POST /api/sessions — create a new session from uploaded file
export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const name = (formData.get("name") as string) || "Untitled Session";

  if (!file) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  const text = await file.text();
  const posts = parsePosts(text);

  if (posts.length === 0) {
    return Response.json(
      { error: "No posts found in the file" },
      { status: 400 }
    );
  }

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
