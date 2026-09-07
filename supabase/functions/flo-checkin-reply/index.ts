import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const apiKey = Deno.env.get('NVIDIA_API_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    return Response.json({ error: 'Missing Supabase environment' }, { status: 500, headers: corsHeaders });
  }

  const body = await req.json().catch(() => ({}));
  const ritual = body?.ritual ?? {};
  const reason = typeof body?.reason === 'string' ? body.reason : '';
  const tone = body?.tone === 'coach' || body?.tone === 'direct' || body?.tone === 'gentle' ? body.tone : 'gentle';
  const hasPattern = Boolean(body?.hasPattern);

  const fallback = localFloCheckinReply({
    name: typeof ritual.name === 'string' ? ritual.name : 'your ritual',
    reminderTime: typeof ritual.reminderTime === 'string' ? ritual.reminderTime : null,
    why: typeof ritual.why === 'string' ? ritual.why : '',
  }, reason, tone, hasPattern);

  if (!apiKey) {
    return Response.json(fallback, { headers: corsHeaders });
  }

  try {
    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'moonshotai/kimi-k3',
        max_tokens: 600,
        temperature: 0.7,
        stream: false,
        messages: [
          {
            role: 'system',
            content: 'You are Flo, the companion inside a ritual habit app. A user missed a scheduled ritual and gave a reason. Respond briefly in 2-4 supportive sentences, honest and never insulting. Return strict JSON with message, category, protect_streak, suggested_action, reason_category, reason_summary, and advice. reason_category must be valid_reason, avoidable_distraction, or unclear_reason. Use unclear_reason when the answer is vague such as busy, forgot, or could not do it. Do not invent facts.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              ritual_name: ritual.name,
              scheduled_window: ritual.reminderTime ?? 'unscheduled',
              ritual_why: ritual.why ?? '',
              user_reason: reason,
              recent_pattern: hasPattern ? 'This is the 3rd+ similar miss this week.' : undefined,
              tone_setting: tone,
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      return Response.json(fallback, { headers: corsHeaders });
    }

    const json = await response.json();
    const content = json?.choices?.[0]?.message?.content;
    const parsed = typeof content === 'string'
      ? JSON.parse(content.replace(/^```json\s*|\s*```$/g, ''))
      : null;

    if (
      parsed
      && typeof parsed.message === 'string'
      && ['aligned_tradeoff', 'circumstantial', 'drift', 'pattern'].includes(parsed.category)
      && typeof parsed.protect_streak === 'boolean'
        && ['valid_reason', 'avoidable_distraction', 'unclear_reason'].includes(parsed.reason_category)
    ) {
      return Response.json({
        message: parsed.message,
        category: parsed.category,
        protect_streak: parsed.protect_streak,
        suggested_action: typeof parsed.suggested_action === 'string' ? parsed.suggested_action : null,
          reason_category: parsed.reason_category,
          reason_summary: typeof parsed.reason_summary === 'string' ? parsed.reason_summary : reason,
          advice: typeof parsed.advice === 'string' ? parsed.advice : 'Try making the next version smaller and easier to start.',
      }, { headers: corsHeaders });
    }
  } catch {
    // fall back below
  }

  return Response.json(fallback, { headers: corsHeaders });
});

function localFloCheckinReply(
  ritual: { name: string; reminderTime?: string | null; why?: string },
  reason: string,
  tone: 'coach' | 'direct' | 'gentle',
  hasPattern: boolean,
) {
  const lower = reason.toLowerCase();
  const valid = /urgent|office|work|health|sick|ill|family|emergency|workload|responsibility|hospital|doctor|travel|traffic|meeting|deadline/i.test(lower);
  const avoidable = /movie|party|social|scroll|instagram|youtube|gaming|game|timepass|entertainment|netflix|reel|fun/i.test(lower);
  const unclear = !valid && !avoidable || /busy|forgot|could not|couldn't|not able|no time/i.test(lower);
  const reasonCategory = avoidable ? 'avoidable_distraction' : valid && !unclear ? 'valid_reason' : 'unclear_reason';
  const category = hasPattern ? 'pattern' : reasonCategory === 'valid_reason' ? 'circumstantial' : 'drift';
  const protect = reasonCategory === 'valid_reason';
  const suggestedAction = reasonCategory === 'avoidable_distraction'
    ? 'Finish first, entertainment after.'
    : reasonCategory === 'unclear_reason'
      ? 'Name the exact blocker.'
      : 'Reschedule or reduce target.';
  const advice = reasonCategory === 'valid_reason'
    ? 'You can reschedule the ritual or reduce today\'s target so the habit still has a clean next step.'
    : reasonCategory === 'avoidable_distraction'
      ? 'Complete the ritual before entertainment, or block the distracting app until the ritual is done.'
      : 'What was the exact blocker: time, energy, place, or another responsibility?';
  const summary = reasonCategory === 'valid_reason'
    ? 'The reason appears valid because an unavoidable responsibility or health issue replaced the planned ritual.'
    : reasonCategory === 'avoidable_distraction'
      ? 'The reason appears avoidable because entertainment or drift replaced the planned ritual.'
      : 'The reason is not specific enough to identify the real blocker.';

  return {
    message: reasonCategory === 'valid_reason'
      ? `I understand. I saved this as a valid reason. ${advice}`
      : reasonCategory === 'avoidable_distraction'
        ? `I saved your reason. This looks like avoidable time usage because it replaced ${ritual.name}. ${advice}`
        : `I saved this, but the reason is not fully clear. ${advice}`,
    category,
    protect_streak: protect,
    suggested_action: suggestedAction,
    reason_category: reasonCategory,
    reason_summary: summary,
    advice,
  };
}
