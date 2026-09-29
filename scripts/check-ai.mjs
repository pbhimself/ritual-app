// This makes one small provider request with synthetic ritual data. Never prints credentials.
process.loadEnvFile('.env');
if (process.argv.includes('--models')) {
  const response = await fetch('https://integrate.api.nvidia.com/v1/models', {
    headers: { Authorization: `Bearer ${process.env.NVIDIA_API_KEY}` }, signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  console.log(JSON.stringify({ status: response.status, models: result.data?.map((model) => model.id).filter((id) => /llama|nemotron|kimi|qwen/i.test(id)) }));
  process.exit(response.ok ? 0 : 1);
}
globalThis.Deno = { env: { get: (name) => process.env[name] } };
const { generateAI, parseObject } = await import('../supabase/functions/_shared/ai.ts');
const started = Date.now();
try {
  const text = await generateAI({
    system: 'You are a habit coach. Return only JSON with text and suggestedActions. Do not invent tracked data.',
    message: 'My ritual is reading ten minutes after breakfast. Give one practical way to start today.',
    maxTokens: 700,
  });
  const reply = parseObject(text);
  console.log(JSON.stringify({ success: typeof reply?.text === 'string', elapsedMs: Date.now() - started, reply: reply?.text ?? 'Invalid response format' }));
  if (typeof reply?.text !== 'string') process.exitCode = 1;
} catch (error) {
  console.log(JSON.stringify({ success: false, elapsedMs: Date.now() - started, error: error.message }));
  process.exitCode = 1;
}
