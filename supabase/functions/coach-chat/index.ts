import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type ConversationItem = {
  role: 'assistant' | 'user';
  text: string;
};

type CoachAction = {
  id: string;
  label: string;
  type: 'reschedule_reminder' | 'suggest_new_ritual' | 'generate_weekly_recap';
  payload?: Record<string, unknown>;
};

type RitualSummary = {
  ritualId: string;
  name: string;
  completionRate: number;
  completions: number;
  totalDays: number;
  longestStreak: number;
  currentStreak: number;
  streakBeforeToday: number;
  completedToday: boolean;
  reminderTime?: string | null;
  last7Days?: number[];
  timeOfDayDistribution?: Record<string, number>;
  dayOfWeekPattern?: Record<string, number>;
};

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
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  const nvidiaKey = Deno.env.get('NVIDIA_API_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    return Response.json({ error: 'Missing Supabase environment' }, { status: 500, headers: corsHeaders });
  }

  const body = await req.json().catch(() => ({}));
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const conversationHistory = Array.isArray(body.conversationHistory)
    ? body.conversationHistory.filter((item: ConversationItem) => item?.text && (item.role === 'assistant' || item.role === 'user'))
    : [];

  if (!message) {
    return Response.json({ error: 'Message is required' }, { status: 400, headers: corsHeaders });
  }

  const authorization = req.headers.get('Authorization') ?? '';
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  }

  const { data: cachedSummary } = await supabase
    .from('coach_summaries')
    .select('summary,summary_window_start,summary_window_end')
    .eq('user_id', user.id)
    .order('summary_window_end', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: rituals } = await supabase
    .from('habits')
    .select('id,name,icon,color,frequency,reminder_time')
    .eq('user_id', user.id)
    .eq('is_archived', false)
    .order('created_at', { ascending: true });

  const { data: checkins } = await supabase
    .from('ritual_checkins')
    .select('ritual_id,checkin_date,scheduled_window,user_reason_raw,completion_status,completed_late,ai_reason_category,ai_reason_summary,ai_advice,task_category')
    .eq('user_id', user.id)
    .order('actual_response_time', { ascending: false })
    .limit(12);

  const coachData = {
    summary: cachedSummary?.summary ?? null,
    summaryWindow: cachedSummary ? { start: cachedSummary.summary_window_start, end: cachedSummary.summary_window_end } : null,
    rituals: rituals ?? [],
    recentCheckins: checkins ?? [],
  };

  const fallback = buildFallbackReply(message, coachData.summary);

  if (!nvidiaKey && !anthropicKey) {
    return Response.json(fallback, { headers: corsHeaders });
  }

  const claudeReply = nvidiaKey
    ? await callNvidia(nvidiaKey, message, conversationHistory, coachData, fallback).catch(() => fallback)
    : anthropicKey
      ? await callClaude(anthropicKey, message, conversationHistory, coachData, fallback).catch((error) => {
        console.error('Claude request failed', error);
        return fallback;
      })
      : fallback;

  return Response.json(claudeReply, { headers: corsHeaders });
});

async function callNvidia(
  apiKey: string,
  message: string,
  conversationHistory: ConversationItem[],
  coachData: unknown,
  fallback: ReturnType<typeof buildFallbackReply>,
) {
  const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'moonshotai/kimi-k3',
      max_tokens: 900,
      temperature: 0.4,
      stream: false,
      messages: [
        {
          role: 'system',
          content: [
            'You are Rituals Coach inside a habit app.',
            'Be concise, practical, and honest.',
            'Reason only from the supplied ritual data, cached summary, and recentCheckins. Never invent metrics or claim an action was applied.',
            'When recentCheckins contain ai_reason_category or ai_reason_summary, use that saved classification before guessing from raw text.',
            'When a ritual is incomplete or weak, suggest one concrete next action: do a tiny version now, move the reminder 30, 60, or 90 minutes later, reduce today\'s target, or add one better starter ritual.',
            'Treat studying, classes, exams, office work, health, family emergency, necessary commute, traffic, meetings, and deadlines as valid/productive constraints.',
            'Treat party, clubbing, casual hangout, movies, social media, gaming, scrolling, entertainment, timepass, and leisure travel as avoidable time leaks.',
            'Generic travel is unclear unless it is clearly a commute, work travel, emergency travel, or required responsibility.',
            'If the user asks for suggestions, name the strongest anchor ritual and one weakest ritual when data exists.',
            'Return plain text for the chat bubble.',
          ].join(' '),
        },
        ...conversationHistory.slice(-8).map((item) => ({ role: item.role, content: item.text })),
        { role: 'user', content: JSON.stringify({ message, coachData }) },
      ],
    }),
  });
  if (!response.ok) return fallback;
  const payload = await response.json();
  const text = payload?.choices?.[0]?.message?.content;
  return typeof text === 'string' && text.trim() ? { ...fallback, text: text.trim() } : fallback;
}

async function callClaude(
  anthropicKey: string,
  message: string,
  conversationHistory: ConversationItem[],
  coachData: unknown,
  fallback: ReturnType<typeof buildFallbackReply>,
) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 900,
      system: [
        'You are Rituals Coach, a calm habit coach.',
        'Only reason from the provided cached 30-day summary and ritual list.',
        'Never invent streaks, rates, times, or counts.',
        'Every claim must name the specific ritual and metric behind it.',
        'If the data does not support an answer, say what data is missing.',
        'You may request actions only through the provided tools. Never say an action was already applied.',
      ].join(' '),
      tools: [
        {
          name: 'reschedule_reminder',
          description: 'Request a reminder time change after user confirmation.',
          input_schema: {
            type: 'object',
            properties: {
              ritualId: { type: 'string' },
              ritualName: { type: 'string' },
              reminderTime: { type: 'string', description: '24-hour HH:mm time' },
            },
            required: ['ritualId', 'ritualName', 'reminderTime'],
          },
        },
        {
          name: 'suggest_new_ritual',
          description: 'Suggest one tiny new ritual after user confirmation.',
          input_schema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              icon: { type: 'string' },
              reason: { type: 'string' },
            },
            required: ['name', 'reason'],
          },
        },
        {
          name: 'generate_weekly_recap',
          description: 'Request a weekly recap from the provided metrics.',
          input_schema: {
            type: 'object',
            properties: {},
          },
        },
      ],
      messages: [
        ...conversationHistory.slice(-8).map((item) => ({ role: item.role, content: item.text })),
        {
          role: 'user',
          content: JSON.stringify({
            userMessage: message,
            coachData,
            responseContract: {
              returnPlainTextForChatBubble: true,
              ifUsingTool: 'Use a tool call. The app will show a one-tap confirmation before writing to Supabase.',
            },
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    return fallback;
  }

  const payload = await response.json();
  const content = Array.isArray(payload.content) ? payload.content : [];
  const text = content
    .filter((item: { type: string }) => item.type === 'text')
    .map((item: { text: string }) => item.text)
    .join('\n')
    .trim();
  const suggestedActions = content
    .filter((item: { type: string }) => item.type === 'tool_use')
    .map((item: { id: string; name: string; input?: Record<string, unknown> }) => toolUseToAction(item))
    .filter(Boolean) as CoachAction[];

  return {
    text: text || fallback.text,
    insightCard: buildInsightCard(message, (coachData as { summary?: unknown }).summary) ?? fallback.insightCard,
    suggestedActions: suggestedActions.length ? suggestedActions : fallback.suggestedActions,
  };
}

function toolUseToAction(toolUse: { id: string; name: string; input?: Record<string, unknown> }): CoachAction | null {
  const input = toolUse.input ?? {};
  if (toolUse.name === 'reschedule_reminder') {
    const ritualName = typeof input.ritualName === 'string' ? input.ritualName : 'ritual';
    const reminderTime = typeof input.reminderTime === 'string' ? input.reminderTime : '19:00';
    return {
      id: toolUse.id,
      type: 'reschedule_reminder',
      label: `Move ${ritualName} reminder to ${reminderTime}`,
      payload: input,
    };
  }

  if (toolUse.name === 'suggest_new_ritual') {
    const name = typeof input.name === 'string' ? input.name : 'New ritual';
    return {
      id: toolUse.id,
      type: 'suggest_new_ritual',
      label: `Add ${name}`,
      payload: input,
    };
  }

  if (toolUse.name === 'generate_weekly_recap') {
    return {
      id: toolUse.id,
      type: 'generate_weekly_recap',
      label: 'Generate weekly recap',
      payload: input,
    };
  }

  return null;
}

function buildFallbackReply(message: string, rawSummary: unknown) {
  const rituals = getSummaryRituals(rawSummary);
  if (!rituals.length) {
    return {
      text: 'I do not have ritual metrics yet. Create and track a ritual, then I can coach from the cached 30-day summary.',
    };
  }

  const strongest = [...rituals].sort((a, b) => b.completionRate - a.completionRate)[0];
  const weakest = [...rituals].sort((a, b) => a.completionRate - b.completionRate)[0];
  const lower = message.toLowerCase();
  const broken = getRecentlyBroken(rawSummary)[0];
  const asksAboutMiss = /miss|incomplete|not complete|not done|late|forgot|party|movie|scroll|social|work|busy|reason/.test(lower);

  if (((lower.includes('break') || lower.includes('streak')) && broken) || asksAboutMiss) {
    const ritual = broken ? rituals.find((item) => item.ritualId === broken.ritualId) ?? weakest : weakest;
    const classified = classifyReasonText(message);
    const recovery = classified.category === 'avoidable_distraction'
      ? `${classified.keyword} is an avoidable time leak here. Do a tiny version of ${ritual.name} now, then keep entertainment after the ritual.`
      : classified.category === 'valid_reason'
        ? `${classified.keyword} is productive protected time. Move ${ritual.name} 30, 60, or 90 minutes later today, or reduce the target so the day still counts honestly.`
        : `Name the real blocker, then pick a 30, 60, or 90-minute recovery slot for ${ritual.name}.`;
    return {
      text: `${ritual.name} is the ritual to inspect. Its 30-day completion rate is ${ritual.completionRate}%. ${recovery}`,
      insightCard: buildInsightCard(message, rawSummary),
      suggestedActions: [{
        id: `reschedule-${ritual.ritualId}`,
        type: 'reschedule_reminder' as const,
        label: `Move ${ritual.name} reminder 60 minutes later`,
        payload: { ritualId: ritual.ritualId, reminderTime: addMinutesToTime(ritual.reminderTime ?? undefined, 60) },
      }],
    };
  }

  if (lower.includes('suggest')) {
    return {
      text: `${strongest.name} is your strongest anchor at ${strongest.completionRate}% over the cached 30-day window. Add one tiny ritual immediately after it.`,
      suggestedActions: [{
        id: 'suggest-breathing',
        type: 'suggest_new_ritual' as const,
        label: 'Add 2-minute breathing',
        payload: { name: '2-minute breathing', icon: 'B' },
      }],
    };
  }

  return {
    text: `${strongest.name} is strongest at ${strongest.completionRate}% over 30 days. ${weakest.name} is lowest at ${weakest.completionRate}%. Tighten that cue with a smaller target or move its reminder 30, 60, or 90 minutes based on when you can actually do it.`,
    insightCard: buildInsightCard(message, rawSummary),
    suggestedActions: [{
      id: 'weekly-recap',
      type: 'generate_weekly_recap' as const,
      label: 'Generate weekly recap',
    }],
  };
}

function buildInsightCard(message: string, rawSummary: unknown) {
  const rituals = getSummaryRituals(rawSummary);
  if (!rituals.length) {
    return null;
  }

  const lower = message.toLowerCase();
  const broken = getRecentlyBroken(rawSummary)[0];
  const selected = lower.includes('break') && broken
    ? rituals.find((ritual) => ritual.ritualId === broken.ritualId) ?? rituals[0]
    : [...rituals].sort((a, b) => b.completionRate - a.completionRate)[0];

  return {
    headline: `${selected.name}: ${selected.completionRate}% completion`,
    body: `${selected.name} has ${selected.completions}/${selected.totalDays} completions, a ${selected.currentStreak}-day current streak, and a ${selected.longestStreak}-day longest streak in the cached window.`,
    bars: selected.last7Days ?? [],
    metric: `${selected.completions}/${selected.totalDays} completed`,
  };
}

function getSummaryRituals(rawSummary: unknown): RitualSummary[] {
  const summary = rawSummary as { rituals?: RitualSummary[] } | null;
  return Array.isArray(summary?.rituals) ? summary.rituals : [];
}

function getRecentlyBroken(rawSummary: unknown): Array<{ ritualId: string; name: string; previousStreak: number; brokenOn: string }> {
  const summary = rawSummary as { recentlyBrokenStreaks?: Array<{ ritualId: string; name: string; previousStreak: number; brokenOn: string }> } | null;
  return Array.isArray(summary?.recentlyBrokenStreaks) ? summary.recentlyBrokenStreaks : [];
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

function isValidReminderTime(value?: string): value is string {
  if (!value || !/^\d{2}:\d{2}/.test(value)) return false;
  const [hour, minute] = value.slice(0, 5).split(':').map(Number);
  return Number.isInteger(hour) && Number.isInteger(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function addMinutesToTime(value: string | undefined, minutes: number) {
  if (!isValidReminderTime(value)) return '19:00';
  const [hour, minute] = value.slice(0, 5).split(':').map(Number);
  const date = new Date(2000, 0, 1, hour, minute, 0, 0);
  date.setMinutes(date.getMinutes() + minutes);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
