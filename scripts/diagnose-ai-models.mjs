process.loadEnvFile('.env');

const models = process.argv.slice(2);
const candidates = models.length ? models : [
  process.env.NVIDIA_MODEL || 'moonshotai/kimi-k3',
  'nvidia/nemotron-3.5-lightning-30b-a3b',
  'nvidia/llama-3.1-nemotron-51b-instruct',
  'nvidia/llama-3.1-nemotron-70b-instruct',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
];

const key = process.env.NVIDIA_API_KEY;
if (!key) {
  console.log(JSON.stringify({ success: false, error: 'Missing NVIDIA_API_KEY' }));
  process.exit(1);
}

for (const model of [...new Set(candidates)]) {
  const started = Date.now();
  const body = {
    model,
    max_tokens: 180,
    temperature: 0.3,
    stream: false,
    messages: [
      { role: 'system', content: 'Return only JSON with keys text and suggestedActions.' },
      { role: 'user', content: 'Give one practical way to start reading today.' },
    ],
  };
  if (model === 'nvidia/nemotron-3.5-lightning-30b-a3b') {
    body.chat_template_kwargs = { enable_thinking: false };
  }
  try {
    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(28000),
    });
    const text = await response.text();
    console.log(JSON.stringify({
      model,
      status: response.status,
      elapsedMs: Date.now() - started,
      ok: response.ok,
      bodyStart: text.slice(0, 260),
    }));
  } catch (error) {
    console.log(JSON.stringify({
      model,
      ok: false,
      elapsedMs: Date.now() - started,
      error: error instanceof Error ? error.name : 'unknown',
    }));
  }
}
