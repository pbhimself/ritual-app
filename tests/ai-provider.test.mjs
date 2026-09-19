import assert from 'node:assert/strict';
import { test } from 'node:test';

const env = new Map();
globalThis.Deno = { env: { get: (name) => env.get(name) } };
const { generateAI, parseObject } = await import('../supabase/functions/_shared/ai.ts');

test('provider failover, bounds and malformed responses', async () => {
  const originalFetch = globalThis.fetch;
  env.set('NVIDIA_API_KEY', 'test-key');
  env.set('ANTHROPIC_API_KEY', 'test-key');
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1 ? new Response('{}', { status: 503 })
      : Response.json({ content: [{ type: 'text', text: 'Useful reply' }] });
  };
  try {
    assert.equal(await generateAI({ system: 'coach', message: 'help' }), 'Useful reply');
    assert.equal(calls.length, 2);
    assert.equal(JSON.parse(calls[0].options.body).reasoning_effort, 'low');
    assert.ok(calls.every((call) => call.options.signal instanceof AbortSignal));
    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: '' } }] });
    env.delete('ANTHROPIC_API_KEY');
    await assert.rejects(generateAI({ system: 'coach', message: 'help' }), /unavailable/);
    env.clear();
    await assert.rejects(generateAI({ system: 'coach', message: 'help' }), /unavailable/);
  } finally {
    globalThis.fetch = originalFetch;
    env.clear();
  }
});
test('JSON envelope accepts fenced objects and rejects partial or non-object data', () => {
  assert.deepEqual(parseObject('```json\n{"text":"ok"}\n```'), { text: 'ok' });
  for (const value of ['null', '[]', 'not json', '{"text":']) assert.equal(parseObject(value), null);
});
