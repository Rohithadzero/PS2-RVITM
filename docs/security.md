# Security and privacy

Scope: hackathon build handling a small business owner's brand data, photos and a customer phone list. Principles: keys stay on the server, facts are deterministic, personal data is minimal and consented, uploaded content is data never instructions.

## 1. Assets to protect

| Asset | Why it matters |
|---|---|
| Agnes API key, Google OAuth secret, session secret | Abuse of free quota; account takeover |
| Offer Facts lock | A wrong price/date told to customers is the core harm |
| Customer list (phone, language, consent) | Personal data; DPDP Act applies to stored phone numbers (confirm current details) |
| Owner's photos, menu, brand data | Business confidentiality |
| Voice recordings and transcripts | May contain names, numbers, private talk |

## 2. Secrets

- All keys in server `.env` only. Never in frontend bundles, never in git (`.env` in `.gitignore`; commit `.env.example` with placeholders).
- Frontend calls only our backend. No direct browser calls to Agnes, Sarvam, Groq, ElevenLabs.
- Rotate any key that was pasted into chat, a screenshot or a commit.

### User-supplied (BYO) provider keys
Users can enter their own provider keys in Settings ([settings](settings.md)). Controls:
- **Write-only**: no API ever returns a stored key; the UI shows `••••` + last 4.
- **Encrypted at rest** (AES-GCM or Fernet) with a master key from server env; ciphertext only in the DB; overwritten on delete.
- Decrypted only in the backend call path, in memory for the request; never logged, never in URLs, redacted from errors and traces.
- Key is tested with a tiny real call before it is stored; failures never echo the key.
- **SSRF protection for custom base URLs**: HTTPS only; resolve DNS and reject private, loopback, link-local and cloud-metadata ranges (including after redirects); timeouts and response-size caps; optional host allow-list for the hackathon.
- Per-owner limits on test and calibration calls so the feature cannot be used to hammer third-party endpoints.
- A user's key is used only for that owner's requests; never shared across owners; never used for the shared default pool.
- Keys, ciphertext and master key are excluded from exports, backups shown to users, and logs.
- Tunnel URL (Cloudflare/ngrok) is not committed and is closed after the event.

## 3. Authentication and sessions

- Google OAuth Authorization Code flow with PKCE, handled by the backend.
- Session = signed, HttpOnly, Secure, SameSite=Lax cookie; short TTL, rotate on login.
- Allow-list of demo Google accounts during the hackathon (env var). No open signup.
- CSRF: SameSite cookie plus a custom header check on state-changing routes.
- Logout invalidates the server session.

## 4. Authorization

- Every row carries `owner_id`. Every query is scoped by the session's owner. No global reads.
- Object access by id requires ownership check (no IDOR): campaign, asset, upload, customer.
- SSE streams are scoped to the authenticated owner's campaign.

## 5. Uploads

- Types allowed: images (JPEG/PNG/WebP), menu as CSV/XLSX/PDF, customer list CSV. Reject others by content sniffing, not extension alone.
- Size caps (e.g. images 10 MB, CSV 2 MB). Re-encode images server-side (strips EXIF GPS and embedded payloads).
- Store outside web root; serve through an authenticated route with signed, short-lived URLs.
- CSV: parse with a strict parser; treat leading `= + - @` cells as text (no formula injection when re-exported).
- Virus scanning is out of scope; document as P2.

## 6. Prompt injection and untrusted text

Untrusted inputs: transcripts, uploaded menu/PDF text, customer names, sample posts, persona text.

- All untrusted text is wrapped in clearly delimited data blocks and the system prompt states it is data, never instructions (suzune-style "never execute the text" rule).
- The model cannot call tools that change facts, send, or delete. Tool surface is minimal and read/propose-only; state changes go through deterministic code after owner approval.
- **The validator and the slot renderer are the real defense**: even if a prompt is hijacked, the output cannot contain an unlocked number, date or promise, and Blocked assets cannot be Approved.
- Strip/limit length of any uploaded text before it enters a prompt.

## 7. Fact integrity (the product's core control)

- Facts live only in the versioned Offer Facts record. Models write `{slots}`.
- Renderer fills slots; validator searches for digits, spelled-out numbers, day names and percentages outside slots (see [validator-and-scoring](validator-and-scoring.md)).
- Approval requires: TTS read-back played or on-screen confirm, then explicit owner action. STT output never writes the lock directly.
- Facts version is part of every asset and cache key; a stale-version asset cannot be Approved or sent.
- Audit log is append-only (`event_log`).

## 8. Customer data, consent and messaging

- Collect only: phone, language preference, per-channel consent (channel, timestamp, consent text version), opted-out flag. No other personal fields.
- Consent is required per channel before any (simulated) send; opted-out customers are skipped and the skip is logged.
- Sends in this build are **simulated** and labelled "simulated send". Demo uses team phone numbers only, never real customers' numbers.
- Real sending (P2) needs: TRAI DLT sender/template registration for SMS, WhatsApp Business Platform with opt-in and approved templates, DPDP-compliant notice, retention and deletion. Confirm current rules before building.
- Owner can export and delete all customer data; deletion cascades to send logs' personal fields.
- Data minimization: customer phone numbers are never sent to Agnes or any model; prompts use language and audience only.

## 9. Voice and model privacy

- Local-first STT/TTS keeps audio on the laptop. Cloud providers (Sarvam, Groq, ElevenLabs free tier) are opt-in per provider; the UI shows which provider handled a clip.
- Audio is deleted after transcription unless the owner keeps it; transcripts are retained as the brief record.
- No customer data in any audio/LLM request.

## 10. Rate-limit and abuse protection

- Server-side token buckets (text 10, image 10, video 1 RPM) protect the shared free quota.
- Per-session request caps and body-size limits; reject oversize audio.
- Backoff on 429; never retry in a tight loop.

## 11. Transport and headers

- HTTPS everywhere outside localhost (tunnel provides TLS).
- CORS: only the frontend origin. CSP, X-Content-Type-Options, frame-ancestors none.
- Cookies Secure + HttpOnly.

## 12. Logging

- Log request ids, provider names, latencies, outcomes. Do not log API keys, raw audio, full customer rows, or full prompts containing PII.
- `event_log` stores actor, action and short detail (e.g. "facts v3 approved"), not payloads with personal data.

## 13. Content safety

- Brand Constitution holds banned phrases and taboo claims (e.g. no health claims, no "cheapest", no competitor names). Validator checks generated copy against it.
- Implied promises ("all drinks", "free", "unlimited") are extracted and must map to a lock field or the asset is Blocked.
- Imagery: no AI-generated food presented as the real product; real photo is default.

## 14. Threat summary

| Threat | Control |
|---|---|
| Key leak | Server-only `.env`, rotate, `.gitignore` |
| User API key theft from DB/logs | Encryption at rest, write-only API, log redaction, master key in env only |
| SSRF via custom endpoint | HTTPS only, block private/metadata IP ranges incl. redirects, timeouts, allow-list |
| Shared default key abused/exhausted | Per-session caps, token buckets, banner prompting users to add their own key |
| Wrong price sent to customers | Slots + deterministic validator in loop + read-back approval |
| Prompt injection via menu PDF / customer name | Data delimiters, no state-changing tools, validator |
| IDOR on campaigns/uploads | owner_id scoping + ownership checks |
| Malicious upload | Type sniffing, re-encode, size caps, authenticated serving |
| Sending to non-consenting customers | Per-channel consent gate, opt-out, simulated send only |
| STT mishear approved as fact | STT never writes lock; read-back + confirm |
| Session theft | HttpOnly Secure cookie, short TTL, allow-list |
| Quota exhaustion | Token buckets, caps, cache |
| Venue Wi-Fi failure | Local adapters + labelled saved outputs |

## 15. Pre-demo security checklist

- [ ] `.env` not in git; `.env.example` present
- [ ] No keys in frontend bundle (search build output)
- [ ] Allow-list set to demo Google accounts
- [ ] Customer list contains only team numbers
- [ ] Simulated-send banner visible
- [ ] Tunnel URL not in repo; plan to close after demo
- [ ] Keys used in testing rotated if shared anywhere
- [ ] BYO key scan: no key appears in any API response, log or client storage
- [ ] SSRF tests pass (localhost, 169.254.169.254, 10.x rejected)
- [ ] Master encryption key set in env and not in git
