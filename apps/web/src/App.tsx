import { useEffect, useMemo, useState } from "react";
import { ToastProvider, useToast } from "./components/ui/ToastProvider";
import { apiFetch } from "./lib/api";
import {
  WorkspaceBootstrap,
  ChatThreadItem,
  SelectedCitation,
  Citation,
  IngestPageFailure
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
    () => pageFailures.filter((failure) => failure.status !== "resolved").length,
    [pageFailures]
  );

  async function loadPageFailures(targetSourceId: number, includeResolved = false): Promise<void> {
    setLoadingPageFailures(true);
    try {
      const result = await apiFetch<{ failures: IngestPageFailure[] }>(
        `/ingest/page-failures?sourceId=${targetSourceId}&includeResolved=${includeResolved ? "1" : "0"}`
      );
      setPageFailures(result.failures);
    } catch (error) {
      pushToast("error", error instanceof Error ? error.message : "Failed to load page failures");
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
        pushToast("error", error instanceof Error ? error.message : "Workspace bootstrap failed");
      }
      setWorkspace({
        hasSource: false,
        source: null,
        latestIngestJob: null
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

  async function handleSessionSelect(newSessionId: number | null): Promise<void> {
    if (newSessionId === null) {
      startNewSession();
      return;
    }
    
    setSessionId(newSessionId);
    try {
      const detail = await apiFetch<ChatSessionDetailOutput>(`/chat/sessions/${newSessionId}`);
      // Re-map messages to ChatThreadItem shape
      const mappedHistory: ChatThreadItem[] = detail.messages
        .filter((m) => m.role === "user")
        .map((m) => {
          // Find the corresponding assistant answer
          // Our simple history assumes pairs, but DB stores them.
          const answerMsg = detail.messages.find(
            (am) => am.role === "assistant" && am.createdAt > m.createdAt
          );
          
          return {
            localId: String(m.id),
            question: m.messageText,
            askedAtIso: m.createdAt,
            result: answerMsg ? {
              sessionId: newSessionId,
              answer: answerMsg.answerText ?? "",
              citations: answerMsg.citations ?? [],
              documents: answerMsg.documents ?? [],
              meta: answerMsg.meta ?? {
                topK: 8,
                retrievalMs: 0,
                llmMs: 0
              }
            } : {
              sessionId: newSessionId,
              answer: "No response recorded.",
              citations: [],
              documents: [],
              meta: { topK: 0, retrievalMs: 0, llmMs: 0 }
            }
          };
        });

      setChatHistory(mappedHistory);
    } catch (error) {
      pushToast("error", "Failed to load session details.");
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
              onReloadFailures={(includeResolved) => sourceId && loadPageFailures(sourceId, includeResolved)}
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
        <div className="settings-backdrop" role="dialog" aria-modal="true" aria-label="Workspace settings">
          <section className="settings-modal" style={{ maxHeight: "90vh", overflowY: "auto" }}>
            <div className="settings-head">
              <h2>Workspace settings</h2>
              <button type="button" className="button-secondary" onClick={() => setShowSettings(false)}>
                Close
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
              onReloadFailures={(includeResolved) => sourceId && loadPageFailures(sourceId, includeResolved)}
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
