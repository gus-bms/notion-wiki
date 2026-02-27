function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withProviderRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries: number; baseDelayMs?: number; maxDelayMs?: number }
): Promise<T> {
  const baseDelayMs = options.baseDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 10_000;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= options.maxRetries || !(error instanceof Error)) {
        throw error;
      }

      const retryable = (error as Error & { retryable?: boolean }).retryable ?? false;
      if (!retryable) {
        throw error;
      }

      const jitter = Math.floor(Math.random() * 250);
      const delayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt + jitter);
      await sleep(delayMs);
    }
  }
}
