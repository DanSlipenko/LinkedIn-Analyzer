import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

// POST /api/sessions/:id/image — upload an image for a post
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!ObjectId.isValid(id)) {
    return Response.json({ error: "Invalid session ID" }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const postId = formData.get("postId") as string | null;

  if (!file || !postId) {
    return Response.json(
      { error: "File and postId are required" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const db = await getDb();

  // Upsert into post_images collection
  await db.collection("post_images").updateOne(
    { sessionId: id, postId },
    {
      $set: {
        sessionId: id,
        postId,
        fileName: file.name,
        contentType: file.type,
        data: buffer,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );

  return Response.json({ ok: true, fileName: file.name });
}

// GET /api/sessions/:id/image?postId=xxx — download the image
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const postId = searchParams.get("postId");

  if (!ObjectId.isValid(id) || !postId) {
    return Response.json({ error: "Invalid parameters" }, { status: 400 });
  }

  const db = await getDb();
  const image = await db
    .collection("post_images")
    .findOne({ sessionId: id, postId });

  if (!image) {
    return Response.json({ error: "Image not found" }, { status: 404 });
  }

  return new Response(image.data.buffer, {
    headers: {
      "Content-Type": image.contentType,
      "Content-Disposition": `attachment; filename="${image.fileName}"`,
    },
  });
}

// DELETE /api/sessions/:id/image?postId=xxx — remove the image
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const postId = searchParams.get("postId");

  if (!ObjectId.isValid(id) || !postId) {
    return Response.json({ error: "Invalid parameters" }, { status: 400 });
  }

  const db = await getDb();
  await db.collection("post_images").deleteOne({ sessionId: id, postId });

  return Response.json({ ok: true });
}
