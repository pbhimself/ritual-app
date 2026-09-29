import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimedFetch } from '../src/lib/request.ts';

const stalledFetch = (_input, { signal }) => new Promise((_resolve, reject) => {
  const stop = () => reject(new DOMException('Aborted', 'AbortError'));
  if (signal.aborted) stop();
  else signal.addEventListener('abort', stop, { once: true });
});

test('stalled data requests time out', async () => {
  const request = createTimedFetch(stalledFetch, 20);
  await assert.rejects(request('https://example.com/rest/v1/habits'), { name: 'AbortError' });
});

test('caller cancellation still aborts AI requests', async () => {
  const controller = new AbortController();
  const request = createTimedFetch(stalledFetch);
  const pending = request('https://example.com/functions/v1/coach-chat', { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});
