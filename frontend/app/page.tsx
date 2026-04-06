"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Table,
  Button,
  Tag,
  Modal,
  Input,
  Upload,
  Card,
  Space,
  Typography,
  App,
  Empty,
  Popconfirm,
  Collapse,
  Image,
} from "antd";
import {
  PlusOutlined,
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
} from "@ant-design/icons";
import type { Post, PostStatus } from "@/lib/parse-posts";
import type { ColumnsType } from "antd/es/table";
import type { UploadFile } from "antd/es/upload";

const { Title, Text, Paragraph } = Typography;

interface Session {
  _id: string;
  name: string;
  fileName: string;
  postCount: number;
  createdAt: string;
  posts?: Post[];
}

export default function Home() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const fileRef = useRef<File | null>(null);
  // Per-post image state: postId → { url, fileName } | null
  const [postImages, setPostImages] = useState<Record<string, { url: string; fileName: string } | null>>({});
  const [postImageUploading, setPostImageUploading] = useState<string | null>(null);
  const [editingDescription, setEditingDescription] = useState(false);
  const [editedDescriptionText, setEditedDescriptionText] = useState("");
  const { message } = App.useApp();

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions");
      const data = await res.json();
      setSessions(data.sessions);
    } catch {
      message.error("Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  async function openSession(id: string) {
    try {
      const res = await fetch(`/api/sessions/${id}`);
      const data = await res.json();
      setActiveSession(data.session);
    } catch {
      message.error("Failed to load session");
    }
  }

  async function deleteSession(id: string) {
    try {
      await fetch(`/api/sessions/${id}`, { method: "DELETE" });
      setSessions((s) => s.filter((x) => x._id !== id));
      if (activeSession?._id === id) setActiveSession(null);
      message.success("Session deleted");
    } catch {
      message.error("Failed to delete session");
    }
  }

  async function handleCreateSession() {
    const file = fileRef.current;
    if (!file) {
      message.warning("Please select a file");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", sessionName || file.name.replace(/\.json$/, ""));

    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        message.error(data.error || "Upload failed");
        return;
      }

      setShowUpload(false);
      setSessionName("");
      setFileList([]);
      fileRef.current = null;
      message.success(`Session created with ${data.postCount} posts`);
      await fetchSessions();
      await openSession(data.sessionId);
    } catch {
      message.error("Failed to upload file");
    } finally {
      setUploading(false);
    }
  }

  // Load image metadata for a post when the modal opens
  async function loadPostImage(postId: string) {
    if (!activeSession) return;
    // If we already know the state, skip
    if (postId in postImages) return;
    try {
      const res = await fetch(
        `/api/sessions/${activeSession._id}/image?postId=${encodeURIComponent(postId)}`
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
    if (!activeSession) return;
    setPostImageUploading(postId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("postId", postId);
      const res = await fetch(`/api/sessions/${activeSession._id}/image`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      // Re-fetch to get a fresh blob URL
      const getRes = await fetch(
        `/api/sessions/${activeSession._id}/image?postId=${encodeURIComponent(postId)}`
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
    if (!activeSession) return;
    try {
      const res = await fetch(
        `/api/sessions/${activeSession._id}/image?postId=${encodeURIComponent(postId)}`,
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
    if (!activeSession) return;
    try {
      await fetch(`/api/sessions/${activeSession._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, description }),
      });
      setActiveSession((prev) => {
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

  async function updatePostStatus(postId: string, status: PostStatus) {
    if (!activeSession) return;
    try {
      await fetch(`/api/sessions/${activeSession._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, status }),
      });
      setActiveSession((prev) => {
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

  // Post table columns
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
      render: (text: string) => text || "—",
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

  // Session detail view
  if (activeSession) {
    const posts = activeSession.posts || [];
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
              onClick={() => setActiveSession(null)}
            />
            <div>
              <Title level={4} style={{ margin: 0 }}>
                {activeSession.name}
              </Title>
              <Text type="secondary">
                {posts.length} posts &middot; {activeSession.fileName}
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

              {/* ── Post Image Section ── */}
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

                {/* Preview */}
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

                {/* Upload dragger */}
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
                    <Text type="secondary">Uploading…</Text>
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

  // Sessions list view
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
            justifyContent: "space-between",
          }}
        >
          <Title level={4} style={{ margin: 0 }}>
            LinkedIn Post Viewer
          </Title>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setShowUpload(true)}
          >
            New Session
          </Button>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
        {loading && <Text type="secondary">Loading sessions...</Text>}

        {!loading && sessions.length === 0 && (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <Empty description="No sessions yet">
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setShowUpload(true)}
              >
                New Session
              </Button>
            </Empty>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {sessions.map((session) => (
            <Card
              key={session._id}
              hoverable
              onClick={() => openSession(session._id)}
              style={{ cursor: "pointer" }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <Text strong>{session.name}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    {session.postCount} posts &middot; {session.fileName}{" "}
                    &middot;{" "}
                    {new Date(session.createdAt).toLocaleDateString(
                      "en-US",
                      {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }
                    )}
                  </Text>
                </div>
                <Popconfirm
                  title="Delete this session?"
                  onConfirm={(e) => {
                    e?.stopPropagation();
                    deleteSession(session._id);
                  }}
                  onCancel={(e) => e?.stopPropagation()}
                >
                  <Button
                    danger
                    type="text"
                    icon={<DeleteOutlined />}
                    onClick={(e) => e.stopPropagation()}
                  />
                </Popconfirm>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Modal
        open={showUpload}
        onCancel={() => {
          setShowUpload(false);
          setSessionName("");
          setFileList([]);
          fileRef.current = null;
        }}
        title="New Session"
        onOk={handleCreateSession}
        okText="Create Session"
        confirmLoading={uploading}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <Text strong>Session Name</Text>
            <Input
              placeholder="e.g. Persona 2 — April Batch"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              style={{ marginTop: 4 }}
            />
          </div>
          <div>
            <Text strong>Post File (.json)</Text>
            <Upload.Dragger
              accept=".json"
              maxCount={1}
              fileList={fileList}
              beforeUpload={(file) => {
                fileRef.current = file;
                setFileList([{ uid: "-1", name: file.name, status: "done" }]);
                return false;
              }}
              onRemove={() => {
                fileRef.current = null;
                setFileList([]);
              }}
              style={{ marginTop: 4 }}
            >
              <p>
                <UploadOutlined style={{ fontSize: 24, color: "#999" }} />
              </p>
              <p>Click or drag a .json file here</p>
            </Upload.Dragger>
          </div>
          <Collapse
            size="small"
            items={[
              {
                key: "1",
                label: "View expected JSON format",
                children: (
                  <div>
                    <pre
                      style={{
                        background: "#f5f5f5",
                        padding: 12,
                        borderRadius: 6,
                        fontSize: 12,
                        overflow: "auto",
                        maxHeight: 260,
                        margin: 0,
                      }}
                    >
{`{
  "posts": [
    {
      "id": "001",
      "persona": "2",
      "postNumber": "1",
      "description": "Your LinkedIn post text here...",
      "imageDescription": "Optional image description or empty string"
    },
    {
      "id": "002",
      "persona": "2",
      "postNumber": "2",
      "description": "Another post text...",
      "imageDescription": ""
    }
  ]
}`}
                    </pre>
                    <Button
                      icon={<CopyOutlined />}
                      size="small"
                      style={{ marginTop: 8 }}
                      onClick={() => {
                        const exampleFormat = JSON.stringify(
                          {
                            posts: [
                              {
                                id: "001",
                                persona: "2",
                                postNumber: "1",
                                description: "Your LinkedIn post text here...",
                                imageDescription: "Optional image description or empty string",
                              },
                              {
                                id: "002",
                                persona: "2",
                                postNumber: "2",
                                description: "Another post text...",
                                imageDescription: "",
                              },
                            ],
                          },
                          null,
                          2
                        );
                        navigator.clipboard.writeText(exampleFormat);
                        message.success("JSON format copied to clipboard");
                      }}
                    >
                      Copy Format
                    </Button>
                    <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: "block" }}>
                      Copy and give to AI to structure your posts
                    </Text>
                  </div>
                ),
              },
            ]}
          />
        </div>
      </Modal>
    </div>
  );
}
