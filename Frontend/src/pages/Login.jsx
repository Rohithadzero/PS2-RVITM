import Backdrop from '../components/Backdrop.jsx';
import { Loader2 } from 'lucide-react';
import Logo from '../components/Logo';
import { loginUrl, useAuth } from '../lib/auth';
import { navigate } from '../lib/router';

const REASONS = {
  denied: 'You cancelled the Google sign-in. Try again when you are ready.',
  forbidden: 'That Google account is not on the allow-list. Ask the team to add it, or use another account.',
  unverified: 'Google says that email address is not verified. Verify it with Google, then try again.',
  failed: 'Sign-in did not complete. Please try again.',
};

const GoogleMark = () => (
  <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
    <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
    <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
    <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" />
    <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
  </svg>
);

// S0: Sign in with Google. The button leaves for the server, which talks to Google and sets the session cookie.
const Login = ({ reason }) => {
  const { me, loading, unreachable, refresh } = useAuth();
  const message = reason ? REASONS[reason] ?? REASONS.failed : null;
  const ready = me?.configured;

  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <Backdrop />
      <main className="glass-panel w-full max-w-sm rounded-[28px] p-8 text-center">
        <Logo size={64} className="mx-auto rounded-2xl" />
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">GrowIT</h1>
        <p className="text-xs font-medium tracking-wide text-accent">AI Marketing Studio</p>
        <p className="mt-2 text-sm text-white/60">Your brand and campaigns sync to your phone and laptop.</p>

        {loading ? (
          <p role="status" className="mt-8 flex items-center justify-center gap-2 text-sm text-white/60">
            <Loader2 size={16} className="animate-spin" /> Checking the server
          </p>
        ) : unreachable ? (
          <div role="alert" className="mt-8 rounded-2xl bg-bad/15 px-4 py-3 text-sm">
            Cannot reach the server. Start the API, then <button type="button" onClick={refresh} className="font-semibold underline">try again</button>.
          </div>
        ) : ready ? (
          <a href={loginUrl()} className="btn mt-8 h-12 w-full bg-white text-ink hover:bg-white/90">
            <GoogleMark /> Continue with Google
          </a>
        ) : (
          <div className="mt-8 rounded-2xl bg-white/10 px-4 py-3 text-left text-sm text-white/80">
            Google sign-in is not set up on this server yet. Add <code className="text-white">GOOGLE_CLIENT_ID</code> and <code className="text-white">GOOGLE_CLIENT_SECRET</code> to the server's .env, then restart it.
          </div>
        )}

        {message && <p role="alert" className="mt-4 text-sm text-bad">{message}</p>}

        {me && !me.require_login && !loading && (
          <button type="button" onClick={() => navigate('home')} className="mt-4 text-sm text-white/60 underline hover:text-white">
            Continue without signing in
          </button>
        )}
        {me?.restricted && ready && <p className="mt-4 text-xs text-white/45">Only approved accounts can sign in.</p>}
      </main>
    </div>
  );
};

export default Login;
