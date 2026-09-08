import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

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
            content: [
              'You are Flo, the companion inside a ritual habit app.',
              'A user missed a scheduled ritual and gave a reason.',
              'Classify honestly: studying, classes, exams, office work, job duty, health, family emergency, necessary commute, traffic, meetings, deadlines, or unavoidable responsibilities are valid_reason.',
              'Party, clubbing, casual hangout, movies, gaming, social media, scrolling, entertainment, timepass, and leisure travel are avoidable_distraction.',
              'Generic travel is unclear unless the user says it was a commute, traffic, work travel, emergency travel, or required responsibility.',
              'Vague answers like busy, forgot, no time, or could not do it are unclear_reason.',
              'Respond in 2-4 supportive but direct sentences.',
              'Always give one concrete recovery action: either do a tiny version now, move it 30, 60, or 90 minutes later, or reduce the target for today.',
              'For valid_reason, mention the productive/protected keyword. For avoidable_distraction, mention the time-leak keyword without shaming.',
              'Do not insult the user, do not overprotect avoidable reasons, and do not invent facts.',
              'Return strict JSON with message, category, protect_streak, suggested_action, reason_category, reason_summary, and advice.',
            ].join(' '),
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
    const parsed = typeof content === 'string' ? parseJsonObject(content) : null;

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

function parseJsonObject(content: string) {
  const clean = content.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try {
    return JSON.parse(clean);
  } catch {
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(clean.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function localFloCheckinReply(
  ritual: { name: string; reminderTime?: string | null; why?: string },
  reason: string,
  _tone: 'coach' | 'direct' | 'gentle',
  hasPattern: boolean,
) {
  const classified = classifyReasonText(reason);
  const reasonCategory = classified.category;
  const category = hasPattern ? 'pattern' : reasonCategory === 'valid_reason' ? 'circumstantial' : 'drift';
  const protect = reasonCategory === 'valid_reason';
  const suggestedAction = reasonCategory === 'avoidable_distraction'
    ? `Do a 2-minute version of ${ritual.name} now, then keep entertainment after the ritual.`
    : reasonCategory === 'unclear_reason'
      ? 'Name the exact blocker, then choose a 30, 60, or 90-minute recovery slot.'
      : `Protect this as ${classified.keyword}, then move ${ritual.name} to a 30, 60, or 90-minute recovery slot today.`;
  const advice = reasonCategory === 'valid_reason'
    ? `That looks valid because ${classified.keyword} used the planned time. Keep the streak honest: reduce the target or do it 30, 60, or 90 minutes later today.`
    : reasonCategory === 'avoidable_distraction'
      ? `This looks avoidable because ${classified.keyword} replaced the ritual. Do the smallest version now, and move fun, scrolling, or social time after the ritual.`
      : 'Tell me the exact blocker: time, energy, place, or another responsibility. Then I can suggest the right recovery slot.';
  const summary = reasonCategory === 'valid_reason'
    ? `${classified.keyword} used the planned ritual window for a real responsibility.`
    : reasonCategory === 'avoidable_distraction'
      ? `${classified.keyword} replaced the planned ritual window.`
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

function classifyReasonText(reason: string): { category: 'valid_reason' | 'avoidable_distraction' | 'unclear_reason'; keyword: string } {
  const lower = reason.trim().toLowerCase();
  const has = (pattern: RegExp) => pattern.test(lower);
  const forcedTravel = has(/\b(commute|traffic|train delay|bus delay|flight delay|work trip|business trip|office travel|travel for work)\b/i);
  const leisureTravel = has(/\b(trip|outing|road trip|vacation|holiday|tour|hangout|hang out|club|clubbing|party|partying)\b/i);
  const validMatch = [
    { keyword: 'studying', pattern: /\b(study|studying|class|exam|assignment|lecture|college|school|homework|revision|practice)\b/i },
    { keyword: 'work', pattern: /\b(work|office|job|shift|client|meeting|deadline|workload|project|overtime)\b/i },
    { keyword: 'health', pattern: /\b(health|sick|ill|fever|doctor|hospital|medicine|injury|therapy)\b/i },
    { keyword: 'family responsibility', pattern: /\b(family|parent|child|care|emergency|responsibility|urgent)\b/i },
    { keyword: 'necessary travel', pattern: /\b(commute|traffic|train delay|bus delay|flight delay|work trip|business trip|office travel|travel for work)\b/i },
  ].find(({ pattern }) => has(pattern));
  const avoidableMatch = [
    { keyword: 'party', pattern: /\b(party|partying|club|clubbing|bar|drinks?)\b/i },
    { keyword: 'hangout', pattern: /\b(hangout|hang out|friends|date|chill|outing)\b/i },
    { keyword: 'social media', pattern: /\b(scroll|instagram|reels?|youtube|shorts|social media|tiktok|facebook)\b/i },
    { keyword: 'entertainment', pattern: /\b(movie|netflix|series|gaming|game|fun|entertainment|timepass)\b/i },
    { keyword: 'leisure travel', pattern: /\b(trip|road trip|vacation|holiday|tour)\b/i },
  ].find(({ pattern }) => has(pattern));
  const vague = !lower || has(/\b(busy|forgot|no time|could not|couldn't|not able|later|something came up)\b/i);

  if (avoidableMatch && (!validMatch || leisureTravel || !forcedTravel)) return { category: 'avoidable_distraction', keyword: avoidableMatch.keyword };
  if (validMatch && !vague) return { category: 'valid_reason', keyword: validMatch.keyword };
  return { category: 'unclear_reason', keyword: 'unclear blocker' };
}
