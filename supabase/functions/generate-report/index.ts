import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
};
const allowedIntervals = [1, 7, 10, 15, 30];

type Report = {
  window: { start: string; end: string; intervalDays: number; timeZone: string };
  totalTasksCreated: number;
  completedOnTime: number;
  completedLate: number;
  notCompleted: number;
  mostMissedTaskCategory: string | null;
  commonValidReasons: string[];
  commonAvoidableDistractions: string[];
  timeWastingPattern: string;
  bestPerformingDays: string[];
  weakAreas: string[];
  advice: string;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anonKey) return Response.json({ error: 'Missing Supabase environment' }, { status: 500, headers: corsHeaders });

  const auth = req.headers.get('Authorization') ?? '';
  const supabase = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

  const body = await req.json().catch(() => ({}));
  const requested = Number(body.intervalDays);
  const timeZone = validTimeZone(typeof body.timeZone === 'string' ? body.timeZone : '') ? body.timeZone : 'UTC';
  const { data: profile } = await supabase.from('profiles').select('name,report_interval_days').eq('id', user.id).maybeSingle();
  const intervalDays = allowedIntervals.includes(requested) ? requested : (profile?.report_interval_days ?? 7);
  const endIso = dateIsoInTimeZone(new Date(), timeZone);
  const startIso = addIsoDays(endIso, -intervalDays + 1);

  const [{ data: habits }, { data: logs }, { data: checkins }] = await Promise.all([
    supabase.from('habits').select('id,name,color,created_at').eq('user_id', user.id).eq('is_archived', false),
    supabase.from('habit_logs').select('habit_id,log_date,completed_at').eq('user_id', user.id).gte('log_date', startIso).lte('log_date', endIso),
    supabase.from('ritual_checkins').select('task_category,user_reason_raw,ai_reason_category,completed_late,completion_status,checkin_date').eq('user_id', user.id).gte('checkin_date', startIso).lte('checkin_date', endIso),
  ]);

  const report = buildReport(habits ?? [], logs ?? [], checkins ?? [], startIso, endIso, intervalDays, timeZone);
  const apiKey = Deno.env.get('NVIDIA_API_KEY');
  if (apiKey) report.advice = await improveAdvice(apiKey, report).catch(() => report.advice);

  const { data, error } = await supabase.from('ai_reports').upsert({
    user_id: user.id,
    window_start: startIso,
    window_end: endIso,
    interval_days: intervalDays,
    report,
  }, { onConflict: 'user_id,window_start,window_end,interval_days' }).select('id,report,created_at').single();
  if (error) return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  return Response.json({ ...report, id: data.id, generatedAt: data.created_at, userName: profile?.name ?? user.email ?? 'Rituals user' }, { headers: corsHeaders });
});

function dateIso(date: Date) { return date.toISOString().slice(0, 10); }

function addIsoDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return dateIso(date);
}

function dateIsoInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '01';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function validTimeZone(value: string) {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function buildReport(habits: Array<{ id: string; name: string; color?: string | null; created_at?: string | null }>, logs: Array<{ habit_id: string; log_date: string; completed_at?: string | null }>, checkins: Array<{ task_category?: string | null; user_reason_raw?: string | null; ai_reason_category?: string | null; completed_late?: boolean | null; completion_status?: string | null; checkin_date: string }>, start: string, end: string, intervalDays: number, timeZone: string): Report {
  const missedByCategory = new Map<string, number>();
  const valid = new Map<string, number>();
  const avoidable = new Map<string, number>();
  checkins.forEach((row) => {
    if (row.task_category) missedByCategory.set(row.task_category, (missedByCategory.get(row.task_category) ?? 0) + 1);
    const reason = (row.user_reason_raw ?? '').trim();
    if (!reason) return;
    if (row.ai_reason_category === 'valid_reason') valid.set(reason, (valid.get(reason) ?? 0) + 1);
    if (row.ai_reason_category === 'avoidable_distraction') avoidable.set(reason, (avoidable.get(reason) ?? 0) + 1);
  });
  const totalTasksCreated = habits.filter((habit) => !habit.created_at || habit.created_at.slice(0, 10) <= end).length;
  const completedLate = checkins.filter((row) => row.completed_late || row.completion_status === 'completed_late').length;
  const notCompleted = checkins.filter((row) => row.completion_status === 'not_completed' || (!row.completed_late && !row.completion_status)).length;
  const completedOnTime = Math.max(0, logs.length - completedLate);
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const dayCounts = new Map<string, number>();
  logs.forEach((log) => { const day = days[new Date(`${log.log_date}T00:00:00Z`).getUTCDay()]; dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1); });
  const bestPerformingDays = [...dayCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([day]) => day);
  const weakAreas = [...missedByCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([category]) => category);
  const topAvoidable = [...avoidable.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const topWeakArea = weakAreas[0];
  return {
    window: { start, end, intervalDays, timeZone },
    totalTasksCreated,
    completedOnTime,
    completedLate,
    notCompleted,
    mostMissedTaskCategory: weakAreas[0] ?? null,
    commonValidReasons: topKeys(valid),
    commonAvoidableDistractions: topKeys(avoidable),
    timeWastingPattern: topAvoidable
      ? `${topAvoidable}${topWeakArea ? ` most often affected ${topWeakArea}.` : ' showed up as the main avoidable distraction.'}`
      : 'No repeated avoidable-distraction pattern recorded.',
    bestPerformingDays,
    weakAreas,
    advice: avoidable.size ? 'Complete the smallest version of the ritual before entertainment or scrolling, and move reminders earlier when needed.' : 'Keep the current cue stable and record the exact blocker when a ritual slips.',
  };
}

function topKeys(values: Map<string, number>) { return [...values.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([key]) => key); }

async function improveAdvice(apiKey: string, report: Report) {
  const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'moonshotai/kimi-k3', max_tokens: 220, temperature: 0.3, messages: [{ role: 'system', content: 'Return one supportive, honest habit-advice paragraph based only on the supplied report. Do not invent numbers.' }, { role: 'user', content: JSON.stringify(report) }] }) });
  if (!response.ok) throw new Error('NVIDIA request failed');
  const json = await response.json();
  return typeof json?.choices?.[0]?.message?.content === 'string' ? json.choices[0].message.content.trim() : report.advice;
}
