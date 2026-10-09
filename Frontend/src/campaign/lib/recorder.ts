// Records the microphone and returns 16 kHz mono 16-bit WAV, the one format every speech engine on the server accepts.
// MediaRecorder gives webm or mp4 depending on the browser; decoding and re-encoding here means the server never has to guess.

export const MAX_SECONDS = 60;
const TARGET_RATE = 16000;

export type Recording = {
  /** Stop and resolve with the WAV, or null if nothing usable was captured. */
  stop: () => Promise<Blob | null>;
  /** Throw the recording away. */
  cancel: () => void;
};

export function recordingSupported(): boolean {
  return typeof window !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";
}

function pickMime(): string | undefined {
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return undefined;
}

export function encodeWav(samples: Float32Array, rate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

async function toWav(blob: Blob): Promise<Blob | null> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    if (decoded.duration < 0.25) return null;
    // Resample to 16 kHz and mix down to mono with an offline context.
    const length = Math.ceil(decoded.duration * TARGET_RATE);
    const offline = new OfflineAudioContext(1, length, TARGET_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return encodeWav(rendered.getChannelData(0), TARGET_RATE);
  } finally {
    ctx.close().catch(() => undefined);
  }
}

/** Ask for the microphone and start recording. Rejects with the browser's error name (NotAllowedError, NotFoundError). */
export async function startRecording(onLimit?: () => void): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const recorder = new MediaRecorder(stream, pickMime() ? { mimeType: pickMime() } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType })); });
  const release = () => stream.getTracks().forEach((t) => t.stop());
  const limit = window.setTimeout(() => { if (recorder.state === "recording") { recorder.stop(); onLimit?.(); } }, MAX_SECONDS * 1000);
  recorder.start();
  return {
    async stop() {
      window.clearTimeout(limit);
      if (recorder.state === "recording") recorder.stop();
      release();
      const raw = await done;
      return raw.size ? toWav(raw) : null;
    },
    cancel() {
      window.clearTimeout(limit);
      recorder.ondataavailable = null;
      if (recorder.state === "recording") recorder.stop();
      release();
    },
  };
}
