// Cutting a reply into pieces for the voice. Pure, so it can be tested without a browser.
const MAX_SPOKEN = 360;
const CHUNK = 190;

// Sentence-sized pieces of at most CHUNK characters, from the first MAX_SPOKEN characters of the text, cut at a sentence end.
export function pieces(text) {
  let t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length > MAX_SPOKEN) {
    const cut = t.slice(0, MAX_SPOKEN);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '), cut.lastIndexOf('। '));
    t = end > 80 ? cut.slice(0, end + 1) : cut;
  }
  const sentences = t.match(/[^.!?।]+[.!?।]*\s*/g) || [t];
  const out = [];
  for (const s of sentences) {
    const last = out[out.length - 1];
    if (last && last.length + s.length <= CHUNK) out[out.length - 1] = `${last}${s}`;
    else out.push(s);
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

