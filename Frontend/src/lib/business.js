import { useCallback, useEffect, useState } from 'react';
import { api } from '../campaign/lib/api';

// The owner's shop details (name, WhatsApp number, menu, colours, site settings), kept on the server.
const send = (method, path, body) => api(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export const getBusiness = () => api('/business');
export const saveBusiness = (patch) => send('PUT', '/business', patch);
export const businessNames = (idea, city) => send('POST', '/business/names', { idea, city });
export const sitePreview = (lang) => api(`/business/site/preview?lang=${encodeURIComponent(lang)}`);
export const publishSite = (slug) => send('POST', '/business/site/publish', { slug });
export const unpublishSite = () => send('DELETE', '/business/site/publish');

export const useBusiness = () => {
  const [data, setData] = useState({ profile: {}, site: { published: false } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try {
      setData(await getBusiness());
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  // Saves only what is sent, and returns the saved profile. Throws with the server's plain message on a bad value.
  const save = useCallback(async (patch) => {
    const next = await saveBusiness(patch);
    setData(next);
    return next;
  }, []);

  return { profile: data.profile, site: data.site, setSite: (site) => setData((d) => ({ ...d, site })), loading, error, reload, save };
};

export const LANG_LABEL = { en: 'English', hi: 'हिन्दी', kn: 'ಕನ್ನಡ' };
