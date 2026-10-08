import { useState } from 'react';
import { Talk } from '../campaign/components/talk';
import { startInterview } from '../campaign/lib/api';
import { LANGS } from '../campaign/lib/format';
import { go } from '../campaign/lib/current';
import { Button, ErrorNote } from '../campaign/components/ui';

// S3: one question at a time, spoken and shown. Mic, tap or type. Every answer is kept with the owner's own words.
const Start = () => {
  const [starting, setStarting] = useState(null);
  const [error, setError] = useState('');
  const start = async (lang) => {
    setStarting(lang);
    setError('');
    try {
      const s = await startInterview(lang);
      go({ name: 'talk', sid: s.id });
    } catch (e) {
      setError(e.message);
      setStarting(null);
    }
  };
  return (
    <section className="start">
      <p className="kicker">Campaign 0 for your shop</p>
      <h1 className="display">Say the offer. We write the campaign.</h1>
      <p className="lede">Answer a few questions out loud or by tapping. Nothing goes out that is not what you said.</p>
      <div className="start-actions" role="group" aria-label="Start in a language">
        {LANGS.map((l, i) => (
          <Button key={l.code} variant={i === 0 ? 'primary' : 'secondary'} onClick={() => start(l.code)} disabled={starting !== null}>
            {starting === l.code ? 'Starting' : `Start in ${l.native}`}
          </Button>
        ))}
      </div>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </section>
  );
};

const TalkPage = ({ id }) => (
  <div className="cv">
    {id ? <Talk key={id} sid={id} go={go} /> : <Start />}
  </div>
);

export default TalkPage;
