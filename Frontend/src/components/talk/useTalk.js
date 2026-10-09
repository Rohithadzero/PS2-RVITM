import { useCallback, useEffect, useRef, useState } from 'react';
import { answerQuestion, applyChange, finishInterview, getBoard, getSession, proposeChange, startInterview, editAnswer } from '../../campaign/lib/api';
import { channelLabel, langName, prettyText } from '../../campaign/lib/format';
import { go, useCurrent } from '../../campaign/lib/current';
import { useVoiceInput } from '../../campaign/lib/voice';
import { navigate } from '../../lib/router';
import { understand } from './intent';
import { getStrings } from './strings';
import { useTalkVoice } from './voiceIO';

// One conversation for everything spoken in the app: starting a campaign, changing one, opening a screen. GrowIT says every line out
// loud (when the voice is on) and, in hands-free mode, starts listening again as soon as it has finished, so it works like a
// phone call. Tapping the orb while it speaks interrupts it. Nothing is changed without a spoken or tapped yes.

const INTENT_KEY = 'talk-intent'; // set by buttons elsewhere ("Tell me what to change") before they open Talk
const LOCALISED = ['en', 'hi', 'kn']; // the interview asks in these; other languages are asked in English

const readBool = (key, fallback) => { try { const v = localStorage.getItem(key); return v === null ? fallback : v === '1'; } catch { return fallback; } };
const writeBool = (key, v) => { try { localStorage.setItem(key, v ? '1' : '0'); } catch { /* storage blocked: holds for this visit */ } };
const readLang = () => { try { return localStorage.getItem('talk-lang') || 'en'; } catch { return 'en'; } };

let nextId = 1;
const msg = (role, text, extra = {}) => ({ id: nextId++, role, text, ...extra });
const hasDetail = (text) => /\d/.test(text) || text.trim().split(/\s+/).length >= 4;

export function useTalk({ sessionId, user }) {
  const cur = useCurrent();
  const [lang, setLangState] = useState(readLang);
  const [handsFree, setHandsFreeState] = useState(() => readBool('talk-handsfree', true));
  const [voiceOn, setVoiceOnState] = useState(() => readBool('talk-voice', true));
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [messages, setMessages] = useState([]);
  const [session, setSession] = useState(null);
  const [proposal, setProposal] = useState(null);
  const [assets, setAssets] = useState([]);
  const [mode, setMode] = useState('home'); // home | interview | change | confirm
  const [busy, setBusy] = useState(false);
  const [lastHeard, setLastHeard] = useState('');
  const voice = useTalkVoice();

  // The conversation outlives renders, so everything async reads the latest values from here.
  const live = useRef({});
  live.current = { lang, handsFree, voiceOn, mode, session, proposal, cur, started };
  const silent = useRef(0);
  const asked = useRef('');
  const owned = useRef(''); // the session this conversation started itself, so the address change does not re-open it
  const micRef = useRef(null);

  const push = useCallback((m) => setMessages((all) => [...all, m]), []);
  const effLang = () => (live.current.session?.lang || live.current.lang);

  const listenSoon = useCallback(() => {
    const { handsFree: hf } = live.current;
    const mic = micRef.current;
    if (hf && mic?.supported && !mic.listening) setTimeout(() => { if (!micRef.current?.listening) micRef.current?.start(); }, 250);
  }, []);

  // Say a line: show it, speak it, then (hands-free) listen. `spoken` is the language the line is in.
  const say = useCallback(async (text, { spoken, listen = true, extra } = {}) => {
    push(msg('ai', text, extra));
    if (live.current.voiceOn) {
      const ok = await voice.speak(text, spoken || effLang());
      if (ok === false) return false; // cut off: the person took over, so do not start listening for them
    }
    if (listen) listenSoon();
    return true;
  }, [push, voice, listenSoon]);

  const strings = () => getStrings(live.current.lang);
  const sayT = useCallback((key, ...args) => {
    const { t, lang: l } = getStrings(live.current.lang);
    const v = t[key];
    return say(typeof v === 'function' ? v(...args) : v, { spoken: l });
  }, [say]);

  // ---------------- interview
  const ask = useCallback(async (s, resumed = false) => {
    const q = s.question;
    setSession(s);
    if (!q || s.status === 'complete') {
      setMode('interview');
      asked.current = 'done';
      await say(getStrings(s.lang).t.allAnswered, { spoken: getStrings(s.lang).lang, extra: { kind: 'done' } });
      return;
    }
    setMode('interview');
    const key = `${q.id}|${s.clarify?.reason ?? ''}`;
    if (asked.current === key && !resumed) return;
    asked.current = key;
    const { t } = getStrings(s.lang);
    const options = q.options?.length ? q.options.map((o) => o.label) : [];
    let text = `${s.clarify ? `${s.clarify.reason} ` : ''}${q.prompt}`;
    if (options.length) text += ` ${t.optionsRead(options.join(', '))}`;
    await say(text, { spoken: LOCALISED.includes(s.lang) ? s.lang : 'en', extra: { kind: 'question' } });
  }, [say]);

  const startNew = useCallback(async () => {
    setBusy(true);
    try {
      const l = live.current.lang;
      await say(getStrings(l).t.newStart, { spoken: getStrings(l).lang, listen: false });
      const s = await startInterview(l);
      owned.current = s.id;
      window.history.replaceState(null, '', `#/voice/${encodeURIComponent(s.id)}`); // a refresh resumes this session; no remount, so the conversation stays on screen
      asked.current = '';
      await ask(await getSession(s.id));
    } catch (e) {
      await say(getStrings(live.current.lang).t.error(e.message), { spoken: 'en', listen: false });
    } finally {
      setBusy(false);
    }
  }, [say, ask]);

  const sendAnswer = useCallback(async (body, echo) => {
    const s = live.current.session;
    if (!s || busy) return;
    if (echo) push(msg('user', echo, { source: body.source }));
    setBusy(true);
    try {
      await ask(await answerQuestion(s.id, body));
    } catch (e) {
      await say(getStrings(s.lang).t.error(e.message), { spoken: 'en', listen: false });
    } finally {
      setBusy(false);
    }
  }, [ask, say, push, busy]);

  const editHeard = useCallback(async (aid, body) => {
    const s = live.current.session;
    if (!s) return;
    setBusy(true);
    try { setSession(await editAnswer(s.id, aid, body)); } catch (e) { push(msg('system', e.message)); } finally { setBusy(false); }
  }, [push]);

  const buildPlan = useCallback(async () => {
    const s = live.current.session;
    if (!s) return;
    setBusy(true);
    await say(getStrings(s.lang).t.building, { spoken: getStrings(s.lang).lang, listen: false });
    try {
      const { campaign_id } = await finishInterview(s.id);
      go({ name: 'plan', id: campaign_id });
    } catch (e) {
      await say(getStrings(s.lang).t.error(e.message), { spoken: 'en', listen: false });
      setBusy(false);
    }
  }, [say]);

  // ---------------- changes
  const loadAssets = useCallback(async () => {
    const id = live.current.cur?.id;
    if (!id) return [];
    try { const b = await getBoard(id); setAssets(b.assets); return b.assets; } catch { return []; }
  }, []);

  const beginChange = useCallback(async () => {
    if (!live.current.cur?.id) { await sayT('noCampaign'); return; }
    setMode('change');
    await loadAssets();
    await sayT('changeIntro');
  }, [sayT, loadAssets]);

  const proposeFor = useCallback(async (text) => {
    const id = live.current.cur?.id;
    if (!id) { await sayT('noCampaign'); setMode('home'); return; }
    setBusy(true);
    try {
      const [p, list] = await Promise.all([proposeChange(id, text.trim()), loadAssets()]);
      const { t, lang: l } = getStrings(live.current.lang);
      setProposal(p);
      if (!p.grounded) {
        setMode('change');
        await say(t.notGrounded, { spoken: l, extra: { kind: 'proposal' } });
        return;
      }
      setMode('confirm');
      const byId = new Map(list.map((a) => [a.id, a]));
      const names = p.affected_asset_ids.slice(0, 3).map((aid) => (byId.get(aid) ? `${channelLabel(byId.get(aid).channel)} ${langName(byId.get(aid).lang)}` : '')).filter(Boolean).join(', ');
      await say(t.proposal(prettyText(p.summary), p.affected_asset_ids.length, names), { spoken: l, extra: { kind: 'proposal' } });
    } catch (e) {
      setMode('change');
      await say(e.code === 'not_understood' ? getStrings(live.current.lang).t.notUnderstood : getStrings(live.current.lang).t.error(e.message), { spoken: getStrings(live.current.lang).lang });
    } finally {
      setBusy(false);
    }
  }, [say, sayT, loadAssets]);

  const applyNow = useCallback(async () => {
    const p = live.current.proposal;
    const id = live.current.cur?.id;
    if (!p || !id || !p.grounded) return;
    setBusy(true);
    try {
      await applyChange(id, p.proposal_id);
      setProposal(null);
      setMode('home');
      await sayT('applied', p.affected_asset_ids.length);
    } catch (e) {
      const { t, lang: l } = getStrings(live.current.lang);
      await say(e.code === 'already_applied' ? 'That change was already applied.' : t.error(e.message), { spoken: e.code === 'already_applied' ? 'en' : l });
      setProposal(null);
      setMode('home');
    } finally {
      setBusy(false);
    }
  }, [say, sayT]);

  const discard = useCallback(async () => {
    setProposal(null);
    setMode('home');
    await sayT('discarded');
  }, [sayT]);

  // ---------------- what was heard (voice or typed)
  const onHeard = useCallback(async (text, source = 'voice') => {
    silent.current = 0;
    setPaused(false);
    setLastHeard(text);
    const { mode: m, session: s } = live.current;
    push(msg('user', text, { source }));
    voice.stop();

    if (m === 'change') {
      const word = understand(text, 'confirm').intent;
      if (word === 'no') { setMode('home'); await sayT('discarded'); return; }
      await proposeFor(text);
      return;
    }
    const u = understand(text, m === 'confirm' ? 'confirm' : m === 'interview' ? 'interview' : 'home');
    switch (u.intent) {
      case 'yes': return applyNow();
      case 'no': return discard();
      case 'repeat': {
        const lastAi = [...live.current.history].reverse().find((x) => x.role === 'ai');
        if (lastAi) await say(lastAi.text, { spoken: effLang(), extra: { replay: true } });
        return;
      }
      case 'help': return sayT('help');
      case 'new_campaign': return startNew();
      case 'navigate': {
        navigate(u.slug); // straight away: the screen changing is the confirmation, and waiting for a voice would make it feel slow
        return;
      }
      case 'change': {
        if (hasDetail(u.text)) return proposeFor(u.text);
        return beginChange();
      }
      case 'finish': return s ? buildPlan() : sayT('unknown');
      case 'skip': {
        if (s?.question && !s.question.required) return sendAnswer({ choices: ['skip'], source: 'tap' });
        return sayT('skipNotAllowed');
      }
      case 'answer': return s ? sendAnswer({ text, source }) : undefined;
      case 'empty': return undefined;
      default:
        if (m === 'confirm') return sayT('confirmHint');
        return sayT('unknown');
    }
  }, [push, voice, say, sayT, startNew, proposeFor, applyNow, discard, beginChange, buildPlan, sendAnswer]);

  // kept for "repeat that"
  live.current.history = messages;

  const mic = useVoiceInput(lang, (text) => onHeard(text, 'voice'));
  micRef.current = mic;

  // Hands-free: if nothing was heard, try once more, then wait quietly instead of looping.
  useEffect(() => {
    if (!mic.error || !live.current.handsFree || !live.current.started) return;
    if (/blocked|No microphone|Could not start/i.test(mic.error)) { setPaused(true); return; }
    silent.current += 1;
    if (silent.current >= 2) {
      silent.current = 0;
      setPaused(true);
      push(msg('system', getStrings(live.current.lang).t.noSpeech));
    } else {
      const t = setTimeout(() => micRef.current?.start(), 700);
      return () => clearTimeout(t);
    }
  }, [mic.error, push]);

  // ---------------- starting and stopping
  const begin = useCallback(async () => {
    setStarted(true);
    live.current.started = true;
    const { t, lang: l } = getStrings(live.current.lang);
    const first = user?.name?.split(' ')[0];
    await say(t.greet(first), { spoken: l });
  }, [say, user]);

  // Arriving with a session in the address (from Home, or a refresh): pick the conversation up where it was.
  useEffect(() => {
    if (!sessionId || owned.current === sessionId) return undefined;
    let liveFlag = true;
    getSession(sessionId).then(async (s) => {
      if (!liveFlag) return;
      setStarted(true);
      live.current.started = true;
      live.current.session = s;
      setLangState(s.lang);
      await ask(s, true);
    }).catch((e) => liveFlag && push(msg('system', e.message)));
    return () => { liveFlag = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Arriving from a button that already knows what it wants.
  useEffect(() => {
    if (sessionId) return;
    let want = null;
    try { want = sessionStorage.getItem(INTENT_KEY); sessionStorage.removeItem(INTENT_KEY); } catch { /* storage blocked */ }
    if (!want) return;
    setStarted(true);
    live.current.started = true;
    if (want === 'change') beginChange();
    else begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => { voice.stop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const orb = useCallback(() => {
    if (!live.current.started) { begin(); return; }
    if (voice.speaking) { voice.stop(); mic.start(); return; }
    if (mic.listening) { mic.stop(); return; }
    silent.current = 0;
    setPaused(false);
    mic.start();
  }, [begin, voice, mic]);

  const setLang = (l) => { setLangState(l); try { localStorage.setItem('talk-lang', l); } catch { /* ignore */ } };
  const setHandsFree = (v) => { setHandsFreeState(v); writeBool('talk-handsfree', v); if (!v) setPaused(false); };
  const setVoiceOn = (v) => { setVoiceOnState(v); writeBool('talk-voice', v); if (!v) voice.stop(); };

  const phase = voice.speaking || voice.preparing ? 'speaking' : mic.listening ? 'listening' : mic.transcribing || busy ? 'thinking' : 'idle';

  return {
    lang, setLang, handsFree, setHandsFree, voiceOn, setVoiceOn, started, paused, messages, session, proposal, assets, mode, busy, phase, lastHeard,
    mic, voice, orb, onHeard, sendAnswer, editHeard, buildPlan, applyNow, discard, beginChange, startNew,
    replay: (text) => say(text, { spoken: effLang(), listen: false }),
    strings, hasCampaign: Boolean(cur.id),
  };
}

// Used by buttons elsewhere: open Talk already set to do one thing.
export const openTalk = (intent) => {
  try { sessionStorage.setItem(INTENT_KEY, intent); } catch { /* storage blocked: Talk opens on its normal start */ }
  navigate('voice');
};
