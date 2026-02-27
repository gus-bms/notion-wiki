import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Citation = { chunkId: string; title: string; url: string; quote: string };

type ChatResult = {
  sessionId: number;
  answer: string;
  citations: Citation[];
  meta: { topK: number; retrievalMs: number; llmMs: number };
};

type ChatThreadItem = {
  localId: number;
  question: string;
  result: ChatResult;
  askedAtIso: string;
};

type SelectedCitation = {
  citation: Citation;
  fromQuestion: string;
  fromAskedAtIso: string;
  sourceThreadLocalId: number;
  sourceCitationIndex: number;
};

type WorkspaceBootstrap = {
  hasSource: boolean;
  source: {
    sourceId: number;
    name: string;
    notionApiVersion: string;
    status: "active" | "inactive";
    activeTargetCount: number;
    documentCount: number;
  } | null;
  latestIngestJob: {
    jobId: number;
    status: "queued" | "running" | "succeeded" | "failed";
    mode: "full" | "incremental" | "webhook";
    startedAt: string | null;
    finishedAt: string | null;
  } | null;
};

type WorkspaceLoginResponse = {
  sourceId: number;
  mode: "created" | "updated";
  activeTargetCount: number;
  discovery: {
    scannedEntries: number;
    discoveredTargets: number;
    createdTargets: number;
    reactivatedTargets: number;
    dataSourceTargets: number;
    pageTargets: number;
  } | null;
  fullSyncJob: {
    jobId: number;
    queued: true;
  } | null;
};

type IngestPageFailure = {
  failureId: number;
  sourceId: number;
  notionPageId: string;
  status: "open" | "retry_queued" | "resolved";
  failureCount: number;
  targetType: string | null;
  targetIdValue: string | null;
  failureStage: string;
  errorCode: string | null;
  errorMessage: string;
  firstFailedAt: string;
  lastFailedAt: string;
  retryRequestedAt: string | null;
  retryRequestedBy: string | null;
  resolvedAt: string | null;
  resolvedIngestJobId: number | null;
};

type ToastLevel = "success" | "error" | "warning" | "info";
type ToastItem = { id: number; level: ToastLevel; message: string };

const API_BASE_URL = __API_BASE_URL__?.trim() ? __API_BASE_URL__ : "http://localhost:3000";
const APP_TOKEN = __APP_TOKEN__?.trim() ?? "";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (APP_TOKEN.length === 0) {
    throw new Error("Missing APP token for web client. Set VITE_APP_TOKEN (or APP_TOKEN) in environment.");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${APP_TOKEN}`,
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`);
  }

  return (await response.json()) as T;
}

function toastClass(level: ToastLevel): string {
  if (level === "success") {
    return "toast toast-success";
  }
  if (level === "error") {
    return "toast toast-error";
  }
  if (level === "warning") {
    return "toast toast-warning";
  }
  return "toast toast-info";
}

export function App(): JSX.Element {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceBootstrap | null>(null);

  const [sourceName, setSourceName] = useState("my-notion");
  const [notionToken, setNotionToken] = useState("");
  const [notionApiVersion, setNotionApiVersion] = useState("2025-09-03");
  const [autoDiscoverTargets, setAutoDiscoverTargets] = useState(true);

  const [question, setQuestion] = useState("");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatThreadItem[]>([]);
  const [selectedCitation, setSelectedCitation] = useState<SelectedCitation | null>(null);

  const [loadingLogin, setLoadingLogin] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [syncModeLoading, setSyncModeLoading] = useState<"incremental" | "full" | null>(null);
  const [pageFailures, setPageFailures] = useState<IngestPageFailure[]>([]);
  const [loadingPageFailures, setLoadingPageFailures] = useState(false);
  const [includeResolvedFailures, setIncludeResolvedFailures] = useState(false);
  const [retryingFailureId, setRetryingFailureId] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastTimers = useRef<Record<number, number>>({});
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const source = workspace?.source ?? null;
  const sourceId = source?.sourceId ?? null;
  const hasSource = workspace?.hasSource === true && source !== null;
  const selectedCitationKey = useMemo(() => {
    if (!selectedCitation) {
      return "";
    }
    return `${selectedCitation.sourceThreadLocalId}-${selectedCitation.sourceCitationIndex}-${selectedCitation.citation.chunkId}`;
  }, [selectedCitation]);
  const unresolvedFailureCount = useMemo(
    () => pageFailures.filter((failure) => failure.status !== "resolved").length,
    [pageFailures]
  );

  function dismissToast(id: number): void {
    const timer = toastTimers.current[id];
    if (timer !== undefined) {
      window.clearTimeout(timer);
      delete toastTimers.current[id];
    }
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }

  function pushToast(level: ToastLevel, message: string, durationMs = 4500): void {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, level, message }].slice(-5));
    toastTimers.current[id] = window.setTimeout(() => dismissToast(id), durationMs);
  }

  useEffect(() => {
    return () => {
      for (const timer of Object.values(toastTimers.current)) {
        window.clearTimeout(timer);
      }
      toastTimers.current = {};
    };
  }, []);

  async function loadBootstrap(silentError = false): Promise<void> {
    setBootstrapping(true);
    try {
      const result = await apiFetch<WorkspaceBootstrap>("/workspace/bootstrap");
      setWorkspace(result);
      if (result.source) {
        setSourceName(result.source.name);
        setNotionApiVersion(result.source.notionApiVersion);
      }
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
  }, []);

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
    void loadPageFailures(sourceId, includeResolvedFailures);
  }, [sourceId, includeResolvedFailures]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        composerRef.current?.focus();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && key === "enter") {
        event.preventDefault();
        void askQuestion(question, true);
        return;
      }

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
  }, [question, selectedCitation, showSettings, hasSource, loadingChat]);

  async function submitLogin(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!notionToken.trim()) {
      pushToast("error", "Notion token is required.");
      return;
    }

    setLoadingLogin(true);
    try {
      const result = await apiFetch<WorkspaceLoginResponse>("/workspace/login", {
        method: "POST",
        body: JSON.stringify({
          name: sourceName,
          notionIntegrationToken: notionToken,
          notionApiVersion,
          autoDiscoverTargets,
          autoRunFullSync: true
        })
      });

      pushToast(
        "success",
        result.mode === "created"
          ? "Workspace connected. You can start chatting now."
          : "Workspace credentials updated."
      );

      if (result.discovery) {
        pushToast(
          "info",
          `Auto-discovered ${result.discovery.discoveredTargets} targets (active: ${result.activeTargetCount}).`
        );
      }

      if (result.activeTargetCount === 0) {
        pushToast("warning", "No active targets yet. Enable auto-discover or add targets before syncing.");
      }

      if (result.fullSyncJob?.queued) {
        pushToast("success", `Full sync queued automatically (#${result.fullSyncJob.jobId}).`);
      }

      setNotionToken("");
      setSessionId(null);
      setChatHistory([]);
      setSelectedCitation(null);
      setShowSettings(false);
      await loadBootstrap(true);
    } catch (error) {
      pushToast("error", error instanceof Error ? error.message : "Workspace login failed");
    } finally {
      setLoadingLogin(false);
    }
  }

  async function runIngest(mode: "incremental" | "full"): Promise<void> {
    if (!sourceId) {
      pushToast("warning", "No workspace source is connected.");
      return;
    }

    setSyncModeLoading(mode);
    try {
      const result = await apiFetch<{ jobId: number; queued: true }>("/ingest/run", {
        method: "POST",
        body: JSON.stringify({
          sourceId,
          mode
        })
      });

      if (mode === "full") {
        pushToast("success", `Full sync queued (#${result.jobId}).`);
      } else {
        pushToast("success", `Incremental sync queued (#${result.jobId}).`);
      }

      await Promise.all([loadBootstrap(true), loadPageFailures(sourceId, includeResolvedFailures)]);
    } catch (error) {
      pushToast("error", error instanceof Error ? error.message : `Failed to queue ${mode} sync`);
    } finally {
      setSyncModeLoading(null);
    }
  }

  async function runIncrementalSync(): Promise<void> {
    await runIngest("incremental");
  }

  async function runFullSync(): Promise<void> {
    await runIngest("full");
  }

  async function retryPageFailure(failureId: number): Promise<void> {
    setRetryingFailureId(failureId);
    try {
      const result = await apiFetch<{ jobId: number; queued: true }>(`/ingest/page-failures/${failureId}/retry`, {
        method: "POST"
      });
      pushToast("success", `Page retry queued (#${result.jobId}).`);
      if (sourceId) {
        await Promise.all([loadBootstrap(true), loadPageFailures(sourceId, includeResolvedFailures)]);
      }
    } catch (error) {
      pushToast("error", error instanceof Error ? error.message : "Failed to retry page failure");
    } finally {
      setRetryingFailureId(null);
    }
  }

  function selectCitation(item: ChatThreadItem, citation: Citation, citationIndex: number): void {
    setSelectedCitation({
      citation,
      fromQuestion: item.question,
      fromAskedAtIso: item.askedAtIso,
      sourceThreadLocalId: item.localId,
      sourceCitationIndex: citationIndex
    });
  }

  async function askQuestion(rawQuestion: string, fromShortcut = false): Promise<void> {
    if (!sourceId) {
      if (fromShortcut) {
        pushToast("warning", "Connect Notion first, then ask.");
      }
      return;
    }

    const prompt = rawQuestion.trim();
    if (!prompt) {
      if (fromShortcut) {
        pushToast("warning", "Type a question first.");
      }
      return;
    }

    if (loadingChat) {
      return;
    }

    setLoadingChat(true);
    try {
      const payload = {
        sourceId,
        ...(sessionId ? { sessionId } : {}),
        message: prompt
      };

      const result = await apiFetch<ChatResult>("/chat", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      const threadItem: ChatThreadItem = {
        localId: Date.now() + Math.floor(Math.random() * 1000),
        question: prompt,
        result,
        askedAtIso: new Date().toISOString()
      };

      setSessionId(result.sessionId);
      setQuestion("");
      setChatHistory((prev) => [...prev, threadItem]);

      if (result.citations.length > 0) {
        selectCitation(threadItem, result.citations[0], 0);
      }
    } catch (error) {
      pushToast("error", error instanceof Error ? error.message : "Chat request failed");
    } finally {
      setLoadingChat(false);
    }
  }

  async function submitChat(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await askQuestion(question);
  }

  function startNewSession(): void {
    setSessionId(null);
    setChatHistory([]);
    setSelectedCitation(null);
    pushToast("info", "Started a new chat session.");
    composerRef.current?.focus();
  }

  function renderCredentialForm(withHeading: boolean): JSX.Element {
    return (
      <form className="settings-form" onSubmit={submitLogin}>
        {withHeading && (
          <div className="auth-copy">
            <h2>Connect Notion Workspace</h2>
            <p>Store your integration token in DB and open directly into chat next time.</p>
          </div>
        )}

        <label className="field">
          Source name
          <input value={sourceName} onChange={(event) => setSourceName(event.target.value)} />
        </label>

        <label className="field">
          Notion integration token
          <input
            value={notionToken}
            onChange={(event) => setNotionToken(event.target.value)}
            placeholder="secret_xxx"
            autoComplete="off"
          />
        </label>

        <label className="field">
          Notion version
          <input value={notionApiVersion} onChange={(event) => setNotionApiVersion(event.target.value)} />
        </label>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={autoDiscoverTargets}
            onChange={(event) => setAutoDiscoverTargets(event.target.checked)}
          />
          Auto-discover targets after login
        </label>

        <div className="inline-actions">
          <button type="submit" disabled={loadingLogin}>
            {loadingLogin ? "Saving..." : "Save and continue"}
          </button>
          {hasSource && (
            <>
              <button
                type="button"
                className="button-secondary"
                onClick={runIncrementalSync}
                disabled={syncModeLoading !== null}
              >
                {syncModeLoading === "incremental" ? "Queueing..." : "Run incremental sync"}
              </button>
              <button type="button" className="button-secondary" onClick={runFullSync} disabled={syncModeLoading !== null}>
                {syncModeLoading === "full" ? "Queueing..." : "Run full sync"}
              </button>
            </>
          )}
        </div>
      </form>
    );
  }

  if (bootstrapping) {
    return (
      <div className="app-shell">
        <section className="loading-state">
          <h1>notion-wiki</h1>
          <p>Loading workspace...</p>
        </section>
        <div className="toast-stack" aria-live="polite" aria-atomic="false">
          {toasts.map((toast) => (
            <article key={toast.id} className={toastClass(toast.level)}>
              <p>{toast.message}</p>
              <button type="button" className="toast-close" onClick={() => dismissToast(toast.id)} aria-label="Dismiss">
                x
              </button>
            </article>
          ))}
        </div>
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
            <button type="button" className="button-secondary" onClick={runIncrementalSync} disabled={syncModeLoading !== null}>
              {syncModeLoading === "incremental" ? "Queueing..." : "Incremental sync"}
            </button>
            <button type="button" className="button-secondary" onClick={runFullSync} disabled={syncModeLoading !== null}>
              {syncModeLoading === "full" ? "Queueing..." : "Full sync"}
            </button>
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
          <div className="auth-card">{renderCredentialForm(true)}</div>
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
              <strong>No indexed documents yet.</strong> Run incremental sync, then start chatting with citations.
            </section>
          )}

          {unresolvedFailureCount > 0 && (
            <section className="callout callout-warning">
              <strong>{unresolvedFailureCount} page(s) failed to index chunks.</strong> Open workspace settings and retry
              failed pages.
            </section>
          )}

          <main className="chat-layout">
            <section className="thread-panel">
              <div className="thread-head">
                <h2>Chat</h2>
                <span>Session {sessionId ?? "new"}</span>
              </div>

              <div className="thread-list">
                {chatHistory.length === 0 && (
                  <article className="empty-thread">
                    <strong>Quick start</strong>
                    <p>Ask a question like: "Which page mentions forcura.com?"</p>
                    <p>Shortcuts: Ctrl/Cmd+K focus, Ctrl/Cmd+Enter send.</p>
                  </article>
                )}

                {chatHistory.map((item) => (
                  <article key={item.localId} className="thread-item">
                    <div className="bubble bubble-user">
                      <div className="bubble-head">
                        <strong>You</strong>
                        <span>{new Date(item.askedAtIso).toLocaleString()}</span>
                      </div>
                      <p>{item.question}</p>
                    </div>

                    <div className="bubble bubble-assistant">
                      <div className="bubble-head">
                        <strong>Assistant</strong>
                        <span>
                          topK={item.result.meta.topK}, retrieval={item.result.meta.retrievalMs}ms, llm={item.result.meta.llmMs}ms
                        </span>
                      </div>
                      <p>{item.result.answer}</p>
                      <div className="citation-pills">
                        {item.result.citations.length === 0 && <small>No citations</small>}
                        {item.result.citations.map((citation, citationIndex) => {
                          const key = `${item.localId}-${citationIndex}-${citation.chunkId}`;
                          const active = selectedCitationKey === key;
                          return (
                            <button
                              key={key}
                              type="button"
                              className={active ? "citation-pill citation-pill-active" : "citation-pill"}
                              onClick={() => selectCitation(item, citation, citationIndex)}
                              aria-pressed={active}
                            >
                              <span>{citation.title || "Untitled"}</span>
                              <small>chunk {citation.chunkId}</small>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <form className="composer" onSubmit={submitChat}>
                <label className="sr-only" htmlFor="question">
                  Question
                </label>
                <textarea
                  id="question"
                  ref={composerRef}
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  rows={4}
                  placeholder="Ask from indexed Notion content..."
                />
                <div className="inline-actions">
                  <button type="submit" disabled={loadingChat || question.trim().length === 0}>
                    {loadingChat ? "Asking..." : "Ask"}
                  </button>
                </div>
              </form>
            </section>

            <aside className="citation-panel">
              <h2>Citation inspector</h2>
              {!selectedCitation && <p>Select a citation from the chat to inspect source proof.</p>}
              {selectedCitation && (
                <article className="citation-card">
                  <small>
                    #{selectedCitation.sourceCitationIndex + 1} from {new Date(selectedCitation.fromAskedAtIso).toLocaleString()}
                  </small>
                  <p className="citation-question">{selectedCitation.fromQuestion}</p>
                  <h3>{selectedCitation.citation.title || "Untitled"}</h3>
                  <p className="citation-quote">{selectedCitation.citation.quote}</p>
                  <small>chunkId: {selectedCitation.citation.chunkId}</small>
                  <div className="inline-actions">
                    {selectedCitation.citation.url ? (
                      <a href={selectedCitation.citation.url} target="_blank" rel="noreferrer">
                        Open source
                      </a>
                    ) : (
                      <span className="muted">Source URL missing</span>
                    )}
                    <button type="button" className="button-secondary" onClick={() => setSelectedCitation(null)}>
                      Clear
                    </button>
                  </div>
                </article>
              )}
            </aside>
          </main>
        </>
      )}

      {showSettings && hasSource && (
        <div className="settings-backdrop" role="dialog" aria-modal="true" aria-label="Workspace settings">
          <section className="settings-modal">
            <div className="settings-head">
              <h2>Workspace settings</h2>
              <button type="button" className="button-secondary" onClick={() => setShowSettings(false)}>
                Close
              </button>
            </div>
            {renderCredentialForm(false)}
            <section className="failure-panel">
              <div className="failure-panel-head">
                <h3>Chunk ingest failures</h3>
                <div className="inline-actions">
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={includeResolvedFailures}
                      onChange={(event) => setIncludeResolvedFailures(event.target.checked)}
                    />
                    Include resolved
                  </label>
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={loadingPageFailures || !sourceId}
                    onClick={() => {
                      if (!sourceId) {
                        return;
                      }
                      void loadPageFailures(sourceId, includeResolvedFailures);
                    }}
                  >
                    {loadingPageFailures ? "Loading..." : "Refresh"}
                  </button>
                </div>
              </div>
              <div className="failure-list">
                {loadingPageFailures && <p className="muted">Loading page failures...</p>}
                {!loadingPageFailures && pageFailures.length === 0 && (
                  <p className="muted">No page-level chunk ingest failures.</p>
                )}
                {!loadingPageFailures &&
                  pageFailures.map((failure) => (
                    <article key={failure.failureId} className="failure-item">
                      <div className="failure-item-head">
                        <strong>{failure.notionPageId}</strong>
                        <span>{failure.status}</span>
                      </div>
                      <p>{failure.errorMessage}</p>
                      <small>
                        stage={failure.failureStage}
                        {failure.errorCode ? `, code=${failure.errorCode}` : ""}, count={failure.failureCount}, last=
                        {new Date(failure.lastFailedAt).toLocaleString()}
                      </small>
                      <div className="inline-actions">
                        <button
                          type="button"
                          className="button-secondary"
                          disabled={failure.status === "resolved" || retryingFailureId === failure.failureId}
                          onClick={() => void retryPageFailure(failure.failureId)}
                        >
                          {retryingFailureId === failure.failureId ? "Queueing..." : "Retry this page"}
                        </button>
                        {failure.resolvedAt && (
                          <small>
                            Resolved at {new Date(failure.resolvedAt).toLocaleString()}
                            {failure.resolvedIngestJobId ? ` (#${failure.resolvedIngestJobId})` : ""}
                          </small>
                        )}
                      </div>
                    </article>
                  ))}
              </div>
            </section>
          </section>
        </div>
      )}

      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <article key={toast.id} className={toastClass(toast.level)} role={toast.level === "error" ? "alert" : "status"}>
            <p>{toast.message}</p>
            <button type="button" className="toast-close" onClick={() => dismissToast(toast.id)} aria-label="Dismiss">
              x
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
