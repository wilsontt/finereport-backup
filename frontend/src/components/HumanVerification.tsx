/**
 * 4 碼數字驗證（防機器人）
 */
import { useState, useEffect } from 'react';
import { backupApi } from '../api/backup';

interface Props {
  verifiedNasPath?: string;
  onDone: () => void;
}

export function HumanVerification({ verifiedNasPath, onDone }: Props) {
  const [code, setCode] = useState('');
  const [displayCode, setDisplayCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);

  const fetchCode = async () => {
    setError('');
    setLoading(true);
    const res = await backupApi.getHumanCode();
    setLoading(false);
    if (res.error) {
      setError(res.message || '取得驗證碼失敗');
      return;
    }
    if (res.data?.code) {
      setDisplayCode(res.data.code);
      setCode('');
    }
  };

  useEffect(() => {
    fetchCode();
  }, []);

  const verify = async () => {
    if (code.length !== 4) {
      setError('請輸入 4 碼數字');
      return;
    }
    setError('');
    setLoading(true);
    const res = await backupApi.verifyHumanCode(code);
    setLoading(false);
    if (res.error) {
      setError(res.message || '驗證失敗');
      return;
    }
    setVerified(true);
  };

  if (verified) {
    return (
      <div>
        <h2 style={{ marginBottom: '0.5rem' }}>2. 4 碼數字驗證</h2>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'var(--color-success)', fontWeight: 600 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            驗證成功
          </div>
          {verifiedNasPath && (
            <div style={{ padding: '1rem', background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', fontSize: '0.875rem', marginBottom: '1.5rem', border: '1px solid var(--color-border)' }}>
              <p style={{ margin: '0 0 0.25rem 0', fontWeight: 600, color: 'var(--color-text-muted)' }}>NAS 驗證路徑：</p>
              <code style={{ wordBreak: 'break-all', fontFamily: 'ui-monospace, monospace' }}>{verifiedNasPath}</code>
            </div>
          )}
          <button className="btn btn-primary" onClick={onDone}>繼續</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginBottom: '0.5rem' }}>2. 4 碼數字驗證</h2>
      <p className="subtitle">請輸入下方顯示的 4 碼數字（防止機器人登入）</p>
      
      <div className="card">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', padding: '1rem 0' }}>
          {displayCode ? (
            <div style={{ background: 'var(--color-bg)', padding: '1rem 2rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
              <p style={{ fontSize: '2.5rem', letterSpacing: '0.5rem', fontWeight: 700, margin: 0, color: 'var(--color-primary)' }}>
                {displayCode}
              </p>
            </div>
          ) : (
            <button className="btn btn-secondary" onClick={fetchCode} disabled={loading}>
              {loading ? '取得中...' : '取得驗證碼'}
            </button>
          )}
          
          <div className="w-full" style={{ maxWidth: '300px' }}>
            <div className="input-group">
              <input
                className="input-field"
                style={{ textAlign: 'center', fontSize: '1.25rem', letterSpacing: '0.25rem' }}
                placeholder="輸入 4 碼"
                maxLength={4}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            
            <button className="btn btn-primary w-full mb-4" onClick={verify} disabled={loading || code.length !== 4}>
              {loading ? '驗證中...' : '驗證'}
            </button>
            
            <button className="btn btn-secondary w-full" onClick={fetchCode} disabled={loading}>
              重新取得驗證碼
            </button>
          </div>
        </div>
        
        {error && <div className="alert-error" style={{ marginTop: '1.5rem', marginBottom: 0 }}>{error}</div>}
      </div>
    </div>
  );
}
