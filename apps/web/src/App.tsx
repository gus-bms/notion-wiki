import { useEffect, useMemo, useState } from "react";
import { ToastProvider, useToast } from "./components/ui/ToastProvider";
import { apiFetch } from "./lib/api";
import {
  WorkspaceBootstrap,
  ChatThreadItem,
  SelectedCitation,
  Citation,
  IngestPageFailure,
} from "./lib/types";
import { WorkspaceSettings } from "./components/WorkspaceSettings";
import { ChatPanel } from "./components/chat/ChatPanel";
import { Sidebar } from "./components/chat/Sidebar";
import { ChatSessionDetailOutput } from "./lib/types";

function AppShell(): JSX.Element {
  const { pushToast } = useToast();
  const [bootstrapping, setBootstrapping] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceBootstrap | null>(null);

  const [sessionId, setSessionId] = useState<number | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatThreadItem[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  const [pageFailures, setPageFailures] = useState<IngestPageFailure[]>([]);
  const [loadingPageFailures, setLoadingPageFailures] = useState(false);

  const source = workspace?.source ?? null;
  const sourceId = source?.sourceId ?? null;
  const hasSource = workspace?.hasSource === true && source !== null;

  const unresolvedFailureCount = useMemo(
    () =>
      pageFailures.filter((failure) => failure.status !== "resolved").length,
    [pageFailures],
  );

  async function loadPageFailures(
    targetSourceId: number,
    includeResolved = false,
  ): Promise<void> {
    setLoadingPageFailures(true);
    try {
      const result = await apiFetch<{ failures: IngestPageFailure[] }>(
        `/ingest/page-failures?sourceId=${targetSourceId}&includeResolved=${includeResolved ? "1" : "0"}`,
      );
      setPageFailures(result.failures);
    } catch (error) {
      pushToast(
        "error",
        error instanceof Error ? error.message : "Failed to load page failures",
      );
      setPageFailures([]);
    } finally {
      setLoadingPageFailures(false);
    }
  }

  useEffect(() => {
    if (!sourceId) {
      setPageFailures([]);
      return;
    }
    void loadPageFailures(sourceId, false);
  }, [sourceId]);

  async function loadBootstrap(silentError = false): Promise<void> {
    setBootstrapping(true);
    try {
      const result = await apiFetch<WorkspaceBootstrap>("/workspace/bootstrap");
      setWorkspace(result);
    } catch (error) {
      if (!silentError) {
        pushToast(
          "error",
          error instanceof Error ? error.message : "Workspace bootstrap failed",
        );
      }
      setWorkspace({
        hasSource: false,
        source: null,
        latestIngestJob: null,
      });
    } finally {
      setBootstrapping(false);
    }
  }

  useEffect(() => {
    void loadBootstrap();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      if (key === "escape" && showSettings) {
        event.preventDefault();
        setShowSettings(false);
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showSettings]);

  function startNewSession(): void {
    setSessionId(null);
    setChatHistory([]);
    pushToast("info", "Started a new chat session.");
  }

  async function handleSessionSelect(
    newSessionId: number | null,
  ): Promise<void> {
    if (newSessionId === null) {
      startNewSession();
      return;
    }

    setSessionId(newSessionId);
    try {
      const detail = await apiFetch<ChatSessionDetailOutput>(
        `/chat/sessions/${newSessionId}`,
      );
      // Messages are sorted by createdAt asc from server.
      // Pair each user message with the immediately following assistant message.
      const mappedHistory: ChatThreadItem[] = [];
      const msgs = detail.messages;
      for (let i = 0; i < msgs.length; i++) {
        const m = msgs[i];
        if (m.role !== "user") continue;
        const next = i + 1 < msgs.length ? msgs[i + 1] : null;
        const assistant = next?.role === "assistant" ? next : null;
        mappedHistory.push({
          localId: String(m.id),
          question: m.messageText,
          askedAtIso: m.createdAt,
          result: assistant
            ? {
                sessionId: newSessionId,
                answer: assistant.answerText ?? "",
                citations: assistant.citations ?? [],
                documents: assistant.documents ?? [],
                meta: assistant.meta ?? {
                  topK: 8,
                  retrievalMs: 0,
                  llmMs: 0,
                },
              }
            : {
                sessionId: newSessionId,
                answer: "No response recorded.",
                citations: [],
                documents: [],
                meta: { topK: 0, retrievalMs: 0, llmMs: 0 },
              },
        });
      }

      setChatHistory(mappedHistory);
    } catch (error) {
      pushToast("error", "Failed to load session details.");
    }
  }

  async function handleSessionDelete(targetSessionId: number): Promise<void> {
    try {
      await apiFetch<{ deleted: boolean }>(
        `/chat/sessions/${targetSessionId}`,
        {
          method: "DELETE",
        },
      );
      pushToast("info", "대화가 삭제되었습니다.");
      if (sessionId === targetSessionId) {
        startNewSession();
      }
    } catch (error) {
      pushToast(
        "error",
        error instanceof Error ? error.message : "삭제에 실패했습니다.",
      );
    }
  }

  if (bootstrapping) {
    return (
      <div className="app-shell">
        <section className="loading-state">
          <h1>notion-wiki</h1>
          <p>Loading workspace...</p>
        </section>
      </div>
    );
  }

  return (
    <div className="chatgpt-layout">
      {hasSource && source && (
        <Sidebar
          sourceId={source.sourceId}
          currentSessionId={sessionId}
          onSelectSession={handleSessionSelect}
          onDeleteSession={handleSessionDelete}
          workspace={workspace}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}

      <div className="app-shell">
        {!hasSource && (
          <section className="auth-shell">
            <div className="auth-card">
              <WorkspaceSettings
                bootstrapping={bootstrapping}
                workspace={workspace}
                hasSource={hasSource}
                sourceId={sourceId}
                onBootstrapComplete={loadBootstrap}
                withHeading={true}
                pageFailures={pageFailures}
                loadingPageFailures={loadingPageFailures}
                onReloadFailures={(includeResolved) =>
                  sourceId && loadPageFailures(sourceId, includeResolved)
                }
              />
            </div>
          </section>
        )}

        {hasSource && source && (
          <>
            <main className="chat-layout">
              <ChatPanel
                sourceId={source.sourceId}
                sessionId={sessionId}
                chatHistory={chatHistory}
                onSessionChange={setSessionId}
                onHistoryChange={setChatHistory}
              />
            </main>
          </>
        )}

        {showSettings && hasSource && (
          <div
            className="settings-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowSettings(false);
            }}
          >
            <section className="settings-modal">
              <div className="settings-head">
                <h2>Settings</h2>
                <button
                  type="button"
                  className="stab-close-btn"
                  onClick={() => setShowSettings(false)}
                  aria-label="Close settings"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <WorkspaceSettings
                bootstrapping={bootstrapping}
                workspace={workspace}
                hasSource={hasSource}
                sourceId={sourceId}
                onBootstrapComplete={loadBootstrap}
                onClose={() => setShowSettings(false)}
                pageFailures={pageFailures}
                loadingPageFailures={loadingPageFailures}
                onReloadFailures={(includeResolved) =>
                  sourceId && loadPageFailures(sourceId, includeResolved)
                }
              />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

export function App(): JSX.Element {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}
