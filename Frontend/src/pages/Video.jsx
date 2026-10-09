import { useEffect, useState } from 'react';
import { Clapperboard, Film } from 'lucide-react';
import { CardTitle, Banner } from '../components/ui';
import { getAssetState, getBoard, mediaUrl } from '../campaign/lib/api';
import { mediaPhase, pickBase } from '../campaign/components/surfaces';
import { useCurrent } from '../campaign/lib/current';
import NoCampaign from '../campaign/NoCampaign';
import { navigate } from '../lib/router';

const PHASE = { none: 'No video yet', pending: 'Making the video', failed: 'The video failed', ready: 'Video ready' };

// S19: your promo reels. The script is written in the campaign; this screen shows each reel and where its video is. Motion is added
// from the campaign card, one reel at a time, because video generation is slow and metered.
const Video = () => {
  const cur = useCurrent();
  const [board, setBoard] = useState(null);
  const [states, setStates] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    if (!cur.id) return undefined;
    let live = true;
    const load = () => Promise.all([getBoard(cur.id), getAssetState(cur.id)])
      .then(([b, s]) => { if (live) { setBoard(b); setStates(s); setError(''); } })
      .catch((e) => live && setError(e.message));
    load();
    const t = setInterval(load, 8000);
    return () => { live = false; clearInterval(t); };
  }, [cur.id]);

  if (!cur.id) return <NoCampaign what="your reels" />;
  const reels = (board?.assets || []).filter((a) => a.channel === 'reel');

  return (
    <div className="flex flex-col gap-4">
      {error && <Banner tone="warn">{error}</Banner>}
      <Banner tone="info">Offer text and prices on a reel are stamped by code from the approved facts, never drawn by the video model. Video is slow and limited to a few clips a minute.</Banner>
      <section className="card">
        <CardTitle sub="One card per reel in this campaign.">Reels</CardTitle>
        {!board && !error && <p className="text-sm text-ink/55" role="status">Loading</p>}
        {board && reels.length === 0 && <p className="text-sm text-ink/60">This campaign has no reel yet. Add the reel channel to the offer facts and write the campaign.</p>}
        <ul className="grid gap-3 md:grid-cols-2">
          {reels.map((a) => {
            const entry = pickBase(states[a.id]);
            const phase = mediaPhase(entry?.kind === 'video' || entry?.url?.match(/\.(mp4|webm)/) ? entry : null);
            const video = (states[a.id]?.media || []).find((m) => /video|reel/.test(m.kind) && m.url) || (phase === 'ready' ? entry : null);
            return (
              <li key={a.id} className="rounded-2xl border border-ink/10 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium"><Film size={16} /> Reel in {a.lang.toUpperCase()}</span>
                  <span className="rounded-full bg-ink/5 px-2.5 py-0.5 text-xs font-medium">{a.status === 'approved' ? 'Approved' : a.status}</span>
                </div>
                {a.content && <p className="mt-2 line-clamp-3 text-sm text-ink/70" lang={a.lang}>{a.content}</p>}
                {video?.url ? <video className="mt-2 w-full rounded-xl" controls src={mediaUrl(video.url)} /> : <p className="mt-2 text-xs text-ink/55">{PHASE[phase]}</p>}
                <button type="button" onClick={() => navigate('campaign')} className="btn-ghost mt-3"><Clapperboard size={15} /> Open in Campaign</button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
};

export default Video;
