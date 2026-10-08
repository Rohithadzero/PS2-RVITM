import { useMemo, useState } from 'react';
import { ArrowRight, CircleMinus, Lightbulb } from 'lucide-react';
import { CardTitle, ChipToggle, Field, BudgetMeter } from '../components/ui';
import { LANGS, CHANNELS, audiences } from '../data/mock';
import { solvePlan, formatDuration } from '../lib/planner';
import { useStore } from '../state/store';
import { navigate } from '../lib/router';

const parseDuration = (text) => {
  const [m, s = '0'] = text.split(':');
  const total = Number(m) * 60 + Number(s);
  return Number.isFinite(total) ? total : 0;
};

// S5: owner picks what she wants; the knapsack shows what fits and why (docs/knapsack-planner.md).
const BudgetPlanner = () => {
  const { dispatch } = useStore();
  const [langs, setLangs] = useState(['en', 'hi', 'kn']);
  const [aud, setAud] = useState(audiences.map((a) => a.id));
  const [channels, setChannels] = useState(['instagram', 'whatsapp', 'poster']);
  const [reels, setReels] = useState(0);
  const [reelSeconds, setReelSeconds] = useState(16);
  const [time, setTime] = useState('3:00');
  const [money, setMoney] = useState(50);
  const [review, setReview] = useState('8:00');

  const wantsReel = channels.includes('reel');
  const limits = { time_s: parseDuration(time), money_inr: Number(money), review_s: parseDuration(review) };

  // Live recompute on every toggle (client estimate; server confirms via POST /planner/solve).
  const plan = useMemo(
    () =>
      solvePlan(
        { langs, audiences: aud, channels: channels.filter((c) => c !== 'reel'), reels: wantsReel ? Math.max(1, reels) : 0, reelSeconds: Number(reelSeconds) },
        limits
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [langs, aud, channels, reels, reelSeconds, time, money, review]
  );

  const nothing = langs.length === 0 || aud.length === 0 || channels.length === 0;

  const confirm = () => {
    dispatch({ type: 'CONFIRM_PLAN', plan: { assets: plan.cost.assets, reels: plan.cost.reels }, why: plan.dropped.map((d) => `Dropped ${d.what}`).join('; ') || 'Everything fits' });
    navigate('generating');
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="card">
        <CardTitle sub="Pick languages, audiences and channels. The plan updates as you go.">What do you want?</CardTitle>
        <div className="flex flex-col gap-5">
          <Field label="Languages">
            <ChipToggle options={LANGS} value={langs} onChange={setLangs} />
          </Field>
          <Field label="Audiences">
            <ChipToggle options={audiences.map((a) => ({ id: a.id, label: a.name }))} value={aud} onChange={setAud} />
          </Field>
          <Field label="Channels">
            <ChipToggle options={CHANNELS} value={channels} onChange={setChannels} />
          </Field>
          {wantsReel && (
            <div className="grid gap-4 rounded-2xl bg-ink/5 p-4 sm:grid-cols-2">
              <Field label="Reels" hint="One reel per audience is typical">
                <input type="number" min={1} max={4} value={Math.max(1, reels)} onChange={(e) => setReels(Number(e.target.value))} className="field" />
              </Field>
              <Field label="Seconds per reel" hint="Clips are 4–12 s; longer reels are stitched">
                <input type="number" min={4} max={36} value={reelSeconds} onChange={(e) => setReelSeconds(e.target.value)} className="field" />
              </Field>
            </div>
          )}
        </div>

        <h3 className="mt-7 font-semibold">Limits</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Field label="Time" hint="Minutes:seconds">
            <input value={time} onChange={(e) => setTime(e.target.value)} className="field" inputMode="numeric" />
          </Field>
          <Field label="Money" hint="Rupees, list price">
            <input type="number" min={0} value={money} onChange={(e) => setMoney(e.target.value)} className="field" />
          </Field>
          <Field label="Review effort" hint="Your time to check">
            <input value={review} onChange={(e) => setReview(e.target.value)} className="field" inputMode="numeric" />
          </Field>
        </div>
      </section>

      <div className="flex flex-col gap-4">
        <section className="card">
          {nothing ? (
            <p className="py-8 text-center text-sm text-ink/55">Pick at least one language, audience and channel to see a plan.</p>
          ) : (
            <>
              <CardTitle sub="Client estimate. The server confirms it with calibrated numbers.">
                Plan: {plan.cost.assets} assets, {plan.cost.reels} reel{plan.cost.reels === 1 ? '' : 's'}
              </CardTitle>
              <dl className="mb-5 grid grid-cols-3 gap-3 text-center">
                {[
                  { label: 'Time', value: formatDuration(plan.cost.time) },
                  { label: 'Money', value: `Rs ${plan.cost.money}` },
                  { label: 'Review', value: formatDuration(plan.cost.review) },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl bg-ink/5 py-2.5">
                    <dd className="text-lg font-bold">{s.value}</dd>
                    <dt className="text-xs text-ink/55">{s.label}</dt>
                  </div>
                ))}
              </dl>
              <BudgetMeter cost={plan.cost} limits={limits} />
              <p className="mt-4 text-xs text-ink/50">
                {plan.cost.textCalls} text calls, {plan.cost.imageCalls} image calls, {plan.cost.clips} video clips. Actual spend on free tiers: Rs 0.
              </p>
            </>
          )}
        </section>

        {!nothing && plan.dropped.length > 0 && (
          <section className="card">
            <CardTitle sub="Cheapest way to get each one back is listed under it.">Dropped</CardTitle>
            <ul className="flex flex-col gap-3">
              {plan.dropped.map((d) => (
                <li key={d.what} className="flex gap-3 text-sm">
                  <CircleMinus size={18} className="mt-0.5 shrink-0 text-bad" />
                  <div>
                    <p className="font-semibold">{d.what}</p>
                    <p className="text-ink/60">{d.why}</p>
                    <p className="text-xs text-ink/50">To get it back: {d.getBack}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!nothing && (
          <section className="card">
            <CardTitle>Alternatives</CardTitle>
            <ul className="flex flex-col gap-2">
              {plan.alternatives.map((a) => (
                <li key={a.label} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-ink/5 px-3 py-2.5 text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <Lightbulb size={15} className="text-accent" /> {a.label}
                  </span>
                  <span className={`text-xs ${a.fits ? 'text-good' : 'text-ink/50'}`}>
                    {formatDuration(a.cost.time)} time, {formatDuration(a.cost.review)} review{a.fits ? ', fits' : ', over a limit'}
                  </span>
                </li>
              ))}
            </ul>
            <button type="button" disabled={nothing || plan.cost.assets === 0} onClick={confirm} className="btn-primary mt-5 w-full">
              Confirm plan <ArrowRight size={16} />
            </button>
          </section>
        )}
      </div>
    </div>
  );
};

export default BudgetPlanner;
