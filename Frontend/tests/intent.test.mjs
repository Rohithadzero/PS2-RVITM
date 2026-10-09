import test from 'node:test';
import assert from 'node:assert/strict';
import { understand, normalize } from '../src/components/talk/intent.js';

const say = (text, state) => understand(text, state);

test('normalises punctuation, case and spacing', () => {
  assert.equal(normalize('  Open  the CUSTOMERS, please!  '), 'open the customers please');
  assert.equal(normalize('ಹೊಸ ಪ್ರಚಾರ!'), 'ಹೊಸ ಪ್ರಚಾರ');
});

test('home: new campaign, change, navigate, help', () => {
  assert.equal(say('I want to start a new campaign').intent, 'new_campaign');
  assert.equal(say('naya campaign shuru karo').intent, 'new_campaign');
  assert.equal(say('ಹೊಸ ಪ್ರಚಾರ ಶುರು ಮಾಡಿ').intent, 'new_campaign');
  assert.deepEqual(say('change the price to 50 rupees'), { intent: 'change', text: 'change the price to 50 rupees' });
  assert.equal(say('make it Sunday only').intent, 'change');
  assert.deepEqual(say('open customers'), { intent: 'navigate', slug: 'customers' });
  assert.deepEqual(say('take me to the dashboard'), { intent: 'navigate', slug: 'dashboard' });
  assert.deepEqual(say('settings'), { intent: 'navigate', slug: 'settings' });
  assert.deepEqual(say('ग्राहक दिखाओ'), { intent: 'navigate', slug: 'customers' });
  assert.deepEqual(say('show me the insights'), { intent: 'navigate', slug: 'insights' });
  assert.equal(say('what can you do').intent, 'help');
  assert.equal(say('purple monkey dishwasher').intent, 'unknown');
  assert.equal(say('   ').intent, 'empty');
});

test('home: "change settings" style requests prefer the page when asked to open it', () => {
  assert.equal(say('open the settings').slug, 'settings');
  assert.equal(say('update the discount to 30 percent').intent, 'change');
});

test('confirm: only clear yes or no words count', () => {
  for (const y of ['yes', 'Yes please', 'apply it', 'go ahead', 'हाँ', 'ಹೌದು', 'okay']) assert.equal(say(y, 'confirm').intent, 'yes', y);
  for (const n of ['no', 'cancel that', 'discard', 'nahi', 'नहीं', 'ಇಲ್ಲ', "don't"]) assert.equal(say(n, 'confirm').intent, 'no', n);
  assert.equal(say('say that again', 'confirm').intent, 'repeat');
  assert.equal(say('maybe later perhaps', 'confirm').intent, 'unknown');
  assert.equal(say('no, do not apply', 'confirm').intent, 'no'); // a no beats a yes word in the same breath
});

test('interview: only whole-sentence commands are commands, everything else is the answer', () => {
  assert.equal(say('skip', 'interview').intent, 'skip');
  assert.equal(say('skip this one', 'interview').intent, 'skip');
  assert.equal(say('repeat', 'interview').intent, 'repeat');
  assert.equal(say('build the plan', 'interview').intent, 'finish');
  assert.equal(say('Next Level Cafe', 'interview').intent, 'answer');
  assert.equal(say('Help Desk Coffee', 'interview').intent, 'answer');
  assert.equal(say('twenty percent off on filter coffee', 'interview').intent, 'answer');
  assert.equal(say('we sell the new menu', 'interview').intent, 'answer');
  assert.deepEqual(say('open settings', 'interview'), { intent: 'navigate', slug: 'settings' });
  assert.equal(say('open house for students this weekend with free tea', 'interview').intent, 'answer'); // long: an answer
});

import { looksLikeQuestion } from '../src/components/talk/intent.js';
import { pieces } from '../src/components/talk/speechText.js';

test('questions for the assistant are told apart from interview answers', () => {
  for (const q of ['what does that mean?', 'How do I get more customers', 'can you explain the forecast', 'क्या यह सही है', 'why is my reach so low', 'Is it free?']) assert.equal(looksLikeQuestion(q), true, q);
  for (const a of ['What a Cake', 'Brew Bandi Cafe', 'next level cafe', 'twenty percent off', 'Indiranagar Bengaluru', 'Indira Nagar bakery and cafe']) assert.equal(looksLikeQuestion(a), false, a);
});

test('replies are cut into sentence-sized pieces and long ones are shortened at a sentence end', () => {
  assert.deepEqual(pieces('Hello there.'), ['Hello there.']);
  const two = pieces('First sentence is here. Second sentence follows right after it.');
  assert.equal(two.length, 1); // short enough to share a piece
  const long = pieces('A sentence of a fair length that goes on for a while. '.repeat(12));
  assert.ok(long.join(' ').length <= 360 && long.every((p) => p.length <= 200) && long.length >= 2);
  assert.ok(long.join(' ').endsWith('.'));
  assert.deepEqual(pieces(''), []);
});
