import { useEffect, useMemo, useState } from "react";
import { ToastProvider, useToast } from "./components/ui/ToastProvider";
import { apiFetch } from "./lib/api";
import {
  WorkspaceBootstrap,
  ChatThreadItem,
  SelectedCitation,
  Citation
} from "./lib/types";
import { WorkspaceSettings } from "./components/WorkspaceSettings";
import { ChatPanel } from "./components/chat/ChatPanel";
import { CitationInspector } from "./components/chat/CitationInspector";

function AppShell(): JSX.Element {
  const { pushToast } = useToast();
  const [bootstrapping, setBootstrapping] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceBootstrap | null>(null);

  const [sessionId, setSessionId] = useState<number | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatThreadItem[]>([]);
  const [selectedCitation, setSelectedCitation] = useState<SelectedCitation | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const source = workspace?.source ?? null;
  const sourceId = source?.sourceId ?? null;
  const hasSource = workspace?.hasSource === true && source !== null;

  const selectedCitationKey = useMemo(() => {
    if (!selectedCitation) {
      return "";
    }
    return `${selectedCitation.sourceThreadLocalId}-${selectedCitation.sourceCitationIndex}-${selectedCitation.citation.chunkId}`;
  }, [selectedCitation]);

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
      if (key === "escape" && selectedCitation) {
        event.preventDefault();
        setSelectedCitation(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedCitation, showSettings]);

  function startNewSession(): void {
    setSessionId(null);
    setChatHistory([]);
    setSelectedCitation(null);
    pushToast("info", "Started a new chat session.");
  }

  function handleCitationSelect(item: ChatThreadItem, citation: Citation, citationIndex: number): void {
    setSelectedCitation({
      citation,
      fromQuestion: item.question,
      fromAskedAtIso: item.askedAtIso,
      sourceThreadLocalId: item.localId,
      sourceCitationIndex: citationIndex
    });
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
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>notion-wiki</h1>
          <p>Ask internal knowledge and verify every answer with citations.</p>
        </div>
        {hasSource && (
          <div className="header-actions">
            <button type="button" className="button-secondary" onClick={() => setShowSettings(true)}>
              Workspace settings
            </button>
            <button type="button" className="button-secondary" onClick={startNewSession}>
              New session
            </button>
          </div>
        )}
      </header>

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
            />
          </div>
        </section>
      )}

      {hasSource && source && (
        <>
          <section className="status-row">
            <div className="status-chip">
              <span>Source</span>
              <strong>{source.name}</strong>
            </div>
            <div className="status-chip">
              <span>Active targets</span>
              <strong>{source.activeTargetCount}</strong>
            </div>
            <div className="status-chip">
              <span>Indexed docs</span>
              <strong>{source.documentCount}</strong>
            </div>
            <div className="status-chip">
              <span>Latest ingest</span>
              <strong>{workspace?.latestIngestJob?.status ?? "none"}</strong>
            </div>
          </section>

          {source.activeTargetCount === 0 && (
            <section className="callout callout-warning">
              <strong>No active targets.</strong> Open workspace settings and save token with auto-discover enabled.
            </section>
          )}

          {source.documentCount === 0 && source.activeTargetCount > 0 && (
            <section className="callout callout-info">
              <strong>No indexed documents yet.</strong> Open workspace settings and run incremental sync, then start chatting with citations.
            </section>
          )}

          <main className="chat-layout">
            <ChatPanel
              sourceId={source.sourceId}
              sessionId={sessionId}
              chatHistory={chatHistory}
              selectedCitationKey={selectedCitationKey}
              onSessionChange={setSessionId}
              onHistoryChange={setChatHistory}
              onCitationSelect={handleCitationSelect}
              onClearCitation={() => setSelectedCitation(null)}
            />

            <CitationInspector
              selectedCitation={selectedCitation}
              onClear={() => setSelectedCitation(null)}
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
            />
          </section>
        </div>
      )}
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
