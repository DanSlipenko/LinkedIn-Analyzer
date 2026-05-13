import { getDb } from "@/lib/mongodb";
import type { Post } from "@/lib/parse-posts";
import { ObjectId } from "mongodb";

interface SessionDocument {
  _id?: ObjectId;
  posts?: Post[];
  postCount?: number;
}

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

  // Check which posts have uploaded images
  const images = await db
    .collection("post_images")
    .find({ sessionId: id }, { projection: { postId: 1, fileName: 1 } })
    .toArray();
  const imageMap = new Map(images.map((img) => [img.postId, img.fileName]));

  if (session.posts) {
    for (const post of session.posts) {
      const fileName = imageMap.get(post.id);
      post.hasImage = !!fileName;
      post.imageFileName = fileName || undefined;
    }
  }

  return Response.json({ session });
}

// PATCH /api/sessions/:id — update a post's status or description
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { postId, status, description, comments } = await request.json();

  if (!ObjectId.isValid(id)) {
    return Response.json({ error: "Invalid session ID" }, { status: 400 });
  }

  if (status && !["draft", "in_progress", "posted", "flagged"].includes(status)) {
    return Response.json({ error: "Invalid status" }, { status: 400 });
  }

  const updateFields: Record<string, string | boolean> = {};
  if (status) updateFields["posts.$.status"] = status;
  if (description !== undefined) {
    updateFields["posts.$.description"] = description;
    updateFields["posts.$.isEdited"] = true;
  }
  if (comments !== undefined) updateFields["posts.$.comments"] = comments;

  if (Object.keys(updateFields).length === 0) {
     return Response.json({ error: "No fields to update" }, { status: 400 });
  }

  const db = await getDb();
  await db.collection("sessions").updateOne(
    { _id: new ObjectId(id), "posts.id": postId },
    { $set: updateFields }
  );

  return Response.json({ ok: true });
}

// POST /api/sessions/:id — append a manually entered post to a session
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  if (!ObjectId.isValid(id)) {
    return Response.json({ error: "Invalid session ID" }, { status: 400 });
  }

  const description = String(body.description || "").trim();
  if (!description) {
    return Response.json({ error: "Description is required" }, { status: 400 });
  }

  const db = await getDb();
  const sessions = db.collection<SessionDocument>("sessions");
  const session = await sessions
    .findOne({ _id: new ObjectId(id) }, { projection: { posts: 1 } });

  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const existingPosts = (session.posts || []) as Post[];
  const requestedId = String(body.id || "").trim();
  const nextId =
    existingPosts
      .map((post) => Number.parseInt(post.id, 10))
      .filter(Number.isFinite)
      .reduce((max, value) => Math.max(max, value), 0) + 1;
  const postId = requestedId || String(nextId).padStart(3, "0");

  if (existingPosts.some((post) => post.id === postId)) {
    return Response.json(
      { error: `Post ID ${postId} already exists in this session` },
      { status: 400 }
    );
  }

  const post: Post = {
    id: postId,
    persona: String(body.persona || "").trim(),
    postNumber: String(body.postNumber || "").trim(),
    description,
    imageDescription: String(body.imageDescription || "").trim(),
    status: "draft",
  };

  await sessions.updateOne(
    { _id: new ObjectId(id) },
    {
      $push: { posts: post },
      $inc: { postCount: 1 },
    }
  );

  return Response.json({ post });
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
