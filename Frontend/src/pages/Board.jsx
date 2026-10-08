import { useState } from 'react';
import { Star, CheckCheck, RefreshCw } from 'lucide-react';
import { StatusChip, ValidatorBadge, Tabs, ChipToggle, CardTitle } from '../components/ui';
import { audiences, LANGS, CHANNELS, assetName } from '../data/mock';
import { useStore } from '../state/store';
import { renderText } from '../lib/facts';
import { navigate } from '../lib/router';

const STATUS_FILTERS = ['All', 'Pending', 'Approved', 'Changed', 'Blocked'];
const BOARD_CHANNELS = CHANNELS.filter((c) => c.id !== 'reel');

export const issuesOf = (asset, approvedVersion) => (asset.status === 'blocked' ? 1 : 0) + (asset.facts_version !== approvedVersion ? 1 : 0);

const Cell = ({ asset, facts, approvedVersion, dimmed, selected, onSelect }) => {
  const preview = renderText(asset.template, facts, asset.lang).replace(/\n/g, ' / ');
  const selectable = asset.status === 'pending';
  return (
    <div className={`relative flex h-full flex-col gap-2 rounded-xl border p-3 transition-opacity ${dimmed ? 'opacity-30' : ''} ${asset.status === 'blocked' ? 'border-bad/40 bg-bad/5' : 'border-ink/10 bg-white'}`}>
      <div className="flex items-start justify-between gap-2">
        <StatusChip status={asset.status} detail={asset.block_reason ? `"${asset.block_reason.token}" vs lock ${asset.block_reason.expected}` : undefined} />
        {selectable && (
          <input type="checkbox" checked={selected} onChange={() => onSelect(asset.id)} aria-label="Select for bulk approve" className="relative z-10 size-4 accent-[var(--color-accent)]" />
        )}
      </div>
      <button type="button" onClick={() => navigate('asset', asset.id)} className="text-left after:absolute after:inset-0 after:content-['']" aria-label={`Open ${assetName(asset)}`}>
        <p lang={asset.lang} className="line-clamp-2 text-xs text-ink/75">{preview}</p>
      </button>
      {asset.block_reason && <p className="text-[11px] font-medium text-bad">"{asset.block_reason.token}" vs lock {asset.block_reason.expected}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        <ValidatorBadge issues={issuesOf(asset, approvedVersion)} />
        {asset.score && <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-semibold">Win {Math.round(asset.score.win_rate * 100)}%</span>}
        {asset.best_reason && (
          <span title={asset.best_reason} className="inline-flex items-center gap-0.5 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
            <Star size={11} fill="currentColor" /> Best
          </span>
        )}
        {asset.is_fallback && <StatusChip status="fallback" />}
      </div>
    </div>
  );
};

// S7: audience x language rows, channel columns. Bulk approve skips Blocked.
const Board = () => {
  const { state, dispatch, approvedFacts } = useStore();
  const [status, setStatus] = useState('All');
  const [langs, setLangs] = useState(LANGS.map((l) => l.id));
  const [selected, setSelected] = useState([]);
  const facts = approvedFacts.json;
  const approvedVersion = approvedFacts.version;

  const visible = (a) => (status === 'All' || a.status === status.toLowerCase()) && langs.includes(a.lang);
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const pending = state.assets.filter((a) => a.status === 'pending');
  const changed = state.assets.filter((a) => a.status === 'changed');
  const best = state.assets.find((a) => a.best_reason);

  const approveSelected = () => {
    dispatch({ type: 'APPROVE_ASSETS', ids: selected });
    setSelected([]);
  };

  return (
    <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="card min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Tabs tabs={STATUS_FILTERS} active={status} onChange={setStatus} />
          <ChipToggle options={LANGS.map((l) => ({ id: l.id, label: l.short }))} value={langs} onChange={setLangs} />
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button type="button" disabled={!selected.length} onClick={approveSelected} className="btn-dark h-9">
            <CheckCheck size={16} /> Approve {selected.length || ''} selected
          </button>
          <button type="button" disabled={!pending.length} onClick={() => setSelected(pending.map((a) => a.id))} className="btn-ghost h-9">
            Select all pending
          </button>
          <button type="button" disabled={!changed.length} onClick={() => dispatch({ type: 'REGENERATE_ASSETS', ids: changed.map((a) => a.id) })} className="btn-ghost h-9">
            <RefreshCw size={15} /> Regenerate {changed.length} changed
          </button>
          <span className="text-xs text-ink/50">Blocked assets cannot be approved.</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-2 text-sm">
            <thead>
              <tr>
                <th className="w-36 text-left text-xs font-medium text-ink/50" />
                {BOARD_CHANNELS.map((c) => (
                  <th key={c.id} className="text-left text-xs font-semibold text-ink/70">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {audiences.flatMap((aud) =>
                LANGS.map((lang) => (
                  <tr key={`${aud.id}-${lang.id}`}>
                    <th scope="row" className="pr-2 text-left align-top text-xs font-medium">
                      <span className="block font-semibold">{aud.name}</span>
                      <span className="text-ink/50">{lang.label}</span>
                    </th>
                    {BOARD_CHANNELS.map((c) => {
                      const asset = state.assets.find((a) => a.id === `${aud.id}-${lang.id}-${c.id}`);
                      return (
                        <td key={c.id} className="h-px align-top">
                          {asset && <Cell asset={asset} facts={facts} approvedVersion={approvedVersion} dimmed={!visible(asset)} selected={selected.includes(asset.id)} onSelect={toggle} />}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <aside className="flex flex-col gap-4">
        <section className="card">
          <CardTitle>Plan</CardTitle>
          <p className="text-2xl font-bold">{state.assets.length}/{state.plan.assets}</p>
          <p className="text-xs text-ink/55">assets generated, {state.plan.reels} reels</p>
          <p className="mt-3 text-sm">
            <span className="font-semibold">Next:</span> approve {pending.length} pending
            {changed.length ? `, regenerate ${changed.length} changed` : ''}
          </p>
        </section>
        {best && (
          <section className="card">
            <CardTitle>Best variant</CardTitle>
            <button type="button" onClick={() => navigate('asset', best.id)} className="text-left text-sm font-semibold hover:text-accent">
              {assetName(best)}
            </button>
            <p className="mt-1 text-xs text-ink/60">{best.best_reason}</p>
          </section>
        )}
        <section className="card">
          <CardTitle action={<button type="button" onClick={() => navigate('log')} className="text-xs font-medium text-ink/55 hover:text-ink">View all</button>}>Change log</CardTitle>
          <ol className="flex flex-col gap-3">
            {state.events.slice(0, 4).map((e) => (
              <li key={e.id} className="text-xs">
                <p className="font-semibold">{e.action}</p>
                <p className="text-ink/55">{e.ts}, {e.actor}</p>
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  );
};

export default Board;
