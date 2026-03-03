import { FormEvent, useState, useEffect } from "react";
import { useToast } from "./ui/ToastProvider";
import { apiFetch } from "../lib/api";
import { WorkspaceBootstrap, WorkspaceLoginResponse, IngestPageFailure, IngestJob } from "../lib/types";

const formatKST = (iso: string): string =>
  new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

interface WorkspaceSettingsProps {
  bootstrapping: boolean;
  workspace: WorkspaceBootstrap | null;
  hasSource: boolean;
  sourceId: number | null;
  onBootstrapComplete: (silentError?: boolean) => Promise<void>;
  onClose?: () => void;
  withHeading?: boolean;
  pageFailures: IngestPageFailure[];
  loadingPageFailures: boolean;
  onReloadFailures: (includeResolved: boolean) => void;
}

type SettingsTab = "general" | "sync" | "jobs" | "failures";

export function WorkspaceSettings({
  bootstrapping,
  workspace,
  hasSource,
  sourceId,
  onBootstrapComplete,
  onClose,
  withHeading = false,
  pageFailures,
  loadingPageFailures,
  onReloadFailures
}: WorkspaceSettingsProps): JSX.Element {
  const { pushToast } = useToast();
  const source = workspace?.source ?? null;

  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [sourceName, setSourceName] = useState(source?.name ?? "my-notion");
  const [notionToken, setNotionToken] = useState("");
  const [notionApiVersion, setNotionApiVersion] = useState(source?.notionApiVersion ?? "2025-09-03");
  const [autoDiscoverTargets, setAutoDiscoverTargets] = useState(true);
  const [loadingLogin, setLoadingLogin] = useState(false);
  const [syncModeLoading, setSyncModeLoading] = useState<"incremental" | "full" | null>(null);

  const [includeResolvedFailures, setIncludeResolvedFailures] = useState(false);
  const [retryingFailureId, setRetryingFailureId] = useState<number | null>(null);

  const [jobs, setJobs] = useState<IngestJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [retryingJobId, setRetryingJobId] = useState<number | null>(null);

  async function loadJobs(): Promise<void> {
    if (!sourceId) return;
    setLoadingJobs(true);
    try {
      const result = await apiFetch<{ jobs: IngestJob[] }>(`/ingest/jobs?sourceId=${sourceId}`);
      setJobs(result.jobs);
    } catch (error) {
      pushToast("error", error instanceof Error ? error.message : "Failed to load jobs");
    } finally {
      setLoadingJobs(false);
    }
  }

  async function retryJob(jobId: number): Promise<void> {
    setRetryingJobId(jobId);
    try {
      const result = await apiFetch<{ jobId: number; queued: true }>(`/ingest/jobs/${jobId}/retry`, { method: "POST" });
      pushToast("success", `Job retry queued (#${result.jobId}).`);
      await loadJobs();
    } catch (error) {
      pushToast("error", error instanceof Error ? error.message : "Failed to retry job");
    } finally {
      setRetryingJobId(null);
    }
  }

  useEffect(() => {
    if (activeTab === "jobs" && sourceId) {
      void loadJobs();
    }
  }, [activeTab, sourceId]);

  useEffect(() => {
    if (source) {
      setSourceName(source.name);
      setNotionApiVersion(source.notionApiVersion);
    }
  }, [source]);

  async function retryPageFailure(failureId: number): Promise<void> {
    setRetryingFailureId(failureId);
    try {
      const result = await apiFetch<{ jobId: number; queued: true }>(`/ingest/page-failures/${failureId}/retry`, {
        method: "POST"
      });
      pushToast("success", `Page retry queued (#${result.jobId}).`);
      onReloadFailures(includeResolvedFailures);
    } catch (error) {
      pushToast("error", error instanceof Error ? error.message : "Failed to retry page failure");
    } finally {
      setRetryingFailureId(null);
    }
  }

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
      await onBootstrapComplete(true);
      if (onClose) onClose();
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

      pushToast("success", `${mode === "full" ? "Full" : "Incremental"} sync queued (#${result.jobId}).`);

      await onBootstrapComplete(true);
      onReloadFailures(includeResolvedFailures);
    } catch (error) {
      pushToast("error", error instanceof Error ? error.message : `Failed to queue ${mode} sync`);
    } finally {
      setSyncModeLoading(null);
    }
  }

  /* ── Tab: General ── */
  const renderGeneral = () => (
    <div className="stab-pane">
      {withHeading && (
        <div className="stab-pane-header">
          <h3>Connect Notion Workspace</h3>
          <p className="stab-hint">Store your integration token and start chatting immediately.</p>
        </div>
      )}
      {!withHeading && (
        <div className="stab-pane-header">
          <h3>General</h3>
          <p className="stab-hint">Manage your workspace connection and credentials.</p>
        </div>
      )}

      <form className="stab-form" onSubmit={submitLogin}>
        <div className="stab-field-group">
          <label className="stab-label">Workspace Name</label>
          <input
            className="stab-input"
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
          />
          <p className="stab-field-hint">A friendly identifier for this source.</p>
        </div>

        <div className="stab-field-group">
          <label className="stab-label">Integration Token</label>
          <input
            className="stab-input"
            type="password"
            value={notionToken}
            onChange={(e) => setNotionToken(e.target.value)}
            placeholder={hasSource ? "••••••••••••••••" : "secret_xxx…"}
            autoComplete="off"
          />
          <p className="stab-field-hint">Your private Notion internal integration token.</p>
        </div>

        <div className="stab-field-group">
          <label className="stab-label">API Version</label>
          <input
            className="stab-input"
            value={notionApiVersion}
            onChange={(e) => setNotionApiVersion(e.target.value)}
          />
        </div>

        <div className="stab-toggle-row">
          <div className="stab-toggle-info">
            <span className="stab-label">Auto-discover targets</span>
            <p className="stab-field-hint">Automatically discover and add sync targets after login.</p>
          </div>
          <button
            type="button"
            className={`stab-toggle ${autoDiscoverTargets ? "on" : ""}`}
            onClick={() => setAutoDiscoverTargets(!autoDiscoverTargets)}
            aria-pressed={autoDiscoverTargets}
          >
            <span className="stab-toggle-knob" />
          </button>
        </div>

        <div className="stab-actions">
          <button type="submit" className="stab-btn-primary" disabled={loadingLogin}>
            {loadingLogin ? "Saving…" : hasSource ? "Update Configuration" : "Save & Continue"}
          </button>
        </div>
      </form>
    </div>
  );

  /* ── Tab: Sync ── */
  const renderSync = () => (
    <div className="stab-pane">
      <div className="stab-pane-header">
        <h3>Data Sync</h3>
        <p className="stab-hint">Trigger knowledge base updates from Notion.</p>
      </div>

      <div className="stab-sync-grid">
        <div className="stab-sync-card">
          <div className="stab-sync-card-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </div>
          <h4>Incremental Sync</h4>
          <p>Fetch only recently edited pages. Fast, lightweight.</p>
          <button
            type="button"
            className="stab-btn-secondary"
            onClick={() => runIngest("incremental")}
            disabled={syncModeLoading !== null}
          >
            {syncModeLoading === "incremental" ? "Queueing…" : "Run Incremental"}
          </button>
        </div>
        <div className="stab-sync-card">
          <div className="stab-sync-card-icon stab-sync-card-icon--warn">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
            </svg>
          </div>
          <h4>Full Sync</h4>
          <p>Re-index all active targets. Comprehensive but heavier.</p>
          <button
            type="button"
            className="stab-btn-secondary"
            onClick={() => runIngest("full")}
            disabled={syncModeLoading !== null}
          >
            {syncModeLoading === "full" ? "Queueing…" : "Run Full Sync"}
          </button>
        </div>
      </div>
    </div>
  );

  /* ── Tab: Failures ── */
  const renderFailures = () => (
    <div className="stab-pane">
      <div className="stab-pane-header">
        <div>
          <h3>Ingestion Failures</h3>
          <p className="stab-hint">Errors encountered while syncing or chunking pages.</p>
        </div>
        <div className="stab-header-actions">
          <label className="stab-check-label">
            <input
              type="checkbox"
              checked={includeResolvedFailures}
              onChange={(e) => {
                setIncludeResolvedFailures(e.target.checked);
                onReloadFailures(e.target.checked);
              }}
            />
            Show resolved
          </label>
          <button
            type="button"
            className="stab-btn-secondary stab-btn-sm"
            disabled={loadingPageFailures || !sourceId}
            onClick={() => onReloadFailures(includeResolvedFailures)}
          >
            {loadingPageFailures ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="stab-failure-list">
        {loadingPageFailures && <p className="stab-hint" style={{ padding: "1.5rem" }}>Loading failures…</p>}
        {!loadingPageFailures && pageFailures.length === 0 && (
          <div className="stab-empty">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1f8b4d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <p>No active ingestion failures</p>
          </div>
        )}
        {!loadingPageFailures &&
          pageFailures.map((failure) => (
            <article key={failure.failureId} className="stab-failure-card">
              <div className="stab-failure-head">
                <strong>{failure.notionPageId}</strong>
                <span className={`stab-status-pill ${failure.status === "resolved" ? "resolved" : "active"}`}>
                  {failure.status}
                </span>
              </div>
              <p className="stab-failure-msg">{failure.errorMessage}</p>
              <small className="stab-failure-meta">
                stage={failure.failureStage}
                {failure.errorCode ? `, code=${failure.errorCode}` : ""}, count={failure.failureCount}, last=
                {formatKST(failure.lastFailedAt)}
              </small>
              <div className="stab-failure-actions">
                <button
                  type="button"
                  className="stab-btn-secondary stab-btn-sm"
                  disabled={failure.status === "resolved" || retryingFailureId === failure.failureId}
                  onClick={() => void retryPageFailure(failure.failureId)}
                >
                  {retryingFailureId === failure.failureId ? "Retrying…" : "Retry"}
                </button>
                {failure.resolvedAt && (
                  <small className="stab-failure-resolved">
                    Resolved {formatKST(failure.resolvedAt)}
                    {failure.resolvedIngestJobId ? ` (#${failure.resolvedIngestJobId})` : ""}
                  </small>
                )}
              </div>
            </article>
          ))}
      </div>
    </div>
  );

  /* ── Tab: Jobs ── */
  const renderJobs = () => (
    <div className="stab-pane">
      <div className="stab-pane-header">
        <div>
          <h3>Job Queue</h3>
          <p className="stab-hint">Recent ingest jobs and their status.</p>
        </div>
        <div className="stab-header-actions">
          <button
            type="button"
            className="stab-btn-secondary stab-btn-sm"
            disabled={loadingJobs}
            onClick={() => void loadJobs()}
          >
            {loadingJobs ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="stab-job-list">
        {loadingJobs && jobs.length === 0 && <p className="stab-hint" style={{ padding: "1.5rem" }}>Loading jobs…</p>}
        {!loadingJobs && jobs.length === 0 && (
          <div className="stab-empty">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 3h-8l-2 4h12l-2-4z" />
            </svg>
            <p>No jobs found</p>
          </div>
        )}
        {jobs.map((job) => (
          <div key={job.jobId} className="stab-job-card">
            <div className="stab-job-card-head">
              <div className="stab-job-card-info">
                <span className="stab-job-id">#{job.jobId}</span>
                <span className={`stab-job-status stab-job-status--${job.status}`}>{job.status}</span>
              </div>
              <span className="stab-job-type">{job.type}</span>
            </div>
            <div className="stab-job-card-meta">
              {job.startedAt && <span>Started: {formatKST(job.startedAt)}</span>}
              {job.finishedAt && <span>Finished: {formatKST(job.finishedAt)}</span>}
              {!job.startedAt && !job.finishedAt && <span>Waiting in queue…</span>}
            </div>
            {job.errorMessage && <p className="stab-job-error">{job.errorMessage}</p>}
            {job.status === "failed" && (
              <button
                type="button"
                className="stab-btn-secondary stab-btn-sm"
                disabled={retryingJobId === job.jobId}
                onClick={() => void retryJob(job.jobId)}
              >
                {retryingJobId === job.jobId ? "Retrying…" : "Retry"}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  /* ── Main layout ── */
  if (withHeading) {
    /* Bootstrap / onboarding mode – no tabs, just general */
    return renderGeneral();
  }

  return (
    <div className="stab-layout">
      <nav className="stab-sidebar">
        <button
          type="button"
          className={`stab-nav-btn ${activeTab === "general" ? "active" : ""}`}
          onClick={() => setActiveTab("general")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          General
        </button>

        {hasSource && (
          <>
            <button
              type="button"
              className={`stab-nav-btn ${activeTab === "sync" ? "active" : ""}`}
              onClick={() => setActiveTab("sync")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              Data Sync
            </button>
            <button
              type="button"
              className={`stab-nav-btn ${activeTab === "jobs" ? "active" : ""}`}
              onClick={() => setActiveTab("jobs")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 3h-8l-2 4h12l-2-4z" />
              </svg>
              Jobs
              {jobs.filter(j => j.status === "running" || j.status === "queued").length > 0 && (
                <span className="stab-badge stab-badge--info">
                  {jobs.filter(j => j.status === "running" || j.status === "queued").length}
                </span>
              )}
            </button>
            <button
              type="button"
              className={`stab-nav-btn ${activeTab === "failures" ? "active" : ""}`}
              onClick={() => setActiveTab("failures")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Failures
              {pageFailures.filter(f => f.status !== "resolved").length > 0 && (
                <span className="stab-badge">{pageFailures.filter(f => f.status !== "resolved").length}</span>
              )}
            </button>
          </>
        )}
      </nav>

      <div className="stab-content">
        {activeTab === "general" && renderGeneral()}
        {activeTab === "sync" && renderSync()}
        {activeTab === "jobs" && renderJobs()}
        {activeTab === "failures" && renderFailures()}
      </div>
    </div>
  );
}
