// Fast client-side estimate for the budget planner (docs/knapsack-planner.md).
// The server confirms with calibrated numbers via POST /planner/solve.

const COST = {
  textCallS: 6, // 10 RPM -> one call every 6 s
  imageCallS: 6, // 1K at 10 RPM
  videoClipS: 60, // 1 RPM
  tailS: 20, // generation time after the last queued call
  review: { copy: 20, poster: 30, reel: 45 },
  money: { textCall: 0.02, image: 0.85, videoSecond: 2.1 }, // INR list price, free tier makes actual spend 0
};

const MAX_CLIP_S = 12;

const estimate = ({ langs, audiences, channels, reels, reelSeconds }) => {
  const copyChannels = channels.filter((c) => c === 'instagram' || c === 'whatsapp');
  const hasPoster = channels.includes('poster');
  const pairs = langs.length * audiences.length;
  const copyAssets = pairs * copyChannels.length;
  const posterAssets = hasPoster ? pairs : 0;
  const assets = copyAssets + posterAssets;

  // One batched call per language and audience, plus brief, scoring and validation calls.
  const textCalls = assets ? pairs + Math.ceil(assets / 4) + 2 : 0;
  const imageCalls = hasPoster ? Math.min(2, posterAssets) : 0;
  const clips = reels * Math.ceil(reelSeconds / MAX_CLIP_S);

  const time = assets || clips ? textCalls * COST.textCallS + imageCalls * COST.imageCallS + clips * COST.videoClipS + COST.tailS : 0;
  const money = textCalls * COST.money.textCall + imageCalls * COST.money.image + reels * reelSeconds * COST.money.videoSecond;
  const review = copyAssets * COST.review.copy + posterAssets * COST.review.poster + reels * COST.review.reel;

  return { assets, reels, textCalls, imageCalls, clips, time: Math.round(time), money: Math.round(money * 10) / 10, review };
};

const fits = (cost, limits) => cost.time <= limits.time_s && cost.money <= limits.money_inr && cost.review <= limits.review_s;

// Drops the most expensive items first until the plan fits. Returns the plan, what was dropped and why, and alternatives.
export const solvePlan = (wanted, limits) => {
  const dropped = [];
  let current = { ...wanted };
  let cost = estimate(current);

  if (!fits(cost, limits) && current.reels > 0) {
    const withoutReels = { ...current, reels: 0 };
    const reelCost = estimate(current).time - estimate(withoutReels).time;
    dropped.push({
      what: `${current.reels} × ${current.reelSeconds} s reel`,
      why: `Needs ${formatDuration(reelCost)} of video queue at 1 request per minute`,
      getBack: `Raise the time limit to ${formatDuration(estimate(current).time)} or drop one audience`,
    });
    current = withoutReels;
    cost = estimate(current);
  }

  if (!fits(cost, limits) && current.channels.includes('poster')) {
    const without = { ...current, channels: current.channels.filter((c) => c !== 'poster') };
    dropped.push({
      what: `${current.langs.length * current.audiences.length} posters`,
      why: 'Posters cost the most review time (30 s each)',
      getBack: `Raise review effort to ${formatDuration(estimate(current).review)}`,
    });
    current = without;
    cost = estimate(current);
  }

  while (!fits(cost, limits) && current.langs.length > 1) {
    const lang = current.langs.at(-1);
    dropped.push({ what: `${lang.toUpperCase()} copy`, why: 'Still over a limit after dropping reels and posters', getBack: 'Raise the time or review limit' });
    current = { ...current, langs: current.langs.slice(0, -1) };
    cost = estimate(current);
  }

  const alternatives = [];
  if (wanted.reels === 0) {
    const alt = { ...wanted, audiences: wanted.audiences.slice(0, 1), reels: 2, reelSeconds: 16 };
    alternatives.push({ label: `${estimate(alt).assets} assets + 2 × 16 s reels`, cost: estimate(alt) });
  } else {
    const alt = { ...wanted, audiences: wanted.audiences.slice(0, 1) };
    alternatives.push({ label: `${estimate(alt).assets} assets + ${alt.reels} reel${alt.reels > 1 ? 's' : ''}`, cost: estimate(alt) });
  }
  const oneReel = { ...wanted, reels: 1, reelSeconds: Math.max(4, Math.min(wanted.reelSeconds, 12)) };
  alternatives.push({ label: `${estimate(oneReel).assets} assets + 1 × ${oneReel.reelSeconds} s reel`, cost: estimate(oneReel) });

  return { chosen: current, cost, dropped, alternatives: alternatives.map((a) => ({ ...a, fits: fits(a.cost, limits) })), fits: fits(cost, limits) };
};

export const formatDuration = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
