// This makes one small provider request with synthetic ritual data. Never prints credentials.
process.loadEnvFile('.env');
globalThis.Deno = { env: { get: (name) => process.env[name] } };
const { generateAI, parseObject } = await import('../supabase/functions/_shared/ai.ts');
const started = Date.now();
try {
  const text = await generateAI({
    system: 'You are a habit coach. Return only JSON with text and suggestedActions. Do not invent tracked data.',
    message: 'My ritual is reading ten minutes after breakfast. Give one practical way to start today.',
    maxTokens: 1800,
  });
  const reply = parseObject(text);
  console.log(JSON.stringify({ success: typeof reply?.text === 'string', elapsedMs: Date.now() - started, reply: reply?.text ?? 'Invalid response format' }));
  if (typeof reply?.text !== 'string') process.exitCode = 1;
} catch (error) {
  console.log(JSON.stringify({ success: false, elapsedMs: Date.now() - started, error: error.message }));
  process.exitCode = 1;
}
