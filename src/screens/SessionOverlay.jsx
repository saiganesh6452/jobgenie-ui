import { useState, useEffect, useRef, useCallback } from 'react';
const { ipcRenderer } = window.require('electron');

const THEMES = {
  light: {
    bg:          (a) => `rgba(255,255,255,${a})`,
    surface:     'rgba(248,248,247,0.95)',
    surface2:    'rgba(240,240,238,0.95)',
    border:      'rgba(220,220,217,0.9)',
    text:        '#1a1a18',
    text2:       '#5a5a54',
    text3:       '#9a9a94',
    accent:      '#16a34a',
    accentBg:    'rgba(22,163,74,0.10)',
    blue:        '#2563eb',
    blueBg:      'rgba(37,99,235,0.09)',
    red:         '#dc2626',
    redBg:       'rgba(220,38,38,0.09)',
    btnHover:    'rgba(0,0,0,0.05)',
    pill:        '#18181b',
    pillText:    '#ffffff',
    pillBorder:  '#27272a',
  },
  dark: {
    bg:          (a) => `rgba(16,16,20,${a})`,
    surface:     'rgba(26,26,32,0.97)',
    surface2:    'rgba(36,36,44,0.97)',
    border:      'rgba(255,255,255,0.08)',
    text:        '#ffffff',
    text2:       '#c0c0ba',
    text3:       '#707070',
    accent:      '#22c55e',
    accentBg:    'rgba(34,197,94,0.12)',
    blue:        '#60a5fa',
    blueBg:      'rgba(96,165,250,0.12)',
    red:         '#f87171',
    redBg:       'rgba(248,113,113,0.12)',
    btnHover:    'rgba(255,255,255,0.07)',
    pill:        '#27272a',
    pillText:    '#ffffff',
    pillBorder:  '#3f3f46',
  },
};

export default function SessionOverlay() {
  const [transcript,   setTranscript]   = useState([]);
  const [interim,      setInterim]      = useState({ system: '', mic: '' });
  const [answers,      setAnswers]      = useState([]);
  const answersRef     = useRef([]);  // ← mirrors answers state; survives re-renders

  // Safe setter — always updates both ref and state together
  const pushAnswer     = useCallback((fn) => {
    setAnswers(prev => {
      const next = fn(prev);
      answersRef.current = next;
      return next;
    });
  }, []);
  const [streaming,    setStreaming]    = useState(false);
  const [autoMode,     setAutoMode]    = useState(true);
  const [speechStatus, setSpeechStatus] = useState('starting');
  const [errorMsg,     setErrorMsg]    = useState('');
  const [showConvo,    setShowConvo]   = useState(true);
  const [sessionId,    setSessionId]   = useState(null);
  const [shareUrl,     setShareUrl]    = useState('');
  const [copied,       setCopied]      = useState(false);
  const [barHidden,    setBarHidden]   = useState(false);
  const [capturing,    setCapturing]   = useState(false);
  const [captureOnly,  setCaptureOnly] = useState(false);

  const [manualInput,  setManualInput]  = useState('');
  const [showInput,    setShowInput]    = useState(false);
  const inputRef = useRef(null);

  const [opacity, setOpacity] = useState(0.92);
  useEffect(() => {
    ipcRenderer.invoke('settings-get-opacity')
      .then(r => { if (r?.opacity != null) setOpacity(Number(r.opacity)); })
      .catch(() => {});
    const handler = (_, { opacity: v }) => setOpacity(Number(v));
    ipcRenderer.on('opacity-updated', handler);
    return () => ipcRenderer.removeListener('opacity-updated', handler);
  }, []);

  const [theme, setTheme] = useState('light');
  useEffect(() => {
    ipcRenderer.invoke('settings-get-theme')
      .then(r => { if (r?.theme) setTheme(r.theme); })
      .catch(() => {});
    const handler = (_, { theme: t }) => setTheme(t);
    ipcRenderer.on('theme-updated', handler);
    return () => ipcRenderer.removeListener('theme-updated', handler);
  }, []);

  const tk = THEMES[theme] ?? THEMES.light;

  const txRef        = useRef(null);
  const ansRef       = useRef(null);
  const autoRef      = useRef(true);
  const readyRef     = useRef(false);
  const lastSentRef  = useRef('');
  const lastQRef     = useRef('');
  const sysRecRef    = useRef(null);
  const micRecRef    = useRef(null);
  const stoppingRef  = useRef(false);
  const curAnsRef    = useRef('');
  const sessionIdRef = useRef(null);
  const transcriptRef = useRef([]);
  const interimRef   = useRef({ system: '', mic: '' });
  // ── NEW: token refresh timer ref ─────────────────────────────────────────
  const tokenTimerRef = useRef(null);
  // ── Reconnect cooldown — prevents 429 spam on Azure ──────────────────────
  const lastReconnectRef = useRef(0);

  useEffect(() => { autoRef.current = autoMode; }, [autoMode]);

  useEffect(() => {
    if (showInput) {
      ipcRenderer.send('set-session-window-focusable', true);
      // Temporarily show cursor when typing
      ipcRenderer.send('session-cursor-visible', true);
      setTimeout(() => { if (inputRef.current) inputRef.current.focus(); }, 150);
    } else {
      ipcRenderer.send('set-session-window-focusable', false);
      // Hide cursor again when done typing
      ipcRenderer.send('session-cursor-visible', false);
    }
  }, [showInput]);

  const updSid = useCallback(id => {
    if (!id) return;
    sessionIdRef.current = id;
    setSessionId(id);
  }, []);

  const signalReady = useCallback(() => {
    if (!readyRef.current) {
      readyRef.current = true;
      ipcRenderer.send('session-window-speech-ready');
    }
  }, []);

  const sendQuestion = useCallback(text => {
    const q = (text || '').trim();
    if (!q || q === lastSentRef.current) return;
    lastSentRef.current = q;
    lastQRef.current    = q;
    ipcRenderer.invoke('session-send-event', 'question', { content: q });
  }, []);

  const addEntry = useCallback((text, speaker) => {
    lastQRef.current    = text;
    lastSentRef.current = '';
    setTranscript(p => {
      const next = [...p, {
        id:   Date.now() + Math.random(),
        text, speaker,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }];
      transcriptRef.current = next;
      return next;
    });
  }, []);

  // ── Azure speech ──────────────────────────────────────────────────────────
  const buildRec = useCallback(async (SDK, audioCfg, label) => {
    const sc = await ipcRenderer.invoke('get-speech-config');
    if (!sc?.token || !sc?.region) throw new Error('Bad speech config');
    const cfg = SDK.SpeechConfig.fromAuthorizationToken(sc.token, sc.region);
    cfg.speechRecognitionLanguage = 'en-US';
    const rec = new SDK.SpeechRecognizer(cfg, audioCfg);
    rec.recognizing = (_, e) => {
      if (e.result.reason === SDK.ResultReason.RecognizingSpeech) {
        interimRef.current = { ...interimRef.current, [label]: e.result.text };
        setInterim(p => ({ ...p, [label]: e.result.text }));
      }
    };
    rec.recognized = (_, e) => {
      interimRef.current = { ...interimRef.current, [label]: '' };
      setInterim(p => ({ ...p, [label]: '' }));
      if (e.result.reason === SDK.ResultReason.RecognizedSpeech) {
        const t = e.result.text?.trim();
        if (!t) return;
        const spk = label === 'system' ? 'interviewer' : 'you';
        lastQRef.current    = t;
        lastSentRef.current = '';
        addEntry(t, spk);
        if (label === 'system' && autoRef.current) setTimeout(() => sendQuestion(t), 300);
      }
    };
    // ── FIX: auto-reconnect with cooldown — prevents Azure 429 spam ──────
    rec.canceled = (_, e) => {
      if (stoppingRef.current) return;
      const now = Date.now();
      // Max one reconnect attempt every 15 seconds
      if (now - lastReconnectRef.current < 15000) {
        console.warn(`[${label}] canceled but cooldown active — skipping reconnect`);
        return;
      }
      lastReconnectRef.current = now;
      console.warn(`[${label}] canceled:`, e.errorDetails);
      setSpeechStatus('reconnecting');
      setTimeout(async () => {
        if (stoppingRef.current) return;
        try { rec.stopContinuousRecognitionAsync(() => {}, () => {}); } catch (_) {}
        await new Promise(r => setTimeout(r, 1000));
        if (!stoppingRef.current) startSpeech();
      }, 3000);
    };
    rec.sessionStopped = () => {
      if (stoppingRef.current) return;
      const now = Date.now();
      if (now - lastReconnectRef.current < 15000) {
        console.warn(`[${label}] sessionStopped but cooldown active — skipping reconnect`);
        return;
      }
      lastReconnectRef.current = now;
      console.warn(`[${label}] sessionStopped — reconnecting...`);
      setSpeechStatus('reconnecting');
      setTimeout(async () => {
        if (stoppingRef.current) return;
        await new Promise(r => setTimeout(r, 1000));
        if (!stoppingRef.current) startSpeech();
      }, 3000);
    };
    return rec;
  }, [addEntry, sendQuestion]);

  const startSpeech = useCallback(async () => {
    try {
      const SDK = window.require('microsoft-cognitiveservices-speech-sdk');
      try {
        const ds = await navigator.mediaDevices.getDisplayMedia({
          video: true, audio: { echoCancellation: false, noiseSuppression: false, sampleRate: 16000 },
        });
        ds.getVideoTracks().forEach(t => t.stop());
        const tracks = ds.getAudioTracks();
        if (!tracks.length) throw new Error('No system audio — tick "Share system audio"');
        const push = SDK.AudioInputStream.createPushStream();
        const ctx  = new AudioContext({ sampleRate: 16000 });
        const src  = ctx.createMediaStreamSource(new MediaStream(tracks));
        const proc = ctx.createScriptProcessor(4096, 1, 1);
        proc.onaudioprocess = e => {
          const f32 = e.inputBuffer.getChannelData(0);
          const i16 = new Int16Array(f32.length);
          for (let i = 0; i < f32.length; i++)
            i16[i] = Math.max(-32768, Math.min(32767, f32[i] * 32768));
          push.write(i16.buffer);
        };
        src.connect(proc); proc.connect(ctx.destination);
        const sr = await buildRec(SDK, SDK.AudioConfig.fromStreamInput(push), 'system');
        sysRecRef.current = sr;
        sr.startContinuousRecognitionAsync(() => {}, err => console.warn('[sys]', err));
      } catch (e) {
        setErrorMsg(`System audio: ${e.message}`);
      }
      const mr = await buildRec(SDK, SDK.AudioConfig.fromDefaultMicrophoneInput(), 'mic');
      micRecRef.current = mr;
      mr.startContinuousRecognitionAsync(
        () => { setSpeechStatus('listening'); setErrorMsg(''); signalReady(); },
        err  => { setSpeechStatus('error');   setErrorMsg(`Mic: ${err}`); signalReady(); },
      );

      // ── FIX: Refresh Azure token every 9 min (token expires at 10 min) ──
      if (tokenTimerRef.current) clearInterval(tokenTimerRef.current);
      tokenTimerRef.current = setInterval(async () => {
        if (stoppingRef.current) return;
        try {
          const sc = await ipcRenderer.invoke('get-speech-config');
          if (!sc?.token) return;
          if (sysRecRef.current) sysRecRef.current.authorizationToken = sc.token;
          if (micRecRef.current) micRecRef.current.authorizationToken = sc.token;
          console.log('[speech] Azure token refreshed');
        } catch (e) {
          console.warn('[speech] token refresh failed:', e.message);
        }
      }, 9 * 60 * 1000);

    } catch (e) {
      setSpeechStatus('error'); setErrorMsg(e.message); signalReady();
    }
  }, [buildRec, signalReady]);

  const stopAll = useCallback(() => {
    if (tokenTimerRef.current) { clearInterval(tokenTimerRef.current); tokenTimerRef.current = null; }
    [sysRecRef, micRecRef].forEach(r => {
      if (r.current) {
        try { r.current.stopContinuousRecognitionAsync(() => { r.current?.close(); r.current = null; }, () => { r.current = null; }); }
        catch (_) { r.current = null; }
      }
    });
  }, []);

  const captureScreen = useCallback(async qText => {
    let res;
    try {
      res = await ipcRenderer.invoke('capture-and-upload-screenshot');
    } catch (err) {
      setErrorMsg(`Screenshot IPC failed: ${err.message}`);
      return false;
    }
    if (!res?.success) {
      setErrorMsg(`Screenshot failed: ${res?.error || 'Unknown capture error'}`);
      return false;
    }
    const b64 = res.base64Image
      ?? (res.attachment?.previewUrl?.startsWith('data:')
          ? res.attachment.previewUrl.split(',')[1]
          : null);
    if (!b64) {
      setErrorMsg('Screenshot captured but no image data returned');
      return false;
    }
    try {
      await ipcRenderer.invoke('session-send-event', 'screen-capture', {
        image: b64,
        mediaType: 'image/jpeg',
        question: qText,
      });
    } catch (err) {
      setErrorMsg(`Failed to send screenshot: ${err.message}`);
      return false;
    }
    await new Promise(r => setTimeout(r, 400));
    setErrorMsg('');
    return true;
  }, []);

  const triggerCaptureOnly = useCallback(async () => {
    const qText = 'Analyze this screen and provide relevant assistance based on what you see';
    setCaptureOnly(true);
    setErrorMsg('');
    try {
      let res;
      try {
        res = await ipcRenderer.invoke('capture-and-upload-screenshot');
      } catch (err) {
        throw new Error(`Screenshot IPC failed: ${err.message}`);
      }

      if (!res?.success) throw new Error(res?.error || 'Unknown capture error');

      const b64 = res.base64Image
        ?? (res.attachment?.previewUrl?.startsWith('data:')
            ? res.attachment.previewUrl.split(',')[1]
            : null);

      if (!b64) throw new Error('Screenshot captured but no image data returned');

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          ipcRenderer.removeAllListeners('screen-analyzed-ack');
          reject(new Error('Screen analysis timed out'));
        }, 15000);

        ipcRenderer.once('screen-analyzed-ack', () => {
          clearTimeout(timeout);
          resolve();
        });

        ipcRenderer.invoke('session-send-event', 'screen-capture', {
          image: b64,
          mediaType: 'image/jpeg',
        }).catch(reject);
      });

      lastSentRef.current = '';
      sendQuestion(qText);

    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setCaptureOnly(false);
    }
  }, [sendQuestion]);

  const triggerAnswer = useCallback(async (overrideText) => {
    const interimText = interimRef.current?.system || interimRef.current?.mic || '';
    const qText = overrideText
      || lastQRef.current
      || transcriptRef.current?.slice(-1)[0]?.text
      || interimText
      || 'Please provide assistance based on the conversation so far';
    lastSentRef.current = '';
    sendQuestion(qText);
  }, [sendQuestion]);

  const submitManual = useCallback(async () => {
    const text = manualInput.trim();
    if (!text) return;
    addEntry(text, 'you');
    setManualInput('');
    setShowInput(false);
    await triggerAnswer(text);
  }, [manualInput, addEntry, triggerAnswer]);

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitManual(); }
    if (e.key === 'Escape') { setShowInput(false); setManualInput(''); ipcRenderer.send('set-session-window-focusable', false); }
  };

  const buildShareUrl = useCallback(async () => {
    try {
      let id = sessionIdRef.current;
      if (!id) {
        const s = await ipcRenderer.invoke('session-status');
        id = s?.sessionId;
      }
      if (id) setShareUrl(`http://localhost:3000/api/sessions/${id}/report`);
    } catch (_) {}
  }, []);

  useEffect(() => {
    stoppingRef.current = false;
    readyRef.current    = false;
    startSpeech();

    // ── Hide cursor — prevents mouse showing during screen share ──────────
    ipcRenderer.send('session-window-ready-for-cursor-hide');

    const onStart  = () => {
      curAnsRef.current = '';
      setStreaming(true);
      pushAnswer(p => [...p, { id: Date.now(), text: '', question: lastQRef.current }]);
    };
    const onAnswer = (_, d) => {
      curAnsRef.current += (d.delta || '');
      pushAnswer(p => {
        if (!p.length) return p;
        const u = [...p];
        u[u.length-1] = { ...u[u.length-1], text: curAnsRef.current };
        return u;
      });
      setStreaming(true);
    };
    const onEnd    = () => {
      setStreaming(false);
      curAnsRef.current   = '';
      lastSentRef.current = ''; // ← clear dedup so next question always goes through
    };
    const onTx = (_, d) => {
      const t = d.text || d.transcript || d.content || '';
      if (t.trim()) {
        lastQRef.current    = t.trim();
        lastSentRef.current = '';
        addEntry(t.trim(), 'interviewer');
      }
    };
    const onState  = (_, { type, payload }) => {
      if (type === 'SESSION_CONNECTING' || type === 'SESSION_STARTED') {
        const sid = payload?.sessionId || payload?.id || payload?._id;
        if (sid) updSid(sid);
        if (!sid) {
          ipcRenderer.invoke('session-status').then(s => { if (s?.sessionId) updSid(s.sessionId); }).catch(() => {});
        }
      }
      if (type === 'SESSION_STOPPED') buildShareUrl();
    };
    const onClean  = () => { stoppingRef.current = true; stopAll(); };

    ipcRenderer.on('session-response-start', onStart);
    ipcRenderer.on('session-answer',          onAnswer);
    ipcRenderer.on('session-response-end',    onEnd);
    ipcRenderer.on('transcript-update',       onTx);
    ipcRenderer.on('state-update',            onState);
    ipcRenderer.on('cleanup-speech-service',  onClean);

    return () => {
      stoppingRef.current = true; stopAll();
      // ── CRITICAL FIX: use exact handler refs, NOT removeAllListeners
      // removeAllListeners wipes every listener on the channel including
      // ones registered by other useEffects (opacity, theme) which causes
      // the answers panel to go blank mid-session
      ipcRenderer.removeListener('session-response-start', onStart);
      ipcRenderer.removeListener('session-answer',          onAnswer);
      ipcRenderer.removeListener('session-response-end',    onEnd);
      ipcRenderer.removeListener('transcript-update',       onTx);
      ipcRenderer.removeListener('state-update',            onState);
      ipcRenderer.removeListener('cleanup-speech-service',  onClean);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { txRef.current && (txRef.current.scrollTop = txRef.current.scrollHeight); }, [transcript, interim]);
  useEffect(() => {
    const el = ansRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (isNearBottom) el.scrollTop = el.scrollHeight;
  }, [answers]);

  // ── RECOVERY: if React state got wiped but ref still has answers, restore ──
  useEffect(() => {
    if (answers.length === 0 && answersRef.current.length > 0) {
      console.log('[ANSWERS] State wiped but ref has data — restoring', answersRef.current.length, 'answers');
      setAnswers(answersRef.current);
    }
  });

  const micColor        = speechStatus === 'listening' ? tk.accent : speechStatus === 'error' ? tk.red : speechStatus === 'reconnecting' ? '#f59e0b' : tk.text3;
  const interimTxt      = interim.system || interim.mic || '';
  const interimSpk      = interim.system ? 'interviewer' : 'you';
  const bgColor         = tk.bg(opacity);
  const answerTextColor = theme === 'dark' ? '#ffffff' : '#0f0f0d';
  const isCaptureSuccess = errorMsg.startsWith('📸');

  return (
    <div style={{
      width:'100%', height:'100%',
      background: bgColor,
      backdropFilter:'blur(24px)', WebkitBackdropFilter:'blur(24px)',
      border:`1px solid ${tk.border}`,
      borderRadius:10, overflow:'hidden',
      display:'flex', flexDirection:'column',
      boxShadow:`0 8px 32px rgba(0,0,0,${theme==='dark'?0.5:0.12}), 0 2px 8px rgba(0,0,0,${theme==='dark'?0.3:0.06})`,
      fontFamily:"'DM Sans', system-ui, sans-serif",
      color: tk.text,
    }}>

      {/* Header */}
      <div style={{
        height:42, borderBottom:`1px solid ${tk.border}`,
        display:'flex', alignItems:'center', padding:'0 10px', gap:6,
        flexShrink:0, WebkitAppRegion:'drag',
      }}>
        <div style={{ width:7, height:7, borderRadius:'50%', background:tk.accent, animation:'pulse 2s ease infinite', flexShrink:0 }} />
        <span style={{ fontSize:12.5, fontWeight:600, color:'#ffffff', letterSpacing:'-0.2px' }}>Live Session</span>

        <div style={{ display:'flex', alignItems:'center', gap:4, padding:'2px 7px', borderRadius:20, border:`1px solid ${tk.border}`, flexShrink:0 }}>
          <div style={{ width:5, height:5, borderRadius:'50%', background:micColor, animation: speechStatus==='listening' ? 'pulse 2s ease infinite' : 'none' }} />
          <span style={{ fontSize:10, color:'#a1a1aa', fontFamily:'DM Mono, monospace' }}>
            {speechStatus === 'listening' ? 'LIVE' : speechStatus === 'reconnecting' ? 'RETRY' : speechStatus === 'starting' ? '...' : 'ERR'}
          </span>
        </div>

        {sessionId && (
          <span style={{ fontSize:9.5, color:'#a1a1aa', fontFamily:'DM Mono, monospace', flexShrink:0 }}>#{sessionId.slice(0,8)}</span>
        )}

        <div style={{ flex:1, WebkitAppRegion:'drag' }} />

        <div style={{ display:'flex', alignItems:'center', gap:4, WebkitAppRegion:'no-drag' }}>
          <DarkBtn tk={tk} onClick={() => { ipcRenderer.send(barHidden ? 'show-main-window' : 'hide-main-window'); setBarHidden(h => !h); }}>
            {barHidden ? '👁 Bar' : '— Bar'}
          </DarkBtn>
          <DarkBtn tk={tk} onClick={() => setShowConvo(v => !v)}>
            {showConvo ? '◀ Hide' : 'Convo ▶'}
          </DarkBtn>
          <DarkBtn tk={tk} active={autoMode} activeColor='#22c55e' activeBg='rgba(34,197,94,0.18)' activeBorder='rgba(34,197,94,0.5)' onClick={() => setAutoMode(a => !a)}>
            ⚡ Auto {autoMode ? 'ON' : 'OFF'}
          </DarkBtn>
          <DarkBtn tk={tk} active={showInput} activeColor='#60a5fa' activeBg='rgba(96,165,250,0.18)' activeBorder='rgba(96,165,250,0.5)' onClick={() => setShowInput(v => !v)} title="Type a question manually">
            ✏️ Type
          </DarkBtn>
          <DarkActionBtn onClick={triggerCaptureOnly} disabled={captureOnly || capturing} bg='#3f3f46' hoverBg='#52525b' title="Capture screen without generating an answer">
            {captureOnly ? <><Spinner />&nbsp;Snap...</> : <>📸 Capture</>}
          </DarkActionBtn>
          <DarkActionBtn onClick={() => triggerAnswer()} disabled={captureOnly} bg='#2563eb' hoverBg='#1d4ed8' title="Send last question to AI for an answer">
            <>🖥️ Answer</>
          </DarkActionBtn>
        </div>
      </div>

      {/* Error banner */}
      {errorMsg && (
        <div style={{
          padding:'4px 12px',
          background: isCaptureSuccess ? 'rgba(22,163,74,0.12)' : tk.redBg,
          borderBottom:`1px solid ${tk.border}`,
          fontSize:10.5,
          color: isCaptureSuccess ? tk.accent : tk.red,
          flexShrink:0, display:'flex', alignItems:'center', gap:6,
        }}>
          <span style={{ flex:1 }}>{isCaptureSuccess ? errorMsg : `⚠ ${errorMsg}`}</span>
          <button onClick={() => setErrorMsg('')} style={{ background:'none', border:'none', color: isCaptureSuccess ? tk.accent : tk.red, cursor:'pointer', fontSize:12, padding:'0 2px' }}>✕</button>
        </div>
      )}

      {/* Manual input */}
      {showInput && (
        <div style={{
          padding:'8px 10px', borderBottom:`1px solid ${tk.border}`,
          background: theme==='dark' ? 'rgba(96,165,250,0.06)' : 'rgba(37,99,235,0.04)',
          display:'flex', gap:6, alignItems:'flex-end', flexShrink:0, animation:'fadeIn 0.15s ease',
        }}>
          <textarea ref={inputRef} value={manualInput} onChange={e => setManualInput(e.target.value)} onKeyDown={handleInputKeyDown}
            placeholder="Type a question and press Enter to get an AI answer..." rows={2}
            style={{ flex:1, resize:'none', background: theme==='dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', border:`1px solid ${tk.border}`, borderRadius:8, padding:'7px 10px', fontSize:12.5, fontFamily:'inherit', color:tk.text, outline:'none', lineHeight:1.5, WebkitAppRegion:'no-drag' }} />
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            <button onClick={submitManual} disabled={!manualInput.trim() || capturing}
              style={{ padding:'6px 14px', border:'none', borderRadius:8, background: manualInput.trim() ? '#2563eb' : '#3f3f46', color:'white', fontSize:11.5, fontWeight:500, fontFamily:'inherit', cursor: manualInput.trim() ? 'pointer' : 'default', opacity: manualInput.trim() ? 1 : 0.5, transition:'all 0.15s', whiteSpace:'nowrap' }}>
              🖥️ Ask
            </button>
            <button onClick={() => { setShowInput(false); setManualInput(''); }}
              style={{ padding:'4px 14px', border:`1px solid ${tk.border}`, borderRadius:8, background:'transparent', color:tk.text3, fontSize:11, fontFamily:'inherit', cursor:'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Share banner */}
      {shareUrl && (
        <div style={{ padding:'6px 12px', background:tk.accentBg, borderBottom:`1px solid ${tk.border}`, display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
          <span style={{ fontSize:11, color:tk.accent, fontWeight:500, flex:1 }}>✅ Session complete! Share report:</span>
          <span style={{ fontSize:10, color:tk.text3, fontFamily:'DM Mono, monospace', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{shareUrl}</span>
          <button onClick={() => { navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            style={{ padding:'2px 10px', border:`1px solid ${tk.accent}`, borderRadius:20, background: copied ? tk.accent : 'transparent', color: copied ? '#fff' : tk.accent, fontSize:11, fontFamily:'inherit', cursor:'pointer', flexShrink:0 }}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          <a href={shareUrl} target="_blank" rel="noreferrer"
            style={{ padding:'2px 9px', border:`1px solid ${tk.border}`, borderRadius:20, color:tk.text3, fontSize:11, fontFamily:'inherit', textDecoration:'none', flexShrink:0 }}>
            Open ↗
          </a>
        </div>
      )}

      {/* Body */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

        {/* Conversation */}
        {showConvo && (
          <div style={{ width:'36%', borderRight:`1px solid ${tk.border}`, display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ padding:'5px 10px', borderBottom:`1px solid ${tk.border}`, display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
              <span style={{ fontSize:10, fontWeight:600, color:'#ffffff', letterSpacing:'0.6px', textTransform:'uppercase' }}>Conversation</span>
              <span style={{ fontSize:9, color:'#a1a1aa', opacity:0.9 }}>
                <span style={{ color:tk.blue }}>■</span> them &nbsp;
                <span style={{ color:tk.accent }}>■</span> you
              </span>
            </div>
            <div ref={txRef} style={{ flex:1, overflowY:'auto', padding:'8px 10px', display:'flex', flexDirection:'column', gap:10 }}>
              {transcript.length === 0 && !interimTxt ? (
                <Empty color={tk.text3} label={speechStatus === 'listening' ? 'Listening...' : speechStatus === 'reconnecting' ? 'Reconnecting...' : 'Starting...'} icon="mic" />
              ) : (
                <>
                  {transcript.map(item => (
                    <div key={item.id} style={{ animation:'fadeIn 0.2s ease' }}>
                      <div style={{ fontSize:9.5, fontWeight:600, letterSpacing:'0.4px', textTransform:'uppercase', marginBottom:2, color: item.speaker === 'interviewer' ? tk.blue : tk.accent }}>
                        {item.speaker === 'interviewer' ? 'Interviewer' : 'You'} · {item.time}
                      </div>
                      <div style={{ fontSize:12.5, color:tk.text, lineHeight:1.6 }}>{item.text}</div>
                    </div>
                  ))}
                  {interimTxt && (
                    <div style={{ opacity:0.4 }}>
                      <div style={{ fontSize:9.5, fontWeight:600, letterSpacing:'0.4px', textTransform:'uppercase', marginBottom:2, color: interimSpk === 'interviewer' ? tk.blue : tk.accent }}>
                        {interimSpk === 'interviewer' ? 'Interviewer' : 'You'} · now
                      </div>
                      <div style={{ fontSize:12.5, color:tk.text, lineHeight:1.6, fontStyle:'italic' }}>{interimTxt}</div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* AI Answers */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ padding:'5px 10px', borderBottom:`1px solid ${tk.border}`, display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
            <span style={{ fontSize:10, fontWeight:600, color:'#ffffff', letterSpacing:'0.6px', textTransform:'uppercase', flex:1 }}>AI Answers</span>
            {streaming   && <div style={{ width:6, height:6, borderRadius:'50%', background:tk.blue, animation:'pulse 1s ease infinite' }} />}
            {(capturing || captureOnly) && <span style={{ fontSize:9.5, color:'#a1a1aa', fontFamily:'DM Mono, monospace' }}>📸 capturing...</span>}
          </div>
          <div ref={ansRef} style={{ flex:1, overflowY:'auto', padding:'10px 12px', display:'flex', flexDirection:'column', gap:0 }}>
            {answers.length === 0
              ? <Empty color={tk.text3} label="Answers appear here..." icon="chat" />
              : answers.map((item, idx) => (
                <div key={item.id} style={{
                  marginBottom: idx < answers.length-1 ? 10 : 0,
                  animation:'fadeIn 0.2s ease',
                  background: theme === 'light' ? 'rgba(255,255,255,0.88)' : 'rgba(12,12,18,0.88)',
                  backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)',
                  borderRadius:8, border:`1px solid ${tk.border}`, padding:'10px 12px',
                }}>
                  {item.question && (
                    <div style={{ fontSize:10, color:tk.blue, marginBottom:5, fontFamily:'DM Mono, monospace', fontWeight:600 }}>
                      Q: {item.question.length > 90 ? item.question.slice(0,90)+'…' : item.question}
                    </div>
                  )}
                  <div style={{ fontSize:13, color: answerTextColor, lineHeight:1.8, whiteSpace:'pre-wrap' }}>
                    {item.text}
                    {streaming && idx === answers.length-1 && (
                      <span style={{ display:'inline-block', width:2, height:14, background:tk.blue, marginLeft:3, verticalAlign:'middle', animation:'cursor 0.8s ease infinite' }} />
                    )}
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </div>

      <style>{`
        * { cursor: none !important; }
        @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes cursor { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes spin   { to{transform:rotate(360deg)} }
        textarea:focus { border-color: #60a5fa !important; box-shadow: 0 0 0 2px rgba(96,165,250,0.15); }
        textarea::placeholder { color: ${tk.text3}; }
      `}</style>
    </div>
  );
}

function DarkBtn({ tk, children, onClick, active, activeColor, activeBg, activeBorder, title }) {
  return (
    <button onClick={onClick} title={title} style={{
      padding:'3px 9px', border:`1px solid ${active && activeBorder ? activeBorder : '#52525b'}`,
      borderRadius:20, cursor:'pointer', fontFamily:'inherit', fontSize:11,
      background: active && activeBg ? activeBg : '#18181b',
      color: active && activeColor ? activeColor : '#ffffff',
      fontWeight: active ? 600 : 500, transition:'all 0.15s',
    }}>
      {children}
    </button>
  );
}

function DarkActionBtn({ children, onClick, disabled, bg, hoverBg, title }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        padding:'4px 12px', border:'none', borderRadius:20,
        background: disabled ? '#3f3f46' : hovered ? hoverBg : bg,
        color:'white', fontSize:11.5, fontWeight:500, fontFamily:'inherit',
        cursor: disabled ? 'default' : 'pointer',
        display:'flex', alignItems:'center', gap:5,
        transition:'all 0.15s', flexShrink:0, opacity: disabled ? 0.6 : 1,
      }}>
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" style={{ animation:'spin 0.8s linear infinite', flexShrink:0 }}>
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  );
}

function Empty({ color, label, icon }) {
  const path = icon === 'mic'
    ? 'M12 15c1.66 0 3-1.34 3-3V6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 15.2 14.47 17 12 17s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V21c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z'
    : 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z';
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:6, opacity:0.4 }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill={color}><path d={path}/></svg>
      <span style={{ fontSize:11, color }}>{label}</span>
    </div>
  );
}