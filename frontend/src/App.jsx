import React, { useState, useEffect, createContext, useContext, useRef, useCallback } from 'react';
import './App.css';
import authBg from './assets/legal_auth_hero.png';
import heroIllustration from './assets/hero_illustration.png';
import scannerIllustration from './assets/shorthand_hero.png';
import legalHeroImg from './assets/legal_empty_state.png';
import shorthandHero from './assets/legal_auth_hero.png';
import legalLoadingImg from './assets/legal_loading.png';

// =====================================================================
// CONTEXT
// =====================================================================
const AuthContext = createContext(null);
const ThemeContext = createContext(null);

const API = 'http://localhost:5000/api';

function api(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  return fetch(`${API}${path}`, { ...options, headers })
    .then(async r => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Request failed');
      return data;
    });
}

// =====================================================================
// FLOATING PARTICLES
// =====================================================================
function FloatingParticles({ count = 20 }) {
  return (
    <div className="particles-container" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="particle"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 8}s`,
            animationDuration: `${6 + Math.random() * 8}s`,
            width: `${2 + Math.random() * 4}px`,
            height: `${2 + Math.random() * 4}px`,
            opacity: 0.15 + Math.random() * 0.3,
          }}
        />
      ))}
    </div>
  );
}

// =====================================================================
// ANIMATED COUNTER
// =====================================================================
function AnimatedNumber({ value, duration = 1000 }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) { setDisplay(value); return; }
    let start = 0;
    const step = num / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= num) { setDisplay(num); clearInterval(timer); }
      else setDisplay(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [value, duration]);
  return <>{display}</>;
}

// =====================================================================
// ONBOARDING TOUR
// =====================================================================
const TOUR_STEPS = [
  {
    target: 'nav-sentence',
    title: 'Sentence Decoder',
    desc: 'Upload a single-line shorthand image for precise symbol-by-symbol recognition.',
    position: 'right',
  },
  {
    target: 'nav-paragraph',
    title: 'Document Decoder',
    desc: 'Upload full multi-line shorthand pages for comprehensive transcription.',
    position: 'right',
  },
  {
    target: 'nav-symbol',
    title: 'Symbol Decoder',
    desc: 'Identify a single shorthand symbol and see its top-ranked predictions.',
    position: 'right',
  },
  {
    target: 'nav-history',
    title: 'History',
    desc: 'Review all past transcriptions, search & filter them, add notes, or re-decode with different settings.',
    position: 'right',
  },
  {
    target: 'nav-settings',
    title: 'Settings',
    desc: 'Edit your profile, change your password, and configure the AI auto-correct provider.',
    position: 'right',
  },
];

function OnboardingTour({ onFinish }) {
  const [step, setStep] = useState(0);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const current = TOUR_STEPS[step];

  useEffect(() => {
    const el = document.getElementById(current.target);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (current.position === 'right') {
      setPos({ top: rect.top + rect.height / 2, left: rect.right + 16 });
    }
    el.style.outline = '2px solid var(--accent)';
    el.style.outlineOffset = '3px';
    return () => { el.style.outline = ''; el.style.outlineOffset = ''; };
  }, [step, current.target, current.position]);

  const next = () => { if (step < TOUR_STEPS.length - 1) setStep(s => s + 1); else onFinish(); };
  const skip = () => onFinish();

  return (
    <div className="tour-overlay" onClick={skip}>
      <div
        className="tour-tooltip glass-card fade-in"
        style={{ top: pos.top, left: pos.left, transform: 'translateY(-50%)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="tour-step-badge">{step + 1} / {TOUR_STEPS.length}</div>
        <h4 className="tour-title">{current.title}</h4>
        <p className="tour-desc">{current.desc}</p>
        <div className="tour-dots">
          {TOUR_STEPS.map((_, i) => (
            <span key={i} className={`tour-dot ${i === step ? 'active' : ''}`} onClick={() => setStep(i)} />
          ))}
        </div>
        <div className="tour-actions">
          <button className="tour-skip" onClick={skip}>Skip tour</button>
          <button className="btn-primary tour-next" onClick={next}>
            {step === TOUR_STEPS.length - 1 ? 'Get Started' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// AUTH PAGES
// =====================================================================
function LoginPage({ onSwitch }) {
  const { login } = useContext(AuthContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const data = await api('/auth/login', {
        method: 'POST', body: JSON.stringify({ email, password })
      });
      login(data.token, data.user);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  return (
    <div className="auth-page">
      <div className="auth-bg-image" style={{ backgroundImage: `url(${authBg})` }} />
      <div className="auth-gradient-overlay" />
      <FloatingParticles count={10} />

      <div className="auth-split">
        <div className="auth-hero-side">
          <img src={shorthandHero} alt="Legal Office" className="auth-hero-img" />
          <h2 className="auth-hero-title">Precision Transcription Services</h2>
          <p className="auth-hero-desc">
            Enterprise-grade shorthand recognition powered by artificial intelligence, trusted by legal professionals
          </p>
          <div className="auth-features">
            <div className="auth-feature">
              <span className="auth-feature-icon">§</span>
              <span>Instant Recognition</span>
            </div>
            <div className="auth-feature">
              <span className="auth-feature-icon">◈</span>
              <span>Court-Grade Accuracy</span>
            </div>
            <div className="auth-feature">
              <span className="auth-feature-icon">⚖</span>
              <span>AI-Powered Correction</span>
            </div>
          </div>
        </div>

        <div className="auth-form-side">
          <div className="auth-card">
            <div className="auth-card-glow" />
            <div className="auth-logo-wrapper">
              <div className="auth-logo-circle">
                <span className="auth-logo">⚖</span>
              </div>
            </div>
            <h1>Welcome Back</h1>
            <p className="auth-subtitle">Sign in to access your workspace</p>
            <form onSubmit={handleSubmit}>
              {error && <div className="error-msg"><span className="error-icon">!</span>{error}</div>}
              <div className="input-group">
                <span className="input-icon">✉</span>
                <input id="login-email" type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="input-group">
                <span className="input-icon">◆</span>
                <input id="login-password" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
              <button id="login-submit" type="submit" className="btn-primary" disabled={loading}>
                {loading ? (
                  <span className="btn-loading"><span className="spinner" />Authenticating...</span>
                ) : (
                  <span className="btn-content">Sign In <span className="btn-arrow">→</span></span>
                )}
              </button>
            </form>
            <p className="auth-switch">
              New here? <span onClick={onSwitch}>Create an account</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function RegisterPage({ onSwitch }) {
  const { login } = useContext(AuthContext);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const data = await api('/auth/register', {
        method: 'POST', body: JSON.stringify({ name, email, password })
      });
      login(data.token, { ...data.user, isNewUser: true });
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  return (
    <div className="auth-page">
      <div className="auth-bg-image" style={{ backgroundImage: `url(${authBg})` }} />
      <div className="auth-gradient-overlay" />
      <FloatingParticles count={10} />

      <div className="auth-split">
        <div className="auth-hero-side">
          <img src={shorthandHero} alt="Legal Office" className="auth-hero-img" />
          <h2 className="auth-hero-title">Trusted Legal Technology</h2>
          <p className="auth-hero-desc">
            Create your account to access professional transcription tools designed for the legal industry
          </p>
          <div className="auth-features">
            <div className="auth-feature">
              <span className="auth-feature-icon">§</span>
              <span>Sentence & Document</span>
            </div>
            <div className="auth-feature">
              <span className="auth-feature-icon">◈</span>
              <span>Complete Audit Trail</span>
            </div>
            <div className="auth-feature">
              <span className="auth-feature-icon">⚙</span>
              <span>Professional Interface</span>
            </div>
          </div>
        </div>

        <div className="auth-form-side">
          <div className="auth-card">
            <div className="auth-card-glow" />
            <div className="auth-logo-wrapper">
              <div className="auth-logo-circle">
                <span className="auth-logo">⚖</span>
              </div>
            </div>
            <h1>Create Account</h1>
            <p className="auth-subtitle">Begin your professional journey</p>
            <form onSubmit={handleSubmit}>
              {error && <div className="error-msg"><span className="error-icon">!</span>{error}</div>}
              <div className="input-group">
                <span className="input-icon">◇</span>
                <input id="register-name" type="text" placeholder="Full name" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="input-group">
                <span className="input-icon">✉</span>
                <input id="register-email" type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="input-group">
                <span className="input-icon">◆</span>
                <input id="register-password" type="password" placeholder="Password (min 6 chars)" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
              </div>
              <button id="register-submit" type="submit" className="btn-primary" disabled={loading}>
                {loading ? (
                  <span className="btn-loading"><span className="spinner" />Creating account...</span>
                ) : (
                  <span className="btn-content">Create Account <span className="btn-arrow">→</span></span>
                )}
              </button>
            </form>
            <p className="auth-switch">
              Already have an account? <span onClick={onSwitch}>Sign In</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// UPLOAD COMPONENT
// =====================================================================
function ImageUploader({ onResult, type = 'sentence', loading, setLoading, initialFiles = null, initialGap = 10 }) {
  const [dragActive, setDragActive] = useState(false);
  const [previews, setPreviews] = useState([]);
  const [gap, setGap] = useState(initialGap);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [pendingFiles, setPendingFiles] = useState(null);

  // When initialFiles are provided (decode-again), trigger auto-upload
  useEffect(() => {
    if (initialFiles && initialFiles.length > 0) {
      setPendingFiles(initialFiles);
    }
  }, [initialFiles]);

  useEffect(() => {
    if (pendingFiles) {
      handleFiles(pendingFiles);
      setPendingFiles(null);
    }
  }, [pendingFiles]);

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;

    const previewUrls = files.map(f => URL.createObjectURL(f));
    setPreviews(previewUrls);
    setLoading(true);
    setProgress({ current: 0, total: files.length });

    const decodeType = type === 'paragraph' ? 'paragraph' : type;
    let allSymbols = [];
    let allRawTexts = [];
    let allCorrectedTexts = [];
    let allMeaningTexts = [];
    let totalConfidence = 0;
    let totalSymbols = 0;
    let totalLines = 0;
    let lastId = null;
    let lastError = null;

    for (let i = 0; i < files.length; i++) {
      setProgress({ current: i + 1, total: files.length });
      try {
        const form = new FormData();
        form.append('image', files[i]);
        form.append('min_gap', gap);
        const data = await api(`/decode/${decodeType}`, { method: 'POST', body: form });

        if (data.error) { lastError = data.error; continue; }

        // Symbol decoder returns { predictions: [...] } — handle it directly
        if (type === 'symbol' && data.predictions) {
          setLoading(false);
          setProgress({ current: 0, total: 0 });
          onResult({ predictions: data.predictions });
          return;
        }

        lastId = data.id;
        if (data.symbols) allSymbols = allSymbols.concat(data.symbols);
        if (data.raw_text) allRawTexts.push(data.raw_text);
        if (data.corrected_text) allCorrectedTexts.push(data.corrected_text);
        if (data.meaning_text) allMeaningTexts.push(data.meaning_text);
        totalConfidence += (data.avg_confidence || 0) * (data.num_symbols || 1);
        totalSymbols += data.num_symbols || 0;
        totalLines += data.num_lines || 0;
      } catch (err) {
        lastError = err.message;
      }
    }

    setLoading(false);
    setProgress({ current: 0, total: 0 });

    if (allRawTexts.length === 0 && lastError) {
      onResult({ error: lastError });
      return;
    }

    if (files.length === 1 && allRawTexts.length === 1) {
      onResult({
        id: lastId,
        raw_text: allRawTexts[0],
        corrected_text: allCorrectedTexts[0] || allRawTexts[0],
        meaning_text: allMeaningTexts[0] || '',
        num_symbols: totalSymbols,
        num_lines: totalLines || undefined,
        avg_confidence: totalSymbols > 0 ? totalConfidence / totalSymbols : 0,
        symbols: allSymbols,
      });
    } else {
      onResult({
        id: lastId,
        raw_text: allRawTexts.join(' \n'),
        corrected_text: allCorrectedTexts.join(' \n') || allRawTexts.join(' \n'),
        meaning_text: allMeaningTexts.join('\n\n') || '',
        num_symbols: totalSymbols,
        num_lines: totalLines || undefined,
        avg_confidence: totalSymbols > 0 ? Math.round((totalConfidence / totalSymbols) * 10000) / 10000 : 0,
        symbols: allSymbols,
      });
    }
  };

  const removePreview = (index) => {
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const typeLabels = {
    sentence: { icon: '📝', title: 'Single-line shorthand image', hint: 'PNG, JPG or BMP up to 10MB — select multiple files' },
    paragraph: { icon: '📄', title: 'Multi-line shorthand page', hint: 'PNG, JPG or BMP up to 10MB — select multiple files' },
    symbol: { icon: '🔤', title: 'Single shorthand symbol', hint: 'PNG, JPG or BMP up to 10MB' },
  };

  const label = typeLabels[type] || typeLabels.sentence;

  return (
    <div className="uploader-section">
      <div className={`drop-zone ${dragActive ? 'active' : ''} ${previews.length > 0 ? 'has-preview' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={e => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files); }}>
        {previews.length > 0 ? (
          <div className="preview-grid">
            {previews.map((src, idx) => (
              <div key={idx} className="preview-grid-item">
                <img src={src} alt={`Preview ${idx + 1}`} className="preview-img" />
                <button className="preview-remove" onClick={(e) => { e.stopPropagation(); removePreview(idx); }} title="Remove">✕</button>
              </div>
            ))}
            <div className="preview-add-more" onClick={() => document.getElementById('file-upload-input')?.click()}>
              <span>＋</span>
              <span className="preview-add-label">Add more</span>
            </div>
          </div>
        ) : (
          <div className="drop-content">
            <div className="drop-illustration">
              <img src={scannerIllustration} alt="Upload" className="drop-scanner-img" />
            </div>
            <div className="drop-text-area">
              <span className="drop-icon">{label.icon}</span>
              <p className="drop-title">{label.title}</p>
              <p className="drop-hint">{label.hint}</p>
              <div className="drop-cta">
                <span className="drop-cta-icon">📂</span>
                <span>Browse files or drag & drop</span>
              </div>
            </div>
          </div>
        )}
        <input id="file-upload-input" type="file" accept="image/*" multiple onChange={e => handleFiles(e.target.files)} />
      </div>

      <div className="gap-control">
        <div className="gap-label-row">
          <label>⚙️ Segmentation Gap</label>
          <span className="gap-value">{gap}px</span>
        </div>
        <input type="range" min="5" max="25" value={gap} onChange={e => setGap(parseInt(e.target.value))} />
      </div>

      {loading && (
        <div className="loading-container">
          <div className="loading-bar"><div className="loading-fill" /></div>
          <p className="loading-text">
            {progress.total > 1
              ? `🔍 Processing image ${progress.current} of ${progress.total}...`
              : '🔍 Analyzing shorthand symbols...'}
          </p>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// RESULT DISPLAY
// =====================================================================
function DecodeResult({ result }) {
  const [exporting, setExporting] = useState(false);

  const exportPdf = async (historyId) => {
    setExporting(true);
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API}/export/pdf/${historyId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error('Export failed');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stenoassist_report_${historyId.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF export error:', err);
    }
    setExporting(false);
  };

  if (!result) return null;
  if (result.error) return <div className="error-msg"><span className="error-icon">!</span>{result.error}</div>;

  return (
    <div className="result-section fade-in">
      <div className="result-header">
        <h3 className="result-title">Transcription Results</h3>
        {result.id && (
          <button
            id="export-pdf-result"
            className="btn-export-pdf"
            onClick={() => exportPdf(result.id)}
            disabled={exporting}
          >
            {exporting ? (
              <span className="btn-loading"><span className="spinner" />Exporting...</span>
            ) : (
              <span className="btn-content">Export PDF</span>
            )}
          </button>
        )}
      </div>

      <div className="result-stats">
        <div className="stat glass-card">
          <span className="stat-icon">§</span>
          <span className="stat-num"><AnimatedNumber value={result.num_symbols} /></span>
          <span className="stat-label">Symbols</span>
        </div>
        {result.num_lines && (
          <div className="stat glass-card">
            <span className="stat-icon">≡</span>
            <span className="stat-num"><AnimatedNumber value={result.num_lines} /></span>
            <span className="stat-label">Lines</span>
          </div>
        )}
        <div className="stat glass-card">
          <span className="stat-icon">◈</span>
          <span className="stat-num">{(result.avg_confidence * 100).toFixed(0)}%</span>
          <span className="stat-label">Confidence</span>
        </div>
      </div>

      {result.raw_text !== result.corrected_text && (
        <div className="raw-text-box glass-card">
          <div className="box-label">Raw Transcription</div>
          <p>{result.raw_text}</p>
        </div>
      )}

      <div className="corrected-text-box">
        <div className="corrected-glow" />
        <div className="box-label">{result.raw_text !== result.corrected_text ? 'AI-Corrected Transcription' : 'Decoded Text'}</div>
        <p>{result.corrected_text}</p>
      </div>

      {result.meaning_text && (
        <div className="meaning-text-box">
          <div className="meaning-glow" />
          <div className="box-label">Analysis & Interpretation</div>
          <p>{result.meaning_text}</p>
        </div>
      )}

      {result.symbols && result.symbols.length > 0 && (
        <div className="symbols-breakdown">
          <div className="symbols-breakdown-header">
            <h3 className="symbols-breakdown-title">Symbol-by-Symbol Analysis</h3>
            <span className="symbols-breakdown-count">{result.symbols.length} symbols identified</span>
          </div>

          <div className="symbols-table">
            <div className="symbols-table-head">
              <span className="stcol stcol-num">#</span>
              <span className="stcol stcol-img">Symbol</span>
              <span className="stcol stcol-word">Meaning</span>
              <span className="stcol stcol-conf">Confidence</span>
            </div>
            {result.symbols.map((s, i) => (
              <div key={i} className="symbols-table-row glass-card" style={{ animationDelay: `${i * 0.05}s` }}>
                <span className="stcol stcol-num">
                  <span className="sym-index">{i + 1}</span>
                </span>
                <span className="stcol stcol-img">
                  <img src={`data:image/png;base64,${s.image_b64}`} alt={s.word} className="sym-image" />
                </span>
                <span className="stcol stcol-word">
                  <span className="sym-word-text">{s.word}</span>
                </span>
                <span className="stcol stcol-conf">
                  <div className="sym-conf-visual">
                    <div className="sym-conf-bar">
                      <div
                        className="sym-conf-fill"
                        style={{
                          width: `${s.confidence * 100}%`,
                          background: s.confidence > 0.7 ? 'var(--success)' : s.confidence > 0.4 ? 'var(--accent)' : 'var(--error)'
                        }}
                      />
                    </div>
                    <span className={`sym-conf-pct ${s.confidence > 0.7 ? 'high' : s.confidence > 0.4 ? 'med' : 'low'}`}>
                      {(s.confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// DECODE-AGAIN MODAL
// =====================================================================
function DecodeAgainModal({ item, onClose }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchingImage, setFetchingImage] = useState(true);
  const [imageB64, setImageB64] = useState(null);
  const [gap, setGap] = useState(10);
  const [fetchError, setFetchError] = useState('');

  const type = item.type === 'paragraph' ? 'paragraph' : item.type;

  // Fetch the full history item (includes image_b64) on mount
  useEffect(() => {
    setFetchingImage(true);
    setFetchError('');
    api(`/history/${item.id}`)
      .then(data => {
        if (data.image_b64) {
          setImageB64(data.image_b64);
        } else {
          setFetchError('Original image not found for this record.');
        }
      })
      .catch(err => setFetchError(err.message || 'Failed to load original image.'))
      .finally(() => setFetchingImage(false));
  }, [item.id]);

  const reDecode = async () => {
    if (!imageB64) return;
    setLoading(true);
    setResult(null);
    try {
      // Convert base64 to Blob then to File
      const byteChars = atob(imageB64);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArray], { type: 'image/png' });
      const file = new File([blob], item.filename || 'image.png', { type: 'image/png' });

      const form = new FormData();
      form.append('image', file);
      form.append('min_gap', gap);
      const data = await api(`/decode/${type}`, { method: 'POST', body: form });
      setResult(data);
    } catch (err) {
      setResult({ error: err.message || 'Re-decode failed' });
    }
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel glass-card fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 760, width: '95%', maxHeight: '88vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3>🔄 Decode Again</h3>
          <p className="modal-subtitle">Re-decode the original image with different segmentation settings</p>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {/* Original result comparison */}
          <div className="decode-again-original glass-card" style={{ padding: '0.8rem 1rem', marginBottom: '1rem', borderLeft: '3px solid var(--accent)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4, letterSpacing: '0.05em' }}>ORIGINAL TRANSCRIPTION</div>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{item.corrected_text || item.raw_text}</p>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 8 }}>
              {item.num_symbols} symbols · {(item.confidence * 100).toFixed(0)}% confidence · {new Date(item.created_at).toLocaleDateString()}
            </div>
          </div>

          {/* Image preview & controls */}
          {fetchingImage ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', gap: '0.75rem' }}>
              <span className="spinner" />
              <span style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>Loading original image…</span>
            </div>
          ) : fetchError ? (
            <div className="error-msg"><span className="error-icon">!</span>{fetchError}</div>
          ) : (
            <>
              {/* Image preview */}
              <div className="glass-card" style={{ padding: '0.8rem', marginBottom: '1rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 8, letterSpacing: '0.05em', textAlign: 'left' }}>ORIGINAL IMAGE</div>
                <img
                  src={`data:image/png;base64,${imageB64}`}
                  alt="Original shorthand"
                  style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 8, border: '1px solid var(--glass-border)', objectFit: 'contain' }}
                />
              </div>

              {/* Gap slider */}
              <div className="gap-control" style={{ marginBottom: '1rem' }}>
                <div className="gap-label-row">
                  <label>⚙️ Segmentation Gap</label>
                  <span className="gap-value">{gap}px</span>
                </div>
                <input type="range" min="5" max="25" value={gap} onChange={e => setGap(parseInt(e.target.value))} />
              </div>

              {/* Re-Decode button */}
              <button
                className="btn-primary"
                style={{ width: '100%', padding: '0.7rem', fontSize: '0.95rem', marginBottom: '1rem' }}
                onClick={reDecode}
                disabled={loading}
              >
                {loading ? (
                  <span className="btn-loading"><span className="spinner" />Re-decoding…</span>
                ) : (
                  <span className="btn-content">🔄 Re-Decode with Gap {gap}px</span>
                )}
              </button>
            </>
          )}

          {/* New result */}
          {result && (
            <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '1rem', marginTop: '0.5rem' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 8, letterSpacing: '0.05em' }}>NEW RESULT</div>
              <DecodeResult result={result} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// NOTE MODAL
// =====================================================================
function NoteModal({ item, onClose, onSave }) {
  const [note, setNote] = useState(item.note || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    // Store notes in localStorage keyed by history item id (no backend change needed)
    const notes = JSON.parse(localStorage.getItem('stenoassist_notes') || '{}');
    notes[item.id] = note;
    localStorage.setItem('stenoassist_notes', JSON.stringify(notes));
    onSave(item.id, note);
    setSaving(false);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel glass-card fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, width: '95%' }}>
        <div className="modal-header">
          <h3>📝 Add Note</h3>
          <p className="modal-subtitle">Annotate this transcription record</p>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            {new Date(item.created_at).toLocaleDateString()} · {item.type} · {item.num_symbols} symbols
          </div>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '1rem', borderLeft: '3px solid var(--accent)', paddingLeft: '0.75rem' }}>
            {item.corrected_text || item.raw_text}
          </p>
          <textarea
            className="note-textarea"
            placeholder="Write your note or annotation here..."
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={5}
          />
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button className="btn-secondary-sm" onClick={onClose}>Cancel</button>
            <button className="btn-primary" style={{ padding: '0.5rem 1.2rem', fontSize: '0.85rem' }} onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Save Note'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// VIEW FULL RECORD MODAL
// =====================================================================
function ViewRecordModal({ itemId, note, onClose }) {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError('');
    api(`/history/${itemId}`)
      .then(data => { setRecord(data); })
      .catch(err => setError(err.message || 'Failed to load record'))
      .finally(() => setLoading(false));
  }, [itemId]);

  // Close on Escape
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const exportPdf = async () => {
    setExporting(true);
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API}/export/pdf/${itemId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error('Export failed');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stenoassist_report_${itemId.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF export error:', err);
    }
    setExporting(false);
  };

  const displayType = record?.type === 'paragraph' ? 'Document' : record?.type === 'symbol' ? 'Symbol' : 'Sentence';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="view-record-panel fade-in" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="view-record-header">
          <div className="view-record-header-left">
            <h3>📋 Full Record Detail</h3>
            <p className="modal-subtitle">Complete transcription data for this session</p>
          </div>
          <div className="view-record-header-actions">
            <button
              className="btn-export-pdf"
              onClick={exportPdf}
              disabled={exporting || loading}
            >
              {exporting ? (
                <span className="btn-loading"><span className="spinner" />Exporting…</span>
              ) : (
                <span className="btn-content">Export PDF</span>
              )}
            </button>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="view-record-body">
          {loading ? (
            <div className="view-record-loading">
              <div className="spinner large" />
              <p>Loading full record…</p>
            </div>
          ) : error ? (
            <div className="error-msg"><span className="error-icon">!</span>{error}</div>
          ) : record ? (
            <>
              {/* Meta strip */}
              <div className="view-record-meta-strip">
                <div className="view-record-meta-item">
                  <span className="view-record-meta-label">Type</span>
                  <span className={`badge badge-${record.type}`}>{displayType}</span>
                </div>
                <div className="view-record-meta-item">
                  <span className="view-record-meta-label">Date</span>
                  <span className="view-record-meta-value">
                    {new Date(record.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="view-record-meta-item">
                  <span className="view-record-meta-label">Symbols</span>
                  <span className="view-record-meta-value">{record.num_symbols}</span>
                </div>
                {record.num_lines && (
                  <div className="view-record-meta-item">
                    <span className="view-record-meta-label">Lines</span>
                    <span className="view-record-meta-value">{record.num_lines}</span>
                  </div>
                )}
                <div className="view-record-meta-item">
                  <span className="view-record-meta-label">Confidence</span>
                  <span className="view-record-meta-value view-record-conf">
                    {(record.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* Original image */}
              {record.image_b64 && (
                <div className="view-record-section">
                  <div className="view-record-section-label">Original Image</div>
                  <div className="view-record-image-wrap glass-card">
                    <img
                      src={`data:image/png;base64,${record.image_b64}`}
                      alt="Original shorthand"
                      className="view-record-image"
                    />
                  </div>
                </div>
              )}

              {/* Raw transcription */}
              {record.raw_text && record.raw_text !== record.corrected_text && (
                <div className="view-record-section">
                  <div className="view-record-section-label">Raw Transcription</div>
                  <div className="raw-text-box glass-card">
                    <p>{record.raw_text}</p>
                  </div>
                </div>
              )}

              {/* Corrected transcription */}
              <div className="view-record-section">
                <div className="view-record-section-label">
                  {record.raw_text !== record.corrected_text ? 'AI-Corrected Transcription' : 'Decoded Text'}
                </div>
                <div className="corrected-text-box">
                  <div className="corrected-glow" />
                  <p>{record.corrected_text || record.raw_text}</p>
                </div>
              </div>

              {/* Meaning / interpretation */}
              {record.meaning_text && (
                <div className="view-record-section">
                  <div className="view-record-section-label">Analysis & Interpretation</div>
                  <div className="meaning-text-box">
                    <div className="meaning-glow" />
                    <p>{record.meaning_text}</p>
                  </div>
                </div>
              )}

              {/* User note */}
              {note && (
                <div className="view-record-section">
                  <div className="view-record-section-label">📝 Your Note</div>
                  <div className="history-note" style={{ marginTop: 0 }}>
                    <span className="history-note-icon">📝</span>
                    <span className="history-note-text">{note}</span>
                  </div>
                </div>
              )}

              {/* Symbol-by-symbol breakdown — reuse DecodeResult's rendering approach */}
              {record.symbols && record.symbols.length > 0 && (
                <div className="view-record-section">
                  <div className="view-record-section-label">Symbol-by-Symbol Analysis</div>
                  <div className="symbols-breakdown" style={{ marginTop: 0 }}>
                    <div className="symbols-breakdown-header">
                      <span className="symbols-breakdown-count">{record.symbols.length} symbols identified</span>
                    </div>
                    <div className="symbols-table">
                      <div className="symbols-table-head">
                        <span className="stcol stcol-num">#</span>
                        <span className="stcol stcol-img">Symbol</span>
                        <span className="stcol stcol-word">Meaning</span>
                        <span className="stcol stcol-conf">Confidence</span>
                      </div>
                      {record.symbols.map((s, i) => (
                        <div key={i} className="symbols-table-row glass-card" style={{ animationDelay: `${i * 0.03}s` }}>
                          <span className="stcol stcol-num">
                            <span className="sym-index">{i + 1}</span>
                          </span>
                          <span className="stcol stcol-img">
                            <img src={`data:image/png;base64,${s.image_b64}`} alt={s.word} className="sym-image" />
                          </span>
                          <span className="stcol stcol-word">
                            <span className="sym-word-text">{s.word}</span>
                          </span>
                          <span className="stcol stcol-conf">
                            <div className="sym-conf-visual">
                              <div className="sym-conf-bar">
                                <div
                                  className="sym-conf-fill"
                                  style={{
                                    width: `${s.confidence * 100}%`,
                                    background: s.confidence > 0.7 ? 'var(--success)' : s.confidence > 0.4 ? 'var(--accent)' : 'var(--error)'
                                  }}
                                />
                              </div>
                              <span className={`sym-conf-pct ${s.confidence > 0.7 ? 'high' : s.confidence > 0.4 ? 'med' : 'low'}`}>
                                {(s.confidence * 100).toFixed(1)}%
                              </span>
                            </div>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// HISTORY PAGE
// =====================================================================
function HistoryPage({ onDecodeAgain }) {
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exportingId, setExportingId] = useState(null);

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Notes state — stored in localStorage
  const [notes, setNotes] = useState(() => JSON.parse(localStorage.getItem('stenoassist_notes') || '{}'));
  const [noteModal, setNoteModal] = useState(null);

  // Decode again modal
  const [decodeAgainItem, setDecodeAgainItem] = useState(null);

  // Clear all confirmation
  const [confirmClear, setConfirmClear] = useState(false);

  // View full record
  const [viewRecordId, setViewRecordId] = useState(null);

  useEffect(() => {
    Promise.all([
      api('/history?per_page=50'),
      api('/history/stats'),
    ]).then(([h, s]) => {
      setHistory(h.items); setStats(s); setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const deleteItem = async (id) => {
    await api(`/history/${id}`, { method: 'DELETE' });
    setHistory(h => h.filter(x => x.id !== id));
  };

  const clearAllHistory = async () => {
    // Delete all items one by one (no bulk endpoint needed)
    try {
      await Promise.all(history.map(item => api(`/history/${item.id}`, { method: 'DELETE' })));
      setHistory([]);
      setStats(s => s ? { ...s, total_decodes: 0, sentences: 0, paragraphs: 0, total_symbols: 0, avg_confidence: 0 } : s);
    } catch (e) { console.error(e); }
    setConfirmClear(false);
  };

  const exportPdf = async (historyId) => {
    setExportingId(historyId);
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API}/export/pdf/${historyId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error('Export failed');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stenoassist_report_${historyId.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF export error:', err);
    }
    setExportingId(null);
  };

  const handleSaveNote = (id, note) => {
    const updated = { ...notes, [id]: note };
    setNotes(updated);
    localStorage.setItem('stenoassist_notes', JSON.stringify(updated));
  };

  // Filtered history
  const filteredHistory = history.filter(item => {
    const text = (item.corrected_text || item.raw_text || '').toLowerCase();
    const note = (notes[item.id] || '').toLowerCase();
    const q = searchQuery.toLowerCase();
    if (q && !text.includes(q) && !note.includes(q)) return false;
    if (typeFilter !== 'all') {
      const displayType = item.type === 'paragraph' ? 'document' : item.type;
      if (displayType !== typeFilter) return false;
    }
    if (dateFrom) {
      const from = new Date(dateFrom);
      if (new Date(item.created_at) < from) return false;
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59);
      if (new Date(item.created_at) > to) return false;
    }
    return true;
  });

  if (loading) return (
    <div className="loading-page">
      <div className="spinner large" />
      <p>Loading history...</p>
    </div>
  );

  return (
    <div className="history-page fade-in">
      <div className="page-header">
        <div>
          <h2>Transcription History</h2>
          <p className="page-desc">Review and manage all past transcription records</p>
        </div>
        {history.length > 0 && (
          <button
            className="btn-clear-all"
            onClick={() => setConfirmClear(true)}
            title="Clear all history"
          >
            🗑 Clear All
          </button>
        )}
      </div>

      {stats && (
        <div className="stats-row">
          <div className="stat-card glass-card">
            <span className="stat-card-icon">◈</span>
            <span className="stat-num"><AnimatedNumber value={stats.total_decodes} /></span>
            <span>Total Decodes</span>
          </div>
          <div className="stat-card glass-card">
            <span className="stat-card-icon">§</span>
            <span className="stat-num"><AnimatedNumber value={stats.sentences} /></span>
            <span>Sentences</span>
          </div>
          <div className="stat-card glass-card">
            <span className="stat-card-icon">▤</span>
            <span className="stat-num"><AnimatedNumber value={stats.paragraphs} /></span>
            <span>Documents</span>
          </div>
          <div className="stat-card glass-card">
            <span className="stat-card-icon">⌂</span>
            <span className="stat-num"><AnimatedNumber value={stats.total_symbols} /></span>
            <span>Symbols</span>
          </div>
          <div className="stat-card glass-card">
            <span className="stat-card-icon">◉</span>
            <span className="stat-num">{(stats.avg_confidence * 100).toFixed(0)}%</span>
            <span>Avg Confidence</span>
          </div>
        </div>
      )}

      {/* Search & Filter Bar */}
      {history.length > 0 && (
        <div className="history-search-bar glass-card">
          <div className="history-search-row">
            <div className="history-search-input-wrap">
              <span className="history-search-icon">🔍</span>
              <input
                className="history-search-input"
                type="text"
                placeholder="Search transcriptions or notes..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="history-search-clear" onClick={() => setSearchQuery('')}>✕</button>
              )}
            </div>
            <button
              className={`history-filter-toggle ${showFilters ? 'active' : ''}`}
              onClick={() => setShowFilters(f => !f)}
            >
              ⚙ Filters {(typeFilter !== 'all' || dateFrom || dateTo) ? '●' : ''}
            </button>
          </div>

          {showFilters && (
            <div className="history-filters fade-in">
              <div className="filter-group">
                <label className="filter-label">Type</label>
                <div className="filter-pills">
                  {['all', 'sentence', 'document', 'symbol'].map(t => (
                    <button
                      key={t}
                      className={`filter-pill ${typeFilter === t ? 'active' : ''}`}
                      onClick={() => setTypeFilter(t)}
                    >
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="filter-group">
                <label className="filter-label">Date Range</label>
                <div className="filter-dates">
                  <input type="date" className="filter-date-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                  <span className="filter-date-sep">→</span>
                  <input type="date" className="filter-date-input" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                  {(dateFrom || dateTo) && (
                    <button className="filter-clear-dates" onClick={() => { setDateFrom(''); setDateTo(''); }}>Clear</button>
                  )}
                </div>
              </div>
            </div>
          )}

          {(searchQuery || typeFilter !== 'all' || dateFrom || dateTo) && (
            <div className="history-results-count">
              Showing {filteredHistory.length} of {history.length} records
            </div>
          )}
        </div>
      )}

      {history.length === 0 ? (
        <div className="empty-state glass-card">
          <img src={legalHeroImg} alt="No history" className="empty-illustration" />
          <h3>No Transcriptions Yet</h3>
          <p>Upload a shorthand document to begin</p>
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="empty-state glass-card">
          <h3>No Results Found</h3>
          <p>Try adjusting your search or filters</p>
        </div>
      ) : (
        <div className="history-list">
          {filteredHistory.map((item, index) => (
            <div key={item.id} className="history-item glass-card" style={{ animationDelay: `${index * 0.05}s` }}>
              <div className="history-meta">
                <span className={`badge badge-${item.type}`}>
                  {item.type === 'paragraph' ? 'document' : item.type}
                </span>
                <span className="history-date">
                  {new Date(item.created_at).toLocaleDateString()}
                </span>
                <span className="history-symbols">{item.num_symbols} symbols</span>
                <span className="history-conf">{(item.confidence * 100).toFixed(0)}% conf.</span>
              </div>
              <p className="history-text">{item.corrected_text || item.raw_text}</p>
              {item.meaning_text && (
                <p className="history-meaning">{item.meaning_text}</p>
              )}
              {/* Note display */}
              {notes[item.id] && (
                <div className="history-note">
                  <span className="history-note-icon">📝</span>
                  <span className="history-note-text">{notes[item.id]}</span>
                </div>
              )}
              <div className="history-actions">
                {/* View Full Record */}
                <button
                  className="btn-icon history-action-btn btn-view-record"
                  onClick={() => setViewRecordId(item.id)}
                  title="View full record"
                >
                  👁
                </button>
                {/* Decode Again */}
                <button
                  className="btn-icon history-action-btn"
                  onClick={() => setDecodeAgainItem(item)}
                  title="Decode again"
                >
                  🔄
                </button>
                {/* Add Note */}
                <button
                  className="btn-icon history-action-btn"
                  onClick={() => setNoteModal(item)}
                  title={notes[item.id] ? 'Edit note' : 'Add note'}
                >
                  {notes[item.id] ? '✏️' : '📝'}
                </button>
                {/* Export PDF */}
                <button
                  className="btn-export-pdf btn-export-sm"
                  onClick={() => exportPdf(item.id)}
                  disabled={exportingId === item.id}
                  title="Export PDF"
                >
                  {exportingId === item.id ? (
                    <span className="btn-loading"><span className="spinner" /></span>
                  ) : (
                    <span>📄</span>
                  )}
                </button>
                {/* Delete */}
                <button className="btn-delete" onClick={() => deleteItem(item.id)} title="Delete">
                  <span>🗑️</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Clear All Confirmation Modal */}
      {confirmClear && (
        <div className="modal-overlay" onClick={() => setConfirmClear(false)}>
          <div className="modal-panel glass-card fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 400, width: '90%' }}>
            <div className="modal-header">
              <h3>⚠️ Clear All History</h3>
              <button className="modal-close" onClick={() => setConfirmClear(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.2rem' }}>
                This will permanently delete all {history.length} transcription records. This action cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button className="btn-secondary-sm" onClick={() => setConfirmClear(false)}>Cancel</button>
                <button
                  style={{ background: 'var(--error)', color: '#fff', border: 'none', borderRadius: 8, padding: '0.5rem 1.2rem', cursor: 'pointer', fontWeight: 600 }}
                  onClick={clearAllHistory}
                >
                  Clear All
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Note Modal */}
      {noteModal && (
        <NoteModal
          item={{ ...noteModal, note: notes[noteModal.id] || '' }}
          onClose={() => setNoteModal(null)}
          onSave={handleSaveNote}
        />
      )}

      {/* Decode Again Modal */}
      {decodeAgainItem && (
        <DecodeAgainModal
          item={decodeAgainItem}
          onClose={() => setDecodeAgainItem(null)}
        />
      )}

      {/* View Full Record Modal */}
      {viewRecordId && (
        <ViewRecordModal
          itemId={viewRecordId}
          note={notes[viewRecordId] || ''}
          onClose={() => setViewRecordId(null)}
        />
      )}
    </div>
  );
}

// =====================================================================
// SETTINGS PAGE
// =====================================================================
function SettingsPage() {
  const { user, setUser } = useContext(AuthContext);
  const { theme, toggleTheme } = useContext(ThemeContext);
  const [provider, setProvider] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState(false);

  // Edit profile state
  const [editName, setEditName] = useState(user?.name || '');
  const [editPassword, setEditPassword] = useState('');
  const [editConfirmPassword, setEditConfirmPassword] = useState('');
  const [profileMsg, setProfileMsg] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  const isDefault = provider === '' || provider === 'default';
  const needsKey = provider && provider !== 'default';

  const saveSettings = async () => {
    const saveProvider = isDefault ? '' : provider;
    const saveKey = isDefault ? '' : apiKey;
    await api('/auth/settings', {
      method: 'PUT', body: JSON.stringify({ api_provider: saveProvider, api_key: saveKey, theme })
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const saveProfile = async () => {
    setProfileError('');
    setProfileMsg('');
    if (editPassword && editPassword !== editConfirmPassword) {
      setProfileError('Passwords do not match');
      return;
    }
    if (editPassword && editPassword.length < 6) {
      setProfileError('Password must be at least 6 characters');
      return;
    }
    setProfileSaving(true);
    try {
      const payload = { name: editName };
      if (editPassword) payload.password = editPassword;
      await api('/auth/settings', { method: 'PUT', body: JSON.stringify(payload) });
      setUser(u => ({ ...u, name: editName }));
      setProfileMsg('Profile updated successfully');
      setEditPassword('');
      setEditConfirmPassword('');
      setTimeout(() => setProfileMsg(''), 3000);
    } catch (e) {
      setProfileError(e.message || 'Failed to update profile');
    }
    setProfileSaving(false);
  };

  return (
    <div className="settings-page fade-in">
      <div className="page-header">
        <div>
          <h2>Settings</h2>
          <p className="page-desc">Configure your workspace preferences</p>
        </div>
      </div>

      <div className="settings-grid">
        <div className="settings-section glass-card">
          <div className="settings-section-header">
            <span className="settings-icon">◐</span>
            <h3>Appearance</h3>
          </div>
          <div className="theme-toggle">
            <div className="theme-info">
              <span className="theme-label">Theme Mode</span>
              <span className="theme-current">{theme === 'dark' ? 'Dark mode active' : 'Light mode active'}</span>
            </div>
            <button className="btn-theme" onClick={toggleTheme}>
              <span className="theme-icon-btn">{theme === 'dark' ? '🌙' : '☀️'}</span>
              <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
            </button>
          </div>
        </div>

        <div className="settings-section glass-card">
          <div className="settings-section-header">
            <span className="settings-icon">⚙</span>
            <h3>AI Auto-Correct</h3>
          </div>
          <p className="settings-desc">AI-powered text correction is active by default using Groq. You can optionally switch to another provider below.</p>

          <div className="ai-default-badge">
            <span className="ai-badge-icon">⚡</span>
            <span className="ai-badge-text">Groq (Llama 3.3 70B) is the default — no setup needed</span>
          </div>

          <select id="ai-provider" value={provider} onChange={e => setProvider(e.target.value)}>
            <option value="">⚡ Default (Groq — built-in, no key needed)</option>
            <option value="groq">⚡ Groq (use your own key)</option>
            <option value="gemini">🌟 Google Gemini</option>
            <option value="openai">🧠 OpenAI (GPT-4o Mini)</option>
          </select>

          {needsKey && (
            <div className="input-group settings-input">
              <span className="input-icon">◆</span>
              <input id="ai-api-key" type="password"
                placeholder={`Enter your ${provider === 'groq' ? 'Groq' : provider === 'gemini' ? 'Gemini' : 'OpenAI'} API Key`}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)} />
            </div>
          )}

          {isDefault && (
            <p className="settings-hint">✅ AI auto-correct is active and ready to use out of the box.</p>
          )}
        </div>

        {/* ── EDIT PROFILE SECTION ── */}
        <div className="settings-section glass-card">
          <div className="settings-section-header">
            <span className="settings-icon">◇</span>
            <h3>Edit Profile</h3>
          </div>

          <div className="account-info" style={{ marginBottom: '1.2rem' }}>
            <div className="account-avatar-large">
              {user?.name?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="account-details">
              <span className="account-name">{user?.name || 'User'}</span>
              <span className="account-email">{user?.email}</span>
            </div>
          </div>

          {profileMsg && (
            <div className="settings-hint" style={{ color: 'var(--success)', marginBottom: '0.8rem' }}>✅ {profileMsg}</div>
          )}
          {profileError && (
            <div className="error-msg" style={{ marginBottom: '0.8rem' }}><span className="error-icon">!</span>{profileError}</div>
          )}

          <div className="profile-edit-fields">
            <div className="input-group settings-input">
              <span className="input-icon">◇</span>
              <input
                type="text"
                placeholder="Display name"
                value={editName}
                onChange={e => setEditName(e.target.value)}
              />
            </div>
            <div className="input-group settings-input">
              <span className="input-icon">◆</span>
              <input
                type="password"
                placeholder="New password (leave blank to keep current)"
                value={editPassword}
                onChange={e => setEditPassword(e.target.value)}
              />
            </div>
            {editPassword && (
              <div className="input-group settings-input">
                <span className="input-icon">◆</span>
                <input
                  type="password"
                  placeholder="Confirm new password"
                  value={editConfirmPassword}
                  onChange={e => setEditConfirmPassword(e.target.value)}
                />
              </div>
            )}
            <button
              className="btn-primary"
              style={{ marginTop: '0.4rem', padding: '0.55rem 1.4rem', fontSize: '0.85rem', maxWidth: 200 }}
              onClick={saveProfile}
              disabled={profileSaving || !editName.trim()}
            >
              {profileSaving ? 'Saving...' : 'Update Profile'}
            </button>
          </div>
        </div>
      </div>

      <button id="save-settings" className="btn-primary btn-save" onClick={saveSettings}>
        {saved ? (
          <span className="btn-content">Saved Successfully</span>
        ) : (
          <span className="btn-content">Save Settings</span>
        )}
      </button>
    </div>
  );
}

// =====================================================================
// MAIN DASHBOARD
// =====================================================================
function Dashboard() {
  const [page, setPage] = useState('sentence');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const { user, logout } = useContext(AuthContext);
  const { theme, toggleTheme } = useContext(ThemeContext);

  // Onboarding tour — only for brand-new registrations (server-side flag)
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    // Show tour only if user just registered (isNewUser) AND server says onboarding not done
    if (user?.isNewUser && !user?.onboarding_done) {
      setShowTour(true);
    }
  }, [user]);

  const finishTour = async () => {
    setShowTour(false);
    // Persist onboarding completion server-side
    try {
      await api('/auth/settings', {
        method: 'PUT', body: JSON.stringify({ onboarding_done: true })
      });
    } catch (e) { console.error('Failed to save onboarding status:', e); }
    // Clean up legacy localStorage key
    localStorage.removeItem('stenoassist_tour_done');
  };

  const navItems = [
    { key: 'sentence', icon: '§', label: 'Sentence' },
    { key: 'paragraph', icon: '▤', label: 'Document' },
    { key: 'symbol', icon: '◈', label: 'Symbol' },
    { key: 'history', icon: '≡', label: 'History' },
    { key: 'settings', icon: '⚙', label: 'Settings' },
  ];

  const pageTitles = {
    sentence: { title: 'Sentence Decoder', desc: 'Upload a single-line shorthand image for precise recognition', icon: '§' },
    paragraph: { title: 'Document Decoder', desc: 'Upload multi-line shorthand pages for comprehensive transcription', icon: '▤' },
    symbol: { title: 'Symbol Decoder', desc: 'Upload a single shorthand symbol for identification', icon: '◈' },
  };

  return (
    <div className="dashboard">
      {showTour && <OnboardingTour onFinish={finishTour} />}

      <nav className="sidebar" id="main-sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon-wrapper">
            <span className="logo-icon">⚖</span>
          </div>
          <span className="logo-text">StenoAssist</span>
        </div>

        <div className="sidebar-emblem">
          <img src={legalHeroImg} alt="" className="sidebar-emblem-img" />
        </div>

        <div className="nav-items">
          {navItems.map(item => (
            <button
              key={item.key}
              id={`nav-${item.key}`}
              className={page === item.key ? 'active' : ''}
              onClick={() => { setPage(item.key); if (['sentence', 'paragraph', 'symbol'].includes(item.key)) setResult(null); }}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              {page === item.key && <span className="nav-indicator" />}
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar-wrapper">
              <span className="user-avatar">{user?.name?.[0]?.toUpperCase() || '?'}</span>
              <span className="user-status" />
            </div>
            <div className="user-meta">
              <span className="user-name">{user?.name}</span>
              <span className="user-role">Member</span>
            </div>
          </div>
          <div className="sidebar-actions">
            <button className="btn-icon" onClick={toggleTheme} title="Toggle theme">
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button className="btn-icon btn-logout-icon" onClick={logout} title="Sign out">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" height="20" width="20">
                <circle cx="12" cy="12" r="12" fill="#e74c3c" />
                <path d="M6.5 7.5h5v2h-3v5h3v2h-5a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z" fill="#fff" />
                <path d="M13 12l4 0M15 9.5l2.5 2.5-2.5 2.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      <main className="main-content">
        {['sentence', 'paragraph', 'symbol'].includes(page) && (
          <div className="decode-page fade-in" key={page}>
            <div className="page-header">
              <div className="page-header-text">
                <h2>{pageTitles[page].icon} {pageTitles[page].title}</h2>
                <p className="page-desc">{pageTitles[page].desc}</p>
              </div>
            </div>

            <ImageUploader type={page} onResult={setResult} loading={loading} setLoading={setLoading} />

            {page === 'symbol' && result?.predictions ? (
              <div className="predictions-list fade-in">
                <h3 className="predictions-title">Top Predictions</h3>
                {result.predictions.map((p, i) => (
                  <div key={i} className="pred-item glass-card" style={{ animationDelay: `${i * 0.1}s` }}>
                    <span className="pred-rank">#{i + 1}</span>
                    <span className="pred-word">{p.word}</span>
                    <div className="pred-bar-bg">
                      <div className="pred-bar" style={{ width: `${p.confidence * 100}%` }} />
                    </div>
                    <span className="pred-conf">{(p.confidence * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            ) : (
              <DecodeResult result={result} />
            )}
          </div>
        )}
        {page === 'history' && <HistoryPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}

// =====================================================================
// APP ROOT
// =====================================================================
export default function App() {
  const [user, setUser] = useState(null);
  const [authPage, setAuthPage] = useState('login');
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api('/auth/me').then(u => { setUser(u); setChecking(false); })
        .catch(() => { localStorage.removeItem('token'); setChecking(false); });
    } else { setChecking(false); }
  }, []);

  const login = (token, userData) => {
    localStorage.setItem('token', token);
    setUser(userData);
  };
  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };
  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  if (checking) return (
    <div className="loading-page">
      <img src={legalLoadingImg} alt="" className="loading-hero-img" />
      <div className="spinner large" />
      <p className="loading-brand">StenoAssist</p>
    </div>
  );

  return (
    <AuthContext.Provider value={{ user, setUser, login, logout }}>
      <ThemeContext.Provider value={{ theme, toggleTheme }}>
        {user ? <Dashboard /> : (
          authPage === 'login'
            ? <LoginPage onSwitch={() => setAuthPage('register')} />
            : <RegisterPage onSwitch={() => setAuthPage('login')} />
        )}
      </ThemeContext.Provider>
    </AuthContext.Provider>
  );
}
