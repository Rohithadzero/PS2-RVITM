# How N Dial does live transcription and translation

Reference for porting the same approach to another project. Everything here was read from source in
`D:\AndroidStudioProjects\N Dial\`:

| Project | Role |
|---|---|
| `NDial V5` | The dialer. Shows the captions UI, sends start/stop. **Runs no speech or translation code for calls.** |
| `NDialRecorder` | Companion app. **This is where transcription and translation actually run.** |
| `NDial V5` NOX Assist (`nox/webrtc/*`) | A second, separate use of speech-to-text: Vosk on the caller's WebRTC audio for voicemail screening. |

Paths below are relative to `NDialRecorder/app/src/main/java/com/hearthborn/studios/ndialrecorder/`
(`R/`) or `NDial V5/app/src/main/java/com/hearthborn/studios/ndial/` (`N/`).

---

## 1. The 30-second picture

```
 call audio (uplink + downlink, 16 kHz mono PCM, 100 ms chunks)
        |
        |  Shizuku -> shell-UID process (scrcpy-server) -> pipe          [R/capture/*]
        v
   CaptureHub  --- one channel per direction (self / peer), or one mixed ---
        |
        v
   per-direction ChannelTranscriber                                      [R/captions/LiveCaptionSession]
        |   engine order: Android on-device recognizer
        |                 -> Whisper-tiny language-ID + Kroko (sherpa-onnx) or Vosk
        |                 -> Vosk model race
        v
   partial / final text  (segmentId, isFinal)
        |
        +--> LiveTranslator (ML Kit, on-device) -> translated text       [R/translate/*]
        |
        v
   AIDL callback onCaption(speaker, segmentId, isFinal, text, translated)  -> NDial UI
        |
        v
   transcript JSON saved every 15 s and at stop                          [R/storage/Transcripts]
```

Key properties:

- **Fully on-device.** No audio and no text leaves the phone for transcription or translation.
  The only network use is one-time model downloads (Hugging Face, alphacephei.com, Google Play
  services for ML Kit) and the optional AI call summary, which is a separate cloud function (section 9).
- **Streaming.** Partial hypotheses arrive every ~100-300 ms while someone talks; a final replaces
  the partial for the same `segmentId` at each pause.
- **Language is auto-detected** per call direction. Nobody picks the spoken language.
- **Translation sits on top of transcription**: every partial/final string is pushed through an
  ML Kit `Translator` for `detectedSourceLanguage -> targetLanguage`.

The call-audio capture (Shizuku, shell UID, scrcpy) is specific to phone calls. If your project has
a normal microphone or a WebRTC/ASR audio stream, you only need sections 3-8.

---

## 2. Audio capture (call-specific, skip if you have your own audio source)

- An ordinary app cannot open `MediaRecorder.AudioSource.VOICE_CALL`. Only the shell UID can.
  The companion uses **Shizuku** to run a user service as shell UID (`capture/ShellCaptureService`,
  `capture/ShizukuCapture`), which execs a bundled **scrcpy-server 4.1** jar. That jar's audio
  engine carries the OEM workarounds; its 48 kHz stereo stream is mixed down to **16 kHz mono
  16-bit PCM** and written to a `ParcelFileDescriptor` pipe.
- `capture/CaptureHub` reads the pipe in **100 ms chunks (3200 bytes)** and fans them to "sinks".
  Three channels: `CH_MIXED` (VOICE_CALL), `CH_UPLINK` (VOICE_UPLINK = this phone's user),
  `CH_DOWNLINK` (VOICE_DOWNLINK = the other party).
- Speaker labelling comes free from the split: uplink = `SPEAKER_SELF`, downlink = `SPEAKER_PEER`.
  Whether a phone allows split capture is only discoverable by trying (`LiveCaptionSession.openSplit`):
  both must open, and at least one must carry sound within 12 s, else fall back to mixed
  (`SPEAKER_UNKNOWN`). A refusal is remembered (`CaptionPrefs.SPLIT_UNSUPPORTED`) so the next call
  does not waste seconds finding out.

**Contract every recognizer relies on:** `onPcm(byte[] data, int length)` called every 100 ms with
16 kHz, 16-bit little-endian, mono audio.

---

## 3. Audio conditioning before recognition

Call audio is band-limited (300-3400 Hz), quiet and has DC offset. Two conditioners, same constants:

**`speech/SpeechGain`** (used before Vosk): slow AGC on `byte[]` PCM.
- `TARGET_PEAK = 12000`, `MAX_GAIN = 12`, `MIN_SPEECH_PEAK = 300`, `SMOOTHING = 0.2`.
- Per chunk: `peak = max(|sample|)`. If `peak > 300`: `gain += 0.2 * (min(12, 12000/peak) - gain)`.
  Apply `gain`, clip to int16. Chunks quieter than 300 hold the current gain (so hiss is never
  amplified into "speech").
- Measured: Hindi/English phone-band WER improved 12% -> 8% (quiet) and 100% -> 72% (quiet + noisy).

**`speech/TelephonyFrontEnd`** (used before sherpa/Kroko and language-ID): `byte[]` PCM -> `float[]` in [-1, 1].
1. DC blocker: `y[n] = x[n] - x[n-1] + 0.995*y[n-1]`.
2. 2nd-order Butterworth high-pass at **80 Hz** (RBJ biquad, Q = 1/sqrt 2).
3. Same AGC as above (after the filters, so rumble cannot steer the gain).
4. **No noise suppression, deliberately.** A GTCRN denoiser was tested and made every engine worse
   (Kroko English WER 0.05 -> 0.16; Whisper 0.12 -> 0.30). Do not add one.

---

## 4. Speech-to-text engines

The session tries engines in this order **per call direction**, and a failing engine drops down the
list mid-call but never off it (`LiveCaptionSession.newTranscriber`, `replaceWithFallback`).

### 4a. Android's on-device recognizer (preferred when it works) - `speech/SystemTranscriber`
- API 33+. `SpeechRecognizer.createOnDeviceSpeechRecognizer(context)`.
- Audio is fed **by pipe, not microphone**: `RecognizerIntent.EXTRA_AUDIO_SOURCE` = read end of a
  `ParcelFileDescriptor.createPipe()`; the app writes PCM into the write end. Extras used:
  `LANGUAGE_MODEL_FREE_FORM`, `EXTRA_LANGUAGE`, `EXTRA_PARTIAL_RESULTS=true`, `EXTRA_PREFER_OFFLINE=true`,
  `EXTRA_AUDIO_SOURCE_CHANNEL_COUNT=1`, `ENCODING_PCM_16BIT`, `SAMPLING_RATE=16000`,
  `EXTRA_SEGMENTED_SESSION = EXTRA_AUDIO_SOURCE` (one session for the whole call, a result per utterance).
- On Android 14+: `EXTRA_ENABLE_LANGUAGE_DETECTION` + `EXTRA_LANGUAGE_DETECTION_ALLOWED_LANGUAGES` +
  `EXTRA_ENABLE_LANGUAGE_SWITCH = LANGUAGE_SWITCH_BALANCED`, results via `onLanguageDetection`.
- Callbacks: `onPartialResults` -> partial, `onSegmentResults` -> final, `ERROR_NO_MATCH` /
  `ERROR_SPEECH_TIMEOUT` = silence (restart, not a failure), `RECOGNIZER_BUSY` / `LANGUAGE_*` /
  `INSUFFICIENT_PERMISSIONS` = fatal -> fall back to the next engine.
- It is only used if a **device check passes** (`speech/SystemSpeech`, cached ~7 days): the app
  speaks/plays a sample ("Hello, this is a speech test. One, two, three.") through the same pipe and
  requires >= 3 probe words back (`SystemSpeechRules.heardProbe`). This catches recognizers that
  ignore the supplied audio and open the real mic.
- Some phones allow only one recognizer session at a time (`verdict.concurrent == false`): then the
  other party gets the system recognizer and this phone's user gets Vosk.

### 4b. Neural path: Whisper-tiny language ID + Kroko streaming - `speech/NeuralAutoTranscriber`, `SherpaStreamingTranscriber`
Library: **sherpa-onnx 1.13.8 AAR** (next-gen Kaldi on ONNX Runtime), in `app/libs/`, not on Maven Central.
Download the official release AAR from `github.com/k2-fsa/sherpa-onnx/releases/tag/v1.13.8`. Every
arm64 `.so` in it is 16 KB page-aligned (needed for 16 KB-page phones).

1. **Language ID (once, then continuously).** Audio is held back while Silero VAD collects the first
   **3.0 s of voiced speech** (`LID_SECONDS`; 2 s misfired, 3 s was 9/9 correct). Whisper-tiny
   (`SpokenLanguageIdentification`, int8 encoder + decoder, 2 threads, CPU) names the language in
   ~150 ms. See `speech/SherpaLanguageId`.
2. **Normalize** (`speech/LanguageChoice`): Whisper `ur` -> `hi` (Hindi/Urdu are one language on the
   phone; Whisper separates them by script), `yue` -> `zh`. If the answer is a language with no model
   on the phone, it counts as "not decided": listen to the next 3 s and ask again, up to 3 attempts,
   then fall back to last call's language, then the phone's locales.
3. **Pick the engine** for that language: Kroko streaming model if installed (English, French),
   else the installed Vosk model for that language (Hindi and the rest).
4. **Replay**: everything held back during identification is replayed into the new engine
   (`onPcmBacklog`) before live audio is forwarded, so the first words are captioned, not lost.
5. **Mid-call switching** (`speech/LanguageSwitchPolicy`): identification keeps running every
   further 3 s of speech. Switch only when **2 consecutive windows** name the same new language.
   Hindi -> English needs +1 window (Hinglish: the Hindi model writes English words passably, the
   English model turns Hindi words into invented English). Each switch already made adds +1 window
   (cap +2), so an unsettled speaker stops bouncing between engines. On a switch the last 100 chunks
   (~10 s) of audio are replayed into the new engine and the lines the old engine wrote for that
   stretch are retracted (empty final = "remove this row").
6. **Pre-warm**: the likely streaming model is loaded on a background thread while language ID is
   still listening (cold Kroko load ~3.9 s, LID needs 3 s; in parallel the first caption lands at
   ~3-4 s instead of ~7 s). Likely = last call's language, then phone locales.

Kroko recognizer config (`speech/SherpaEngines.streamingConfig`):
- Streaming transducer (`encoder.onnx`, `decoder.onnx`, `joiner.onnx`, `tokens.txt`), 80-dim features,
  16 kHz, 2 threads, CPU, `greedy_search`, `maxActivePaths=4`.
- **Endpoint rules decide when a caption becomes final:** rule1 = 2.4 s of nothing resets an idle
  stream; **rule2 = 0.8 s of silence after speech closes the line**; rule3 = 20 s cap on a monologue.
- Decode loop per chunk: `stream.acceptWaveform(samples, 16000)`, `while (recognizer.isReady(stream)) recognizer.decode(stream)`,
  `text = recognizer.getResult(stream).getText()`, `if (recognizer.isEndpoint(stream)) { emit final; recognizer.reset(stream) }`,
  otherwise emit a partial if the text changed.
- One recognizer per model is **shared** by both call directions (each direction has its own
  `OnlineStream`), reference-counted, freed when the last user releases.

Model sizes / sources (`speech/NeuralModels`, files fetched individually from Hugging Face
`csukuangfj/*`, size + SHA-256 checked, downloaded into `<id>.partial/` then renamed, `.complete`
marker last so a crash never leaves a model that looks installed):
- `whisper-tiny-lid`: tiny-encoder.int8.onnx 12.9 MB + tiny-decoder.int8.onnx 89.9 MB + tokens 0.8 MB (Whisper: MIT).
- `kroko-en`, `kroko-fr`: ~70 MB each, `sherpa-onnx-streaming-zipformer-{en,fr}-kroko-2025-08-06` (CC BY-SA 4.0, attribution required).
- Silero VAD `silero_vad.onnx` is **bundled in the APK** (`assets/sherpa/`); threshold 0.5,
  min silence 0.4 s, min speech 0.25 s, window 512, max speech 10 s.

Why these models (measured on simulated cellular audio: 8 kHz, 300-3400 Hz, G.711 mu-law, quiet, +/- noise):
Kroko beat Vosk-small by a wide margin in English/French (noisy EN WER 0.67 -> 0.16, noisy FR 0.43 -> 0.04)
and returns cased, punctuated text. Whisper base was worse than Kroko and useless for Hindi on phone
audio (WER ~1.0), so Whisper is used **only to tell languages apart**. Hindi stays on Vosk (beat
Whisper and the 104 MB Dolphin multilingual model).

### 4c. Vosk (fallback, and the engine for most non-EN/FR languages) - `speech/StreamingTranscriber`
- Dependency: `com.alphacephei:vosk-android:0.3.75`. **Must be 0.3.75+**: 0.3.47's arm64 `libvosk.so`
  is 4 KB-aligned and cannot be mapped on 16 KB-page phones (silent process death).
- `packaging.jniLibs.useLegacyPackaging = true` (Vosk binds native via JNA and needs a real extracted
  `.so`; otherwise `UnsatisfiedLinkError` on a background thread kills the process with no Java stack).
  Exclude `**/mips/**`, `**/mips64/**`, `**/armeabi/**`. Don't compress `zip`/`onnx` assets.
- Per chunk: `recognizer.acceptWaveForm(bytes, len)` returns true at an utterance boundary ->
  `getResult()` (final), else `getPartialResult()` (partial; emit only when the text changed).
  `Recognizer(model, 16000f)`, `setMaxAlternatives(0)`, `setWords(true)` when confidences are needed.
- **Confidence filter** (`speech/ConfidentWords`, `MIN_CONFIDENCE = 0.5`): drop words with
  `conf < 0.5` from finals. Under call noise Vosk pads real words with confident-sounding inventions
  ("be home office indeed" for "be home") and those sit below the real words' confidence. If every
  word is dropped, emit an empty final so the UI removes the partial it was showing.
- **Latency over completeness**: a 20-chunk (2 s) `ArrayBlockingQueue` per transcriber. If decoding
  falls behind real time, drop the *oldest* chunk, never the newest, and count drops.
- Wrap every native call in `catch (Throwable)`: native linkage failures are `Error`s, not `Exception`s.
- Models: `SpeechLanguages.ALL`, 29 languages from `alphacephei.com/vosk/models/<name>.zip`
  (small models only, 31-289 MB zips). English-India, Hindi and French are **bundled in the APK**
  (`assets/speech/`) and unpacked on first run; the rest download on demand. `speech/SpeechModelCache`
  keeps loaded models shared and refcounted (`MAX_IDLE = 2` idle models kept for fast next call).

### 4d. Vosk model race (no language-ID model installed) - `speech/AutoLanguageTranscriber`, `LanguageScorer`
Run up to 4 Vosk models on the same audio; `LanguageScorer` scores each by summed word confidence
over a prior of 2 zero-confidence words (so one lucky word can't decide). Declare a winner when it
averages >= 0.5, beats the runner-up by >= 0.1, over >= 3 words, only counting words ending inside
the stretch of audio **every** candidate has finalised (otherwise a faster-finalising wrong model
wins - this exact bug called Hindi "English"). Hard stops: 12 s of speech -> take the best; 30 s with
nothing recognized -> fall back to the preferred language. Nothing is shown during the race; when a
winner is declared everything it heard so far is emitted as one segment. Much more CPU than 4b.

### Safety nets (copy these)
- `SherpaEngines.available()`: loads the native lib once per process; catches `Throwable`.
  Refuses on x86 ABIs (ARM libs run translated; seen SIGSEGV). Uses a "loading" sentinel written with
  `commit()` before the load: if still set at the next two starts, the load kills the process, so
  neural captions stay off for that app version.
- Engine failures are reported via a callback and the session swaps in the next engine on a
  separate thread; failures never propagate onto the capture thread.

---

## 5. Streaming contract between engines and the session

Every engine implements `ChannelTranscriber` (`onPcm`, `onPcmBacklog`, `peak`, `release`) and emits:

```java
void onText(int speaker, int segmentId, boolean isFinal, String text, long latencyMs);
```

- A partial and the final that replaces it share one `segmentId` per speaker.
- A final with **empty text** means "take this row back" (all words misheard, or re-captioned
  in another language after a switch).
- `segmentId`s from a replacement engine are offset (`GENERATION_STEP = 100_000`,
  `ENGINE_SEGMENT_STEP = 5_000`) so they never reuse an id already on screen.
- Row key on the receiving side: `speaker * 10_000_000L + segmentId`.
- `release()` flushes the last utterance as a final and frees native state (blocks <= 2 s).

---

## 6. Translation - ML Kit on-device (`translate/LiveTranslator`, `TranslationModels`)

Dependency: `com.google.mlkit:translate:17.0.3`. One `Translator` per **source -> target** pair:

```java
Translator t = Translation.getClient(new TranslatorOptions.Builder()
        .setSourceLanguage(sourceCode)   // BCP-47, e.g. "hi"
        .setTargetLanguage(targetCode)   // e.g. "en"
        .build());
t.translate(text).addOnSuccessListener(executor, translated -> ...);
```

How the live part is handled (`LiveTranslator`):
- **Finals** are translated immediately.
- **Partials** are translated too, but **at most once per 300 ms per speaker, and only the newest
  partial is ever sent** (`PARTIAL_INTERVAL_MS = 300`). A talking speaker produces a new hypothesis
  every 100-200 ms; translating each would queue faster than it completes and make everything later.
- Results can return out of order, so each request gets a sequence number: a result is dropped if
  it is older than one already delivered for that segment, or if it is a partial arriving after that
  segment's final.
- Runs on its own `HandlerThread`; callbacks use that thread's executor.

How the session wires it (`LiveCaptionSession`):
- When a direction's language becomes known (`onLanguage`), it creates a translator for
  `translateCodeOf(language) -> target` on a background thread (listing models is a Play-services
  round trip), **provided that source model is already downloaded**. If not, that direction is
  captioned untranslated instead of refused.
- It translates a **backlog of the 8 newest untranslated lines** the moment a translator comes up,
  because detection takes ~a sentence and earlier lines would otherwise stay source-only.
- Spoken-language -> ML Kit code mapping lives in `SpeechLanguages.Language.translateCode`
  (null for Kazakh/Uzbek/Tajik/Kyrgyz: transcribable, not translatable). Android locale tags
  ("hi-IN") are normalised via `TranslateLanguage.fromLanguageTag`.
- If source == target, no translator is created (already in that language).
- `setTarget()` at runtime closes translators, clears cached translations and rebuilds for the known
  languages; no transcriber restart needed.
- On stop, waits up to 800 ms for the last final's translation (`pendingFinalTranslations`) so it
  lands in the saved transcript.

Model management (`TranslationModels`):
- ~30 MB per language, downloaded via `RemoteModelManager.download(TranslateRemoteModel, DownloadConditions)`
  with optional `requireWifi()`. English is built in. **Never download mid-call**: a call that needs
  a missing model is refused with `START_TRANSLATION_MODEL_MISSING`.
- `RemoteModelManager.getInstance().getDownloadedModels(TranslateRemoteModel.class)` lists installed.
- Hindi and French models are fetched in the background once on first launch (`ensureBundledTargets`),
  so Hindi <-> English works after one Wi-Fi session.
- Supported set: `TranslateLanguage.getAllLanguages()` (59 languages, listed in NDial's
  `CaptionLanguageCatalog.TRANSLATION`).

UI rule in NDial (`LiveCaptionsController.renderRow`): when translating, show **the translation as
the line** and keep the original hidden under it, revealed on tap. Only the *other* party's speech is
translated/displayed (`dropOwnLines`) because the user knows what they said. Until a translation
lands the original is shown, so nothing waits on the translator.

---

## 7. Session lifecycle & the control API (`captions/LiveCaptionSession`, `ICallRecorder.aidl`)

`start(callTag, spoken, target)`:
1. `spoken` empty / `"auto"` -> auto-detect (the normal case since API 4). A tag pins the language.
2. Decide engines: system recognizer if the device check passed (auto only); neural path if
   language-ID is installed (or a pinned language has a Kroko model); else Vosk.
3. Resolve `target`: `TranslationModels.normalize`; refuse with `START_TRANSLATION_MODEL_MISSING`
   if the target model isn't downloaded, `START_TRANSLATION_UNSUPPORTED` if a pinned source has no
   ML Kit code. Refuse `START_SPEECH_MODEL_MISSING` if no engine/model exists.
4. If already running with the same language setup, just `setTarget()`; otherwise `stop()` and restart.
5. Open split capture (`openSplit`), else mixed. State: `OFF -> STARTING -> RUNNING`.
6. Checkpoint timer: write the transcript every **15 s**, or sooner after **8** new finals, so a
   process kill loses at most that much.

`stop()`: detach sinks (flushes last utterances), wait <= 800 ms for pending translations, close
translators, **atomically** write the transcript (temp file + rename), release models.

AIDL surface NDial calls (`RecorderContract.API_VERSION = 4`): `startLiveCaptions(callTag, spoken, target)`,
`stopLiveCaptions()`, `captionState()`, `captionLanguagesJson()`; callbacks on `IRecorderClient`:
`onCaption(speaker, segmentId, isFinal, text, translated, latencyMs)`, `onCaptionState(state)`,
`onCaptionLanguage(speaker, tag, name)`. Only text crosses the binder, never audio.
Constants: `SPEAKER_UNKNOWN=0 / SELF=1 / PEER=2`, `CAPTION_STATE_OFF/STARTING/RUNNING = 0/1/2`.
Result codes: `START_OK=0`, `...AUDIO_BUSY=4`, `...SPEECH_MODEL_MISSING=7`,
`...TRANSLATION_MODEL_MISSING=8`, `...TRANSLATION_UNSUPPORTED=9`.

Saved transcript (`storage/Transcripts`), one file per call at `files/CallTranscripts/<startedAt>.json`:

```json
{"startedAt": 1759900000000, "tag": "...", "spoken": "hi", "target": "en",
 "segments": [{"speaker": 2, "at": 1759900001234, "text": "...", "translated": "..."}]}
```

Only final segments are kept. A restart within the same call (language change, Transcribe toggled)
**appends** to the same file (`carried` segments).

---

## 8. Minimal recipe to reproduce this in another Android project

1. **Pick the audio source.** Anything that gives you 16 kHz mono 16-bit PCM in ~100 ms chunks
   (`AudioRecord`, WebRTC `AudioTrackSink` then downsample, etc.). If it is not 16 kHz, downsample by
   **box-averaging**, not by dropping samples (decimation without a low-pass aliases >8 kHz into the
   speech band). NDial's NOX does exactly this in `NoxVoskRecognizer.downsampleTo16k` (48k -> 16k). Mix
   stereo to mono by averaging channels (`NoxAudioChunker.toMono`).
2. **Gradle**
   ```kotlin
   implementation("com.alphacephei:vosk-android:0.3.75")
   implementation("com.google.mlkit:translate:17.0.3")
   implementation(files("libs/sherpa-onnx-1.13.8.aar"))   // optional: Kroko + Whisper-LID + VAD
   android { packaging { jniLibs { useLegacyPackaging = true
              excludes += listOf("**/mips/**","**/mips64/**","**/armeabi/**") } }
             androidResources { noCompress += listOf("zip","onnx") }
             defaultConfig { ndk { abiFilters += listOf("arm64-v8a","armeabi-v7a") } } }
   ```
3. **Simplest working version (Vosk + ML Kit only)**
   - Load a Vosk model dir once (`Model(path)`), `Recognizer(model, 16000f)` with `setWords(true)`.
   - On each 100 ms chunk, on a worker thread (never the audio thread): apply AGC, then
     `if (rec.acceptWaveForm(buf, len)) final(rec.getResult()) else partial(rec.getPartialResult())`.
     Parse JSON `"text"` / `"partial"`. Filter final words with `conf < 0.5`.
   - Queue of 20 chunks; drop oldest on overflow.
   - Build `Translator(src -> tgt)` once the source language is known; submit finals immediately and
     partials throttled to one per 300 ms (newest only); drop stale/out-of-order results by sequence.
4. **Add language auto-detect** (optional): sherpa-onnx Whisper-tiny `SpokenLanguageIdentification`
   fed 3.0 s of VAD-gated voiced audio, mapped through `LanguageChoice` (`ur->hi`, `yue->zh`),
   with the confirm-twice switch policy.
5. **Add Kroko** (optional, best English/French quality): the streaming config in 4b, endpoint rule2 0.8 s.
6. **Models are downloaded, not shipped** (except the small bundled ones): file-by-file, verified by size
   and SHA-256, into a `.partial` dir, renamed on success. Refuse to start a feature rather than
   downloading mid-use.

---

## 9. NOX Assist: the other speech-to-text path in NDial V5 (voicemail screening)

Not live captions, but it uses the same toolkit, so useful to know:

- `N/nox/webrtc/NoxVoskRecognizer.kt` (Vosk, in-app, no companion). Model:
  `vosk-model-small-en-us-0.15` (~39 MB) downloaded at runtime when the user turns NOX on
  (`NoxVoskModelDownloader`, saved to `filesDir/vosk-model`); optional extra `vosk-model-small-hi-0.22`.
- `N/nox/webrtc/NoxAudioChunker.kt` implements WebRTC `AudioTrackSink`: downmix to mono, buffer the
  caller's audio into **turns**: flush on `>= 1.1 s` of silence (RMS < 0.015) once `>= 800 ms` is
  buffered, or at `12 s` max. Each turn is decoded **as a self-contained utterance**
  (`acceptWaveForm` then `finalResult`), not streamed.
- Multi-language by confidence: each chunk is decoded by English and every installed extra model; the
  extra language wins only if its mean word confidence exceeds English's by `> 0.05` (English keeps
  near-ties because most calls are English).
- Rate bug worth remembering: WebRTC delivers 48 kHz; Vosk does not resample ("Sampling frequency
  mismatch" then garbage). Always downsample to the model's 16 kHz first.
- Concurrency bug worth remembering: Vosk `Model`/`Recognizer` are native handles; `close()` racing an
  in-flight `acceptWaveForm` is a use-after-free (SIGSEGV, no Java stack). Guard all use and
  `release()` with one lock plus a `released` flag re-checked inside the lock.
- The verbatim text is shown immediately; AI enrichment is **fire-and-forget afterwards**
  (`summarizeNoxIntent` Cloud Function -> Groq, region `asia-south1`). Transcription never waits on the cloud.

### AI call summary (`N/callrecording/TranscriptSummarizer.java`)
After a call, saved transcript lines `{who, text}` are sent to the `summarizeTranscript` Firebase
callable (region `asia-south1`, anonymous auth, 30/user quota in `SummaryQuota`). The function holds
the Groq key, map-reduces long calls (summarise chunks, then the summaries) and returns
`{summary, keyPoints[], actionItems[], dates[]}`. This is the **only** cloud step in the whole flow,
and it is optional; live transcription and translation never touch it.

---

## 10. Gotchas that cost the original authors real time

- **16 KB page size**: old `libvosk.so` (<= 0.3.47) is unloadable on 16 KB-page devices; use 0.3.75+.
  Verify any native `.so` you add (`llvm-objdump`, `LOAD p_align` should be `2**14`).
- Native crashes are uncatchable once in the library; catch `Throwable` around every load and decode,
  and add the "loading sentinel" so a bad library cannot become a crash loop.
- Vosk hallucinates on noisy narrowband audio; the 0.5 word-confidence filter is not optional.
- Don't denoise before recognition; it hurts accuracy on every engine tested.
- Detect language from **voiced** audio (VAD), 3 s windows; 2 s was unreliable.
- Code-mixed Hindi/English flips detection window to window: require more confirmations to leave Hindi,
  add fatigue per switch, and never let the on-device recognizer self-switch while a watcher decides.
- Translate partials with a throttle and newest-only, or latency grows with every word spoken.
- Dedupe on language switch: replay audio into the new engine **and** retract the old engine's lines
  for that stretch, or the same sentence appears twice.
- Keep segment ids unique across engine swaps (offset them per generation).
- Persist checkpoints during the session, not only on stop; background killers will end the process.
- Don't download models during use; check readiness first and send the user to a setup screen.

---

## 11. File map (where to read the real code)

| Topic | File |
|---|---|
| Session orchestration, fallback order, split/mixed capture, translator wiring, checkpoints | `R/captions/LiveCaptionSession.java` |
| Streaming Vosk | `R/speech/StreamingTranscriber.java`, `ConfidentWords.java`, `SpeechGain.java` |
| Streaming Kroko (sherpa-onnx) | `R/speech/SherpaStreamingTranscriber.java`, `SherpaEngines.java`, `TelephonyFrontEnd.java` |
| Language ID + switching | `R/speech/NeuralAutoTranscriber.java`, `SherpaLanguageId.java`, `VoicedCollector.java`, `LanguageChoice.java`, `LanguageSwitchPolicy.java`, `LanguageWatch.java` |
| Vosk model race | `R/speech/AutoLanguageTranscriber.java`, `LanguageScorer.java` |
| Android system recognizer | `R/speech/SystemTranscriber.java`, `SystemSpeech.java`, `SystemSpeechRules.java` |
| Model catalogues / download / cache | `R/speech/SpeechLanguages.java`, `SpeechModels.java`, `NeuralModels.java`, `SpeechModelCache.java` |
| Translation | `R/translate/LiveTranslator.java`, `TranslationModels.java` |
| Readiness / defaults / prefs | `R/captions/CaptionReadiness.java`, `CaptionLanguages.java`, `CaptionPrefs.java` |
| Capture | `R/capture/CaptureHub.java`, `ShizukuCapture.java`, `ShellCaptureService.java`, `ScrcpyServer.java` |
| Transcript storage | `R/storage/Transcripts.java` |
| Control API contract | `NDial V5/.../recording/ICallRecorder.aidl`, `IRecorderClient.aidl`, `callrecording/RecorderContract.java` |
| NDial UI for captions | `N/callrecording/LiveCaptionsController.java`, `CompanionBridge.java`, `CaptionLanguageCatalog.java` |
| NOX Vosk path | `N/nox/webrtc/NoxVoskRecognizer.kt`, `NoxAudioChunker.kt`, `nox/NoxVoskModelDownloader.kt` |
| AI summary | `N/callrecording/TranscriptSummarizer.java`, `functions/index.js` (`summarizeTranscript`) |
