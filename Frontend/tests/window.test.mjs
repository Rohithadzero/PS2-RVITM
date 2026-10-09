// Run with: npm test (Node 22.6+ strips the TypeScript types itself).
import test from 'node:test';
import assert from 'node:assert/strict';
import { localizedClock, localizedDays, timingLine } from '../src/campaign/lib/window.ts';

const weekend = { days: ['Sat', 'Sun'], start_date: '2030-01-05', end_date: null, time_start: '09:00', time_end: '13:00' };

test('English timing row', () => {
  assert.equal(timingLine(weekend, 'en'), 'Sat, Sun, 9:00 AM - 1:00 PM');
});

test('Kannada and Hindi rows are in their own script and keep Western digits', () => {
  const kn = timingLine(weekend, 'kn');
  const hi = timingLine(weekend, 'hi');
  assert.match(kn, /[ಀ-೿]/);
  assert.match(hi, /[ऀ-ॿ]/);
  assert.doesNotMatch(kn + hi, /[೦-೯०-९]/); // no Kannada or Devanagari digits
  assert.match(kn, /9:00 AM - 1:00 PM/); // the browsers' own Kannada and Hindi data use Latin AM and PM
  assert.match(hi, /9:00 AM - 1:00 PM/);
  assert.ok(!/Sat|Sun/.test(kn + hi), 'the day names are in their own language');
});

test('every day says nothing about days, because it is implied', () => {
  assert.equal(localizedDays(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], 'kn'), '');
  assert.equal(timingLine({ ...weekend, days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] }, 'en'), '9:00 AM - 1:00 PM');
});

test('unparsed times give an empty row so the original wording is kept', () => {
  assert.equal(timingLine({ ...weekend, time_start: null, time_end: null }, 'kn'), '');
  assert.equal(timingLine(null, 'kn'), '');
  assert.equal(timingLine(undefined, 'hi'), '');
});

test('bad clock strings are rejected, not guessed', () => {
  for (const bad of [null, '', '9:00', '25:00', '12:61', 'nine']) assert.equal(localizedClock(bad, 'en'), '');
});

test('unknown language falls back to English, unknown days are ignored', () => {
  assert.equal(localizedClock('15:30', 'xx'), '3:30 PM');
  assert.equal(localizedDays(['Funday'], 'en'), '');
});
