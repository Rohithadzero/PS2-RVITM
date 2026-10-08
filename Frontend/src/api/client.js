// Typed-by-convention wrappers for every route in docs/api-spec.md.
// Pages use mock data from src/data/mock.js today; switch a page to these calls once its route is live.
// Set VITE_API_URL in .env.local (e.g. http://localhost:8000). The session cookie carries auth; no keys in the browser.

const BASE = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(status, code, message, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra; // e.g. retry_after on 429, fallback info on 502
  }
}

const request = async (method, path, body, { form = false } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: form || body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: form ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error ?? {};
    throw new ApiError(res.status, err.code ?? 'unknown', err.message ?? res.statusText, data);
  }
  return data;
};

const get = (p) => request('GET', p);
const post = (p, b) => request('POST', p, b ?? {});
const put = (p, b) => request('PUT', p, b);
const patch = (p, b) => request('PATCH', p, b);
const del = (p) => request('DELETE', p);
const upload = (p, fields) => {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => v !== undefined && fd.append(k, v));
  return request('POST', p, fd, { form: true });
};

export const api = {
  // 1. Auth
  loginUrl: () => `${BASE}/auth/google/login`,
  logout: () => post('/auth/logout'),
  me: () => get('/me'),

  // 2. Onboarding and brand (S1)
  uploadFile: (kind, file) => upload('/uploads', { kind, file }),
  listUploads: (kind) => get(`/uploads?kind=${encodeURIComponent(kind)}`),
  importMenu: (body) => post('/menu/import', body),
  saveMenu: (items) => put('/menu', items),
  importCustomers: (file) => upload('/customers/import', { file }),
  listCustomers: () => get('/customers'),
  updateCustomer: (id, body) => patch(`/customers/${id}`, body),
  deleteCustomers: () => del('/customers'),
  proposeBrand: () => post('/brand/propose'),
  saveBrand: (brand) => put('/brand', brand),
  getBrand: () => get('/brand'),
  getAudiences: () => get('/audiences'),
  saveAudiences: (list) => put('/audiences', list),

  // 3. Voice (S3, S4, S10)
  transcribe: (audio, langHint, provider) => upload('/voice', { audio, lang_hint: langHint, provider }),
  cleanTranscript: (transcript) => post('/voice/clean', { transcript }),
  readBack: (campaignId, factsVersion, lang) => post('/tts/readback', { campaign_id: campaignId, facts_version: factsVersion, lang }),
  voiceProviders: () => get('/voice/providers'),
  setVoiceProviders: (body) => put('/voice/providers', body),

  // 4. Campaign flow (S2-S8)
  createCampaign: (name) => post('/campaign', { name }),
  submitBrief: (id, transcriptEdited) => post(`/campaign/${id}/brief`, { transcript_edited: transcriptEdited }),
  editFacts: (id, facts) => put(`/campaign/${id}/facts`, facts),
  approveFacts: (campaignId, version, method) => post('/facts/approve', { campaign_id: campaignId, version, method }),
  plan: (id, body) => post(`/campaign/${id}/plan`, body),
  confirmPlan: (id, planId) => post(`/campaign/${id}/plan/confirm`, { plan_id: planId }),
  generate: (campaignId, planId) => post('/campaign/generate', { campaign_id: campaignId, plan_id: planId }),
  board: (id) => get(`/campaign/${id}/board`),
  asset: (id) => get(`/asset/${id}`),
  editAsset: (id, content, reason) => patch(`/asset/${id}`, { content, reason }),
  approveAsset: (id) => post(`/asset/${id}/approve`),
  regenerateAsset: (id) => post(`/asset/${id}/regenerate`),
  job: (id) => get(`/jobs/${id}`),

  // 5. Scoring, optimization, change (S9, S10, S11)
  compare: (a, b, repeats) => post('/compare', { a_asset_id: a, b_asset_id: b, repeats }),
  vote: (id, choice) => post(`/compare/${id}/vote`, { choice }),
  optimize: (id) => post(`/campaign/${id}/optimize`),
  previewChange: (campaignId, text) => post('/campaign/change', { campaign_id: campaignId, text }),
  applyChange: (previewId) => post('/campaign/change/apply', { preview_id: previewId }),
  log: (id) => get(`/campaign/${id}/log`),

  // 6. Send, simulated (S12)
  sendPreview: (campaignId, audienceId, channel) => post('/send/preview', { campaign_id: campaignId, audience_id: audienceId, channel }),
  simulateSend: (body) => post('/send/simulate', body),
  sendLog: () => get('/send/log'),

  // 7. Planner (S5)
  solve: (body) => post('/planner/solve', body),
  plannerCalibration: () => get('/planner/calibration'),

  // 7a. Settings and calibration (S13)
  providers: () => get('/settings/providers'),
  testProvider: (body) => post('/settings/providers/test', body),
  saveProvider: (body) => put('/settings/providers', body),
  removeKey: (capability) => del(`/settings/providers/${capability}/key`),
  saveLimits: (body) => put('/settings/limits', body),
  usage: () => get('/settings/usage'),
  getVoiceSettings: () => get('/settings/voice'),
  saveVoiceSettings: (body) => put('/settings/voice', body),
  runCalibration: (body) => post('/calibration/run', body),
  calibration: () => get('/calibration'),
  deleteAllData: () => del('/settings/data'),

  // 8. Bake-off (S14, flag-gated)
  bakeoffStt: (body) => post('/bakeoff/stt', body),
  bakeoffTts: (body) => post('/bakeoff/tts', body),
  bakeoffResults: () => get('/bakeoff/results'),
};

// 9. Live updates (asset.updated, job.progress, facts.versioned, change.logged, plan.updated, send.logged,
// calibration.updated, provider.status, usage.warning). EventSource resumes with Last-Event-ID on its own.
export const subscribe = (campaignId, handlers) => {
  const source = new EventSource(`${BASE}/campaign/${campaignId}/events`, { withCredentials: true });
  Object.entries(handlers).forEach(([event, fn]) => source.addEventListener(event, (e) => fn(JSON.parse(e.data))));
  return () => source.close();
};
