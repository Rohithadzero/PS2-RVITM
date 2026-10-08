import { useCallback, useEffect, useState } from 'react';
import { ChangeByVoice } from '../campaign/components/change';
import NoCampaign from '../campaign/NoCampaign';
import { getBoard } from '../campaign/lib/api';
import { channelLabel, langName, prettyText } from '../campaign/lib/format';
import { useCurrent } from '../campaign/lib/current';

const TONE = { approved: 'bg-good/12 text-good', blocked: 'bg-bad/12 text-bad' };

// S10: say one change. The server shows exactly which assets it touches before anything is rewritten.
const Change = () => {
  const { id } = useCurrent();
  const [board, setBoard] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    if (!id) return;
    getBoard(id).then((b) => (setBoard(b), setError(''))).catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  if (!id) return <NoCampaign what="change by voice" />;
  const assets = board?.assets ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="cv">
        <p className="muted">Say or type one change, like a new price or date. Nothing changes until you confirm, and only the assets that use that fact are rewritten.</p>
        {error && <p role="alert" className="error-note">{error}</p>}
        <ChangeByVoice campaignId={id} assets={assets} onApplied={(b) => setBoard(b)} />
      </div>
      <section className="card">
        <h2 className="font-semibold">Assets</h2>
        <ul className="mt-3 divide-y divide-ink/10 text-sm">
          {assets.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{langName(a.lang)} {channelLabel(a.channel)} <span className="text-ink/50">for {a.audience}</span></span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[a.status] || 'bg-ink/5 text-ink/70'}`}>
                {prettyText(a.status)}
              </span>
            </li>
          ))}
          {!assets.length && <li className="py-2 text-ink/55">No assets yet.</li>}
        </ul>
      </section>
    </div>
  );
};

export default Change;
