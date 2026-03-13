import { useState, useEffect } from 'react';
const { ipcRenderer } = window.require('electron');

const THEMES = {
  light: {
    bg:'#ffffff', bg2:'#f7f7f6', bg3:'#f0f0ee',
    border:'#e2e2df', border2:'#c8c8c4',
    text:'#1a1a18', text2:'#5a5a54', text3:'#9a9a94',
    accent:'#16a34a', accentBg:'rgba(22,163,74,0.09)',
    blue:'#2563eb', blueBg:'rgba(37,99,235,0.08)',
    red:'#dc2626', redBg:'rgba(220,38,38,0.08)',
    shadow:'0 4px 20px rgba(0,0,0,0.10)',
  },
  dark: {
    bg:'#111114', bg2:'#1c1c20', bg3:'#262630',
    border:'rgba(255,255,255,0.08)', border2:'rgba(255,255,255,0.13)',
    text:'#f0f0ec', text2:'#9a9a94', text3:'#555558',
    accent:'#22c55e', accentBg:'rgba(34,197,94,0.11)',
    blue:'#60a5fa', blueBg:'rgba(96,165,250,0.11)',
    red:'#f87171', redBg:'rgba(248,113,113,0.11)',
    shadow:'0 4px 24px rgba(0,0,0,0.50)',
  },
};

const PLAN_COLORS = {
  free:       { bg:'rgba(154,154,148,0.12)', text:'#9a9a94',  label:'Free'        },
  pro:        { bg:'rgba(37,99,235,0.10)',   text:'#2563eb',  label:'Pro'         },
  enterprise: { bg:'rgba(22,163,74,0.10)',   text:'#16a34a',  label:'Enterprise'  },
};

export default function SettingsScreen() {
  const [opacity,    setOpacity]    = useState(92);
  const [visibility, setVisibility] = useState('invisible');
  const [theme,      setTheme]      = useState('light');
  const [tab,        setTab]        = useState('general');
  const [saved,      setSaved]      = useState(false);

  const [account,        setAccount]       = useState(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError,   setAccountError]  = useState('');

  const tk = THEMES[theme] ?? THEMES.light;

  useEffect(() => {
    ipcRenderer.invoke('settings-get-opacity').then(r => { if (r?.opacity != null) setOpacity(Math.round(r.opacity * 100)); }).catch(() => {});
    ipcRenderer.invoke('settings-get-visibility').then(r => { if (r?.visibility) setVisibility(r.visibility); }).catch(() => {});
    ipcRenderer.invoke('settings-get-theme').then(r => { if (r?.theme) setTheme(r.theme); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab !== 'account') return;
    if (account) return;
    setAccountLoading(true);
    setAccountError('');
    ipcRenderer.invoke('auth-get-user')
      .then(user => {
        setAccount(user || null);
        if (!user) setAccountError('Not signed in');
      })
      .catch(err => setAccountError(err?.message || 'Failed to load account info'))
      .finally(() => setAccountLoading(false));
  }, [tab, account]);

  const save = async () => {
    await ipcRenderer.invoke('settings-save-opacity', opacity / 100);
    await ipcRenderer.invoke('settings-save-visibility', visibility);
    await ipcRenderer.invoke('settings-save-theme', theme);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleSignOut = async () => {
    try {
      await ipcRenderer.invoke('auth-logout');
      ipcRenderer.send('close-child-window', 'settings');
    } catch (err) {
      setAccountError(err?.message || 'Sign out failed');
    }
  };

  const closeSettings = () => ipcRenderer.send('close-child-window', 'settings');

  const label = () => ({ fontSize:11.5, fontWeight:500, color:tk.text2, marginBottom:8, display:'block' });
  const planInfo = PLAN_COLORS[account?.plan] ?? PLAN_COLORS.free;

  return (
    <div style={{ width:'100%', height:'100%', background:tk.bg, display:'flex', flexDirection:'column', border:`1px solid ${tk.border}`, borderRadius:10, overflow:'hidden', boxShadow:tk.shadow, fontFamily:"'DM Sans',system-ui,sans-serif", color:tk.text }}>

      {/* Title bar — with ✕ close button */}
      <div style={{ height:44, borderBottom:`1px solid ${tk.border}`, display:'flex', alignItems:'center', padding:'0 16px', flexShrink:0, WebkitAppRegion:'drag' }}>
        <span style={{ fontSize:13.5, fontWeight:600, color:tk.text }}>Settings</span>
        <div style={{ flex:1 }} />
        {/* Status dot */}
        <div style={{ width:8, height:8, borderRadius:'50%', background: theme==='dark' ? '#60a5fa' : '#16a34a', transition:'background 0.3s', marginRight:10 }} />
        {/* Close button */}
        <button
          onClick={closeSettings}
          title="Close settings"
          style={{
            width:24, height:24, borderRadius:6,
            background:'transparent', border:`1px solid ${tk.border}`,
            cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
            color:tk.text3, fontSize:13, fontFamily:'inherit',
            transition:'all 0.15s', WebkitAppRegion:'no-drag',
            lineHeight:1,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = tk.redBg; e.currentTarget.style.borderColor = tk.red; e.currentTarget.style.color = tk.red; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = tk.border; e.currentTarget.style.color = tk.text3; }}>
          ✕
        </button>
      </div>

      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>

        {/* Sidebar */}
        <div style={{ width:120, borderRight:`1px solid ${tk.border}`, padding:'8px 6px', display:'flex', flexDirection:'column', gap:2, flexShrink:0, background:tk.bg2 }}>
          {[
            { id:'general',    icon:'⚙️',  label:'General'    },
            { id:'appearance', icon:'🎨',  label:'Appearance' },
            { id:'shortcuts',  icon:'⌨️',  label:'Shortcuts'  },
            { id:'account',    icon:'👤',  label:'Account'    },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding:'7px 10px', border:'none', borderRadius:6,
              background: tab===t.id ? (theme==='dark' ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)') : 'transparent',
              textAlign:'left', fontSize:12, fontWeight: tab===t.id ? 500 : 400,
              color: tab===t.id ? tk.text : tk.text2,
              fontFamily:'inherit', cursor:'pointer',
              display:'flex', alignItems:'center', gap:6,
            }}>
              <span style={{ fontSize:13 }}>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex:1, padding:'18px', overflowY:'auto', background:tk.bg }}>

          {/* ── General ── */}
          {tab === 'general' && (
            <div style={{ display:'flex', flexDirection:'column', gap:22 }}>
              <div>
                <span style={label()}>Window Opacity</span>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <input type="range" min="20" max="100" value={opacity}
                    onChange={e => setOpacity(+e.target.value)}
                    style={{ flex:1, accentColor:tk.accent, height:4 }} />
                  <span style={{ fontSize:12, color:tk.text3, fontFamily:'DM Mono,monospace', width:34 }}>{opacity}%</span>
                </div>
                <p style={{ fontSize:11, color:tk.text3, marginTop:5 }}>Controls how transparent the overlay windows appear.</p>
              </div>

              <div>
                <span style={label()}>Screen Capture Visibility</span>
                <div style={{ display:'flex', gap:8 }}>
                  {['invisible','visible'].map(v => (
                    <button key={v} onClick={() => setVisibility(v)} style={{
                      padding:'7px 16px', border:`1px solid ${visibility===v ? tk.accent : tk.border2}`,
                      borderRadius:8, background: visibility===v ? tk.accentBg : 'transparent',
                      color: visibility===v ? tk.accent : tk.text2,
                      fontSize:12, fontFamily:'inherit', cursor:'pointer', textTransform:'capitalize',
                      fontWeight: visibility===v ? 500 : 400,
                    }}>
                      {v === 'invisible' ? '👻 Invisible' : '👁 Visible'}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize:11, color:tk.text3, marginTop:5 }}>Controls whether the app window appears in screen captures and recordings.</p>
              </div>
            </div>
          )}

          {/* ── Appearance ── */}
          {tab === 'appearance' && (
            <div style={{ display:'flex', flexDirection:'column', gap:22 }}>
              <div>
                <span style={label()}>Theme</span>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  {[
                    { value:'light', label:'Light', icon:'☀️', preview:['#fff','#f0f0ee','#1a1a18'] },
                    { value:'dark',  label:'Dark',  icon:'🌙', preview:['#111','#1c1c20','#f0f0ec'] },
                  ].map(({ value, label: lbl, icon, preview }) => (
                    <button key={value} onClick={() => setTheme(value)} style={{
                      padding:'14px', border:`2px solid ${theme===value ? tk.accent : tk.border}`,
                      borderRadius:10, background: theme===value ? tk.accentBg : tk.bg2,
                      cursor:'pointer', fontFamily:'inherit', textAlign:'left', transition:'all 0.2s',
                    }}>
                      <div style={{ width:'100%', height:42, borderRadius:6, background:preview[0], border:`1px solid ${tk.border}`, marginBottom:8, overflow:'hidden', display:'flex', flexDirection:'column' }}>
                        <div style={{ height:10, background:preview[1], borderBottom:`1px solid ${tk.border}`, display:'flex', alignItems:'center', padding:'0 4px', gap:2 }}>
                          {['#f87171','#fbbf24','#34d399'].map(c => <div key={c} style={{ width:3, height:3, borderRadius:'50%', background:c }} />)}
                        </div>
                        <div style={{ flex:1, padding:'4px 5px', display:'flex', flexDirection:'column', gap:2 }}>
                          <div style={{ height:3, width:'80%', background:preview[2], borderRadius:2, opacity:0.4 }} />
                          <div style={{ height:3, width:'60%', background:preview[2], borderRadius:2, opacity:0.25 }} />
                        </div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ fontSize:14 }}>{icon}</span>
                        <span style={{ fontSize:12.5, fontWeight:500, color: theme===value ? tk.accent : tk.text }}>{lbl}</span>
                        {theme===value && <span style={{ marginLeft:'auto', fontSize:11, color:tk.accent }}>✓</span>}
                      </div>
                    </button>
                  ))}
                </div>
                <p style={{ fontSize:11, color:tk.text3, marginTop:10 }}>Dark mode is easier on the eyes during long interview sessions.</p>
              </div>
            </div>
          )}

          {/* ── Shortcuts ── */}
          {tab === 'shortcuts' && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <p style={{ fontSize:11, color:tk.text3, marginBottom:4 }}>Global keyboard shortcuts</p>
              {[
                ['Generate answer',  'Ctrl + Enter'],
                ['Toggle overlay',   'Ctrl + \\'],
                ['Clear session',    'Ctrl + K'],
              ].map(([lbl, key]) => (
                <div key={lbl} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 12px', background:tk.bg2, borderRadius:8, border:`1px solid ${tk.border}` }}>
                  <span style={{ fontSize:12.5, color:tk.text }}>{lbl}</span>
                  <kbd style={{ padding:'3px 9px', background:tk.bg3, border:`1px solid ${tk.border2}`, borderRadius:5, fontSize:11, fontFamily:'DM Mono,monospace', color:tk.text2 }}>{key}</kbd>
                </div>
              ))}
            </div>
          )}

          {/* ── Account ── */}
          {tab === 'account' && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {accountLoading && (
                <div style={{ display:'flex', alignItems:'center', gap:8, color:tk.text3, fontSize:13 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ animation:'spin 0.8s linear infinite' }}>
                    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                  </svg>
                  Loading account…
                </div>
              )}

              {accountError && !accountLoading && (
                <div style={{ padding:'10px 14px', background:tk.redBg, border:`1px solid ${tk.red}22`, borderRadius:8, fontSize:12.5, color:tk.red }}>
                  {accountError}
                </div>
              )}

              {account && !accountLoading && (
                <>
                  <div style={{ display:'flex', alignItems:'center', gap:14, padding:'16px', background:tk.bg2, borderRadius:10, border:`1px solid ${tk.border}` }}>
                    <div style={{
                      width:48, height:48, borderRadius:'50%',
                      background: tk.accentBg,
                      border:`2px solid ${tk.accent}33`,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:20, fontWeight:600, color:tk.accent, flexShrink:0,
                    }}>
                      {account.avatar
                        ? <img src={account.avatar} alt="" style={{ width:'100%', height:'100%', borderRadius:'50%', objectFit:'cover' }} />
                        : (account.name?.[0] || account.email?.[0] || '?').toUpperCase()
                      }
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:600, color:tk.text, marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {account.name || 'Anonymous'}
                      </div>
                      <div style={{ fontSize:12, color:tk.text3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {account.email || '—'}
                      </div>
                    </div>
                    <div style={{ padding:'3px 10px', borderRadius:20, background:planInfo.bg, color:planInfo.text, fontSize:11, fontWeight:600, flexShrink:0 }}>
                      {planInfo.label}
                    </div>
                  </div>

                  <div style={{ display:'flex', flexDirection:'column', gap:1, borderRadius:10, overflow:'hidden', border:`1px solid ${tk.border}` }}>
                    {[
                      { label:'Email',         value: account.email        || '—' },
                      { label:'Member since',  value: account.createdAt ? new Date(account.createdAt).toLocaleDateString(undefined, { year:'numeric', month:'long', day:'numeric' }) : '—' },
                      { label:'Subscription',  value: planInfo.label },
                      { label:'Sessions used', value: account.sessionsUsed != null ? String(account.sessionsUsed) : '—' },
                      { label:'Minutes left',  value: account.minutesLeft != null ? `${account.minutesLeft} min` : account.paidMinutes != null ? `${account.paidMinutes} min` : '—' },
                    ].map(({ label: lbl, value }, i) => (
                      <div key={lbl} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background: i % 2 === 0 ? tk.bg2 : tk.bg, gap:12 }}>
                        <span style={{ fontSize:12, color:tk.text3, flexShrink:0 }}>{lbl}</span>
                        <span style={{ fontSize:12.5, color:tk.text, fontWeight:500, textAlign:'right', wordBreak:'break-all' }}>{value}</span>
                      </div>
                    ))}
                  </div>

                  {account.plan === 'free' && (
                    <div style={{ padding:'14px 16px', background: tk.blueBg, border:`1px solid ${tk.blue}33`, borderRadius:10, display:'flex', alignItems:'center', gap:12 }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:tk.blue, marginBottom:3 }}>Upgrade to Pro</div>
                        <div style={{ fontSize:11.5, color:tk.text3, lineHeight:1.5 }}>Unlimited sessions, priority support, and advanced AI answers.</div>
                      </div>
                      <button
                        onClick={() => ipcRenderer.invoke('auth-open-billing')}
                        style={{ padding:'7px 16px', background:tk.blue, border:'none', borderRadius:8, color:'white', fontSize:12.5, fontWeight:500, fontFamily:'inherit', cursor:'pointer', flexShrink:0, whiteSpace:'nowrap' }}>
                        Upgrade ↗
                      </button>
                    </div>
                  )}

                  {account.plan !== 'free' && (
                    <button
                      onClick={() => ipcRenderer.invoke('auth-open-billing')}
                      style={{ padding:'9px 14px', background:'transparent', border:`1px solid ${tk.border2}`, borderRadius:8, color:tk.text2, fontSize:12.5, fontFamily:'inherit', cursor:'pointer', textAlign:'left', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span>Manage subscription</span>
                      <span style={{ fontSize:14, opacity:0.5 }}>↗</span>
                    </button>
                  )}

                  <button
                    onClick={handleSignOut}
                    style={{ marginTop:4, padding:'9px 14px', background:'transparent', border:`1px solid ${tk.red}55`, borderRadius:8, color:tk.red, fontSize:12.5, fontFamily:'inherit', cursor:'pointer', fontWeight:500, transition:'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = tk.redBg}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    Sign out
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer — hide Save on Account tab */}
      {tab !== 'account' && (
        <div style={{ height:52, borderTop:`1px solid ${tk.border}`, display:'flex', alignItems:'center', justifyContent:'flex-end', padding:'0 16px', gap:8, flexShrink:0, background:tk.bg2 }}>
          <button onClick={closeSettings}
            style={{ padding:'7px 16px', background:'transparent', border:`1px solid ${tk.border2}`, borderRadius:8, fontSize:12.5, color:tk.text2, fontFamily:'inherit', cursor:'pointer' }}>
            Cancel
          </button>
          <button onClick={save}
            style={{ padding:'7px 18px', background: saved ? tk.accent : tk.text, border:'none', borderRadius:8, fontSize:12.5, color: theme==='dark' ? '#111' : '#fff', fontFamily:'inherit', cursor:'pointer', fontWeight:500, transition:'background 0.2s' }}>
            {saved ? '✓ Saved!' : 'Save'}
          </button>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}