import { useStore } from '../../state/store';
import { renderText } from '../../lib/facts';
import { navigate } from '../../lib/router';
import { FactChip } from '../ui';

// Live campaign summary with the Kannada poster preview for locals.
const LiveCampaignCard = () => {
  const { state, approvedFacts } = useStore();
  const poster = state.assets.find((a) => a.id === 'locals-kn-poster');
  const lines = renderText(poster.template, approvedFacts.json, 'kn').split('\n');
  const approved = state.assets.filter((a) => a.status === 'approved').length;
  const facts = approvedFacts.json;

  return (
    <article className="grid overflow-hidden rounded-2xl bg-white text-ink sm:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col justify-between gap-5 p-4 sm:p-5">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium text-good">
            <span className="size-1.5 rounded-full bg-good" />
            Live now
          </p>
          <h3 className="mt-1.5 text-lg font-semibold leading-snug">{state.campaign.name}</h3>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <FactChip value={`${facts.discount_pct}% off`} />
            <FactChip value={`Rs ${facts.price_inr}`} />
          </div>
        </div>
        <dl className="flex gap-6">
          <div>
            <dt className="text-xs text-ink/50">approved</dt>
            <dd className="text-xl font-bold">{approved} of {state.assets.length}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink/50">languages</dt>
            <dd className="text-xl font-bold">3</dd>
          </div>
        </dl>
        <button type="button" onClick={() => navigate('board')} className="btn-dark w-fit">
          Open board
        </button>
      </div>

      {/* Poster preview: real photo plus text stamped by the overlay renderer. */}
      <button
        type="button"
        onClick={() => navigate('asset', poster.id)}
        className="relative flex min-h-56 flex-col justify-end bg-[radial-gradient(circle_at_75%_25%,#f59a4a_0%,#c2541a_45%,#3d2214_100%)] p-4 text-left text-white"
        aria-label="Open Kannada poster for regular locals"
      >
        <span lang="kn" className="text-xl font-bold leading-snug">{lines[0]}</span>
        <span lang="kn" className="mt-1 text-sm text-white/85">{lines[1]}</span>
        <span lang="kn" className="mt-1 text-lg font-semibold">{lines[2]}</span>
        <span className="mt-3 w-fit rounded-full bg-black/30 px-2.5 py-0.5 text-[11px] font-medium">Poster, Kannada, regular locals</span>
      </button>
    </article>
  );
};

export default LiveCampaignCard;
