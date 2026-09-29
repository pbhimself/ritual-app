const AUTH_KEYS = ['code', 'access_token', 'refresh_token', 'error', 'error_description', 'error_code'];

export function trustedAuthCallback(raw: string, nativeCallback: string, webOrigin?: string) {
  try {
    const url = new URL(raw);
    const native = new URL(nativeCallback);
    const nativeMatch = url.protocol === native.protocol && url.host === native.host && url.pathname === native.pathname;
    const webMatch = webOrigin && url.origin === webOrigin && ['/', '/auth/callback', '/auth/callback/'].includes(url.pathname);
    if (!nativeMatch && !webMatch) return false;
    const fragment = new URLSearchParams(url.hash.slice(1));
    return AUTH_KEYS.some((key) => url.searchParams.has(key) || fragment.has(key));
  } catch {
    return false;
  }
}

export function safeStoredAccount<T extends { password?: string }>(account: T): T {
  return { ...account, password: '' };
}
