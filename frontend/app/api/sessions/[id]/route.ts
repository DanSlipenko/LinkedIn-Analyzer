import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

// GET /api/sessions/:id — get a single session with posts
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!ObjectId.isValid(id)) {
    return Response.json({ error: "Invalid session ID" }, { status: 400 });
  }

  const db = await getDb();
  const session = await db
    .collection("sessions")
    .findOne({ _id: new ObjectId(id) });

  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  return Response.json({ session });
}

// PATCH /api/sessions/:id — update a post's status
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { postId, status } = await request.json();

  if (!ObjectId.isValid(id)) {
    return Response.json({ error: "Invalid session ID" }, { status: 400 });
  }

  if (!["draft", "in_progress", "posted"].includes(status)) {
    return Response.json({ error: "Invalid status" }, { status: 400 });
  }

  const db = await getDb();
  await db.collection("sessions").updateOne(
    { _id: new ObjectId(id), "posts.id": postId },
    { $set: { "posts.$.status": status } }
  );

  return Response.json({ ok: true });
}

// DELETE /api/sessions/:id — delete a session
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!ObjectId.isValid(id)) {
    return Response.json({ error: "Invalid session ID" }, { status: 400 });
  }

  const db = await getDb();
  await db.collection("sessions").deleteOne({ _id: new ObjectId(id) });

  return Response.json({ ok: true });
}
