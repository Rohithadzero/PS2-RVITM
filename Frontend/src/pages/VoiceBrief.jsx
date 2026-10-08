import { useState } from 'react';
import { Pencil, Check, Keyboard, MessageCircleQuestion, ArrowRight } from 'lucide-react';
import Mic from '../components/ui/Mic';
import { Tabs, ProviderChip, CardTitle, SourceChip } from '../components/ui';
import { sampleTranscript, LANGS, voiceOptions } from '../data/mock';
import { useStore } from '../state/store';
import { navigate } from '../lib/router';

// Offer-critical tokens: digits, %, number words, weekdays, times, conditions (EN + common KN/HI words).
const CRITICAL = /(\d+%?|%|percent|ಪರ್ಸೆಂಟ್|ಇಪ್ಪತ್ತು|प्रतिशत|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred)\b|\b(?:mon|tues|wednes|thurs|fri|satur|sun)day\b|\bweekend\b|\bmorning\b|\bevening\b|\bdine-in only\b|\bfree\b)/gi;

const IS_CRITICAL = new RegExp(`^${CRITICAL.source}$`, 'i');

const Highlighted = ({ text }) => {
  const parts = text.split(CRITICAL).filter((p) => p !== undefined && p !== '');
  return (
    <p className="text-lg leading-relaxed">
      {parts.map((p, i) =>
        IS_CRITICAL.test(p) ? (
          <mark key={i} className="rounded bg-accent-soft px-1 font-semibold text-ink">{p}</mark>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </p>
  );
};

const BRIEF = [
  { label: 'Intent', value: 'Weekend morning offer on filter coffee' },
  { label: 'Item', value: 'Filter coffee (menu: Rs 60)' },
  { label: 'Discount', value: '20% off' },
  { label: 'Days', value: 'Saturday and Sunday' },
  { label: 'Time', value: '8 to 11 am' },
  { label: 'Terms', value: 'Dine-in only' },
  { label: 'Tone', value: 'Warm, neighbourly (from brand)' },
];

// S3: speak, see the live transcript, fix any word, then let the cleaner and Brief Agent run.
const VoiceBrief = () => {
  const { dispatch } = useStore();
  const [lang, setLang] = useState('KN');
  const [transcript, setTranscript] = useState('');
  const [meta, setMeta] = useState(null);
  const [editing, setEditing] = useState(false);
  const [stage, setStage] = useState('record'); // record | brief
  const [dateAnswer, setDateAnswer] = useState(null);
  const [provider, setProvider] = useState(voiceOptions.stt[2]);

  const langId = LANGS.find((l) => l.short === lang).id;

  const onResult = (text, m) => {
    setTranscript(text);
    setMeta(m);
    setEditing(false);
    setStage('record');
  };

  const confirm = () => {
    // Backend: POST /voice/clean then POST /campaign/:id/brief (docs/api-spec.md).
    setStage('brief');
    dispatch({ type: 'LOG', actor: 'Priya', kind: 'scope', action: 'Recorded voice brief', why: 'New campaign' });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="flex flex-col items-center gap-6 rounded-3xl bg-black/20 p-6 ring-1 ring-white/10">
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <Tabs tabs={['KN', 'EN', 'HI']} active={lang} onChange={setLang} dark />
          <ProviderChip name={meta?.provider ?? provider} latency={meta ? `${meta.latency_ms} ms` : undefined} />
        </div>
        <Mic lang={langId} onResult={onResult} mockText={sampleTranscript.raw} />
        <div className="w-full">
          <label className="flex flex-col gap-1.5 text-xs text-white/55">
            Speech-to-text provider
            <select value={provider} onChange={(e) => setProvider(e.target.value)} className="h-10 rounded-xl bg-black/30 px-3 text-sm text-white ring-1 ring-white/10 focus:outline-none focus:ring-accent">
              {voiceOptions.stt.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <p className="mt-2 text-xs text-white/45">Speech never goes straight into the offer. It becomes text you can correct.</p>
        </div>
      </section>

      <div className="flex flex-col gap-4">
        <section className="card">
          <CardTitle
            sub={transcript ? 'Numbers, days and conditions are highlighted. Check them.' : 'Hold the mic and say your offer, or type it.'}
            action={
              <button type="button" onClick={() => setEditing((v) => !v)} className="btn-ghost h-8 px-3 text-xs">
                {editing ? <Check size={14} /> : transcript ? <Pencil size={14} /> : <Keyboard size={14} />}
                {editing ? 'Done' : transcript ? 'Edit text' : 'Type instead'}
              </button>
            }
          >
            Transcript
          </CardTitle>

          {editing ? (
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={4}
              placeholder="Weekend filter coffee offer, 20 percent off, Saturday Sunday, 8 to 11 morning, dine-in only."
              className="field h-auto py-2.5 text-base"
              autoFocus
            />
          ) : transcript ? (
            <>
              <Highlighted text={transcript} />
              {meta?.provider === 'Demo transcript' && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {sampleTranscript.segments.map((s, i) => (
                    <SourceChip key={i}>
                      {s.lang.toUpperCase()} segment, {Math.round(s.conf * 100)}% sure
                    </SourceChip>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="rounded-xl bg-ink/5 p-4 text-sm text-ink/55">“Weekend filter coffee offer, twenty percent off, Saturday Sunday…”</p>
          )}

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" disabled={!transcript.trim()} onClick={confirm} className="btn-primary">
              <Check size={16} /> Looks right
            </button>
          </div>
        </section>

        {stage === 'brief' && (
          <section className="card">
            <CardTitle sub="Cleaned by the transcript cleaner, structured by the Brief Agent. Nothing is locked yet.">Your brief</CardTitle>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {BRIEF.map((b) => (
                <div key={b.label}>
                  <dt className="text-xs text-ink/50">{b.label}</dt>
                  <dd className="text-sm font-medium">{b.value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 rounded-2xl bg-accent-soft p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <MessageCircleQuestion size={16} className="text-accent" /> Which dates?
              </p>
              <p className="mt-1 text-sm text-ink/70">You said “weekend”. Is this for this Saturday and Sunday, 10 and 11 October?</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => setDateAnswer('yes')} aria-pressed={dateAnswer === 'yes'} className={dateAnswer === 'yes' ? 'btn-dark h-9' : 'btn-ghost h-9 bg-white'}>
                  Yes, 10–11 Oct
                </button>
                <button type="button" onClick={() => setDateAnswer('next')} aria-pressed={dateAnswer === 'next'} className={dateAnswer === 'next' ? 'btn-dark h-9' : 'btn-ghost h-9 bg-white'}>
                  Next weekend, 17–18 Oct
                </button>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button type="button" disabled={!dateAnswer} onClick={() => navigate('facts')} className="btn-primary">
                Lock the facts <ArrowRight size={16} />
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default VoiceBrief;
