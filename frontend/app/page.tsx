"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Modal,
  Input,
  Upload,
  Card,
  Typography,
  App,
  Empty,
  Popconfirm,
  Collapse,
} from "antd";
import {
  PlusOutlined,
  UploadOutlined,
  DeleteOutlined,
  CopyOutlined,
} from "@ant-design/icons";
import type { UploadFile } from "antd/es/upload";

const { Title, Text } = Typography;

interface Session {
  _id: string;
  name: string;
  fileName: string;
  postCount: number;
  createdAt: string;
}

export default function Home() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const fileRef = useRef<File | null>(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  async function deleteSession(id: string) {
    try {
      await fetch(`/api/sessions/${id}`, { method: "DELETE" });
      setSessions((s) => s.filter((x) => x._id !== id));
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
      router.push(`/sessions/${data.sessionId}`);
    } catch {
      message.error("Failed to upload file");
    } finally {
      setUploading(false);
    }
  }

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
              onClick={() => router.push(`/sessions/${session._id}`)}
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
