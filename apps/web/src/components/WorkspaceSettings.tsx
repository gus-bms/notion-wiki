import { FormEvent, useState, useEffect } from "react";
import { useToast } from "./ui/ToastProvider";
import { apiFetch } from "../lib/api";
import { WorkspaceBootstrap, WorkspaceLoginResponse, IngestPageFailure } from "../lib/types";

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

  const [sourceName, setSourceName] = useState(source?.name ?? "my-notion");
  const [notionToken, setNotionToken] = useState("");
  const [notionApiVersion, setNotionApiVersion] = useState(source?.notionApiVersion ?? "2025-09-03");
  const [autoDiscoverTargets, setAutoDiscoverTargets] = useState(true);
  const [loadingLogin, setLoadingLogin] = useState(false);
  const [syncModeLoading, setSyncModeLoading] = useState<"incremental" | "full" | null>(null);

  const [includeResolvedFailures, setIncludeResolvedFailures] = useState(false);
  const [retryingFailureId, setRetryingFailureId] = useState<number | null>(null);

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

  return (
    <>
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
            {loadingLogin ? "Saving..." : hasSource ? "Update Source / Token" : "Save and continue"}
          </button>
          {hasSource && (
            <>
              <button
                type="button"
                className="button-secondary"
                onClick={() => runIngest("incremental")}
                disabled={syncModeLoading !== null}
              >
                {syncModeLoading === "incremental" ? "Queueing..." : "Run incremental sync"}
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={() => runIngest("full")}
                disabled={syncModeLoading !== null}
              >
                {syncModeLoading === "full" ? "Queueing..." : "Run full sync"}
              </button>
            </>
          )}
        </div>
      </form>

      {!withHeading && hasSource && (
        <section className="failure-panel">
          <div className="failure-panel-head">
            <h3>Chunk ingest failures</h3>
            <div className="inline-actions">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={includeResolvedFailures}
                  onChange={(event) => {
                    setIncludeResolvedFailures(event.target.checked);
                    onReloadFailures(event.target.checked);
                  }}
                />
                Include resolved
              </label>
              <button
                type="button"
                className="button-secondary"
                disabled={loadingPageFailures || !sourceId}
                onClick={() => onReloadFailures(includeResolvedFailures)}
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
      )}
    </>
  );
}
