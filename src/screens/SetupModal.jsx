import { useState, useRef, useEffect } from 'react';
const { ipcRenderer } = window.require('electron');

const THEMES = {
  light: {
    bg:       '#ffffff',
    border:   'rgba(220,220,217,0.9)',
    text:     '#1a1a18',
    text2:    '#5a5a54',
    text3:    '#9a9a94',
    accent:   '#16a34a',
    red:      '#dc2626',
    redLight: 'rgba(220,38,38,0.09)',
    btnBorder:'rgba(0,0,0,0.12)',
    surface:  '#f8f8f7',
  },
  dark: {
    bg:       '#1a1a20',
    border:   'rgba(255,255,255,0.10)',
    text:     '#ffffff',
    text2:    '#c0c0ba',
    text3:    '#707070',
    accent:   '#22c55e',
    red:      '#f87171',
    redLight: 'rgba(248,113,113,0.12)',
    btnBorder:'rgba(255,255,255,0.15)',
    surface:  '#111116',
  },
};

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result.split(',')[1]);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

export default function SetupModal() {
  const [theme,      setTheme]      = useState('light');
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeName, setResumeName] = useState('');
  const [jdText,     setJdText]     = useState('');
  const [uploading,  setUploading]  = useState(false);
  const [error,      setError]      = useState('');
  const resumeRef = useRef(null);
  const tk = THEMES[theme] ?? THEMES.light;

  // Get theme from main process
  useEffect(() => {
    ipcRenderer.invoke('settings-get-theme')
      .then(r => { if (r?.theme) setTheme(r.theme); })
      .catch(() => {});
    document.body.style.background = 'transparent';
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';
  }, []);

  const handleResumeChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ok = file.name.endsWith('.pdf') || file.name.endsWith('.doc') || file.name.endsWith('.docx');
    if (!ok) { setError('Only PDF or Word (.doc/.docx) files allowed'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('File too large — max 5MB'); return; }
    setError('');
    setResumeFile(file);
    setResumeName(file.name);
  };

  const handleCancel = () => {
    ipcRenderer.send('setup-modal-cancel');
  };

  const handleStart = async () => {
    if (uploading) return;
    setUploading(true);
    setError('');
    try {
      const result = await ipcRenderer.invoke('get-store-value', 'assistant');
      const assistantId = result?.id || '71910528-40b7-4218-978c-1de14b9189d4';

      let resumeBase64   = null;
      let resumeFileName = null;
      let resumeMimeType = null;

      if (resumeFile) {
        resumeBase64   = await fileToBase64(resumeFile);
        resumeFileName = resumeFile.name;
        resumeMimeType = resumeFile.type ||
          (resumeFile.name.endsWith('.pdf')
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      }

      // Tell main process to start the session with this data
      ipcRenderer.send('setup-modal-start', {
        assistantId,
        resumeBase64,
        resumeFileName,
        resumeMimeType,
        jobDescription: jdText.trim() || null,
      });
    } catch (e) {
      setUploading(false);
      setError(e.message || 'Failed to start session');
    }
  };

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: tk.bg,
      fontFamily: "'DM Sans', system-ui, sans-serif",
      color: tk.text,
      display: 'flex', flexDirection: 'column',
      padding: 20, boxSizing: 'border-box',
      borderRadius: 12,
      border: `1px solid ${tk.border}`,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: tk.text }}>Session Setup</div>
          <div style={{ fontSize: 11, color: tk.text3, marginTop: 2 }}>
            Upload your resume &amp; job description for personalised answers
          </div>
        </div>
        <button onClick={handleCancel} style={{
          marginLeft: 'auto', background: 'none', border: 'none',
          color: tk.text3, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px',
        }}>✕</button>
      </div>

      {/* Resume upload */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: tk.text2, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Resume <span style={{ color: tk.text3, fontWeight: 400, textTransform: 'none' }}>(PDF or Word — optional)</span>
        </label>
        <div
          onClick={() => resumeRef.current?.click()}
          style={{
            border: `1.5px dashed ${resumeFile ? tk.accent : tk.border}`,
            borderRadius: 8, padding: '12px 14px',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
            background: resumeFile
              ? (theme === 'dark' ? 'rgba(34,197,94,0.06)' : 'rgba(22,163,74,0.04)')
              : 'transparent',
            transition: 'all 0.15s',
          }}>
          <span style={{ fontSize: 20 }}>{resumeFile ? '📄' : '📁'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            {resumeFile ? (
              <>
                <div style={{ fontSize: 12, fontWeight: 600, color: tk.accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resumeName}</div>
                <div style={{ fontSize: 10, color: tk.text3 }}>Click to change</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 12, color: tk.text2 }}>Click to upload resume</div>
                <div style={{ fontSize: 10, color: tk.text3 }}>PDF, DOC, DOCX — max 5MB</div>
              </>
            )}
          </div>
          {resumeFile && (
            <button onClick={(e) => { e.stopPropagation(); setResumeFile(null); setResumeName(''); }} style={{
              background: 'none', border: 'none', color: tk.text3, cursor: 'pointer', fontSize: 14, padding: 2,
            }}>✕</button>
          )}
        </div>
        <input
          ref={resumeRef}
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleResumeChange}
          style={{ display: 'none' }}
        />
      </div>

      {/* Job description */}
      <div style={{ marginBottom: 14, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: tk.text2, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Job Description <span style={{ color: tk.text3, fontWeight: 400, textTransform: 'none' }}>(paste here — optional)</span>
        </label>
        <textarea
          value={jdText}
          onChange={e => setJdText(e.target.value)}
          placeholder="Paste the job description here... The AI will tailor answers to match this role."
          style={{
            flex: 1,
            minHeight: 100,
            resize: 'none',
            background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
            border: `1px solid ${tk.border}`,
            borderRadius: 8, padding: '10px 12px',
            fontSize: 12, fontFamily: 'inherit', color: tk.text,
            outline: 'none', lineHeight: 1.6,
            boxSizing: 'border-box',
            width: '100%',
          }}
        />
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: '7px 10px', borderRadius: 6, marginBottom: 10,
          background: tk.redLight, color: tk.red, fontSize: 11,
        }}>
          ⚠ {error}
        </div>
      )}

      {/* Info note */}
      <div style={{
        padding: '7px 10px', borderRadius: 6, marginBottom: 14,
        background: theme === 'dark' ? 'rgba(96,165,250,0.08)' : 'rgba(37,99,235,0.06)',
        color: theme === 'dark' ? '#93c5fd' : '#1d4ed8',
        fontSize: 11, lineHeight: 1.5,
      }}>
        💡 Answers will sound like <strong>you</strong> — based on your actual experience and the role requirements.
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleCancel} disabled={uploading} style={{
          flex: 1, padding: '9px 0',
          background: 'transparent', border: `1px solid ${tk.btnBorder}`,
          borderRadius: 8, color: tk.text2, fontSize: 12,
          fontFamily: 'inherit', cursor: 'pointer',
        }}>
          Cancel
        </button>
        <button onClick={handleStart} disabled={uploading} style={{
          flex: 2, padding: '9px 0',
          background: uploading ? tk.text3 : tk.accent,
          border: 'none', borderRadius: 8,
          color: 'white', fontSize: 12, fontWeight: 600,
          fontFamily: 'inherit', cursor: uploading ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          {uploading ? '⏳ Starting...' : '▶ Start Session'}
        </button>
      </div>
    </div>
  );
}