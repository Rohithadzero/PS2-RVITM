// The live map a voice briefing builds. The ElevenLabs agent calls record_fact and revise_fact as the person speaks; these functions turn
// those calls into a list the screen can show. Pure, so the rules (no repeats, corrections reach what hangs off a fact, removal means gone)
// can be tested without a microphone.

export const KINDS = { org: 'Organisations', role: 'Roles', project: 'Projects', skill: 'Skills', judgment: 'What I believe', ambition: 'Ambitions', trait: 'Traits' };

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const text = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
let seq = 1;

const clean = (raw) => ({
  subject: text(raw?.subject, 160),
  relation: text(raw?.relation, 60),
  object: text(raw?.object, 200),
  kind: text(raw?.kind, 20),
  detail: text(raw?.detail, 300),
  quote: text(raw?.quote, 400),
});

// A fact the person just said. The same subject, relation and object again updates the detail instead of adding a second copy.
export function addFact(facts, raw) {
  const f = clean(raw);
  if (!f.relation || !f.object || !KINDS[f.kind]) return facts;
  const at = facts.findIndex((x) => norm(x.subject) === norm(f.subject) && norm(x.relation) === norm(f.relation) && norm(x.object) === norm(f.object));
  if (at >= 0) {
    const next = facts.slice();
    next[at] = { ...next[at], detail: f.detail || next[at].detail, quote: f.quote || next[at].quote, kind: f.kind };
    return next;
  }
  return [...facts, { id: seq++, ...f }];
}

const find = (facts, target) => {
  const t = norm(target);
  if (!t) return null;
  return facts.find((f) => norm(f.object) === t)
    || facts.find((f) => norm(`${f.relation} ${f.object}`) === t)
    || facts.find((f) => norm(`${f.subject} ${f.relation} ${f.object}`) === t)
    || facts.find((f) => t.length > 3 && (norm(f.object).includes(t) || t.includes(norm(f.object)))) // "the Infosys job" finds "Infosys"
    || null;
};

// A correction. With a replacement the object is reworded (and what hangs off it follows); without one the fact is taken off the map, with
// everything that hung off it. A correction that matches nothing changes nothing.
export function reviseFact(facts, raw) {
  const hit = find(facts, raw?.target);
  if (!hit) return facts;
  const replacement = text(raw?.replacement, 200);
  const detail = raw?.detail !== undefined && String(raw.detail).trim() ? text(raw.detail, 300) : null;
  const quote = raw?.quote !== undefined && String(raw.quote).trim() ? text(raw.quote, 400) : null;
  if (!replacement && detail === null) {
    const gone = new Set([norm(hit.object)]);
    return facts.filter((f) => f.id !== hit.id && !gone.has(norm(f.subject)));
  }
  return facts.map((f) => {
    if (f.id === hit.id) return { ...f, object: replacement || f.object, detail: detail ?? f.detail, quote: quote ?? f.quote };
    if (replacement && norm(f.subject) === norm(hit.object)) return { ...f, subject: replacement };
    return f;
  });
}

export const factLine = (f) => {
  const head = f.subject ? `${f.subject} ` : '';
  return `${head}${f.relation} ${f.object}${f.detail ? ` (${f.detail})` : ''}${f.quote ? ` - “${f.quote}”` : ''}`;
};

export const groupByKind = (facts) => Object.keys(KINDS).map((kind) => [kind, facts.filter((f) => f.kind === kind)]).filter(([, list]) => list.length);

export const toPayload = (facts) => facts.map(({ subject, relation, object, kind, detail, quote }) => ({ subject, relation, object, kind, detail, quote }));
