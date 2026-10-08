import { useState } from 'react';
import { Play, WandSparkles, Info, Loader2, ShieldCheck } from 'lucide-react';
import { CardTitle, Field, ScoreBar, SlotText, Banner } from '../components/ui';
import { personas, optimizeRounds, assetName } from '../data/mock';
import { useStore } from '../state/store';

const assetLabel = assetName;

// S9: blind pairwise comparison with repeats and variance, native-speaker votes, and the optimize loop.
const Compare = () => {
  const { state, approvedFacts, dispatch } = useStore();
  const options = state.assets.filter((a) => a.status !== 'blocked');
  const [aId, setAId] = useState('locals-en-whatsapp');
  const [bId, setBId] = useState('locals-en-instagram');
  const [repeats, setRepeats] = useState(5);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [voter, setVoter] = useState('');
  const [votes, setVotes] = useState([
    { voter: 'Ananya (Kannada)', choice: 'B' },
    { voter: 'Rahul (Hindi)', choice: 'B' },
  ]);
  const [rounds, setRounds] = useState([]);
  const [optimizing, setOptimizing] = useState(false);

  const a = state.assets.find((x) => x.id === aId);
  const b = state.assets.find((x) => x.id === bId);

  // Backend: POST /compare { a_asset_id, b_asset_id, repeats }.
  const run = () => {
    setRunning(true);
    setResult(null);
    setTimeout(() => {
      const wins = Math.round(repeats * 0.72);
      setResult({
        winRateB: wins / repeats,
        ci: [Math.max(0, wins / repeats - 0.2), Math.min(1, wins / repeats + 0.13)],
        repeats,
        swapConsistent: `${repeats - 1} of ${repeats}`,
      });
      setRunning(false);
    }, 900);
  };

  const vote = (choice) => {
    if (!voter.trim()) return;
    setVotes((v) => [...v.filter((x) => x.voter !== voter.trim()), { voter: voter.trim(), choice }]);
  };

  // Backend: POST /campaign/:id/optimize (max 2 rounds, validator inside each round).
  const optimize = () => {
    setOptimizing(true);
    setRounds([]);
    optimizeRounds.forEach((r, i) =>
      setTimeout(() => {
        setRounds((prev) => [...prev, r]);
        if (i === optimizeRounds.length - 1) {
          setOptimizing(false);
          dispatch({ type: 'LOG', actor: 'agent:optimizer', kind: 'edits', action: `Optimizer ran ${optimizeRounds.length} rounds`, why: 'Kept rewrites that passed the validator and won blind runs' });
        }
      }, (i + 1) * 900)
    );
  };

  const tally = votes.reduce((t, v) => ({ ...t, [v.choice]: (t[v.choice] ?? 0) + 1 }), {});

  return (
    <div className="flex flex-col gap-4">
      <Banner tone="info">Pre-launch proxy, not a prediction of real sales. Same model family writes and judges, so results come with repeats, variance and human votes.</Banner>

      <section className="card">
        <CardTitle sub="Labels are hidden from the scorer and positions swap on every run.">Pick two variants</CardTitle>
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_8rem_auto] md:items-end">
          <Field label="Variant A">
            <select value={aId} onChange={(e) => setAId(e.target.value)} className="field">
              {options.map((o) => <option key={o.id} value={o.id}>{assetLabel(o)}</option>)}
            </select>
          </Field>
          <Field label="Variant B">
            <select value={bId} onChange={(e) => setBId(e.target.value)} className="field">
              {options.map((o) => <option key={o.id} value={o.id}>{assetLabel(o)}</option>)}
            </select>
          </Field>
          <Field label="Repeats">
            <input type="number" min={3} max={9} value={repeats} onChange={(e) => setRepeats(Number(e.target.value))} className="field" />
          </Field>
          <button type="button" disabled={aId === bId || running} onClick={run} className="btn-primary">
            {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} Run blind comparison
          </button>
        </div>
        {aId === bId && <p className="mt-2 text-xs text-bad">Pick two different variants.</p>}

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {[{ label: 'A', asset: a }, { label: 'B', asset: b }].map(({ label, asset }) => (
            <div key={label} className="rounded-xl bg-ink/[0.03] p-4">
              <p className="mb-2 text-xs font-semibold text-ink/50">Variant {label}</p>
              <SlotText template={asset.template} facts={approvedFacts.json} lang={asset.lang} className="text-sm" />
            </div>
          ))}
        </div>
      </section>

      {result && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card">
            <CardTitle sub={`Position-swap consistency: ${result.swapConsistent} runs`}>Result</CardTitle>
            <ScoreBar score={{ win_rate: result.winRateB, ci: result.ci, repeats: result.repeats }} label="B wins" />
            <h3 className="mt-5 text-sm font-semibold">Why, per persona</h3>
            <ul className="mt-2 flex flex-col gap-2">
              {personas.map((p) => (
                <li key={p.name} className="flex gap-3 rounded-xl bg-ink/5 p-3 text-sm">
                  <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${p.winner === 'B' ? 'bg-accent text-white' : 'bg-ink text-white'}`}>{p.winner}</span>
                  <span>
                    <span className="block font-medium">{p.name}</span>
                    <span className="text-ink/60">{p.reason}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <CardTitle sub="Team members who read the language vote. Shown beside the model result.">Native-speaker votes</CardTitle>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-40 flex-1">
                <Field label="Your name and language">
                  <input value={voter} onChange={(e) => setVoter(e.target.value)} className="field" placeholder="e.g. Kiran (Kannada)" />
                </Field>
              </div>
              {['A', 'B', 'Tie'].map((c) => (
                <button key={c} type="button" disabled={!voter.trim()} onClick={() => vote(c)} className="btn-ghost">{c}</button>
              ))}
            </div>
            <p className="mt-4 text-sm">
              <span className="font-semibold">A {tally.A ?? 0}</span>, <span className="font-semibold">B {tally.B ?? 0}</span>, tie {tally.Tie ?? 0}
            </p>
            <ul className="mt-2 flex flex-col gap-1 text-sm text-ink/70">
              {votes.map((v) => (
                <li key={v.voter}>{v.voter}: {v.choice}</li>
              ))}
            </ul>
          </section>
        </div>
      )}

      <section className="card">
        <CardTitle
          sub="Rewrites change wording only; facts stay in slots. A rewrite is kept only if it passes the validator and wins."
          action={
            <button type="button" disabled={optimizing} onClick={optimize} className="btn-dark">
              {optimizing ? <Loader2 size={16} className="animate-spin" /> : <WandSparkles size={16} />} Optimize
            </button>
          }
        >
          Optimize loop
        </CardTitle>
        {rounds.length === 0 && !optimizing ? (
          <p className="flex items-center gap-2 text-sm text-ink/55"><Info size={15} /> Runs at most 2 rounds and stops early if nothing improves.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {rounds.map((r) => (
              <li key={r.round} className="grid gap-3 rounded-xl bg-ink/5 p-4 sm:grid-cols-[6rem_1fr_1fr] sm:items-center">
                <span className="font-semibold">Round {r.round}</span>
                <span className="text-sm text-ink/70">
                  {r.rewrites} rewrites, {r.discarded} discarded by the validator
                  <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-good"><ShieldCheck size={13} /> {r.validator}</span>
                </span>
                <ScoreBar score={{ win_rate: r.after, ci: [r.after - 0.14, Math.min(1, r.after + 0.11)], repeats: 5 }} label={`From ${Math.round(r.before * 100)}% to`} />
              </li>
            ))}
            {optimizing && <li className="flex items-center gap-2 text-sm text-ink/55"><Loader2 size={15} className="animate-spin" /> Running round {rounds.length + 1}…</li>}
          </ol>
        )}
      </section>
    </div>
  );
};

export default Compare;
