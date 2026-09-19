import assert from 'node:assert/strict';
import { test } from 'node:test';
import { offlineCoachReply, parseCoachReply, ritualMetrics } from '../src/lib/coach.ts';

const now = new Date(2026, 8, 19, 14);
const ritual = {
  id: 'reading', name: 'Read a book', icon: 'R', doneToday: false, streakDays: 3,
  bestStreakDays: 3, heat: [...Array(27).fill(0), 1, 1, 0], weekly: [0, 0, 0, 0, 1, 1, 0],
  createdAt: new Date(2026, 8, 17, 10).getTime(), reminderTime: '20:30', why: 'Learn new things',
};

test('new rituals are measured against days since creation', () => {
  assert.deepEqual(ritualMetrics(ritual, now), { totalDays: 3, completions: 2, completionRate: 67 });
});
test('untrusted AI actions cannot target unknown rituals or invalid times', () => {
  const response = parseCoachReply({ text: 'Try a later slot', suggestedActions: [
    { type: 'reschedule_reminder', payload: { ritualId: 'other-user', reminderTime: '20:00' } },
    { type: 'reschedule_reminder', payload: { ritualId: 'reading', reminderTime: '25:90' } },
    { type: 'reschedule_reminder', payload: { ritualId: 'reading', reminderTime: '21:15' } },
  ] }, [ritual]);
  assert.equal(response.suggestedActions.length, 1);
  assert.equal(response.suggestedActions[0].payload.reminderTime, '21:15');
});
test('empty or malformed responses are rejected', () => {
  for (const value of [null, [], { text: '' }, { text: {} }]) assert.equal(parseCoachReply(value, []), null);
});
test('model labels and unsupported mutation types are not trusted', () => {
  const response = parseCoachReply({ text: 'A suggestion', suggestedActions: [
    { id: 'x', type: 'suggest_new_ritual', label: 'Already saved!', payload: { name: '  Stretch  ' } },
    { type: 'delete_all_rituals' },
  ] }, []);
  assert.equal(response.suggestedActions.length, 1);
  assert.equal(response.suggestedActions[0].label, 'Add Stretch');
});
test('offline response uses the named ritual even beyond the first twelve', () => {
  const rituals = [...Array.from({ length: 15 }, (_, i) => ({ ...ritual, id: `r${i}`, name: `Habit ${i}` })), ritual];
  const reply = offlineCoachReply('What is the reminder for Read a book?', rituals);
  assert.match(reply.text, /20:30/);
  assert.match(reply.text, /Read a book/);
  assert.equal(reply.source, 'offline');
});
test('incomplete today is not reported as a broken streak', () => {
  assert.match(offlineCoachReply('Help with my streak', [ritual]).text, /does not mean your streak is broken/);
});
test('offline answers remain useful without deployment', () => {
  const reply = offlineCoachReply('What should I do next?', [ritual]);
  assert.equal(reply.source, 'offline');
  assert.doesNotMatch(reply.text, /needs the online coach/);
  assert.match(reply.text, /smallest useful version/i);
});
test('empty accounts can receive a useful starter action', () => {
  assert.equal(offlineCoachReply('How do I start?', []).suggestedActions[0].type, 'suggest_new_ritual');
});
test('recap includes every ritual and does not offer an endless recap loop', () => {
  const reply = offlineCoachReply('Weekly recap', [ritual, { ...ritual, id: 'walk', name: 'Walk', doneToday: true }]);
  assert.match(reply.text, /1\/2 rituals completed today/);
  assert.match(reply.text, /Read a book/);
  assert.match(reply.text, /Walk/);
  assert.equal(reply.suggestedActions, undefined);
});
