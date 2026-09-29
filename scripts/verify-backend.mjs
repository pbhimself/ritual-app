// Creates two disposable accounts and removes only those accounts in finally.
// Opt in explicitly; this performs live writes and a few synthetic AI calls.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

if (!process.argv.includes('--live')) throw new Error('Use --live to run disposable-account checks.');
process.loadEnvFile('.env');
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(url && key && adminKey, 'Missing backend verification environment');
const timedFetch = (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(35000) });
const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: timedFetch } };
const admin = createClient(url, adminKey, options);
const anon = createClient(url, key, options);
const users = [];
const stamp = randomUUID().replaceAll('-', '').slice(0, 16);
const date = new Date().toISOString().slice(0, 10);
const pass = (name, extra = {}) => console.log(JSON.stringify({ check: name, passed: true, ...extra }));
const requireData = ({ data, error }, name) => {
  assert.equal(error, null, `${name}: ${error?.message}`);
  return data;
};
try {
  for (const suffix of ['a', 'b']) {
    const email = `rituals-qa-${stamp}-${suffix}@example.invalid`;
    const password = `${randomUUID()}aA!9`;
    const created = requireData(await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username: `qa_${stamp}_${suffix}`, full_name: 'Disposable QA' } }), 'Create QA account');
    users.push({ id: created.user.id, client: createClient(url, key, options) });
    requireData(await users.at(-1).client.auth.signInWithPassword({ email, password }), 'Password sign-in');
  }
  pass('email sign-in');
  const [owner, stranger] = users;
  const habit = requireData(await owner.client.from('habits').insert({ user_id: owner.id, name: 'QA reading', icon: 'book', color: 'amber', palette_key: 'reading', frequency: 'daily', reminder_time: '08:00', goal_amount: 10, goal_unit: 'pages' }).select('id,name').single(), 'Create ritual');
  requireData(await owner.client.from('habits').update({ name: 'QA reading updated' }).eq('id', habit.id), 'Edit ritual');
  const otherHabits = requireData(await stranger.client.from('habits').select('id').eq('id', habit.id), 'Cross-user read');
  assert.equal(otherHabits.length, 0);
  const changed = requireData(await stranger.client.from('habits').update({ name: 'Forbidden' }).eq('id', habit.id).select('id'), 'Cross-user edit');
  assert.equal(changed.length, 0);
  const crossLog = await stranger.client.from('habit_logs').insert({ user_id: stranger.id, habit_id: habit.id, log_date: date, activity_date: date, completed: true });
  assert.ok(crossLog.error, 'Another user must not log against this ritual');
  pass('ritual CRUD and cross-user isolation');
  const log = { user_id: owner.id, habit_id: habit.id, log_date: date, activity_date: date, completed: true, completed_at: new Date().toISOString() };
  requireData(await owner.client.from('habit_logs').upsert(log, { onConflict: 'user_id,habit_id,activity_date' }), 'Complete ritual');
  const checkin = { id: `qa-${stamp}`, user_id: owner.id, ritual_id: habit.id, habit_id: habit.id, checkin_date: date, scheduled_window: '08:00', user_reason_raw: 'QA work meeting', category: 'circumstantial', flo_message: 'QA response', planned_closing_time: '08:00', completion_status: 'completed_late', completed_late: true, ai_reason_category: 'valid_reason' };
  requireData(await owner.client.from('ritual_checkins').upsert(checkin), 'Save check-in');
  assert.equal(requireData(await stranger.client.from('ritual_checkins').select('id').eq('id', checkin.id), 'Cross-user check-in').length, 0);
  const lookup = await anon.rpc('email_for_username', { lookup_username: `qa_${stamp}_a` });
  assert.ok(lookup.error, 'Anonymous username-to-email lookup must be blocked');
  pass('completion, check-in and email privacy');
  const session = requireData(await owner.client.auth.getSession(), 'Read session').session;
  for (const name of ['coach-chat', 'flo-checkin-reply', 'generate-report']) {
    const response = await timedFetch(`${url}/functions/v1/${name}`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 401, `${name} must reject anonymous calls`);
  }
  pass('all active AI endpoints reject anonymous access');
  const invoke = async (name, body) => {
    const started = Date.now();
    const response = await timedFetch(`${url}/functions/v1/${name}`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json();
    console.log(JSON.stringify({ check: name, status: response.status, elapsedMs: Date.now() - started, error: response.ok ? null : result.error ?? result.message ?? null }));
    return { response, result };
  };
  const coach = await invoke('coach-chat', { message: 'How can I start reading ten pages after breakfast?', clientContext: { rituals: [{ id: habit.id, name: 'QA reading', goal: '10 pages' }] } });
  if (coach.response.ok) assert.ok(coach.result.text?.length);
  else process.exitCode = 1;
  const checkinReply = await invoke('flo-checkin-reply', { ritual: { name: 'QA reading', reminderTime: '08:00' }, reason: 'A work meeting ran late', tone: 'gentle' });
  assert.equal(checkinReply.response.status, 200);
  assert.ok(checkinReply.result.message?.length);
  const report = await invoke('generate-report', { intervalDays: 1, timeZone: 'UTC', force: true });
  assert.equal(report.response.status, 200);
  assert.equal(report.result.totalTasksCreated, 1);
  assert.equal(report.result.completedLate, 1);
  assert.equal(requireData(await stranger.client.from('ai_reports').select('id').eq('user_id', owner.id), 'Cross-user report').length, 0);
  pass('dynamic report and report privacy');
  requireData(await owner.client.from('habit_logs').delete().eq('habit_id', habit.id), 'Unmark ritual');
  requireData(await owner.client.from('habits').delete().eq('id', habit.id), 'Delete ritual');
  assert.equal(requireData(await owner.client.from('habits').select('id').eq('id', habit.id), 'Verify removal').length, 0);
  pass('unmark and delete');
} finally {
  for (const user of users) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      console.error(`QA cleanup failed for ${user.id}: ${error.message}`);
      process.exitCode = 1;
    } else pass('temporary account removed');
  }
}
