export type CoachRitual = {
  id: string;
  name: string;
  icon: string;
  doneToday: boolean;
  streakDays: number;
  bestStreakDays: number;
  heat: number[];
  weekly: number[];
  createdAt: number;
  reminderTime?: string;
  why?: string;
  goalAmount?: number;
  goalUnit?: string;
};

export type CoachReply = {
  text: string;
  source?: 'ai' | 'offline';
  insightCard?: { headline: string; body: string; bars?: number[]; metric?: string };
  suggestedActions?: Array<{
    id: string;
    label: string;
    type: 'reschedule_reminder' | 'suggest_new_ritual' | 'generate_weekly_recap';
    payload?: Record<string, unknown>;
  }>;
};

export function ritualMetrics(ritual: CoachRitual, now = new Date()) {
  const created = new Date(ritual.createdAt);
  const calendarDay = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const age = Math.max(1, Math.floor((calendarDay(now) - calendarDay(created)) / 86400000) + 1);
  const totalDays = Math.min(age, ritual.heat.length || 1);
  const days = ritual.heat.slice(-totalDays);
  const completions = days.filter(Boolean).length;
  return { totalDays, completions, completionRate: Math.round(completions / totalDays * 100) };
}

export function offlineCoachReply(message: string, rituals: CoachRitual[]): CoachReply {
  const lower = message.toLowerCase();
  const named = [...rituals].sort((a, b) => b.name.length - a.name.length)
    .find((ritual) => lower.includes(ritual.name.toLowerCase()));
  if (!rituals.length) {
    return {
      source: 'offline',
      text: 'Start with one small ritual tied to something you already do. A two-minute reading break after breakfast is a simple option. What would you like to build?',
      suggestedActions: [{ id: 'starter-reading', type: 'suggest_new_ritual', label: 'Add 2-minute reading', payload: { name: '2-minute reading', icon: 'R' } }],
    };
  }
  const pending = rituals.filter((ritual) => !ritual.doneToday);
  const target = named ?? pending[0] ?? rituals[0];
  const metrics = ritualMetrics(target);
  const detail = `${target.name}: ${target.doneToday ? 'completed today' : 'still open today'}, ${target.streakDays}-day streak, ${metrics.completions}/${metrics.totalDays} tracked days completed.`;
  const card = { headline: target.name, body: detail, bars: target.weekly, metric: `${metrics.completionRate}% over ${metrics.totalDays} tracked days` };
  if (/\b(recap|week|progress|doing|summary)\b/.test(lower)) {
    const lines = rituals.map((ritual) => {
      const days = Math.min(7, ritualMetrics(ritual).totalDays);
      return `${ritual.name}: ${ritual.heat.slice(-days).filter(Boolean).length}/${days} recent days, ${ritual.streakDays}-day streak.`;
    });
    return { source: 'offline', text: `${rituals.length - pending.length}/${rituals.length} rituals completed today.\n\n${lines.join('\n')}\n\n${pending.length ? `Next: choose a manageable version of ${target.name}.` : 'Everything is complete today. Take a break and keep the same cues tomorrow.'}` };
  }
  if (/\b(remind|reminder|schedule|time)\b/.test(lower)) {
    return { source: 'offline', text: `${detail} ${target.reminderTime ? `Its reminder is set to ${target.reminderTime}.` : 'It has no reminder yet.'} You can change it from the ritual edit button.`, insightCard: card };
  }
  if (/\b(why|goal|purpose)\b/.test(lower) && named) {
    return { source: 'offline', text: `${detail} ${target.why ? `Your reason: ${target.why}.` : 'You have not added a personal reason yet.'} ${target.goalAmount ? `Your target is ${target.goalAmount} ${target.goalUnit ?? ''}.` : 'Keep the first step small enough to repeat.'}`, insightCard: card };
  }
  if (/\b(suggest|new|start|build)\b/.test(lower)) {
    return { source: 'offline', text: `Try two minutes of quiet breathing after ${target.name}. Keep the cue specific and the target easy to repeat.`, suggestedActions: [{ id: 'starter-breathing', type: 'suggest_new_ritual', label: 'Add 2-minute breathing', payload: { name: '2-minute breathing', icon: 'B' } }] };
  }
  if (/\b(miss|missed|late|streak|motivation|tired|busy|hard)\b/.test(lower)) {
    return { source: 'offline', text: `${detail} An unfinished ritual today does not mean your streak is broken. Choose a smaller version or a realistic time. What is getting in the way?`, insightCard: card };
  }
  return {
    source: 'offline',
    text: `${detail} ${target.doneToday ? 'You have finished this ritual today.' : `Try the smallest useful version of ${target.name} next.`} Keep the next step specific, short and easy to repeat. Start with two minutes, then stop or continue only if it still feels manageable.`,
    insightCard: card,
  };
}

export function parseCoachReply(value: unknown, rituals: Array<{ id: string }>): CoachReply | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  if (typeof input.text !== 'string' || !input.text.trim()) return null;
  const actions: NonNullable<CoachReply['suggestedActions']> = [];
  for (const raw of Array.isArray(input.suggestedActions) ? input.suggestedActions.slice(0, 3) : []) {
    if (!raw || typeof raw !== 'object') continue;
    const action = raw as Record<string, unknown>;
    const payload = action.payload && typeof action.payload === 'object' ? action.payload as Record<string, unknown> : {};
    const id = `action-${actions.length}`;
    if (action.type === 'generate_weekly_recap') {
      actions.push({ id, type: action.type, label: 'Show weekly recap' });
    } else if (action.type === 'suggest_new_ritual' && typeof payload.name === 'string' && payload.name.trim()) {
      const name = payload.name.trim().slice(0, 80);
      actions.push({ id, type: action.type, label: `Add ${name}`, payload: { name, icon: typeof payload.icon === 'string' ? payload.icon.slice(0, 12) : 'R' } });
    } else if (action.type === 'reschedule_reminder' && rituals.some((ritual) => ritual.id === payload.ritualId)
      && typeof payload.reminderTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(payload.reminderTime)) {
      actions.push({ id, type: action.type, label: `Set reminder to ${payload.reminderTime}`, payload: { ritualId: payload.ritualId, reminderTime: payload.reminderTime } });
    }
  }
  const card = input.insightCard as Record<string, unknown> | undefined;
  return {
    text: input.text.trim().slice(0, 12000),
    source: input.source === 'offline' ? 'offline' : 'ai',
    suggestedActions: actions,
    ...(card && typeof card.headline === 'string' && typeof card.body === 'string' ? {
      insightCard: {
        headline: card.headline.slice(0, 160), body: card.body.slice(0, 2000),
        bars: Array.isArray(card.bars) ? card.bars.slice(0, 30).map((value) => Number(value) > 0 ? 1 : 0) : undefined,
        metric: typeof card.metric === 'string' ? card.metric.slice(0, 120) : undefined,
      },
    } : {}),
  };
}
