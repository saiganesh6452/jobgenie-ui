import './styles/globals.css';
import { useState, useEffect } from 'react';
import LoginScreen from './screens/LoginScreen';
import MainWindow from './screens/MainWindow';
import SessionOverlay from './screens/SessionOverlay';
import SettingsScreen from './screens/SettingsScreen';
import SetupModal from './screens/SetupModal';
const { ipcRenderer } = window.require('electron');

function detectScreen() {
  const params = new URLSearchParams(window.location.search);
  const w = params.get('window');
  if (w === 'session')  return 'session';
  if (w === 'settings') return 'settings';
  if (w === 'setup')    return 'setup';
  return 'main';
}

export default function App() {
  const screen = detectScreen();
  const [authed, setAuthed] = useState(false);

  // ── Apply opacity from store on mount and on change ──────────────────────
  useEffect(() => {
    const applyOpacity = (opacity) => {
      document.documentElement.style.setProperty('--bg-opacity', opacity);
    };

    if (screen !== 'settings') {
      ipcRenderer.invoke('get-store-value', 'opacity')
        .then(v => { if (v != null) applyOpacity(v); })
        .catch(() => {});
    }

    ipcRenderer.on('opacity-updated', (_, { opacity }) => applyOpacity(opacity));
    return () => ipcRenderer.removeAllListeners('opacity-updated');
  }, [screen]);

  useEffect(() => {
    if (screen !== 'main') return;
    ipcRenderer.invoke('auth-check').then(s => setAuthed(!!s?.authenticated)).catch(() => {});
    ipcRenderer.on('auth-state-changed', (_, { authenticated }) => setAuthed(authenticated));
    return () => ipcRenderer.removeAllListeners('auth-state-changed');
  }, [screen]);

  // ── Setup popup window — fully focusable, no drag-region fighting ─────────
  if (screen === 'setup')    return <SetupModal />;
  if (screen === 'session')  return <SessionOverlay />;
  if (screen === 'settings') return <SettingsScreen />;
  if (!authed)               return <LoginScreen />;
  return <MainWindow />;
}