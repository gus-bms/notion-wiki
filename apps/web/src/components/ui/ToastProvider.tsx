import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";

export type ToastLevel = "success" | "error" | "warning" | "info";
export type ToastItem = { id: number; level: ToastLevel; message: string };

type ToastContextType = {
  toasts: ToastItem[];
  pushToast: (level: ToastLevel, message: string, durationMs?: number) => void;
  dismissToast: (id: number) => void;
};

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastTimers = useRef<Record<number, number>>({});

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

  return (
    <ToastContext.Provider value={{ toasts, pushToast, dismissToast }}>
      {children}
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
    </ToastContext.Provider>
  );
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
