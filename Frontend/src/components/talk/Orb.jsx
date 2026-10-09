import { motion } from 'framer-motion';
import { Loader2, Mic, Square, Volume2 } from 'lucide-react';

// The one button of a conversation. It shows whose turn it is: waiting, listening to you, working, or speaking. Tapping it while it
// speaks interrupts; tapping while it listens finishes your turn.
const LABEL = { idle: 'Tap to talk', listening: 'Listening. Tap when you are done', thinking: 'One moment', speaking: 'Speaking. Tap to interrupt' };

const Orb = ({ phase, onClick, started, disabled }) => {
  const Icon = phase === 'listening' ? Square : phase === 'thinking' ? Loader2 : phase === 'speaking' ? Volume2 : Mic;
  const label = started ? LABEL[phase] : 'Tap to start';
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative grid size-24 place-items-center">
        {(phase === 'listening' || phase === 'speaking') && [0, 1].map((i) => (
          <motion.span
            key={`${phase}-${i}`}
            aria-hidden="true"
            className="absolute inset-0 rounded-full border-2 border-accent"
            initial={{ scale: 1, opacity: 0.5 }}
            animate={{ scale: phase === 'listening' ? 1.7 : 1.45, opacity: 0 }}
            transition={{ duration: phase === 'listening' ? 1.6 : 1.1, repeat: Infinity, delay: i * 0.5, ease: 'easeOut' }}
          />
        ))}
        <motion.button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          aria-pressed={phase === 'listening'}
          whileTap={{ scale: 0.94 }}
          animate={{ scale: phase === 'listening' ? [1, 1.05, 1] : 1 }}
          transition={phase === 'listening' ? { duration: 1.2, repeat: Infinity } : { duration: 0.2 }}
          className={`voice-mic relative z-10 grid size-[72px] place-items-center rounded-full ${phase === 'listening' ? 'voice-mic-live' : ''}`}
        >
          <Icon size={28} className={phase === 'thinking' ? 'animate-spin' : ''} />
        </motion.button>
      </div>
      <p className="text-xs font-medium text-ink/60" role="status">{label}</p>
    </div>
  );
};

export default Orb;
