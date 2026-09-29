type Message = { role: 'assistant' | 'user'; text: string };
type AIOptions = { system: string; message: string; history?: Message[]; maxTokens?: number };

export async function generateAI({ system, message, history = [], maxTokens = 1000 }: AIOptions): Promise<string> {
  const nvidiaKey = Deno.env.get('NVIDIA_API_KEY');
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  const nvidiaModel = Deno.env.get('NVIDIA_MODEL') || 'moonshotai/kimi-k3';
  const messages = [...history.slice(-10).map((item) => ({ role: item.role, content: item.text })), { role: 'user', content: message }];
  const providers: Array<{ name: string; url: string; headers: Record<string, string>; body: unknown; timeout: number }> = [
    ...(nvidiaKey ? [{
      name: 'nvidia', url: 'https://integrate.api.nvidia.com/v1/chat/completions',
      headers: { Authorization: `Bearer ${nvidiaKey}`, 'Content-Type': 'application/json' },
      body: { model: nvidiaModel, ...(nvidiaModel.startsWith('moonshotai/') ? { reasoning_effort: 'low' } : {}), ...(nvidiaModel === 'nvidia/nemotron-3.5-lightning-30b-a3b' ? { chat_template_kwargs: { enable_thinking: false } } : {}), max_tokens: maxTokens, temperature: 0.4, stream: false, messages: [{ role: 'system', content: system }, ...messages] },
      timeout: 11000,
    }] : []),
    ...(anthropicKey ? [{
      name: 'anthropic', url: 'https://api.anthropic.com/v1/messages',
      headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: { model: Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-6', max_tokens: maxTokens, system, messages },
      timeout: 7000,
    }] : []),
  ];
  for (const provider of providers) {
    try {
      const response = await fetch(provider.url, {
        method: 'POST', headers: provider.headers,
        body: JSON.stringify(provider.body), signal: AbortSignal.timeout(provider.timeout),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const text = provider.name === 'nvidia' ? data.choices?.[0]?.message?.content
        : data.content?.filter((item: { type: string }) => item.type === 'text').map((item: { text: string }) => item.text).join('\n');
      if (typeof text !== 'string' || !text.trim()) throw new Error('Empty response');
      return text.trim();
    } catch (error) {
      // Never log prompts, user data or credentials in provider diagnostics.
      console.warn('AI provider unavailable', provider.name, error instanceof Error ? (/^HTTP \d{3}$/.test(error.message) ? error.message : error.name) : 'unknown');
    }
  }
  throw new Error('AI unavailable');
}

export function parseObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
