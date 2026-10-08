import { createContext, useContext, useMemo, useReducer } from 'react';
import { initialAssets, factsVersions, events as initialEvents, customers as initialCustomers, slotsIn } from '../data/mock';
import { FIELD_TO_SLOT, diffFacts } from '../lib/facts';

// Client-side state for the demo. Each action mirrors an API call in docs/api-spec.md;
// swap the reducer for API calls + SSE updates once the backend is live.

// ASCII, Devanagari and Kannada digits (validator rule V1).
const STRAY_DIGITS = /[0-9०-९೦-೯]+/;

const now = () => new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });

const initialState = {
  signedIn: true,
  campaign: { id: 'c1', name: 'Weekend filter coffee' },
  factsVersions,
  draftFacts: null, // unapproved edit of the latest version
  plan: { confirmed: true, assets: 18, reels: 0 },
  assets: initialAssets,
  events: initialEvents,
  customers: initialCustomers,
  sendLog: [],
  sync: 'connected', // connected | reconnecting | offline
};

const log = (state, actor, kind, action, why, link = null) => ({
  ...state,
  events: [{ id: `e${Date.now()}`, ts: now(), actor, kind, action, why, link }, ...state.events],
});

const reducer = (state, action) => {
  switch (action.type) {
    case 'SIGN_IN':
      return { ...state, signedIn: true };
    case 'SIGN_OUT':
      return { ...state, signedIn: false };

    case 'SAVE_DRAFT_FACTS':
      return { ...state, draftFacts: action.facts };
    case 'DISCARD_DRAFT_FACTS':
      return { ...state, draftFacts: null };

    case 'APPROVE_FACTS': {
      // POST /facts/approve -> new version; assets using changed fields move to Changed.
      const latest = state.factsVersions.at(-1);
      const version = latest.version + 1;
      const changedSlots = diffFacts(latest.json, state.draftFacts).map((d) => FIELD_TO_SLOT[d.field]).filter(Boolean);
      // Untouched assets stay frozen and move to the new version: none of their slots changed.
      const assets = state.assets.map((a) => {
        if (a.facts_used.some((f) => changedSlots.includes(f))) return { ...a, status: 'changed', score: null };
        return a.facts_version === latest.version ? { ...a, facts_version: version } : a;
      });
      const next = {
        ...state,
        factsVersions: [
          ...state.factsVersions,
          { version, approved: true, approved_at: new Date().toISOString(), approval_method: action.method, json: state.draftFacts },
        ],
        draftFacts: null,
        assets,
      };
      const changedCount = assets.filter((a, i) => a.status === 'changed' && state.assets[i].status !== 'changed').length;
      return log(
        log(next, 'Priya', 'facts', `Approved facts v${version}`, action.method === 'readback_played' ? 'Read-back played' : 'Checked on screen'),
        'system', 'facts', `Marked ${changedCount} assets Changed`, `Fields changed: ${changedSlots.join(', ') || 'none'}`
      );
    }

    case 'APPROVE_ASSETS': {
      // POST /asset/:id/approve for each id; blocked or stale assets are refused (409).
      const approvedVersion = state.factsVersions.at(-1).version;
      const ids = new Set(action.ids);
      let count = 0;
      const assets = state.assets.map((a) => {
        if (!ids.has(a.id) || a.status === 'blocked' || a.facts_version !== approvedVersion || a.status === 'approved') return a;
        count += 1;
        return { ...a, status: 'approved' };
      });
      return count ? log({ ...state, assets }, 'Priya', 'edits', `Approved ${count} asset${count > 1 ? 's' : ''}`, 'Reviewed on the board') : state;
    }

    case 'EDIT_ASSET': {
      // PATCH /asset/:id with reason; revalidates (V1 stray digits here, full validator on the server) and writes the decision log.
      const stray = action.template.replace(/\{[a-z_]+\}/g, '').match(STRAY_DIGITS);
      const facts = state.factsVersions.at(-1).json;
      const assets = state.assets.map((a) =>
        a.id === action.id
          ? {
              ...a,
              template: action.template,
              facts_used: slotsIn(action.template),
              status: stray ? 'blocked' : 'pending',
              block_reason: stray ? { token: stray[0], field: 'price_inr', rule: 'V1 Stray digits', expected: `Rs ${facts.price_inr}` } : undefined,
            }
          : a
      );
      return log({ ...state, assets }, 'Priya', 'edits', stray ? 'Edited copy (blocked)' : 'Edited copy', action.reason, action.id);
    }

    case 'MARK_CHANGED': {
      const ids = new Set(action.ids);
      const assets = state.assets.map((a) => (ids.has(a.id) ? { ...a, status: 'changed', score: null } : a));
      return log({ ...state, assets }, 'Priya', action.kind, action.action, action.why);
    }

    case 'REGENERATE_ASSETS': {
      const approvedVersion = state.factsVersions.at(-1).version;
      const ids = new Set(action.ids);
      const assets = state.assets.map((a) =>
        ids.has(a.id) ? { ...a, status: 'pending', facts_version: approvedVersion, block_reason: undefined } : a
      );
      return log({ ...state, assets }, 'system', 'edits', `Regenerated ${ids.size} asset${ids.size > 1 ? 's' : ''}`, `Using facts v${approvedVersion}`);
    }

    case 'CONFIRM_PLAN':
      return log({ ...state, plan: { confirmed: true, ...action.plan } }, 'Priya', 'scope', `Confirmed plan: ${action.plan.assets} assets, ${action.plan.reels} reels`, action.why);

    case 'TOGGLE_OPT_OUT':
      return {
        ...state,
        customers: state.customers.map((c) => (c.id === action.id ? { ...c, opted_out: !c.opted_out } : c)),
      };

    case 'SIMULATE_SEND':
      return log({ ...state, sendLog: [...action.rows, ...state.sendLog] }, 'Priya', 'sends', `Simulated send to ${action.rows.length} customers`, 'No real messages sent');

    case 'LOG':
      return log(state, action.actor, action.kind, action.action, action.why, action.link);

    default:
      return state;
  }
};

const StoreContext = createContext(null);

export const StoreProvider = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const value = useMemo(() => {
    const approvedFacts = state.factsVersions.filter((v) => v.approved).at(-1);
    return { state, dispatch, approvedFacts };
  }, [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
};

export const useStore = () => useContext(StoreContext);
