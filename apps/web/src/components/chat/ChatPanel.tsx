import { FormEvent, useState, useRef, useEffect, KeyboardEvent } from "react";
import { useToast } from "../ui/ToastProvider";
import { apiFetch } from "../../lib/api";
import {
  ChatThreadItem,
  ChatResult,
  Citation,
  SelectedCitation,
} from "../../lib/types";
import ReactMarkdown from "react-markdown";

interface ChatPanelProps {
  sourceId: number;
  sessionId: number | null;
  chatHistory: ChatThreadItem[];
  onSessionChange: (id: number | null) => void;
  onHistoryChange: (history: ChatThreadItem[]) => void;
}

export function ChatPanel({
  sourceId,
  sessionId,
  chatHistory,
  onSessionChange,
  onHistoryChange,
}: ChatPanelProps): JSX.Element {
  const { pushToast } = useToast();
  const [question, setQuestion] = useState("");
  const [loadingChat, setLoadingChat] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Auto-scroll to bottom on new messages
    if (threadEndRef.current) {
      threadEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatHistory]);

  useEffect(() => {
    const onGlobalKeyDown = (event: globalThis.KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        composerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onGlobalKeyDown);
    return () => window.removeEventListener("keydown", onGlobalKeyDown);
  }, []);

  async function askQuestion(
    rawQuestion: string,
    fromShortcut = false,
  ): Promise<void> {
    if (!sourceId) {
      if (fromShortcut) pushToast("warning", "Connect Notion first, then ask.");
      return;
    }

    const prompt = rawQuestion.trim();
    if (!prompt) {
      if (fromShortcut) pushToast("warning", "Type a question first.");
      return;
    }

    if (loadingChat) return;

    setLoadingChat(true);
    try {
      const payload = {
        sourceId,
        ...(sessionId ? { sessionId } : {}),
        message: prompt,
      };

      const result = await apiFetch<ChatResult>("/chat", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const threadItem: ChatThreadItem = {
        localId: Date.now() + Math.floor(Math.random() * 1000),
        question: prompt,
        result,
        askedAtIso: new Date().toISOString(),
      };

      onSessionChange(result.sessionId);
      setQuestion("");
      onHistoryChange([...chatHistory, threadItem]);
    } catch (error) {
      pushToast(
        "error",
        error instanceof Error ? error.message : "Chat request failed",
      );
    } finally {
      setLoadingChat(false);
      // Wait a tick and refocus the composer
      setTimeout(() => {
        composerRef.current?.focus();
      }, 0);
    }
  }

  async function submitChat(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await askQuestion(question);
  }

  function handleComposerKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void askQuestion(question);
    }
  }

  return (
    <section className="thread-panel">
      <div className="thread-list">
        {chatHistory.length === 0 && (
          <article className="empty-thread">
            <strong>Quick start</strong>
            <p>Ask a question like: "Which page mentions forcura.com?"</p>
            <p>Shortcuts: Ctrl/Cmd+K focus, Enter send, Shift+Enter newline.</p>
          </article>
        )}

        {chatHistory.map((item) => (
          <article key={item.localId} className="thread-item">
            <div className="bubble bubble-user">
              <div className="bubble-head">
                <strong>You</strong>
                <span>
                  {new Date(item.askedAtIso).toLocaleString("ko-KR", {
                    timeZone: "Asia/Seoul",
                  })}
                </span>
              </div>
              <p>{item.question}</p>
            </div>

            <div className="bubble bubble-assistant">
              <div className="bubble-head" style={{ marginBottom: "0.4rem" }}>
                <strong>Semantic Search Results</strong>
                <span>
                  retrieval: {item.result.meta.retrievalMs}ms, llm:{" "}
                  {item.result.meta.llmMs}ms
                </span>
              </div>
              {item.result.answer && (
                <div className="markdown-body assistant-answer">
                  <ReactMarkdown>{item.result.answer}</ReactMarkdown>
                </div>
              )}
              {item.result.documents.length > 0 && (
                <div className="doc-grid">
                  {item.result.documents.map((doc) => (
                    <a
                      key={doc.documentId}
                      href={doc.url}
                      target="_blank"
                      rel="noreferrer"
                      className="doc-card"
                    >
                      <span className="doc-card-title">
                        {doc.title || "Untitled"}
                      </span>
                      {doc.lastEditedAt && (
                        <small className="doc-card-meta">
                          {new Date(doc.lastEditedAt).toLocaleDateString()}
                        </small>
                      )}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </article>
        ))}
        {/* Invisible element to scroll into view */}
        <div ref={threadEndRef} style={{ height: 1 }} />
      </div>

      <form className="composer" onSubmit={submitChat}>
        <label className="sr-only" htmlFor="question">
          Question
        </label>
        <div className="input-wrapper">
          <textarea
            id="question"
            ref={composerRef}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            rows={2}
            placeholder="Ask from indexed Notion content..."
          />
          <button
            type="submit"
            disabled={loadingChat || question.trim().length === 0}
            title="Send message"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
      </form>
    </section>
  );
}
