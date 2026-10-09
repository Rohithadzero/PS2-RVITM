import { Plug, Code2 } from 'lucide-react';

// Shown where a teammate's service plugs in. Says exactly what is missing and what the UI expects back.
export const NotConnected = ({ service, owner, children }) => (
  <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-warn/15 px-4 py-3 text-sm text-white ring-1 ring-warn/40" role="status">
    <Plug size={18} className="shrink-0 text-warn" />
    <div className="min-w-0 flex-1">
      <strong>{service} is not connected.</strong> {children}
      {owner && <span className="text-white/60"> Owner: {owner}.</span>}
    </div>
  </div>
);

// The request and response a service must implement, so the UI and the service can be built in parallel.
export const ContractCard = ({ title, request, response }) => (
  <section className="card">
    <h2 className="mb-1 flex items-center gap-2 font-semibold"><Code2 size={16} className="text-accent-deep" /> {title}</h2>
    <p className="mb-3 text-xs text-ink/55">Contract for the service team. The UI already sends and reads exactly this.</p>
    <div className="grid gap-3 lg:grid-cols-2">
      <div>
        <p className="mb-1 text-xs font-medium text-ink/60">Request</p>
        <pre className="overflow-x-auto rounded-xl bg-ink p-3 text-xs leading-relaxed text-white/85">{request}</pre>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-ink/60">Response</p>
        <pre className="overflow-x-auto rounded-xl bg-ink p-3 text-xs leading-relaxed text-white/85">{response}</pre>
      </div>
    </div>
  </section>
);
