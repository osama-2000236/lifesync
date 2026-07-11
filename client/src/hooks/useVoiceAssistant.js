// Hands-free voice assistant loop, Gemini-app style. SEPARATE from the chat's
// push-to-talk mic (useVoice): this drives a full-screen conversational mode —
// continuous listening with live interim transcript, silence-based turn-taking,
// a mic-level signal for the reactive orb, and spoken replies, then auto-resumes
// listening. The orchestration (sending the utterance to the model) lives in the
// overlay; this hook owns the microphone, recognition, audio metering, and TTS.
import { useCallback, useEffect, useRef, useState } from 'react';
import { voiceAPI } from '../services/api';
import {
  chunkForSpeech, pickVoice, detectLang, speechLangTag, hasVoiceForLang, stripMarkdownForSpeech,
} from '../utils/speech';
import { attachBlobUrl, stopAndRevokeAudio } from '../utils/cloudAudio';

const SR = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

const SILENCE_MS = 1300; // pause after speech that finalizes a turn

// Native SR errors meaning "this engine can't do this language here" (Arabic
// on desktop Chrome). The loop then switches to the cloud engine: record the
// turn with MediaRecorder, detect the pause from the mic level meter, and
// transcribe via /api/voice/transcribe (server Whisper).
const NATIVE_FATAL = ['language-not-supported', 'network', 'service-not-allowed'];
const canRecord = () =>
  typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined';
// VAD thresholds against the 0..1 smoothed mic level (hysteresis).
const VOICE_START_LEVEL = 0.06;
const VOICE_KEEP_LEVEL = 0.035;
const MAX_TURN_MS = 30_000; // hard cap per recorded turn

/**
 * Decide what a cloud-STT transcribe failure does to the converse loop.
 * 501 = provider unconfigured → hard stop. A single transient failure (502
 * upstream flap, network blip) recycles the turn; repeated failures stop
 * honestly instead of looping a dead mic. Exported for unit tests.
 */
export const sttFailurePlan = (status, consecutiveFails) => {
  if (status === 501) return 'stt-unavailable';
  return consecutiveFails < 2 ? 'retry' : 'stt-failed';
};

/**
 * Map getUserMedia / MediaDevices failures to stable UI codes.
 * Exported for unit tests — browsers disagree on DOMException names.
 */
export const classifyMicError = (e, { isSecureContext } = {}) => {
  const secure = typeof isSecureContext === 'boolean'
    ? isSecureContext
    : (typeof window !== 'undefined' ? window.isSecureContext : true);
  if (secure === false) return 'mic-insecure';

  const name = String(e?.name || '');
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'mic-denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'mic-none';
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'mic-busy';
  if (name === 'SecurityError') return 'mic-insecure';
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') return 'mic-failed';

  const msg = String(e?.message || '').toLowerCase();
  if (msg.includes('permission') || msg.includes('not allowed') || msg.includes('denied')) {
    return 'mic-denied';
  }
  if (msg.includes('not found') || msg.includes('no device') || msg.includes('requested device')) {
    return 'mic-none';
  }
  if (msg.includes('could not start') || msg.includes('in use') || msg.includes('busy')) {
    return 'mic-busy';
  }
  if (msg.includes('secure') || msg.includes('https') || msg.includes('only secure')) {
    return 'mic-insecure';
  }
  return 'mic-failed';
};

export function useVoiceAssistant({ locale = 'en', onUtterance, onBargeIn } = {}) {
  // Native Web Speech OR cloud record→Whisper is enough to converse.
  // speechSynthesis is preferred for replies; cloud TTS covers Arabic gaps.
  const supported = Boolean(
    typeof window !== 'undefined'
    && (SR || (navigator.mediaDevices?.getUserMedia && canRecord())),
  );

  const [active, setActive] = useState(false);
  const [state, setState] = useState('idle'); // idle | listening | thinking | speaking
  const [transcript, setTranscript] = useState('');
  const [level, setLevel] = useState(0); // 0..1 mic amplitude for the orb
  const [error, setError] = useState(null);
  // True once we've had to speak a reply whose language has no local device
  // voice (Arabic on Windows/Chrome). The UI shows a hint; audio still plays via
  // cloud TTS when configured, else the browser reads it with its default voice.
  const [ttsVoiceMissing, setTtsVoiceMissing] = useState(false);

  const recRef = useRef(null);
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const rafRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const finalRef = useRef('');
  const voicesRef = useRef([]);
  // Language of the CURRENT turn: seeded from the UI locale, then re-detected
  // from each utterance so the user can switch languages mid-session and STT
  // (recognizer lang) + TTS (voice) follow. In a ref because the recognizer/TTS
  // callbacks close over stale state otherwise.
  const sessionLangRef = useRef(locale === 'ar' ? 'ar' : 'en');
  const smoothRef = useRef(0);
  const lastSetRef = useRef(0);
  // Live frequency bands for the audio-reactive orb ring. Mutated in place
  // every frame with ZERO React state — consumers (canvas) read it in their
  // own rAF loop.
  const bandsRef = useRef(new Float32Array(24));

  // Cache TTS voices (load async) so the first reply picks the right language
  // voice — Arabic especially, which often loads late.
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return undefined;
    const load = () => { voicesRef.current = window.speechSynthesis.getVoices() || []; };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);
  const activeRef = useRef(false);
  const onUtteranceRef = useRef(onUtterance);
  useEffect(() => { onUtteranceRef.current = onUtterance; }, [onUtterance]);
  const onBargeInRef = useRef(onBargeIn);
  useEffect(() => { onBargeInRef.current = onBargeIn; }, [onBargeIn]);
  const stateRef = useRef('idle');
  const setPhase = useCallback((s) => { stateRef.current = s; setState(s); }, []);

  // ─── Sentence-queue TTS (real-time): speaks each finished sentence as soon as
  // it arrives from the streaming reply, instead of waiting for the full text.
  const speechQueueRef = useRef([]);
  const speakingRef = useRef(false);
  const streamDoneRef = useRef(true);
  const bargeRecRef = useRef(null);
  // Cloud STT/TTS: STT is required for Arabic when the browser Web Speech engine
  // can't do ar-* (common on desktop Chrome). Without it we must NOT pretend the
  // mic is broken — show stt-unavailable instead of the generic mic error.
  const cloudSttRef = useRef(false);
  const cloudTtsRef = useRef(false);
  const cloudAudioRef = useRef(null);
  const speakViaCloudRef = useRef(() => {});
  // Rotate BCP-47 tags when the engine rejects the first Arabic tag.
  const srLangIdxRef = useRef(0);

  // Learn once whether server-side STT/TTS is available.
  useEffect(() => {
    let alive = true;
    voiceAPI.getConfig()
      .then((res) => {
        if (!alive) return;
        const cfg = res?.data?.data;
        cloudSttRef.current = Boolean(cfg?.stt?.cloud);
        cloudTtsRef.current = Boolean(cfg?.tts?.cloud);
      })
      .catch(() => { /* stay on browser engines */ });
    return () => { alive = false; };
  }, []);

  const stopCloudAudio = useCallback(() => {
    const a = cloudAudioRef.current;
    cloudAudioRef.current = null;
    // Must revoke blob: URLs on barge-in/stop — onended cleanup never runs if paused.
    stopAndRevokeAudio(a);
  }, []);

  // ─── Mic level metering (drives the orb) ───
  const startMeter = useCallback(async () => {
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      setError('mic-insecure');
      return false;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(window.isSecureContext === false ? 'mic-insecure' : 'mic-failed');
      return false;
    }

    let stream;
    try {
      // Try several constraint shapes — Windows drivers often reject the first.
      const attempts = [
        { audio: true },
        { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } },
        { audio: { deviceId: 'default' } },
      ];
      let lastErr = null;
      for (const c of attempts) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(c);
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
        }
      }
      // After a successful permission grant, labels appear — try each input.
      if (!stream) {
        try {
          const unlock = await navigator.mediaDevices.getUserMedia({ audio: true });
          unlock.getTracks().forEach((t) => t.stop());
        } catch (e) {
          throw lastErr || e;
        }
        const inputs = (await navigator.mediaDevices.enumerateDevices())
          .filter((d) => d.kind === 'audioinput' && d.deviceId);
        for (const d of inputs) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: { deviceId: { exact: d.deviceId } },
            });
            lastErr = null;
            break;
          } catch (err) {
            lastErr = err;
          }
        }
      }
      if (!stream) throw lastErr || new Error('No usable microphone');
    } catch (e) {
      setError(classifyMicError(e));
      return false;
    }

    streamRef.current = stream;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      if (ctx.state === 'suspended') { try { await ctx.resume(); } catch { /* ignore */ } }
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) sum += data[i];
        const avg = sum / data.length / 255; // 0..1
        smoothRef.current = smoothRef.current * 0.6 + avg * 0.4;
        // Downsample the spectrum into the ring's bands (in-place, no state).
        const bands = bandsRef.current;
        const per = Math.floor(data.length / bands.length) || 1;
        for (let b = 0; b < bands.length; b += 1) {
          let bs = 0;
          for (let j = 0; j < per; j += 1) bs += data[b * per + j] || 0;
          const v = bs / per / 255;
          bands[b] = bands[b] * 0.5 + v * 0.5;
        }
        // Throttle React state to ~20fps (orb has a CSS transition for smoothing)
        // so the overlay doesn't re-render 60×/sec.
        const now = performance.now();
        if (now - lastSetRef.current > 50) {
          lastSetRef.current = now;
          setLevel(Math.round(smoothRef.current * 100) / 100);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
      return true;
    } catch {
      // Mic stream is open; metering failed — still usable for cloud STT.
      return true;
    }
  }, []);

  const stopMeter = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    try { audioCtxRef.current?.close(); } catch { /* ignore */ }
    streamRef.current = null;
    audioCtxRef.current = null;
    setLevel(0);
  }, []);

  // ─── Cloud engine (record → server Whisper) ───
  // Chosen automatically when native SR proves broken for the locale; sticky
  // for the rest of the session so every turn doesn't re-fail first.
  const engineRef = useRef('native'); // 'native' | 'cloud'
  const cloudRecorderRef = useRef(null);
  const sttFailsRef = useRef(0); // consecutive cloud-STT failures (reset on success)
  const vadTimerRef = useRef(null);
  const startCloudTurnRef = useRef(() => {});
  const startListeningRef = useRef(() => {});

  const stopCloudTurn = useCallback(() => {
    if (vadTimerRef.current) { clearInterval(vadTimerRef.current); vadTimerRef.current = null; }
    const rec = cloudRecorderRef.current;
    cloudRecorderRef.current = null;
    try { if (rec && rec.state !== 'inactive') rec.stop(); } catch { /* ignore */ }
  }, []);

  const startCloudTurn = useCallback(() => {
    if (!activeRef.current || !streamRef.current || !canRecord()) return;
    stopCloudTurn();
    setTranscript('');
    const recorder = new window.MediaRecorder(streamRef.current);
    const chunks = [];
    let spoke = false;
    let lastVoice = 0;
    const startedAt = Date.now();

    recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    recorder.onstop = async () => {
      if (vadTimerRef.current) { clearInterval(vadTimerRef.current); vadTimerRef.current = null; }
      if (!activeRef.current) return;
      if (!spoke || chunks.length === 0) {
        // Nothing said — keep the loop alive.
        if (activeRef.current) startCloudTurnRef.current();
        return;
      }
      setPhase('thinking');
      try {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        // Arabic session → force language=ar so Whisper TRANSCRIBES (not
        // translates to English). English session → omit language for
        // auto-detect so a mid-session switch into Arabic still works.
        const sttHint = sessionLangRef.current === 'ar' ? 'ar' : undefined;
        const { data } = await voiceAPI.transcribe(blob, sttHint);
        sttFailsRef.current = 0;
        const text = String(data?.data?.text || '').trim();
        if (!activeRef.current) return;
        if (text) {
          const detected = detectLang(text, sessionLangRef.current);
          // If we forced ar STT, keep ar unless the transcript is clearly Latin prose
          // (user switched to English mid-session).
          const lang = sttHint === 'ar'
            ? (detected === 'en' && /[A-Za-z]{4,}/.test(text) && !/[\u0600-\u06FF]/.test(text) ? 'en' : 'ar')
            : detected;
          // Real-time AR↔EN: reset BCP-47 tag rotation when language flips.
          if (lang && lang !== sessionLangRef.current) srLangIdxRef.current = 0;
          sessionLangRef.current = lang || sessionLangRef.current;
          setTranscript(text);
          onUtteranceRef.current?.(text, sessionLangRef.current);
        } else if (activeRef.current) {
          startCloudTurnRef.current();
        }
      } catch (err) {
        // 501 = cloud STT not configured — not a microphone problem. One
        // transient flap (502 upstream, network) recycles the turn instead of
        // killing the whole session; repeated failures stop honestly.
        sttFailsRef.current += 1;
        const plan = sttFailurePlan(err?.response?.status, sttFailsRef.current);
        if (plan === 'retry' && activeRef.current) {
          startCloudTurnRef.current();
          return;
        }
        setError(plan);
        activeRef.current = false;
        setActive(false);
        setPhase('idle');
      }
    };

    cloudRecorderRef.current = recorder;
    setPhase('listening');
    try {
      recorder.start(250);
    } catch {
      // MediaRecorder failed (codec), not getUserMedia — still not "mic access".
      setError(cloudSttRef.current ? 'stt-failed' : 'stt-unavailable');
      return;
    }

    // Level-meter VAD: turn ends after SILENCE_MS of quiet following speech.
    vadTimerRef.current = setInterval(() => {
      if (!activeRef.current || cloudRecorderRef.current !== recorder) return;
      const now = Date.now();
      const level = smoothRef.current;
      if (level >= VOICE_START_LEVEL) { spoke = true; lastVoice = now; }
      else if (spoke && level >= VOICE_KEEP_LEVEL) { lastVoice = now; }
      const tooLong = now - startedAt > MAX_TURN_MS;
      const paused = spoke && now - lastVoice > SILENCE_MS;
      // A silent turn hitting the cap just recycles: onstop sees !spoke and
      // starts a fresh recorder, keeping memory bounded while idle.
      if (paused || tooLong) {
        cloudRecorderRef.current = null;
        try { if (recorder.state !== 'inactive') recorder.stop(); } catch { /* ignore */ }
        if (vadTimerRef.current) { clearInterval(vadTimerRef.current); vadTimerRef.current = null; }
      }
    }, 100);
  }, [setPhase, stopCloudTurn]);
  useEffect(() => { startCloudTurnRef.current = startCloudTurn; }, [startCloudTurn]);

  // ─── Recognition ───
  const clearSilence = () => { if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; };

  /** Candidate BCP-47 tags for the current turn language (Arabic needs fallbacks). */
  const srLangCandidates = (lang) => {
    if (lang === 'ar') return ['ar-SA', 'ar-EG', 'ar-AE', 'ar', 'ar-XA'];
    return [speechLangTag(lang), 'en-US', 'en'];
  };

  const startNativeListening = useCallback(() => {
    if (!SR || !activeRef.current) return;
    try { recRef.current?.abort(); } catch { /* ignore */ }
    finalRef.current = '';
    setTranscript('');
    const candidates = srLangCandidates(sessionLangRef.current);
    const langTag = candidates[Math.min(srLangIdxRef.current, candidates.length - 1)];
    const rec = new SR();
    rec.lang = langTag;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const txt = e.results[i][0]?.transcript || '';
        if (e.results[i].isFinal) finalRef.current += txt;
        else interim += txt;
      }
      setTranscript((finalRef.current + interim).trim());
      // Restart the silence timer on every chunk; fire when the user pauses.
      clearSilence();
      silenceTimerRef.current = setTimeout(() => {
        const utterance = (finalRef.current || interim).trim();
        if (utterance && activeRef.current) {
          try { rec.stop(); } catch { /* ignore */ }
          setPhase('thinking');
          // Re-detect language from what was said — mid-session AR↔EN switch.
          const lang = detectLang(utterance, sessionLangRef.current);
          if (lang && lang !== sessionLangRef.current) srLangIdxRef.current = 0;
          sessionLangRef.current = lang || sessionLangRef.current;
          onUtteranceRef.current?.(utterance, sessionLangRef.current);
        }
      }, SILENCE_MS);
    };
    rec.onerror = (e) => {
      if (e?.error === 'not-allowed') { setError('mic-denied'); return; }
      if (e?.error === 'audio-capture') {
        setError('mic-failed');
        return;
      }
      // Engine can't handle this language/network.
      if (NATIVE_FATAL.includes(e?.error) && activeRef.current) {
        clearSilence();
        try { rec.abort(); } catch { /* ignore */ }
        recRef.current = null;
        // Try next Arabic/English lang tag before giving up.
        if (srLangIdxRef.current < candidates.length - 1) {
          srLangIdxRef.current += 1;
          startListeningRef.current?.();
          return;
        }
        // Only fall back to cloud when the server actually has STT configured.
        // Otherwise the UI used to show a fake "mic access" error (stt-failed → micError).
        if (cloudSttRef.current && canRecord()) {
          engineRef.current = 'cloud';
          srLangIdxRef.current = 0;
          startCloudTurnRef.current();
          return;
        }
        setError('stt-unavailable');
        activeRef.current = false;
        setActive(false);
        setPhase('idle');
      }
      // 'no-speech'/'aborted' are benign in a continuous loop.
    };
    rec.onend = () => {
      // If we're still meant to be listening (not thinking/speaking), restart.
      if (activeRef.current && stateRef.current === 'listening' && engineRef.current === 'native' && recRef.current === rec) {
        try { rec.start(); } catch { /* ignore */ }
      }
    };
    recRef.current = rec;
    setPhase('listening');
    try { rec.start(); } catch { /* ignore */ }
  }, [setPhase]);

  // Engine dispatcher: every "resume listening" goes through here.
  const startListening = useCallback(() => {
    if (!activeRef.current) return;
    if (engineRef.current === 'cloud') startCloudTurnRef.current();
    else startListeningRef.current();
  }, []);
  useEffect(() => { startListeningRef.current = startNativeListening; }, [startNativeListening]);

  // ─── Barge-in: while the assistant is speaking, a separate recognizer listens
  // for the user starting to talk. On detection it cuts the reply short and
  // hands control back to the normal listening loop (Gemini-app style interrupt).
  const stopBargeListener = useCallback(() => {
    const rec = bargeRecRef.current;
    bargeRecRef.current = null;
    try { rec?.abort(); } catch { /* ignore */ }
  }, []);

  const startBargeListener = useCallback(() => {
    // Barge-in rides on native SR; in cloud mode the reply just plays out and
    // the record loop resumes right after.
    if (!SR || !activeRef.current || engineRef.current === 'cloud') return;
    stopBargeListener();
    const rec = new SR();
    rec.lang = speechLangTag(sessionLangRef.current);
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      const last = e.results[e.results.length - 1];
      const txt = (last?.[0]?.transcript || '').trim();
      if (txt.length < 3) return;
      stopBargeListener();
      try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
      stopCloudAudio();
      speechQueueRef.current = [];
      speakingRef.current = false;
      streamDoneRef.current = true;
      onBargeInRef.current?.();
      if (activeRef.current) startListening();
    };
    rec.onerror = () => { /* benign in a best-effort listener */ };
    rec.onend = () => {
      if (activeRef.current && stateRef.current === 'speaking' && bargeRecRef.current === rec) {
        try { rec.start(); } catch { /* ignore */ }
      }
    };
    bargeRecRef.current = rec;
    try { rec.start(); } catch { /* ignore */ }
  }, [stopBargeListener, startListening, stopCloudAudio]);

  // Speaks the queue sequentially; resumes listening once it's drained AND the
  // caller has signaled no more chunks are coming (finishSpeechStream). Recurses
  // through a ref (not its own name) so the self-call doesn't reference the
  // `const` binding before it's fully assigned.
  const drainQueueImplRef = useRef(() => {});
  useEffect(() => {
    drainQueueImplRef.current = () => {
      if (speakingRef.current || !activeRef.current) return;
      const next = speechQueueRef.current.shift();
      if (!next) {
        stopBargeListener();
        if (streamDoneRef.current && activeRef.current) startListening();
        return;
      }
      speakingRef.current = true;
      setPhase('speaking');
      if (!bargeRecRef.current) startBargeListener(); // keep one barge listener alive across the whole speaking turn, not per-sentence
      // Speak in the language of THIS chunk (the reply mirrors the user), so an
      // Arabic reply gets an Arabic voice even when the app UI is English.
      const lang = detectLang(next, sessionLangRef.current);
      const pool = voicesRef.current.length ? voicesRef.current : (window.speechSynthesis.getVoices() || []);
      const advance = () => { speakingRef.current = false; drainQueueImplRef.current(); };
      const speakWithBrowser = () => {
        try {
          const u = new SpeechSynthesisUtterance(next);
          u.lang = speechLangTag(lang);
          const voice = pickVoice(pool, lang);
          if (voice) u.voice = voice;
          u.onend = advance;
          u.onerror = advance;
          window.speechSynthesis.speak(u);
        } catch { advance(); }
      };
      // No local device voice for this language (Arabic on Windows/Chrome has
      // none) → the browser would read it with the wrong voice or stay silent.
      // Use cloud TTS when configured; otherwise flag it so the UI can hint.
      if (!hasVoiceForLang(pool, lang)) {
        if (cloudTtsRef.current) { speakViaCloudRef.current(next, lang, advance, speakWithBrowser); return; }
        setTtsVoiceMissing(true);
      }
      speakWithBrowser();
    };
  }, [locale, setPhase, startListening, startBargeListener, stopBargeListener]);
  const drainQueue = useCallback(() => drainQueueImplRef.current(), []);

  // Cloud TTS: fetch synthesized audio and play it, calling done() when it ends.
  // On any failure (incl. 501 = provider unconfigured) fall back to the browser
  // voice for this chunk and stop reaching for cloud the rest of the session.
  useEffect(() => {
    speakViaCloudRef.current = (text, lang, done, fallback) => {
      let settled = false;
      const finish = (fn) => { if (!settled) { settled = true; fn(); } };
      // Drop any previous cloud clip before starting a new one (queue drain).
      stopAndRevokeAudio(cloudAudioRef.current);
      cloudAudioRef.current = null;
      voiceAPI.speak(text, lang)
        .then((res) => {
          if (!activeRef.current) { finish(done); return; }
          const url = URL.createObjectURL(res.data);
          const audio = attachBlobUrl(new Audio(url), url);
          cloudAudioRef.current = audio;
          const cleanup = () => {
            stopAndRevokeAudio(audio);
            if (cloudAudioRef.current === audio) cloudAudioRef.current = null;
          };
          audio.onended = () => { cleanup(); finish(done); };
          audio.onerror = () => { cleanup(); finish(fallback); };
          audio.play().catch(() => { cleanup(); finish(fallback); });
        })
        .catch((err) => {
          if (err?.response?.status === 501) cloudTtsRef.current = false;
          finish(fallback);
        });
    };
  }, []);

  // Enqueue one finished sentence/chunk for speech (called as the reply streams in).
  const enqueueSpeech = useCallback((text) => {
    // Strip markdown once here so chat deltas don't get read as "asterisk asterisk".
    const t = stripMarkdownForSpeech(text);
    if (!t || !activeRef.current) return;
    // Chunk under Chrome's ~200-char utterance cutoff; shorter utterances also
    // make barge-in cuts feel snappier.
    speechQueueRef.current.push(...chunkForSpeech(t));
    streamDoneRef.current = false;
    drainQueue();
  }, [drainQueue]);

  // Signal that no more chunks are coming for this turn — resumes listening
  // once whatever is queued finishes speaking.
  const finishSpeechStream = useCallback(() => {
    streamDoneRef.current = true;
    if (!speakingRef.current && speechQueueRef.current.length === 0 && activeRef.current) {
      stopBargeListener();
      startListening();
    }
  }, [startListening, stopBargeListener]);

  // Back-compat single-shot speak (BERT path / error messages): one chunk, done.
  const speak = useCallback((text) => {
    if (!text || !activeRef.current) return;
    enqueueSpeech(text);
    finishSpeechStream();
  }, [enqueueSpeech, finishSpeechStream]);

  const start = useCallback(async () => {
    if (!supported) { setError('unsupported'); return; }
    if (activeRef.current) return; // guard against double-start (StrictMode / re-open)
    setError(null);
    srLangIdxRef.current = 0;
    sttFailsRef.current = 0;
    // Arabic on desktop Web Speech is usually broken — go straight to cloud
    // Whisper with language=ar so we don't spend a failed native cycle first.
    // English keeps native when available (fast + free).
    if (!SR) {
      if (cloudSttRef.current && canRecord()) engineRef.current = 'cloud';
      else {
        setError('stt-unavailable');
        return;
      }
    } else if (sessionLangRef.current === 'ar' && cloudSttRef.current && canRecord()) {
      engineRef.current = 'cloud';
    } else {
      engineRef.current = 'native';
    }
    activeRef.current = true;
    setActive(true);
    const micOk = await startMeter();
    if (!micOk) {
      // No microphone → don't pretend to listen; surface the error + retry UX.
      activeRef.current = false;
      setActive(false);
      setPhase('idle');
      return;
    }
    startListening();
  }, [supported, startMeter, startListening, setPhase]);

  // Retry the native engine when the UI language changes — it may work for the
  // new locale even if it was broken for the previous one — and re-seed the
  // turn language so the next utterance starts from the user's new UI choice.
  useEffect(() => {
    engineRef.current = 'native';
    sessionLangRef.current = locale === 'ar' ? 'ar' : 'en';
    srLangIdxRef.current = 0;
  }, [locale]);

  const stop = useCallback(() => {
    activeRef.current = false;
    clearSilence();
    stopCloudTurn();
    try { recRef.current?.abort(); } catch { /* ignore */ }
    stopBargeListener();
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    stopCloudAudio();
    speechQueueRef.current = [];
    speakingRef.current = false;
    streamDoneRef.current = true;
    stopMeter();
    setTranscript('');
    setPhase('idle');
    setActive(false);
  }, [stopMeter, setPhase, stopBargeListener, stopCloudTurn, stopCloudAudio]);

  useEffect(() => () => { stop(); }, [stop]);

  return {
    supported, active, state, transcript, level, error, ttsVoiceMissing, bandsRef,
    start, stop, speak, enqueueSpeech, finishSpeechStream, setPhase,
  };
}
