import { useState } from 'react';
import { AudioLines, Loader2 } from 'lucide-react';
import { useStore } from '../state/store';
import { navigate } from '../lib/router';

// S0: Google sign-in. Backend: GET /auth/google/login (PKCE), allow-list enforced on the callback.
const Login = () => {
  const { dispatch } = useStore();
  const [state, setState] = useState('idle'); // idle | loading | forbidden | error

  const signIn = () => {
    setState('loading');
    setTimeout(() => {
      dispatch({ type: 'SIGN_IN' });
      navigate('home');
    }, 900);
  };

  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <div className="app-backdrop" aria-hidden="true" />
      <main className="glass-panel w-full max-w-sm rounded-[28px] p-8 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent/15 text-accent">
          <AudioLines size={28} strokeWidth={2.4} />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Tell it once</h1>
        <p className="mt-2 text-sm text-white/60">Your brand and campaigns sync to your phone and laptop.</p>

        <button type="button" onClick={signIn} disabled={state === 'loading'} className="btn mt-8 h-12 w-full bg-white text-ink hover:bg-white/90">
          {state === 'loading' ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
              <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
              <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
              <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" />
              <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
            </svg>
          )}
          Continue with Google
        </button>

        {state === 'forbidden' && <p className="mt-4 text-sm text-bad">This account is not on the allow-list. Ask the team to add it.</p>}
        {state === 'error' && (
          <p className="mt-4 text-sm text-bad">
            Sign-in failed. <button type="button" onClick={signIn} className="underline">Try again</button>
          </p>
        )}
      </main>
    </div>
  );
};

export default Login;
