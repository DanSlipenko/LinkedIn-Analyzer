"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Post } from "@/lib/parse-posts";

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
  const [error, setError] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions");
      const data = await res.json();
      setSessions(data.sessions);
    } catch {
      setError("Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  async function openSession(id: string) {
    setError("");
    try {
      const res = await fetch(`/api/sessions/${id}`);
      const data = await res.json();
      setActiveSession(data.session);
    } catch {
      setError("Failed to load session");
    }
  }

  async function deleteSession(id: string) {
    try {
      await fetch(`/api/sessions/${id}`, { method: "DELETE" });
      setSessions((s) => s.filter((x) => x._id !== id));
      if (activeSession?._id === id) setActiveSession(null);
    } catch {
      setError("Failed to delete session");
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", sessionName || file.name.replace(/\.txt$/, ""));

    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Upload failed");
        return;
      }

      setShowUpload(false);
      setSessionName("");
      await fetchSessions();
      await openSession(data.sessionId);
    } catch {
      setError("Failed to upload file");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Session detail view
  if (activeSession) {
    const posts = activeSession.posts || [];
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900">
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center gap-4">
            <button
              onClick={() => setActiveSession(null)}
              className="text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
            >
              &larr; Back
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-semibold">{activeSession.name}</h1>
              <p className="text-sm text-gray-500">
                {posts.length} posts &middot; {activeSession.fileName}
              </p>
            </div>
          </div>
        </header>

        <main className="max-w-6xl mx-auto p-6">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 text-left text-sm text-gray-500">
                  <th className="px-4 py-3 font-medium w-20">Post ID</th>
                  <th className="px-4 py-3 font-medium w-40">
                    Persona | Post #
                  </th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium w-48">
                    Image Description
                  </th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post, i) => (
                  <tr
                    key={post.id + "-" + i}
                    onClick={() => setSelectedPost(post)}
                    className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-sm font-mono font-medium text-blue-600">
                      {post.id}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs font-medium">
                        P{post.persona}
                      </span>
                      <span className="ml-2 text-gray-600">
                        Post {post.postNumber}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 max-w-md">
                      <p className="line-clamp-2">{post.description}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      <p className="line-clamp-2">
                        {post.imageDescription || "—"}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>

        {/* Post detail modal */}
        {selectedPost && (
          <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
            onClick={() => setSelectedPost(null)}
          >
            <div
              className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold">
                    Post {selectedPost.id}
                  </h2>
                  <p className="text-sm text-gray-500">
                    Persona {selectedPost.persona} — Post{" "}
                    {selectedPost.postNumber}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedPost(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl leading-none cursor-pointer"
                >
                  &times;
                </button>
              </div>
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-500 mb-2">
                  Description
                </h3>
                <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                  {selectedPost.description}
                </p>
              </div>
              {selectedPost.imageDescription && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">
                    Image Description
                  </h3>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed bg-gray-50 p-3 rounded-lg">
                    {selectedPost.imageDescription}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Sessions list view
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-semibold">LinkedIn Post Viewer</h1>
          <button
            onClick={() => setShowUpload(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors cursor-pointer"
          >
            New Session
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {loading && (
          <div className="text-center py-12 text-gray-500">
            Loading sessions...
          </div>
        )}

        {!loading && sessions.length === 0 && (
          <div className="text-center py-24">
            <div className="text-5xl mb-4">📁</div>
            <h2 className="text-lg font-medium text-gray-700 mb-2">
              No sessions yet
            </h2>
            <p className="text-gray-500 mb-6">
              Create a new session by uploading a post file.
            </p>
            <button
              onClick={() => setShowUpload(true)}
              className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors cursor-pointer"
            >
              New Session
            </button>
          </div>
        )}

        {sessions.length > 0 && (
          <div className="grid gap-4">
            {sessions.map((session) => (
              <div
                key={session._id}
                className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between hover:border-blue-300 transition-colors"
              >
                <button
                  onClick={() => openSession(session._id)}
                  className="flex-1 text-left cursor-pointer bg-transparent border-none p-0"
                >
                  <h2 className="font-medium text-gray-900">{session.name}</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {session.postCount} posts &middot; {session.fileName}{" "}
                    &middot;{" "}
                    {new Date(session.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSession(session._id);
                  }}
                  className="text-gray-400 hover:text-red-500 ml-4 text-sm cursor-pointer"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Upload modal */}
      {showUpload && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          onClick={() => setShowUpload(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-4">New Session</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Session Name
                </label>
                <input
                  type="text"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  placeholder="e.g. Persona 2 — April Batch"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Post File (.txt)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.text"
                  onChange={handleUpload}
                  className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 file:cursor-pointer"
                />
              </div>
              {uploading && (
                <p className="text-sm text-gray-500">Uploading & parsing...</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
