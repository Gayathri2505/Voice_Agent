import React, { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createSession, closeSession, flagHandoff, createCustomerInfo, saveChatTurn, saveGreeting } from './utils/supabaseService';
import './App.css';

const WEBHOOK_URL         = process.env.REACT_APP_WEBHOOK_URL;
const END_SESSION_WEBHOOK = process.env.REACT_APP_END_SESSION_WEBHOOK_URL;

// Greeting spoken at session start
const GREETING = "Hello! This is your assistant from AIS Glass. How can I help you today?";

// "Thinking" messages cycled while waiting > 5s for backend
const THINKING_MESSAGES = [
  "Just a moment, I'm checking on that information for you.",
  "Let me look that up for you, one moment please.",
  "I'm pulling up the details, bear with me for a second.",
];

// Min transcript length to treat as real speech (filters background noise)
const MIN_TRANSCRIPT_LENGTH = 3;

// Split text into sentences so TTS starts on sentence 1 immediately
function splitSentences(text) {
  if (!text) return [];
  return text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
}

// ─── Pulse Ring ───────────────────────────────────────────────────────────────
function PulseRing({ phase }) {
  return (
    <div className={`pulse-ring-wrap ${phase}`}>
      <div className="ring r1" />
      <div className="ring r2" />
      <div className="ring r3" />
    </div>
  );
}

// ─── Sound Wave Bars ──────────────────────────────────────────────────────────
function SoundWave({ active, color }) {
  return (
    <div className={`sound-wave ${active ? 'active' : ''}`} style={{ '--bar-color': color }}>
      {[0,1,2,3,4].map(i => (
        <div key={i} className="sw-bar" style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────
function MessageBubble({ role, text }) {
  return (
    <div className={`bubble ${role}`}>
      <div className="bubble-avatar">{role === 'user' ? 'U' : 'A'}</div>
      <div className="bubble-content">
        <span className="bubble-name">{role === 'user' ? 'You' : 'AIS Glass'}</span>
        <p>{text}</p>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [phase, setPhase]           = useState('idle');
  const [sessionId, setSessionId]   = useState(() => uuidv4());
  const [history, setHistory]       = useState([]);
  const [liveText, setLiveText]     = useState('');
  const [statusText, setStatusText] = useState('Press the button to start a conversation');

  const recognitionRef    = useRef(null);
  const audioPlayerRef    = useRef(new Audio());
  const voiceRef          = useRef(null);
  const mediaRecorderRef  = useRef(null);
  const streamRef         = useRef(null);
  const chunksRef         = useRef([]);
  const isProcessingRef   = useRef(false);
  const transcriptRef     = useRef('');
  const historyEndRef     = useRef(null);
  const silenceTimerRef   = useRef(null);
  const isListeningRef    = useRef(false);
  const vadRef            = useRef(null);
  const isAgentSpeaking   = useRef(false);
  const isSpeakingAborted = useRef(false);
  const thinkingTimerRef  = useRef(null); // fires "checking info" message after 5s
  const isThinkingRef     = useRef(false); // true while a thinking phrase is mid-speech
  const thinkingAbortRef  = useRef(false); // set to true to permanently stop thinking loop
  const thinkingIndexRef  = useRef(0);     // cycles through THINKING_MESSAGES

  // Supabase session tracking
  const sessionStartedAt = useRef(null);
  const handoffTriggered = useRef(false);
  const handoffReason    = useRef(null);

  // ── Voice init ──────────────────────────────────────────────────────────────
  const initVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    const preferred = [
      voices.find(v => v.name === 'Google UK English Female'),
      voices.find(v => v.name === 'Google US English Female'),
      voices.find(v => v.name === 'Google US English'),
      voices.find(v => v.name.toLowerCase().includes('female')),
      voices.find(v => v.lang === 'en-IN'),
      voices.find(v => v.lang === 'en-GB'),
      voices.find(v => v.lang === 'en-US'),
      voices.find(v => v.lang.startsWith('en')),
    ].find(Boolean);
    if (preferred) voiceRef.current = preferred;
    console.log('[TTS] Voice selected:', voiceRef.current?.name);
  };

  useEffect(() => {
    initVoice();
    window.speechSynthesis.onvoiceschanged = initVoice;
    return () => { window.speechSynthesis.cancel(); };
  }, []);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, liveText]);

  // ── Speak a single utterance ─────────────────────────────────────────────────
  const speakUtterance = (text) => new Promise((resolve) => {
    const utt = new SpeechSynthesisUtterance(text);
    if (voiceRef.current) utt.voice = voiceRef.current;
    utt.rate   = 1.15;
    utt.pitch  = 1.0;
    utt.volume = 1.0;
    utt.onend   = resolve;
    utt.onerror = resolve;
    window.speechSynthesis.speak(utt);
  });

  // ── Speak sentence-by-sentence ───────────────────────────────────────────────
  const speakText = async (text) => {
    window.speechSynthesis.cancel();
    isSpeakingAborted.current = false;
    const sentences = splitSentences(text);
    if (!sentences.length) return;
    for (const sentence of sentences) {
      if (isSpeakingAborted.current) break;
      await speakUtterance(sentence);
    }
  };

  // ── Utilities ────────────────────────────────────────────────────────────────
  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  // ── Thinking timer — fires after 5s of waiting for backend ──────────────────
  const startThinkingTimer = () => {
    clearThinkingTimer();
    thinkingAbortRef.current = false; // reset abort flag for this processing turn
    thinkingTimerRef.current = setTimeout(async () => {
      if (!isProcessingRef.current || thinkingAbortRef.current) return;
      const msg = THINKING_MESSAGES[thinkingIndexRef.current % THINKING_MESSAGES.length];
      thinkingIndexRef.current++;
      setStatusText(msg);
      isThinkingRef.current = true;
      await speakUtterance(msg);
      isThinkingRef.current = false;
      // Only reschedule if response still hasn't arrived AND not aborted
      if (!thinkingAbortRef.current && isProcessingRef.current) {
        startThinkingTimer();
      }
    }, 5000);
  };

  const clearThinkingTimer = () => {
    // Mark as aborted first — prevents the async callback from rescheduling
    thinkingAbortRef.current = true;
    if (thinkingTimerRef.current) {
      clearTimeout(thinkingTimerRef.current);
      thinkingTimerRef.current = null;
    }
    // If a thinking phrase is mid-speech, cut it off immediately
    if (isThinkingRef.current) {
      window.speechSynthesis.cancel();
      isThinkingRef.current = false;
    }
  };

  // ── VAD ─────────────────────────────────────────────────────────────────────
  const startVAD = (stream) => {
    stopVAD();
    const ctx      = new (window.AudioContext || window.webkitAudioContext)();
    const source   = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    // Raised threshold to reduce false triggers from background noise
    const THRESHOLD = 30;
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const vol = data.reduce((a, b) => a + b, 0) / data.length;
      if (isAgentSpeaking.current && vol > THRESHOLD) interruptAgent();
      vadRef.current.animFrame = requestAnimationFrame(tick);
    };
    vadRef.current = { ctx, animFrame: requestAnimationFrame(tick) };
  };

  const stopVAD = () => {
    if (vadRef.current) {
      cancelAnimationFrame(vadRef.current.animFrame);
      vadRef.current.ctx?.close().catch(() => {});
      vadRef.current = null;
    }
  };

  // ── Interrupt agent mid-speech ───────────────────────────────────────────────
  const interruptAgent = () => {
    if (!isAgentSpeaking.current) return;
    isAgentSpeaking.current   = false;
    isSpeakingAborted.current = true;

    // Stop both browser TTS and audio blob playback
    window.speechSynthesis.cancel();
    audioPlayerRef.current.pause();
    audioPlayerRef.current.src    = '';
    audioPlayerRef.current.onended = null; // prevent afterSpeak from firing
    audioPlayerRef.current.onerror = null;

    transcriptRef.current = '';
    chunksRef.current     = [];
    clearSilenceTimer();
    clearThinkingTimer();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }

    isListeningRef.current  = false;
    recognitionRef.current?.abort();
    isProcessingRef.current = false;

    setPhase('listening');
    setLiveText('');
    setStatusText('Listening — speak when ready');

    setTimeout(async () => {
      await startMicRecording();
      restartListening();
    }, 120);
  };

  // ── Speech recognition ───────────────────────────────────────────────────────
  const setupRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;
    const rec = new SpeechRecognition();
    rec.continuous     = true;
    rec.interimResults = true;
    rec.lang           = 'en-US';
    const SILENCE_MS   = 900; // slightly longer pause to reduce noise false-triggers

    rec.onresult = (e) => {
      let interim = '', final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      if (final) transcriptRef.current += final;
      setLiveText(transcriptRef.current + interim);
      clearSilenceTimer();
      if (!isProcessingRef.current) {
        silenceTimerRef.current = setTimeout(() => {
          const t = transcriptRef.current.trim();
          // Only send if transcript is long enough to be real speech
          // This filters out single-word background noise triggers
          if (t && t.length >= MIN_TRANSCRIPT_LENGTH) {
            recognitionRef.current?.stop();
          } else if (t) {
            // Too short — likely noise, discard and keep listening
            transcriptRef.current = '';
            setLiveText('');
          }
        }, SILENCE_MS);
      }
    };

    rec.onend = () => {
      isListeningRef.current = false;
      clearSilenceTimer();
      if (isProcessingRef.current) return;
      const transcript = transcriptRef.current.trim();
      if (transcript && transcript.length >= MIN_TRANSCRIPT_LENGTH) {
        sendToBackend(transcript);
      } else {
        // Discard short/noise transcript and keep listening
        transcriptRef.current = '';
        setLiveText('');
        restartListening();
      }
    };

    rec.onerror = (e) => {
      isListeningRef.current = false;
      if (e.error === 'no-speech') restartListening();
    };

    rec.onstart = () => { isListeningRef.current = true; };
    return rec;
  }, []);

  const restartListening = () => {
    if (!recognitionRef.current || isProcessingRef.current || isListeningRef.current) return;
    try { recognitionRef.current.start(); } catch (_) {}
  };

  // ── Mic recording ────────────────────────────────────────────────────────────
  const startMicRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    chunksRef.current = [];
    const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.start(200);
    mediaRecorderRef.current = mr;
    startVAD(stream);
  };

  const stopMicRecording = () => new Promise((resolve) => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
      resolve(new Blob(chunksRef.current, { type: 'audio/webm' }));
      return;
    }
    mediaRecorderRef.current.onstop = () => {
      resolve(new Blob(chunksRef.current, { type: 'audio/webm' }));
      chunksRef.current = [];
    };
    mediaRecorderRef.current.stop();
  });

  // ── Parse n8n response ───────────────────────────────────────────────────────
  const parseResponseText = (raw) => {
    if (!raw) return '';
    const trimmed = raw.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        return parsed.text || parsed.response || parsed.message || trimmed;
      } catch (_) {}
    }
    return trimmed;
  };

  // ── Play audio blob from n8n TTS ─────────────────────────────────────────────
  // Returns a Promise that resolves when audio finishes OR is interrupted.
  const playAudioBlob = (blob) => new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    audioPlayerRef.current.src = url;
    audioPlayerRef.current.onended = () => {
      URL.revokeObjectURL(url);
      audioPlayerRef.current.onended = null;
      audioPlayerRef.current.onerror = null;
      resolve();
    };
    audioPlayerRef.current.onerror = () => {
      URL.revokeObjectURL(url);
      audioPlayerRef.current.onended = null;
      audioPlayerRef.current.onerror = null;
      resolve(); // resolve even on error so flow continues
    };
    audioPlayerRef.current.play().catch(() => resolve());
  });

  // ── After speaking finishes (shared by both audio and text paths) ────────────
  const afterSpeak = async () => {
    // If VAD interrupted, isAgentSpeaking is already false — bail out
    if (!isAgentSpeaking.current) return;
    isAgentSpeaking.current = false;

    if (handoffTriggered.current) {
      // Small pause so user hears full response before session ends
      setTimeout(() => endCall(), 1200);
    } else {
      isProcessingRef.current = false;
      setPhase('listening');
      setStatusText('Listening — speak when ready');
      await startMicRecording();
      restartListening();
    }
  };

  // ── Send to n8n ──────────────────────────────────────────────────────────────
  // n8n can return EITHER:
  //   • JSON text  → Content-Type: application/json  → browser TTS
  //   • Audio blob → Content-Type: audio/*           → play directly
  // Handoff is signalled via X-Handoff: true header on either response type.
  const sendToBackend = async (transcript) => {
    isProcessingRef.current  = true;
    thinkingIndexRef.current = 0;
    setPhase('processing');
    setStatusText('Processing your request...');
    setHistory(prev => [...prev, { role: 'user', text: transcript }]);
    setLiveText('');
    transcriptRef.current = '';

    // Start thinking timer — speaks after 5s if backend is slow
    startThinkingTimer();

    const audioBlob = await stopMicRecording();
    const formData  = new FormData();
    formData.append('data', audioBlob, 'utterance.webm');
    formData.append('session_id', sessionId);
    formData.append('is_final', 'true');

    try {
      const res = await fetch(WEBHOOK_URL, { method: 'POST', body: formData });
      if (!res.ok) throw new Error(`Backend error ${res.status}`);

      // Stop thinking timer — real response arrived
      clearThinkingTimer();
      window.speechSynthesis.cancel(); // stop any in-progress thinking message

      // Check handoff header — works for both audio and text responses
      if (res.headers.get('X-Handoff') === 'true') {
        handoffTriggered.current = true;
        handoffReason.current    = res.headers.get('X-Handoff-Reason') || null;
        flagHandoff(sessionId, handoffReason.current).catch(() => {});
      }

      // Set speaking state before branching
      isAgentSpeaking.current = true;
      setPhase('speaking');
      setStatusText('AIS Glass is responding...');

      const contentType = res.headers.get('Content-Type') || '';

      if (contentType.includes('audio/') || contentType.includes('audio/*')) {
        // ── Path A: Audio blob from n8n TTS ────────────────────────────────────
        console.log('[Response] Audio blob received');

        // Debug: log ALL headers received — helps diagnose CORS expose issues
        console.log('[Response] All headers:');
        res.headers.forEach((value, key) => console.log(`  ${key}: ${value}`));

        const rawHeader = res.headers.get('x-response-text') || '';
        console.log('[Response] X-Response-Text:', rawHeader);

        let responseText = '';
        try {
          responseText = rawHeader ? decodeURIComponent(rawHeader) : '';
        } catch (_) {
          responseText = rawHeader;
        }

        const blob = await res.blob();

        const displayText = responseText || '[Audio response]';
        setHistory(prev => [...prev, { role: 'assistant', text: displayText }]);

        saveChatTurn(sessionId, transcript, displayText)
          .catch(err => console.warn('[Supabase] saveChatTurn failed:', err.message));

        await playAudioBlob(blob);
        await afterSpeak();

      } else {
        // ── Path B: JSON text → browser TTS ────────────────────────────────────
        console.log('[Response] JSON text received');
        const rawText      = await res.text();
        const responseText = parseResponseText(rawText);

        // Show in chat immediately
        if (responseText) {
          setHistory(prev => [...prev, { role: 'assistant', text: responseText }]);
        }

        saveChatTurn(sessionId, transcript, responseText)
          .catch(err => console.warn('[Supabase] saveChatTurn failed:', err.message));

        await speakText(responseText || 'Sorry, I could not get a response.');
        await afterSpeak();
      }

    } catch (err) {
      clearThinkingTimer();
      console.error('[sendToBackend]', err);
      setStatusText('Something went wrong. Please try again.');
      isProcessingRef.current = false;
      isAgentSpeaking.current = false;
      setPhase('listening');
      await startMicRecording();
      restartListening();
    }
  };

  // ── Start call ───────────────────────────────────────────────────────────────
  const startCall = async () => {
    setHistory([]);
    setLiveText('');
    transcriptRef.current    = '';
    handoffTriggered.current = false;
    handoffReason.current    = null;
    thinkingIndexRef.current = 0;

    const rec = setupRecognition();
    if (!rec) { alert('Speech recognition not supported. Please use Chrome.'); return; }
    recognitionRef.current = rec;

    sessionStartedAt.current = new Date();

    // Fire-and-forget Supabase — don't block call start
    // Promise.all([
    //   createSession(sessionId),
    //   createCustomerInfo(sessionId),
    // ]).catch(err => console.warn('[Supabase] Session init failed:', err.message));

    createSession(sessionId)
      .then(() => createCustomerInfo(sessionId))
      .catch(err => console.warn('[Supabase] Session init failed:', err.message));

    await startMicRecording();
    rec.start();

    // Speak greeting immediately, then start listening
    setPhase('speaking');
    setStatusText('AIS Glass is greeting you...');
    isAgentSpeaking.current = false; // don't allow VAD interrupt during greeting

    await speakText(GREETING);

    // Save greeting to chat history
    setHistory([{ role: 'assistant', text: GREETING }]);
    saveGreeting(sessionId, GREETING)
      .catch(err => console.warn('[Supabase] saveGreeting failed:', err.message));

    setPhase('listening');
    setStatusText('Listening — speak when ready');
  };

  // ── End call ─────────────────────────────────────────────────────────────────
  const endCall = async () => {
    clearThinkingTimer();

    if (sessionStartedAt.current) {
      closeSession(sessionId, {
        startedAt:        sessionStartedAt.current,
        handoffTriggered: handoffTriggered.current,
        handoffReason:    handoffReason.current,
        metadata:         { turn_count: history.length },
      }).catch(err => console.warn('[Supabase] closeSession failed:', err.message));

      sessionStartedAt.current = null;

      fetch(END_SESSION_WEBHOOK, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ session_id: sessionId }),
      }).catch(err => console.warn('[Webhook] End-session failed:', err.message));
    }

    clearSilenceTimer();
    stopVAD();
    isAgentSpeaking.current   = false;
    isSpeakingAborted.current = true;
    recognitionRef.current?.abort();
    recognitionRef.current = null;

    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop();
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;

    audioPlayerRef.current.pause();
    audioPlayerRef.current.src = '';
    window.speechSynthesis.cancel();

    chunksRef.current        = [];
    isProcessingRef.current  = false;
    transcriptRef.current    = '';
    handoffTriggered.current = false;
    handoffReason.current    = null;

    setPhase('idle');
    setStatusText('Press the button to start a conversation');
    setLiveText('');
    setHistory([]);
    setSessionId(uuidv4());
  };

  const isActive = phase !== 'idle';

  const chipMeta = {
    idle:       { color: '#64748b', label: 'Standby'    },
    listening:  { color: '#0ea5e9', label: 'Listening'  },
    processing: { color: '#f59e0b', label: 'Processing' },
    speaking:   { color: '#10b981', label: 'Speaking'   },
  }[phase];

  return (
    <div className="app">
      <nav className="navbar">
        <div className="nav-brand">
          <div className="nav-dot" />
          <span className="nav-logo">AIS<b>Glass</b></span>
        </div>
        <span className="nav-badge">Voice Intelligence</span>
      </nav>

      <main className="main">
        <section className="left-panel">
          <div className="hero-text">
            <p className="eyebrow">Enterprise AI Assistant</p>
            <h1>Talk to your<br /><em>intelligent assistant</em></h1>
            <p className="hero-desc">
              AIS Glass listens, understands context, and responds with precision.
              No commands needed — just speak naturally.
            </p>
          </div>
          <div className="feature-list">
            {[
              { icon: '◎', label: 'Natural conversation', desc: 'No wake words or commands required' },
              { icon: '⬡', label: 'Context-aware',        desc: 'Remembers your full session history' },
              { icon: '◈', label: 'Auto-detection',       desc: 'Sends automatically when you finish speaking' },
            ].map(f => (
              <div key={f.label} className="feature-item">
                <span className="f-icon">{f.icon}</span>
                <div>
                  <strong>{f.label}</strong>
                  <p>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="right-panel">
          <div className="voice-card">
            <div className="card-header">
              <div>
                <span className="session-label">Session ID</span>
                <span className="session-id">{sessionId.slice(0, 8).toUpperCase()}</span>
              </div>
              <div className="status-chip" style={{ '--chip': chipMeta.color }}>
                <span className="chip-dot" />
                <span className="chip-text">{chipMeta.label}</span>
              </div>
            </div>

            <div className="orb-area">
              <PulseRing phase={phase} />
              <button
                className={`orb-btn ${phase}`}
                onClick={isActive ? undefined : startCall}
                disabled={isActive && phase === 'processing'}
                aria-label="Voice control"
              >
                {phase === 'idle'       && <MicIcon />}
                {phase === 'listening'  && <SoundWave active color="#0ea5e9" />}
                {phase === 'processing' && <SpinIcon />}
                {phase === 'speaking'   && <SoundWave active color="#10b981" />}
              </button>
            </div>

            <p className="status-text">{statusText}</p>

            {liveText && (
              <div className="live-transcript">
                <span className="live-label">● Live</span>
                <p>{liveText}<span className="cursor" /></p>
              </div>
            )}

            {history.length > 0 && (
              <div className="divider"><span>Conversation</span></div>
            )}

            {history.length > 0 && (
              <div className="chat-scroll">
                {history.map((msg, i) => (
                  <MessageBubble key={i} role={msg.role} text={msg.text} />
                ))}
                <div ref={historyEndRef} />
              </div>
            )}

            <div className="card-footer">
              {isActive
                ? <button className="btn-end"   onClick={endCall}  ><StopIcon /> End Session</button>
                : <button className="btn-start" onClick={startCall}><MicIcon  /> Start Session</button>
              }
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <span>© 2025 AIS Glass · Powered by Voice Intelligence</span>
        <span>Best experienced in Chrome</span>
      </footer>

      <audio ref={audioPlayerRef} />
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8"  y1="23" x2="16" y2="23"/>
    </svg>
  );
}
function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2"/>
    </svg>
  );
}
function SpinIcon() { return <div className="spin-ring" />; }