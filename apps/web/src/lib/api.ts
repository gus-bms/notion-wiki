const API_BASE_URL = __API_BASE_URL__?.trim() ? __API_BASE_URL__ : "http://localhost:3000";
const APP_TOKEN = __APP_TOKEN__?.trim() ?? "";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
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
