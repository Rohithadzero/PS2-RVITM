import { useState } from 'react';
import { ArrowRight, Snowflake, RefreshCw, ChevronDown, Send } from 'lucide-react';
import Mic from '../components/ui/Mic';
import { CardTitle, StatusChip } from '../components/ui';
import { changeExamples, assetName } from '../data/mock';
import { useStore } from '../state/store';
import { navigate } from '../lib/router';

const CLASS_STYLE = {
  fact: 'bg-bad/12 text-bad',
  tone: 'bg-info/12 text-info',
  scope: 'bg-warn/15 text-warn',
};

// Diff Agent stand-in: matches the spoken change to a known example.
// Backend: POST /campaign/change { campaign_id, text } -> { class, diff, blast_radius } (preview only).
const classify = (text) => {
  const key = Object.keys(changeExamples).find((k) => text.toLowerCase().includes(k.split(' ').slice(-2).join(' ')));
  return key ? { ...changeExamples[key], text } : null;
};

const label = assetName;

// Shows which assets a change touches and which stay frozen, with the reason.
const BlastRadiusList = ({ changed, frozen, reason }) => (
  <div className="grid gap-3 md:grid-cols-2">
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><RefreshCw size={14} className="text-warn" /> Will change ({changed.length})</p>
      <ul className="flex flex-col gap-1">
        {changed.map((a) => (
          <li key={a.id} className="rounded-lg bg-warn/10 px-3 py-1.5 text-xs">{label(a)} <span className="text-ink/50">uses {reason}</span></li>
        ))}
      </ul>
    </div>
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Snowflake size={14} className="text-info" /> Stay frozen ({frozen.length})</p>
      <ul className="flex flex-col gap-1">
        {frozen.map((a) => (
          <li key={a.id} className="rounded-lg bg-ink/5 px-3 py-1.5 text-xs">{label(a)} <span className="text-ink/50">no {reason}</span></li>
        ))}
      </ul>
    </div>
  </div>
);

// S10: speak a change, see the blast radius, then apply. Fact changes go through S4 for a new read-back.
const ChangeByVoice = () => {
  const { state, dispatch, approvedFacts } = useStore();
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);
  const [showList, setShowList] = useState(false);

  const analyse = (value) => {
    setText(value);
    setPreview(classify(value));
    setShowList(false);
  };

  const affected = (() => {
    if (!preview) return { changed: [], frozen: [] };
    const hit = (a) =>
      preview.class === 'fact' ? a.facts_used.includes(preview.field) : preview.class === 'tone' ? a.channel !== 'poster' : a.channel === 'poster';
    return { changed: state.assets.filter(hit), frozen: state.assets.filter((a) => !hit(a)) };
  })();

  const apply = () => {
    if (preview.class === 'fact') {
      // New facts draft; the owner approves it on S4 after the read-back, then only these assets regenerate.
      dispatch({ type: 'SAVE_DRAFT_FACTS', facts: { ...approvedFacts.json, days: ['sun'] } });
      navigate('facts');
      return;
    }
    dispatch({
      type: 'MARK_CHANGED',
      ids: affected.changed.map((a) => a.id),
      kind: preview.class,
      action: `${preview.class === 'tone' ? 'Tone' : 'Scope'} change: ${preview.to}`,
      why: `Said "${preview.text}"`,
    });
    navigate('board');
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <section className="flex flex-col items-center gap-5 rounded-3xl bg-black/20 p-6 ring-1 ring-white/10">
        <Mic lang="en" onResult={(t) => analyse(t)} mockText="Make it Sunday only" label="Hold and say a change" />
        <form
          className="flex w-full gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            analyse(text);
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Or type: make it Sunday only"
            className="h-10 min-w-0 flex-1 rounded-full bg-black/30 px-4 text-sm text-white ring-1 ring-white/10 placeholder:text-white/40 focus:outline-none focus:ring-accent"
          />
          <button type="submit" className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-white" aria-label="Check change">
            <Send size={16} />
          </button>
        </form>
        <div className="flex flex-wrap justify-center gap-2">
          {Object.values(changeExamples).map((ex) => (
            <button key={ex.say} type="button" onClick={() => analyse(ex.say)} className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/75 hover:bg-white/15 hover:text-white">
              “{ex.say}”
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        {!text ? (
          <p className="py-10 text-center text-sm text-ink/55">Say or type a change. Nothing changes until you press Apply.</p>
        ) : !preview ? (
          <div className="py-6 text-center">
            <p className="font-semibold">“{text}”</p>
            <p className="mt-1 text-sm text-ink/55">Could not tell what this changes. Try naming a day, the tone, or a channel.</p>
          </div>
        ) : (
          <>
            <CardTitle sub={`“${preview.text}”`}>Change preview</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${CLASS_STYLE[preview.class]}`}>{preview.class[0].toUpperCase() + preview.class.slice(1)} change</span>
              <span className="text-sm">
                <span className="font-medium">{preview.field}:</span> <span className="text-ink/50 line-through">{preview.from}</span> → <span className="font-semibold">{preview.to}</span>
              </span>
            </div>

            <div className="mt-5 rounded-2xl bg-accent-soft p-4">
              <p className="text-2xl font-bold">Changes {affected.changed.length} of {state.assets.length} assets</p>
              <p className="text-sm text-ink/65">{affected.frozen.length} stay frozen and keep their approval.</p>
            </div>

            <button type="button" onClick={() => setShowList((v) => !v)} className="btn-ghost mt-4 h-9" aria-expanded={showList}>
              <ChevronDown size={15} className={showList ? 'rotate-180' : ''} /> {showList ? 'Hide list' : 'See list'}
            </button>
            {showList && <div className="mt-4"><BlastRadiusList changed={affected.changed} frozen={affected.frozen} reason={`{${preview.field}}`} /></div>}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-ink/8 pt-4">
              <p className="flex items-center gap-2 text-xs text-ink/55">
                {preview.class === 'fact' ? <>Fact changes need a new read-back approval first. <StatusChip status="changed" /></> : 'Changed assets regenerate; frozen ones keep their approval.'}
              </p>
              <button type="button" onClick={apply} className="btn-primary">
                {preview.class === 'fact' ? 'Apply and review facts' : 'Apply'} <ArrowRight size={16} />
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
};

export default ChangeByVoice;
