import { useState } from 'react';
const { ipcRenderer } = window.require('electron');
export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const handleLogin = () => { setLoading(true); ipcRenderer.invoke('auth-login'); };
  return (
    <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg)',WebkitAppRegion:'drag'}}>
      <div style={{width:300,padding:'36px 28px',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',boxShadow:'var(--shadow-lg)',display:'flex',flexDirection:'column',alignItems:'center',gap:20,WebkitAppRegion:'no-drag',animation:'slideUp 0.3s ease forwards'}}>
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:10}}>
          <div style={{width:44,height:44,background:'var(--accent)',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M9 11.5L11 13.5L15.5 9M12 3C7.03 3 3 7.03 3 12C3 16.97 7.03 21 12 21C16.97 21 21 16.97 21 12C21 7.03 16.97 3 12 3Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div style={{textAlign:'center'}}>
            <div style={{fontSize:18,fontWeight:600,color:'var(--text)',letterSpacing:'-0.3px'}}>JobGenie</div>
            <div style={{fontSize:11.5,color:'var(--text3)',marginTop:2}}>AI interview assistant</div>
          </div>
        </div>
        <div style={{width:'100%',height:1,background:'var(--border)'}}/>
        <div style={{width:'100%',display:'flex',flexDirection:'column',gap:10}}>
          <button onClick={handleLogin} disabled={loading} style={{width:'100%',padding:'10px 16px',background:loading?'var(--bg3)':'var(--text)',color:loading?'var(--text3)':'white',border:'none',borderRadius:'var(--radius)',fontSize:13.5,fontWeight:500,fontFamily:'var(--font)',cursor:loading?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:7,transition:'opacity 0.15s ease'}}>
            {loading?(<><div style={{width:13,height:13,border:'1.5px solid var(--border2)',borderTopColor:'var(--text2)',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}/>Opening browser...</>):'Sign in to continue'}
          </button>
          <div style={{textAlign:'center',fontSize:11,color:'var(--text3)'}}>Works with Zoom, Teams, Google Meet &amp; more</div>
        </div>
      </div>
    </div>
  );
}
