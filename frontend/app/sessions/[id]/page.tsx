"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Table,
  Button,
  Tag,
  Modal,
  Input,
  Upload,
  Space,
  Typography,
  App,
  Popconfirm,
  Collapse,
  Image,
} from "antd";
import {
  ArrowLeftOutlined,
  UploadOutlined,
  DeleteOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CopyOutlined,
  FileImageOutlined,
  DownloadOutlined,
  PictureOutlined,
  EditOutlined,
  SaveOutlined,
  CloseOutlined,
  FlagOutlined,
  CommentOutlined,
} from "@ant-design/icons";
import type { Post, PostStatus } from "@/lib/parse-posts";
import type { ColumnsType } from "antd/es/table";

const { Title, Text, Paragraph } = Typography;

interface Session {
  _id: string;
  name: string;
  fileName: string;
  postCount: number;
  createdAt: string;
  posts?: Post[];
}

export default function SessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [postImages, setPostImages] = useState<Record<string, { url: string; fileName: string } | null>>({});
  const [postImageUploading, setPostImageUploading] = useState<string | null>(null);
  const [editingDescription, setEditingDescription] = useState(false);
  const [editedDescriptionText, setEditedDescriptionText] = useState("");
  const [editingComments, setEditingComments] = useState(false);
  const [editedCommentsText, setEditedCommentsText] = useState("");
  const { message } = App.useApp();

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`);
      if (!res.ok) {
        message.error("Session not found");
        router.push("/");
        return;
      }
      const data = await res.json();
      setSession(data.session);
    } catch {
      message.error("Failed to load session");
      router.push("/");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  async function loadPostImage(postId: string) {
    if (!session) return;
    if (postId in postImages) return;
    try {
      const res = await fetch(
        `/api/sessions/${session._id}/image?postId=${encodeURIComponent(postId)}`
      );
      if (res.ok) {
        const blob = await res.blob();
        const disposition = res.headers.get("Content-Disposition") || "";
        const nameMatch = disposition.match(/filename="([^"]+)"/);
        const fileName = nameMatch ? nameMatch[1] : "image";
        const url = URL.createObjectURL(blob);
        setPostImages((prev) => ({ ...prev, [postId]: { url, fileName } }));
      } else {
        setPostImages((prev) => ({ ...prev, [postId]: null }));
      }
    } catch {
      setPostImages((prev) => ({ ...prev, [postId]: null }));
    }
  }

  async function uploadPostImage(postId: string, file: File) {
    if (!session) return;
    setPostImageUploading(postId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("postId", postId);
      const res = await fetch(`/api/sessions/${session._id}/image`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const getRes = await fetch(
        `/api/sessions/${session._id}/image?postId=${encodeURIComponent(postId)}`
      );
      if (getRes.ok) {
        const blob = await getRes.blob();
        const url = URL.createObjectURL(blob);
        setPostImages((prev) => ({ ...prev, [postId]: { url, fileName: file.name } }));
      }
      message.success("Image uploaded");
    } catch {
      message.error("Failed to upload image");
    } finally {
      setPostImageUploading(null);
    }
  }

  function downloadPostImage(postId: string) {
    const img = postImages[postId];
    if (!img) return;
    const a = document.createElement("a");
    a.href = img.url;
    a.download = img.fileName;
    a.click();
  }

  async function removePostImage(postId: string) {
    if (!session) return;
    try {
      const res = await fetch(
        `/api/sessions/${session._id}/image?postId=${encodeURIComponent(postId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Delete failed");
      setPostImages((prev) => ({ ...prev, [postId]: null }));
      message.success("Image removed");
    } catch {
      message.error("Failed to remove image");
    }
  }

  async function updatePostDescription(postId: string, description: string) {
    if (!session) return;
    try {
      await fetch(`/api/sessions/${session._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, description }),
      });
      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          posts: prev.posts?.map((p) =>
            p.id === postId ? { ...p, description, isEdited: true } : p
          ),
        };
      });
      if (selectedPost?.id === postId) {
        setSelectedPost((prev) => prev ? { ...prev, description, isEdited: true } : prev);
      }
      message.success("Description updated");
      setEditingDescription(false);
    } catch {
      message.error("Failed to update description");
    }
  }

  async function updatePostComments(postId: string, comments: string) {
    if (!session) return;
    try {
      await fetch(`/api/sessions/${session._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, comments }),
      });
      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          posts: prev.posts?.map((p) =>
            p.id === postId ? { ...p, comments } : p
          ),
        };
      });
      if (selectedPost?.id === postId) {
        setSelectedPost((prev) => prev ? { ...prev, comments } : prev);
      }
      message.success("Comments updated");
      setEditingComments(false);
    } catch {
      message.error("Failed to update comments");
    }
  }

  async function updatePostStatus(postId: string, status: PostStatus) {
    if (!session) return;
    try {
      await fetch(`/api/sessions/${session._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, status }),
      });
      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          posts: prev.posts?.map((p) =>
            p.id === postId ? { ...p, status } : p
          ),
        };
      });
    } catch {
      message.error("Failed to update status");
    }
  }

  const postColumns: ColumnsType<Post> = [
    {
      title: "Post ID",
      dataIndex: "id",
      key: "id",
      width: 90,
      render: (id: string) => <Text code>{id}</Text>,
    },
    {
      title: "Persona | Post #",
      key: "persona",
      width: 150,
      render: (_, post) => (
        <Space>
          <Tag color="purple">P{post.persona}</Tag>
          <Text type="secondary">Post {post.postNumber}</Text>
        </Space>
      ),
    },
    {
      title: "Description",
      dataIndex: "description",
      key: "description",
      ellipsis: true,
      render: (text: string, post) => (
        <span>
          {text}
          {post.isEdited && (
            <Text type="secondary" style={{ fontStyle: "italic", marginLeft: 8, fontSize: 12 }}>
              (edited)
            </Text>
          )}
        </span>
      ),
    },
    {
      title: "Image Description",
      dataIndex: "imageDescription",
      key: "imageDescription",
      width: 250,
      ellipsis: true,
      render: (text: string) => text || "\u2014",
    },
    {
      title: "Status",
      key: "status",
      width: 320,
      render: (_, post) => {
        const status = post.status || "draft";
        return (
          <Space>
            <Button
              size="small"
              type={status === "in_progress" ? "primary" : "default"}
              icon={<ClockCircleOutlined />}
              style={
                status === "in_progress"
                  ? { background: "#faad14", borderColor: "#faad14" }
                  : undefined
              }
              onClick={(e) => {
                e.stopPropagation();
                updatePostStatus(
                  post.id,
                  status === "in_progress" ? "draft" : "in_progress"
                );
              }}
            >
              In Progress
            </Button>
            <Button
              size="small"
              type={status === "posted" ? "primary" : "default"}
              icon={<CheckCircleOutlined />}
              style={
                status === "posted"
                  ? { background: "#52c41a", borderColor: "#52c41a" }
                  : undefined
              }
              onClick={(e) => {
                e.stopPropagation();
                updatePostStatus(
                  post.id,
                  status === "posted" ? "draft" : "posted"
                );
              }}
            >
              Posted
            </Button>
            <Button
              size="small"
              type={status === "flagged" ? "primary" : "default"}
              danger={status === "flagged"}
              icon={<FlagOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                updatePostStatus(
                  post.id,
                  status === "flagged" ? "draft" : "flagged"
                );
              }}
            >
              Flag
            </Button>
          </Space>
        );
      },
    },
  ];

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Text type="secondary">Loading session...</Text>
      </div>
    );
  }

  if (!session) return null;

  const posts = session.posts || [];

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5" }}>
      <div
        style={{
          background: "#fff",
          borderBottom: "1px solid #f0f0f0",
          padding: "16px 24px",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <Button
            icon={<ArrowLeftOutlined />}
            type="text"
            onClick={() => router.push("/")}
          />
          <div>
            <Title level={4} style={{ margin: 0 }}>
              {session.name}
            </Title>
            <Text type="secondary">
              {posts.length} posts &middot; {session.fileName}
            </Text>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
        <Table
          columns={postColumns}
          dataSource={posts}
          rowKey={(post, i) => post.id + "-" + i}
          pagination={false}
          onRow={(post) => ({
            onClick: () => setSelectedPost(post),
            style: { cursor: "pointer" },
          })}
        />
      </div>

      <Modal
        open={!!selectedPost}
        onCancel={() => setSelectedPost(null)}
        footer={null}
        title={selectedPost ? `Post ${selectedPost.id}` : ""}
        width={700}
        afterOpenChange={(open) => {
          if (open && selectedPost) {
            loadPostImage(selectedPost.id);
            setEditingDescription(false);
            setEditingComments(false);
          }
        }}
      >
        {selectedPost && (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text type="secondary">
                Persona {selectedPost.persona} — Post{" "}
                {selectedPost.postNumber}
              </Text>
              <Space>
                <Button
                  icon={<CopyOutlined />}
                  onClick={() => {
                    navigator.clipboard.writeText(selectedPost.description);
                    message.success("Description copied");
                  }}
                >
                  Copy Description
                </Button>
                {selectedPost.imageDescription && (
                  <Button
                    icon={<FileImageOutlined />}
                    onClick={() => {
                      navigator.clipboard.writeText(
                        selectedPost.imageDescription
                      );
                      message.success("Image description copied");
                    }}
                  >
                    Copy Image Description
                  </Button>
                )}
                {postImages[selectedPost.id] && (
                  <Button
                    icon={<DownloadOutlined />}
                    onClick={() => downloadPostImage(selectedPost.id)}
                  >
                    Download Image
                  </Button>
                )}
              </Space>
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Text strong>
                  Description
                  {selectedPost.isEdited && (
                    <Text
                      type="secondary"
                      style={{ fontStyle: "italic", marginLeft: 8, fontWeight: "normal" }}
                    >
                      (edited)
                    </Text>
                  )}
                </Text>
                {!editingDescription && (
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => {
                      setEditedDescriptionText(selectedPost.description);
                      setEditingDescription(true);
                    }}
                  />
                )}
              </div>
              {editingDescription ? (
                <div style={{ marginTop: 8 }}>
                  <Input.TextArea
                    value={editedDescriptionText}
                    onChange={(e) => setEditedDescriptionText(e.target.value)}
                    autoSize={{ minRows: 4, maxRows: 12 }}
                  />
                  <Space style={{ marginTop: 8 }}>
                    <Button
                      type="primary"
                      icon={<SaveOutlined />}
                      onClick={() =>
                        updatePostDescription(selectedPost.id, editedDescriptionText)
                      }
                    >
                      Save
                    </Button>
                    <Button
                      icon={<CloseOutlined />}
                      onClick={() => setEditingDescription(false)}
                    >
                      Cancel
                    </Button>
                  </Space>
                </div>
              ) : (
                <Paragraph style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
                  {selectedPost.description}
                </Paragraph>
              )}
            </div>
            {selectedPost.imageDescription && (
              <div style={{ marginTop: 16 }}>
                <Collapse
                  size="small"
                  items={[
                    {
                      key: "1",
                      label: <Text strong>Image Description</Text>,
                      children: (
                        <Paragraph
                          style={{ margin: 0, whiteSpace: "pre-wrap" }}
                        >
                          {selectedPost.imageDescription}
                        </Paragraph>
                      ),
                    },
                  ]}
                />
              </div>
            )}

            {/* Comments Section */}
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Text strong>
                  <CommentOutlined style={{ marginRight: 6 }} />
                  Comments
                </Text>
                {!editingComments && (
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => {
                      setEditedCommentsText(selectedPost.comments || "");
                      setEditingComments(true);
                    }}
                  />
                )}
              </div>
              {editingComments ? (
                <div style={{ marginTop: 8 }}>
                  <Input.TextArea
                    value={editedCommentsText}
                    onChange={(e) => setEditedCommentsText(e.target.value)}
                    autoSize={{ minRows: 2, maxRows: 8 }}
                    placeholder="Add comments about this post..."
                  />
                  <Space style={{ marginTop: 8 }}>
                    <Button
                      type="primary"
                      icon={<SaveOutlined />}
                      onClick={() =>
                        updatePostComments(selectedPost.id, editedCommentsText)
                      }
                    >
                      Save
                    </Button>
                    <Button
                      icon={<CloseOutlined />}
                      onClick={() => setEditingComments(false)}
                    >
                      Cancel
                    </Button>
                  </Space>
                </div>
              ) : (
                <Paragraph
                  style={{ marginTop: 8, whiteSpace: "pre-wrap", color: selectedPost.comments ? undefined : "#bfbfbf" }}
                >
                  {selectedPost.comments || "No comments yet"}
                </Paragraph>
              )}
            </div>

            {/* Post Image Section */}
            <div style={{ marginTop: 20 }}>
              <div style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Text strong>
                  <PictureOutlined style={{ marginRight: 6 }} />
                  Post Image
                </Text>
                {postImages[selectedPost.id] && (
                  <Popconfirm
                    title="Remove image?"
                    onConfirm={() => removePostImage(selectedPost.id)}
                  >
                    <Button icon={<DeleteOutlined />} danger size="small">
                      Remove
                    </Button>
                  </Popconfirm>
                )}
              </div>

              {postImages[selectedPost.id] && (
                <div style={{ marginBottom: 12 }}>
                  <Image
                    src={postImages[selectedPost.id]!.url}
                    alt="Post image"
                    style={{
                      maxWidth: "100%",
                      maxHeight: 320,
                      objectFit: "contain",
                      borderRadius: 8,
                      border: "1px solid #f0f0f0",
                      display: "block",
                    }}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {postImages[selectedPost.id]!.fileName}
                  </Text>
                </div>
              )}

              <Upload.Dragger
                accept="image/*"
                maxCount={1}
                showUploadList={false}
                beforeUpload={(file) => {
                  uploadPostImage(selectedPost.id, file);
                  return false;
                }}
                style={{ padding: "12px 0" }}
              >
                {postImageUploading === selectedPost.id ? (
                  <Text type="secondary">Uploading...</Text>
                ) : (
                  <>
                    <p>
                      <UploadOutlined
                        style={{ fontSize: 22, color: "#999" }}
                      />
                    </p>
                    <p style={{ margin: 0 }}>
                      {postImages[selectedPost.id]
                        ? "Click or drag to replace image"
                        : "Click or drag an image to upload"}
                    </p>
                  </>
                )}
              </Upload.Dragger>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
