import test from 'node:test';
import assert from 'node:assert/strict';
import { createChunkedStorage } from '../src/lib/chunked-storage.ts';

function memoryStore(limit = Infinity) {
  const values = new Map();
  return {
    values,
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) {
      assert.ok(Buffer.byteLength(value) <= limit);
      values.set(key, value);
    },
    async removeItem(key) { values.delete(key); },
  };
}

test('large multilingual OAuth sessions stay encrypted and migrate from legacy storage', async () => {
  const secure = memoryStore(2048);
  const legacy = memoryStore();
  const session = JSON.stringify({ access_token: 'x'.repeat(6000), name: '\u0928\u093e\u092e'.repeat(1500) });
  await legacy.setItem('session', session);
  const storage = createChunkedStorage(secure, legacy);
  assert.equal(await storage.getItem('session'), session);
  assert.equal(await legacy.getItem('session'), null);
  assert.ok(secure.values.size > 3);
  await storage.setItem('session', 'updated');
  assert.equal(secure.values.size, 2);
  assert.equal(await storage.getItem('session'), 'updated');
  await storage.removeItem('session');
  assert.equal(secure.values.size, 0);
});

test('failed secure writes preserve the previous session', async () => {
  const secure = memoryStore();
  const storage = createChunkedStorage(secure, memoryStore());
  await storage.setItem('session', 'original');
  const write = secure.setItem;
  secure.setItem = async (key, value) => {
    if (value === 'fail') throw new Error('keychain unavailable');
    return write(key, value);
  };
  await assert.rejects(storage.setItem('session', 'fail'), /keychain/);
  assert.equal(await storage.getItem('session'), 'original');
  assert.equal(secure.values.size, 2);
});

test('concurrent token refresh and sign-out cannot leave an active session', async () => {
  const secure = memoryStore();
  const storage = createChunkedStorage(secure, memoryStore());
  await Promise.all([storage.setItem('session', 'first'), storage.setItem('session', 'second'), storage.removeItem('session')]);
  assert.equal(await storage.getItem('session'), null);
  assert.equal(secure.values.size, 0);
});
