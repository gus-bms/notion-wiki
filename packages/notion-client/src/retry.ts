function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterSeconds(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries: number; baseDelayMs?: number; maxDelayMs?: number }
): Promise<T> {
  const baseDelay = options.baseDelayMs ?? 500;
  const maxDelay = options.maxDelayMs ?? 10_000;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (!(error instanceof Error) || attempt >= options.maxRetries) {
        throw error;
      }

      const retryAfterHeader = (error as Error & { retryAfter?: string }).retryAfter ?? null;
      const retryAfterSeconds = parseRetryAfterSeconds(retryAfterHeader);

      const isRetryable =
        (error as Error & { retryable?: boolean }).retryable ??
        ["TIMEOUT", "RATE_LIMITED", "SERVER_ERROR", "UPSTREAM_UNAVAILABLE"].includes(
          (error as Error & { code?: string }).code ?? ""
        );

      if (!isRetryable) {
        throw error;
      }

      const jitter = Math.floor(Math.random() * 250);
      const fallbackDelay = Math.min(maxDelay, baseDelay * 2 ** attempt + jitter);
      const delayMs = retryAfterSeconds ? retryAfterSeconds * 1000 : fallbackDelay;
      await sleep(delayMs);
    }
  }
}
