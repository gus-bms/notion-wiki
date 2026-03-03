import { useEffect, useState } from "react";
import { ChatSessionListOutput, WorkspaceBootstrap } from "../../lib/types";
import { apiFetch } from "../../lib/api";
import { useToast } from "../ui/ToastProvider";

interface SidebarProps {
  sourceId: number;
  currentSessionId: number | null;
  onSelectSession: (sessionId: number | null) => void;
  workspace: WorkspaceBootstrap | null;
  onOpenSettings: () => void;
}

export function Sidebar({
  sourceId,
  currentSessionId,
  onSelectSession,
  workspace,
  onOpenSettings
}: SidebarProps): JSX.Element {
  const [sessions, setSessions] = useState<ChatSessionListOutput["sessions"]>([]);
  const [loading, setLoading] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const { pushToast } = useToast();

  const source = workspace?.source ?? null;

  async function loadSessions() {
    setLoading(true);
    try {
      const result = await apiFetch<ChatSessionListOutput>(`/chat/sessions?sourceId=${sourceId}`);
      setSessions(result.sessions);
    } catch (error) {
      pushToast("error", error instanceof Error ? error.message : "Failed to load chat history");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, currentSessionId]);

  return (
    <aside className="sidebar">
      {/* ── Brand ── */}
      <div className="sidebar-brand">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
        </svg>
        <span>notion-wiki</span>
      </div>

      {/* ── New Chat ── */}
      <div className="sidebar-header">
        <button
          className="button-primary new-chat-button"
          onClick={() => onSelectSession(null)}
          title="New Chat"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          New Chat
        </button>
      </div>

      {/* ── Session list ── */}
      <div className="sidebar-content">
        {loading && sessions.length === 0 ? (
          <div className="sidebar-muted">Loading history...</div>
        ) : sessions.length === 0 ? (
          <div className="sidebar-muted">No previous chats.</div>
        ) : (
          <ul className="session-list">
            {sessions.map((session) => (
              <li key={session.id}>
                <button
                  className={`session-item ${currentSessionId === session.id ? "active" : ""}`}
                  onClick={() => onSelectSession(session.id)}
                >
                  <span className="session-title">{session.title}</span>
                  <span className="session-date">
                    {new Date(session.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric"
                    })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Footer: Workspace info + Settings ── */}
      <div className="sidebar-footer">
        {source && (
          <button
            className="sidebar-info-toggle"
            onClick={() => setInfoOpen(!infoOpen)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            Workspace Info
            <svg
              className={`sidebar-chevron ${infoOpen ? "open" : ""}`}
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        )}

        {infoOpen && source && (
          <div className="sidebar-info-panel">
            <div className="sidebar-info-row">
              <span>Source</span>
              <strong>{source.name}</strong>
            </div>
            <div className="sidebar-info-row">
              <span>Targets</span>
              <strong>{source.activeTargetCount}</strong>
            </div>
            <div className="sidebar-info-row">
              <span>Docs</span>
              <strong>{source.documentCount}</strong>
            </div>
            <div className="sidebar-info-row">
              <span>Sync</span>
              <strong>{workspace?.latestIngestJob?.status ?? "none"}</strong>
            </div>
          </div>
        )}

        <button className="sidebar-settings-btn" onClick={onOpenSettings}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
          Settings
        </button>
      </div>
    </aside>
  );
}
