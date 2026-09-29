export function createTimedFetch(fetcher: typeof fetch = fetch, timeoutMs = 10000): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const upstream = init?.signal ?? (typeof Request !== 'undefined' && input instanceof Request ? input.signal : undefined);
    const cancel = () => controller.abort();
    if (upstream?.aborted) cancel();
    else upstream?.addEventListener('abort', cancel, { once: true });
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const timer = setTimeout(cancel, url.includes('/functions/v1/') ? Math.max(timeoutMs, 30000) : timeoutMs);
    try {
      return await fetcher(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      upstream?.removeEventListener('abort', cancel);
    }
  };
}
