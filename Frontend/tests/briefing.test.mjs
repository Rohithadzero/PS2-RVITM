import test from 'node:test';
import assert from 'node:assert/strict';
import { addFact, reviseFact, factLine, groupByKind, toPayload } from '../src/components/briefing/facts.js';

const f = (o = {}) => ({ relation: 'founded', object: 'Brew Bandi', kind: 'org', ...o });

test('a recorded fact appears once, and the same fact again only updates its detail', () => {
  let facts = addFact([], f({ detail: 'in 2019' }));
  facts = addFact(facts, f({ detail: 'in a garage', quote: 'I started it in a garage' }));
  assert.equal(facts.length, 1);
  assert.equal(facts[0].detail, 'in a garage');
  assert.equal(facts[0].quote, 'I started it in a garage');
});

test('facts that are incomplete or of an unknown kind are ignored', () => {
  assert.equal(addFact([], f({ object: '' })).length, 0);
  assert.equal(addFact([], f({ relation: '  ' })).length, 0);
  assert.equal(addFact([], f({ kind: 'secret' })).length, 0);
});

test('a correction rewords the object and what hangs off it follows', () => {
  let facts = addFact([], f({ object: 'Brew Bandy' }));
  facts = addFact(facts, { subject: 'Brew Bandy', relation: 'built', object: 'a loyalty card', kind: 'project' });
  facts = reviseFact(facts, { target: 'Brew Bandy', replacement: 'Brew Bandi' });
  assert.equal(facts[0].object, 'Brew Bandi');
  assert.equal(facts[1].subject, 'Brew Bandi');
});

test('removing a fact takes what hung off it too, and a correction that matches nothing changes nothing', () => {
  let facts = addFact([], f({ object: 'Infosys', relation: 'worked at' }));
  facts = addFact(facts, { subject: 'Infosys', relation: 'led', object: 'a team of ten', kind: 'role' });
  facts = addFact(facts, { relation: 'is good at', object: 'roasting', kind: 'skill' });
  const same = reviseFact(facts, { target: 'Wipro', replacement: '' });
  assert.deepEqual(same, facts);
  const after = reviseFact(facts, { target: 'Infosys', replacement: '' });
  assert.deepEqual(after.map((x) => x.object), ['roasting']);
});

test('a detail can be corrected without changing the object, and the target can be named loosely', () => {
  let facts = addFact([], f({ object: 'Infosys', relation: 'worked at', detail: '3 years' }));
  facts = reviseFact(facts, { target: 'the Infosys job', detail: '5 years' });
  assert.equal(facts[0].detail, '5 years');
  assert.equal(facts[0].object, 'Infosys');
});

test('lines, groups and the payload for saving', () => {
  const facts = addFact(addFact([], f({ detail: 'in 2019', quote: 'my own words' })), { relation: 'wants', object: 'a second shop', kind: 'ambition' });
  assert.equal(factLine(facts[0]), 'founded Brew Bandi (in 2019) - “my own words”');
  assert.deepEqual(groupByKind(facts).map(([k, l]) => [k, l.length]), [['org', 1], ['ambition', 1]]);
  assert.deepEqual(Object.keys(toPayload(facts)[0]).sort(), ['detail', 'kind', 'object', 'quote', 'relation', 'subject']);
});
