import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Brain, Cog, UserRound, Check, Loader2, CircleAlert, SkipForward, ArrowRight, Mic, Square, ChevronDown } from 'lucide-react';
import { createAgentRun, tickAgentRun, listAgentRuns, confirmAgentStep, skipAgentStep } from '../campaign/lib/api';
import { LANGS, FIELD_LABEL } from '../campaign/lib/format';
import { useRecognizer } from '../campaign/lib/speech';
import { go, setCurrent } from '../campaign/lib/current';
import { navigate } from '../lib/router';

const KEY = 'll-agent-run';
const EXAMPLE =
  'I run Brew Bandi Cafe, a cafe in Indiranagar Bengaluru. I want to promote an offer: 20% off filter coffee starting 2030-01-05 on weekend for students and families, in English and Kannada, on WhatsApp and poster. Customers can reach us at https://instagram.com/brewbandi. Keep the tone warm.';

const KIND = {
  ai: { label: 'AI', icon: Brain, cls: 'bg-info/12 text-info' },
  rule: { label: 'Code', icon: Cog, cls: 'bg-ink/8 text-ink/70' },
  human: { label: 'You', icon: UserRound, cls: 'bg-accent-soft text-accent' },
  mixed: { label: 'AI + you', icon: Bot, cls: 'bg-warn/15 text-warn' },
};
const STATE = {
  pending: { label: 'Waiting', ring: 'border-ink/15 bg-white text-ink/45', dot: 'bg-ink/20' },
  running: { label: 'Working', ring: 'border-info bg-white text-ink', dot: 'bg-info' },
  needs_you: { label: 'Needs you', ring: 'border-accent bg-accent-soft/40 text-ink', dot: 'bg-accent' },
  done: { label: 'Done', ring: 'border-good/50 bg-white text-ink', dot: 'bg-good' },
  skipped: { label: 'Skipped', ring: 'border-ink/10 bg-white text-ink/45', dot: 'bg-ink/20' },
  failed: { label: 'Stopped', ring: 'border-bad bg-white text-ink', dot: 'bg-bad' },
};
const StateIcon = ({ s }) =>
  s === 'done' ? <Check size={14} /> : s === 'running' ? <Loader2 size={14} className="animate-spin" /> : s === 'needs_you' ? <UserRound size={14} /> : s === 'failed' ? <CircleAlert size={14} /> : s === 'skipped' ? <SkipForward size={14} /> : <span className="size-2 rounded-full bg-current opacity-40" />;

const Flow = ({ steps }) => (
  <ol className="flex flex-wrap items-center gap-y-2" aria-label="Workflow">
    {steps.map((s, i) => {
      const st = STATE[s.status];
      return (
        <li key={s.id} className="flex items-center">
          <span className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${st.ring}`}>
            <span className={`grid size-5 place-items-center rounded-full text-white ${st.dot}`}><StateIcon s={s.status} /></span>
            {s.title}
          </span>
          {i < steps.length - 1 && <ArrowRight size={14} className="mx-1 text-ink/30" aria-hidden="true" />}
        </li>
      );
    })}
  </ol>
);

const Step = ({ s, runId, onChange, busy }) => {
  const [open, setOpen] = useState(false);
  const st = STATE[s.status];
  const kind = KIND[s.kind];
  const KindIcon = kind.icon;
  const open_ = (a) => {
    if (a.id) setCurrent({ id: a.screen === 'voice' ? undefined : a.id });
    if (a.screen === 'voice') navigate('voice', a.id);
    else if (a.screen === 'planner') navigate('planner');
    else go({ name: a.screen, id: a.id });
  };
  return (
    <li className={`rounded-2xl border p-4 ${st.ring}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full text-white ${st.dot}`}><StateIcon s={s.status} /></span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              {s.title}
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${kind.cls}`}><KindIcon size={11} /> {kind.label}</span>
              <span className="text-[11px] font-medium text-ink/50">{st.label}</span>
            </p>
            {s.detail && <p className="mt-1 text-sm text-ink/70">{s.detail}</p>}
            {s.next_idea && s.status === 'needs_you' && <p className="mt-2 rounded-xl bg-ink/5 px-3 py-2 text-sm text-ink/70">“{s.next_idea}”</p>}
            {s.next_run_id && (
              <button type="button" onClick={() => onChange(() => tickAgentRun(s.next_run_id))} className="mt-2 text-sm font-semibold text-accent hover:underline">Open the drafted campaign</button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {s.gate === 'confirm' && s.status === 'needs_you' && (
            <button type="button" disabled={busy} onClick={() => onChange(() => confirmAgentStep(runId, s.id))} className="btn-primary h-9 px-4 text-sm">{s.id === 'next' ? 'Draft it' : 'Rewrite them'}</button>
          )}
          {s.can_skip && s.status === 'needs_you' && (
            <button type="button" disabled={busy} onClick={() => onChange(() => skipAgentStep(runId, s.id))} className="btn-ghost h-9 px-4 text-sm">Skip</button>
          )}
          {s.action && s.status !== 'pending' && (
            <button type="button" onClick={() => open_(s.action)} className={`${s.status === 'needs_you' && !s.gate ? 'btn-primary' : 'btn-ghost'} h-9 px-4 text-sm`}>
              {s.status === 'needs_you' ? 'Open and do it' : 'Open'} <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="mt-2 flex items-center gap-1 text-xs font-medium text-ink/50 hover:text-ink">
        <ChevronDown size={13} className={open ? 'rotate-180' : ''} /> How this step works ({s.tool})
      </button>
      {open && <p className="mt-1 text-sm text-ink/65">{s.why}</p>}
    </li>
  );
};

const Brief = ({ brief }) => {
  if (!brief) return null;
  const entries = Object.entries(brief.fields).filter(([k]) => !k.startsWith('_'));
  return (
    <section className="card">
      <h2 className="font-semibold">What it took from your words</h2>
      <p className="mt-1 text-xs text-ink/55">Every value is an exact phrase you said. Anything it could not quote was thrown away{brief.dropped.length ? ` (${brief.dropped.map((d) => FIELD_LABEL[d] || d).join(', ')})` : ''}.</p>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        {entries.map(([k, v]) => (
          <div key={k} className="rounded-xl bg-ink/5 px-3 py-2">
            <dt className="text-[11px] font-medium text-ink/50">{FIELD_LABEL[k] || k}</dt>
            <dd className="text-sm font-semibold">“{v}”</dd>
          </div>
        ))}
        {entries.length === 0 && <p className="text-sm text-ink/55">Nothing quotable yet. It will ask you the questions.</p>}
      </dl>
    </section>
  );
};

const Banner = ({ run }) => {
  const m = {
    working: { cls: 'bg-info/12 text-ink', icon: <Loader2 size={16} className="animate-spin text-info" />, text: 'The agent is working. This page updates by itself.' },
    needs_you: { cls: 'bg-accent-soft text-ink', icon: <UserRound size={16} className="text-accent" />, text: run.next ? run.next.message : 'It needs you.' },
    done: { cls: 'bg-good/12 text-ink', icon: <Check size={16} className="text-good" />, text: 'Every step is finished.' },
    failed: { cls: 'bg-bad/12 text-ink', icon: <CircleAlert size={16} className="text-bad" />, text: 'A step stopped. Read it below, fix it, and the agent carries on.' },
  }[run.status];
  return (
    <p role="status" className={`flex items-start gap-2 rounded-2xl px-4 py-3 text-sm font-medium ${m.cls}`}>
      <span className="mt-0.5">{m.icon}</span> {m.text}
    </p>
  );
};

// S20: describe the idea once, watch the workflow the agent builds, and step in only at the gates.
const Agent = () => {
  const [idea, setIdea] = useState('');
  const [lang, setLang] = useState('en');
  const [run, setRun] = useState(null);
  const [runs, setRuns] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);

  const mic = useRecognizer(lang, (text) => setIdea((cur) => `${cur} ${text}`.trim()));

  useEffect(() => {
    alive.current = true;
    listAgentRuns().then((r) => alive.current && setRuns(r.runs)).catch(() => undefined);
    let saved = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {
      // Storage blocked: start with an empty page.
    }
    if (saved) tickAgentRun(saved).then((v) => alive.current && setRun(v)).catch(() => undefined);
    return () => {
      alive.current = false;
    };
  }, []);

  const remember = (v) => {
    try {
      localStorage.setItem(KEY, v.id);
    } catch {
      // ignore
    }
  };

  const act = useCallback(async (fn) => {
    setBusy(true);
    setError('');
    try {
      const result = await fn();
      const v = result.new_run || result; // confirming "next" starts a new run: follow it
      if (alive.current) {
        setRun(v);
        remember(v);
      }
    } catch (e) {
      if (alive.current) setError(e.message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }, []);

  // Keep observing: the agent moves on by itself as soon as the real state allows it.
  useEffect(() => {
    if (!run || run.status === 'done') return undefined;
    const t = setInterval(() => {
      tickAgentRun(run.id).then((v) => alive.current && setRun(v)).catch(() => undefined);
    }, 4000);
    return () => clearInterval(t);
  }, [run?.id, run?.status]);

  const start = () => act(() => createAgentRun(idea.trim(), lang));
  const reset = () => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // ignore
    }
    setRun(null);
    setIdea('');
  };

  return (
    <div className="flex flex-col gap-4">
      {!run && (
        <section className="card">
          <h2 className="font-semibold">Describe your idea</h2>
          <p className="mt-1 text-sm text-ink/60">Say or type it the way you would tell a friend: the business, the offer, who it is for, where to promote it. The agent plans the work, does what it can, and stops to ask you only where it must.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Language you speak">
            {LANGS.map((l) => (
              <button key={l.code} type="button" aria-pressed={lang === l.code} onClick={() => setLang(l.code)} className={lang === l.code ? 'btn-dark h-9 px-4 text-sm' : 'btn-ghost h-9 px-4 text-sm'}>{l.native}</button>
            ))}
          </div>
          <textarea
            value={mic.listening && mic.interim ? `${idea} ${mic.interim}`.trim() : idea}
            onChange={(e) => setIdea(e.target.value)}
            rows={5}
            maxLength={2000}
            aria-label="Your idea"
            placeholder="For example: I run a bakery in Jayanagar. I want to promote 15% off on cakes this weekend for families, in Kannada and English, on WhatsApp."
            className="field mt-3 h-auto py-3"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy || idea.trim().length < 8} onClick={start} className="btn-primary">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Bot size={15} />} Plan the work
            </button>
            {mic.supported && (
              <button type="button" onClick={() => (mic.listening ? mic.stop() : mic.start())} aria-pressed={mic.listening} className="btn-ghost">
                {mic.listening ? <Square size={14} /> : <Mic size={15} />} {mic.listening ? 'Stop' : 'Speak it'}
              </button>
            )}
            <button type="button" onClick={() => setIdea(EXAMPLE)} className="text-sm text-ink/55 underline hover:text-ink">Use an example</button>
          </div>
          {mic.error && <p role="alert" className="mt-2 text-sm text-bad">{mic.error}</p>}
          {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
          {runs.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-medium text-ink/50">Earlier runs</p>
              <ul className="mt-1 flex flex-col gap-1">
                {runs.slice(0, 4).map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => act(() => tickAgentRun(r.id))} className="w-full truncate rounded-lg bg-ink/5 px-3 py-2 text-left text-sm hover:bg-ink/10">{r.idea}</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {run && (
        <>
          <Banner run={run} />
          <section className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-semibold">The workflow</h2>
                <p className="mt-1 max-w-2xl text-sm text-ink/60">“{run.idea}”</p>
              </div>
              <button type="button" onClick={reset} className="btn-ghost h-9 px-4 text-sm">New idea</button>
            </div>
            <div className="mt-4"><Flow steps={run.steps} /></div>
            <p className="mt-3 text-xs text-ink/50">Blue steps run on their own. Orange steps wait for you. The agent never locks facts, approves assets or sends anything for you.</p>
          </section>
          {error && <p role="alert" className="text-sm text-bad">{error}</p>}
          <ol className="flex flex-col gap-2">
            {run.steps.map((s) => (
              <Step key={s.id} s={s} runId={run.id} busy={busy} onChange={act} />
            ))}
          </ol>
          <Brief brief={run.brief} />
        </>
      )}
    </div>
  );
};

export default Agent;
