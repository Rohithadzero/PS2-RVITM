import { useState } from 'react';
import { Check, Loader2, Mic, Square, Trash2, Volume2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { CardTitle } from '../ui';
import { LANGS } from '../../campaign/lib/format';
import { api } from '../../campaign/lib/api';
import { KINDS, groupByKind, toPayload } from './facts';
import { useBriefing } from './useBriefing';

const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// "Tell GrowIt your story": a ten-minute voice conversation with the briefing agent. A live map of what you say builds as you talk; you
// press Save to keep it in Memory, or Discard. The agent only listens and asks: it gives no advice.
const BriefingCard = ({ onSaved }) => {
  const b = useBriefing();
  const [lang, setLang] = useState('en');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');
  const live = b.status === 'live';

  const save = async () => {
    setSaving(true);
    setProblem('');
    try {
      const r = await api('/memory/briefing', { method: 'POST', body: JSON.stringify({ facts: toPayload(b.facts) }) });
      setNote(`Saved ${r.saved} thing${r.saved === 1 ? '' : 's'} to Memory, in ${r.notes} note${r.notes === 1 ? '' : 's'}.`);
      b.reset();
      onSaved?.();
    } catch (e) {
      setProblem(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card" aria-label="Voice briefing">
      <CardTitle sub="A ten-minute voice chat with Agnez, GrowIt's briefing agent. She asks one question at a time and builds a live map of what you say. Nothing is kept until you press Save. Your voice goes to ElevenLabs." action={
        b.status === 'idle' || b.status === 'error' ? (
          <div className="flex flex-wrap items-center gap-2">
            <select className="field h-9 w-auto" value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Briefing language">
              {LANGS.map((l) => <option key={l.code} value={l.code}>{l.native}</option>)}
            </select>
            <button type="button" className="btn-primary" disabled={!b.availability?.available} onClick={() => b.start(lang)}><Mic size={15} /> Start a briefing</button>
          </div>
        ) : live ? (
          <button type="button" className="btn-ghost" onClick={b.end}><Square size={14} /> End briefing</button>
        ) : null
      }>Tell GrowIt your story</CardTitle>

      {b.availability && !b.availability.available && b.status === 'idle' && (
        <p className="text-sm text-ink/60">The live agent is not set up on this server. Add the ElevenLabs key and agent id to the server's .env and switch ElevenLabs on in Settings.</p>
      )}
      {b.status === 'connecting' && <p role="status" className="flex items-center gap-2 text-sm text-ink/70"><Loader2 size={15} className="animate-spin" /> Connecting. Allow the microphone if the browser asks.</p>}
      {b.error && <p role="alert" className="mt-2 text-sm font-medium text-bad">{b.error}</p>}
      {note && <p role="status" className="mt-2 text-sm text-good">{note}</p>}

      {live && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-ink/5 px-4 py-3">
          <motion.span
            aria-hidden="true"
            className="grid size-9 place-items-center rounded-full bg-accent text-on-accent"
            animate={{ scale: b.paused ? 1 : [1, 1.12, 1] }}
            transition={{ duration: 1.3, repeat: Infinity }}
          >
            {b.mode === 'speaking' ? <Volume2 size={16} /> : <Mic size={16} />}
          </motion.span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium" role="status">{b.paused ? 'Paused. Take your time.' : b.mode === 'speaking' ? 'Agnez is speaking' : 'Listening'}</p>
            <p className="truncate text-xs text-ink/60">{b.lines.length ? `${b.lines[b.lines.length - 1].who === 'you' ? 'You: ' : 'Agnez: '}${b.lines[b.lines.length - 1].text}` : 'She will start in a moment.'}</p>
          </div>
          <span className="tabular-nums text-sm font-semibold text-ink/70" aria-label="Time left">{clock(b.left)}</span>
        </div>
      )}

      {b.facts.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {groupByKind(b.facts).map(([kind, list]) => (
            <div key={kind}>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink/55">{KINDS[kind]}</h3>
              <ul className="flex flex-col gap-1.5">
                {list.map((f) => (
                  <motion.li key={f.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="group rounded-xl border border-ink/10 bg-white/60 px-3 py-2 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p>
                        {f.subject && <span className="text-ink/50">{f.subject} </span>}
                        <span className="text-ink/60">{f.relation} </span><strong>{f.object}</strong>
                        {f.detail && <span className="text-ink/60"> ({f.detail})</span>}
                      </p>
                      {b.status === 'done' && <button type="button" aria-label={`Remove ${f.object}`} onClick={() => b.remove(f.id)} className="shrink-0 text-ink/40 hover:text-bad"><Trash2 size={13} /></button>}
                    </div>
                    {f.quote && <p className="mt-0.5 text-xs italic text-ink/55">&ldquo;{f.quote}&rdquo;</p>}
                  </motion.li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {b.status === 'done' && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-ink/10 pt-4">
          {b.facts.length ? (
            <>
              <button type="button" className="btn-primary" onClick={save} disabled={saving}>{saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save {b.facts.length} to Memory</button>
              <button type="button" className="btn-ghost" onClick={b.reset} disabled={saving}>Discard</button>
              <span className="text-xs text-ink/55">Remove anything that is not right first. You can edit the notes afterwards.</span>
            </>
          ) : (
            <>
              <p className="text-sm text-ink/60">The briefing ended without anything to save.</p>
              <button type="button" className="btn-ghost" onClick={b.reset}>Start over</button>
            </>
          )}
        </div>
      )}
      {problem && <p role="alert" className="mt-2 text-sm font-medium text-bad">{problem}</p>}
    </section>
  );
};

export default BriefingCard;
