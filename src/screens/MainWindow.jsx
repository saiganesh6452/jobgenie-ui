import { useState, useEffect } from 'react';
const { ipcRenderer } = window.require('electron');

const THEMES = {
  light: {
    bg:       'rgba(255,255,255,0.92)',
    border:   'rgba(220,220,217,0.9)',
    text:     '#1a1a18', text2: '#5a5a54', text3: '#9a9a94',
    accent:   '#16a34a', red: '#dc2626', redLight: 'rgba(220,38,38,0.09)',
    btnBg:    'rgba(0,0,0,0.04)', btnBorder: 'rgba(0,0,0,0.12)',
  },
  dark: {
    bg:       'rgba(16,16,20,0.95)',
    border:   'rgba(255,255,255,0.08)',
    text:     '#ffffff', text2: '#c0c0ba', text3: '#707070',
    accent:   '#22c55e', red: '#f87171', redLight: 'rgba(248,113,113,0.12)',
    btnBg:    'rgba(255,255,255,0.07)', btnBorder: 'rgba(255,255,255,0.15)',
  },
};

const fmt = (s) => String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');

export default function MainWindow() {
  const [recording, setRecording] = useState(false);
  const [elapsed,   setElapsed]   = useState(0);
  const [theme,     setTheme]     = useState('light');
  const tk = THEMES[theme] ?? THEMES.light;

  useEffect(() => {
    ipcRenderer.invoke('settings-get-theme').then(r => { if (r?.theme) setTheme(r.theme); }).catch(() => {});
    const h = (_, { theme: t }) => setTheme(t);
    ipcRenderer.on('theme-updated', h);
    return () => ipcRenderer.removeAllListeners('theme-updated');
  }, []);

  useEffect(() => {
    const onState = (_, { type }) => {
      if (type === 'SESSION_STOPPED') setRecording(false);
      if (type === 'SESSION_STARTED') setRecording(true);
    };
    ipcRenderer.on('state-update', onState);
    return () => ipcRenderer.removeAllListeners('state-update');
  }, []);

  useEffect(() => {
    let t;
    if (recording) { t = setInterval(() => setElapsed(e => e+1), 1000); } else { setElapsed(0); }
    return () => clearInterval(t);
  }, [recording]);

  const handleToggle = () => {
    if (recording) {
      ipcRenderer.invoke('session-stop');
    } else {
      // Open setup as a REAL popup window — fully focusable, no drag-region fighting
      ipcRenderer.send('open-setup-modal');
    }
  };

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', alignItems: 'center',
      background: tk.bg, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      border: `1px solid ${tk.border}`, borderRadius: 8,
      boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: '0 10px',
      WebkitAppRegion: 'drag', gap: 6,
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: recording ? tk.accent : tk.text3,
          boxShadow: recording ? `0 0 0 3px ${tk.accent}33` : 'none',
          animation: recording ? 'pulse 2s ease infinite' : 'none', flexShrink: 0,
        }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: tk.text, letterSpacing: '-0.2px', flexShrink: 0 }}>JobGenie</span>
        {recording && <span style={{ fontSize: 11, color: tk.text3, fontFamily: 'DM Mono, monospace', flexShrink: 0 }}>{fmt(elapsed)}</span>}
      </div>

      <span style={{ fontSize: 11, color: tk.text3, flexShrink: 0 }}>{recording ? 'Session active' : 'Ready'}</span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 5, WebkitAppRegion: 'no-drag', flexShrink: 0 }}>
        <button onClick={handleToggle} style={{
          padding: '4px 10px', background: recording ? tk.red : tk.accent,
          color: 'white', border: 'none', borderRadius: 5,
          fontSize: 11, fontWeight: 500, fontFamily: 'inherit',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <div style={{ width: 6, height: 6, background: 'white', borderRadius: recording ? 1 : '50%' }} />
          {recording ? 'Stop' : 'Start'}
        </button>

        <IconBtn tk={tk} title="Settings" onClick={() => ipcRenderer.send('open-settings-window')}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
          </svg>
        </IconBtn>

        <IconBtn tk={tk} title="Quit JobGenie" onClick={() => ipcRenderer.invoke('settings-quit-app')} danger>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><line x1="12" y1="2" x2="12" y2="12" />
          </svg>
        </IconBtn>
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}

function IconBtn({ tk, onClick, title, children, danger }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button onClick={onClick} title={title}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        width: 24, height: 24, borderRadius: 5,
        background: danger && hovered ? tk.redLight : hovered ? tk.btnBg : 'transparent',
        border: `1px solid ${danger && hovered ? tk.red : tk.btnBorder}`,
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: danger && hovered ? tk.red : tk.text3, transition: 'all 0.15s', flexShrink: 0,
      }}>
      {children}
    </button>
  );
}