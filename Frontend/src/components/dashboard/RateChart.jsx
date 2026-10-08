import { useState } from 'react';
import { textCallsPerMinute } from '../../data/mock';

const CAP = 10; // Agnes free tier: 10 text requests per minute
const Y_MAX = 12;

// Text calls per minute against the rate limit, so the owner sees why the queue waits.
const RateChart = () => {
  const [hover, setHover] = useState(null);
  const data = textCallsPerMinute;
  const total = data.reduce((a, b) => a + b, 0);

  return (
    <article className="card flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">Text calls per minute</h3>
          <p className="text-xs text-ink/55">Last 15 minutes, {total} calls. Agnes free tier allows 10.</p>
        </div>
        <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold">
          {hover === null ? `Now: ${data.at(-1)}` : `${data.length - hover - 1 === 0 ? 'Now' : `${data.length - hover - 1} min ago`}: ${data[hover]}`}
        </span>
      </div>

      <div className="mt-4 flex flex-1 gap-2">
        <div className="relative w-6 text-right text-[11px] text-ink/45" aria-hidden="true">
          {[0, 4, 8, 12].map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - (t / Y_MAX) * 100}%` }}>
              {t}
            </span>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-40 flex-1" role="img" aria-label={`Text calls per minute over the last 15 minutes, peak ${Math.max(...data)}, limit ${CAP}`}>
            {[0, 4, 8, 12].map((t) => (
              <span key={t} className="absolute inset-x-0 border-t border-ink/8" style={{ top: `${100 - (t / Y_MAX) * 100}%` }} />
            ))}
            <span className="absolute inset-x-0 border-t-2 border-dashed border-bad/60" style={{ top: `${100 - (CAP / Y_MAX) * 100}%` }} />
            <span className="absolute right-0 -translate-y-full pb-0.5 text-[11px] font-semibold text-bad" style={{ top: `${100 - (CAP / Y_MAX) * 100}%` }}>
              10 RPM limit
            </span>
            <div className="absolute inset-0 flex items-end gap-[2px]" onPointerLeave={() => setHover(null)}>
              {data.map((v, i) => (
                <div key={i} className="flex h-full flex-1 items-end" onPointerEnter={() => setHover(i)}>
                  <span
                    className={`w-full rounded-t-[4px] transition-colors ${v >= CAP ? 'bg-accent' : 'bg-accent/45'} ${hover === i ? 'ring-2 ring-ink/30' : ''}`}
                    style={{ height: `${(v / Y_MAX) * 100}%` }}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-ink/45" aria-hidden="true">
            <span>15 min ago</span>
            <span>Now</span>
          </div>
        </div>
      </div>
    </article>
  );
};

export default RateChart;
