import { useState } from 'react';
import { Coffee, CloudRain, UtensilsCrossed, Mic, Sparkles, Rocket } from 'lucide-react';
import StatCards from '../components/dashboard/StatCards';
import RateChart from '../components/dashboard/RateChart';
import LiveCampaignCard from '../components/dashboard/LiveCampaignCard';
import { SectionTitle } from '../components/ui';
import { campaigns } from '../data/mock';
import { useStore } from '../state/store';
import { navigate } from '../lib/router';

const ICONS = { c1: Coffee, c2: CloudRain, c3: UtensilsCrossed };
const STATUS_LABEL = { live: 'Live', planning: 'Planning', draft: 'Draft', facts_pending: 'Facts pending', generating: 'Generating' };

const summary = (counts) => {
  const parts = [
    counts.approved && `${counts.approved} approved`,
    counts.pending && `${counts.pending} pending`,
    counts.changed && `${counts.changed} changed`,
    counts.blocked && `${counts.blocked} blocked`,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'No assets yet';
};

// S2: campaigns with status summary, plus what the live campaign needs.
const Home = () => {
  const { state } = useStore();
  const [selected, setSelected] = useState('c1');

  // Live counts for the active campaign come from the store; others from the list.
  const live = state.assets.reduce((acc, a) => ({ ...acc, [a.status]: (acc[a.status] ?? 0) + 1 }), {});
  const list = campaigns.map((c) => (c.id === state.campaign.id ? { ...c, counts: live } : c));

  return (
    <div className="flex flex-col gap-5">
      <section className="grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => navigate('studio')} className="flex items-center gap-3 rounded-2xl bg-white p-4 text-left text-ink hover:bg-white/90">
          <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent"><Sparkles size={22} /></span>
          <span><span className="block font-semibold">Make something new</span><span className="text-sm text-ink/60">Posts, posters, taglines, a website or a reel.</span></span>
        </button>
        <button type="button" onClick={() => navigate('launch')} className="flex items-center gap-3 rounded-2xl bg-accent p-4 text-left text-white hover:bg-accent/90">
          <span className="grid size-11 place-items-center rounded-xl bg-white/20"><Rocket size={22} /></span>
          <span><span className="block font-semibold">No business yet? Build one</span><span className="text-sm text-white/85">Ideas, a name, a brand and a launch pack.</span></span>
        </button>
      </section>
      <StatCards />
      <div className="grid gap-3 lg:grid-cols-[1fr_1.15fr]">
        <RateChart />
        <LiveCampaignCard />
      </div>

      <section>
        <SectionTitle action={<button type="button" onClick={() => navigate('voice')} className="text-sm text-white/60 hover:text-white">New campaign</button>}>
          Campaigns
        </SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {list.map((c) => {
            const Icon = ICONS[c.id];
            const on = selected === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setSelected(c.id);
                  if (c.id === state.campaign.id) navigate('board');
                }}
                aria-pressed={on}
                className={`flex items-start justify-between gap-3 rounded-2xl p-4 text-left transition-colors ${on ? 'bg-accent text-white' : 'bg-white text-ink hover:bg-white/90'}`}
              >
                <span className="min-w-0">
                  <span className="block font-semibold">{c.name}</span>
                  <span className={`mt-1 block text-xs ${on ? 'text-white/85' : 'text-ink/55'}`}>{summary(c.counts)}</span>
                  <span className={`mt-1 block text-xs ${on ? 'text-white/70' : 'text-ink/45'}`}>{c.last_change}</span>
                  <span className={`mt-3 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${on ? 'bg-white text-accent' : 'bg-ink/5 text-ink/70'}`}>
                    {STATUS_LABEL[c.status]}
                  </span>
                </span>
                <span className={`grid size-12 shrink-0 place-items-center rounded-full ${on ? 'bg-white/20' : 'bg-accent-soft text-accent'}`}>
                  <Icon size={22} />
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => navigate('voice')}
            className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 p-4 text-sm text-white/70 transition-colors hover:border-accent hover:text-white"
          >
            <span className="grid size-12 place-items-center rounded-full bg-accent text-white">
              <Mic size={20} />
            </span>
            Say your next idea
          </button>
        </div>
      </section>
    </div>
  );
};

export default Home;
