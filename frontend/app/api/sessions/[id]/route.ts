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
