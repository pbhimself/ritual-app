import assert from 'node:assert/strict';
import { test } from 'node:test';
import { trustedAuthCallback, safeStoredAccount } from '../src/lib/auth-callback.ts';

const native = 'com.pratikbhangale.rituals://auth/callback';
const origin = 'https://ritual.example';
test('only app-owned OAuth callbacks are accepted', () => {
  assert.equal(trustedAuthCallback(`${native}?code=ok`, native, origin), true);
  assert.equal(trustedAuthCallback(`${origin}/auth/callback?code=ok`, native, origin), true);
  assert.equal(trustedAuthCallback(`${origin}/#access_token=a&refresh_token=b`, native, origin), true);
  for (const url of ['https://attacker.example/?code=abc', 'com.pratikbhangale.rituals://other/path?code=abc', `${origin}/profile?code=abc`, `${origin}/auth/callback`, 'invalid']) {
    assert.equal(trustedAuthCallback(url, native, origin), false, url);
  }
});
test('persisted account copies never contain the password', () => {
  const original = { id: 'user', password: 'private-value', username: 'Alex' };
  assert.deepEqual(safeStoredAccount(original), { ...original, password: '' });
  assert.equal(original.password, 'private-value');
});
