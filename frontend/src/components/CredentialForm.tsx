/**
 * SSH + Sudo + NAS 憑證輸入
 */
import { useState } from 'react';
import { backupApi } from '../api/backup';

interface Props {
  onDone: (nasFullPath?: string) => void;
}

export function CredentialForm({ onDone }: Props) {
  const [ssh, setSsh] = useState({ host: '10.9.82.57', username: 'crownap', password: '' });
  const [sudoPwd, setSudoPwd] = useState('');
  const [nas, setNas] = useState({
    host: '10.9.82.22',
    username: '',
    password: '',
    domain: 'WORKGROUP',
    share: 'KE20.4.軟硬體系統備份記錄',
    path: '4.備份記錄/KE',
  });
  const [step, setStep] = useState<'ssh' | 'sudo' | 'nas'>('ssh');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const verifySsh = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await backupApi.verifySsh(ssh);
      if (res.error) {
        setError(res.message || 'SSH 驗證失敗');
        return;
      }
      setStep('sudo');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'SSH 連線失敗（網路或伺服器錯誤）';
      setError(msg);
      console.error('[SSH 驗證]', err);
    } finally {
      setLoading(false);
    }
  };

  const verifySudo = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await backupApi.verifySudo({ sudoPassword: sudoPwd });
      if (res.error) {
        setError(res.message || 'sudo 驗證失敗');
        return;
      }
      setStep('nas');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'sudo 驗證失敗（網路或伺服器錯誤）';
      setError(msg);
      console.error('[sudo 驗證]', err);
    } finally {
      setLoading(false);
    }
  };

  const verifyNas = async () => {
    setError('');
    setLoading(true);
    try {
      // 除錯用：確認送出的 NAS 憑證內容（驗證完成後請移除）
      // console.log('[NAS 驗證] 送出的憑證:', {
      //   host: nas.host,
      //   username: nas.username,
      //   password: nas.password,
      //   domain: nas.domain,
      //   share: nas.share,
      //   path: nas.path,
      // });
      const res = await backupApi.verifyNas({
        ...nas,
        share: nas.share || undefined,
        path: nas.path || undefined,
      });
      if (res.error) {
        setError(res.message || res.code || 'NAS 驗證失敗');
        return;
      }
      onDone(res.data?.fullPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'NAS 連線失敗（網路或伺服器錯誤）';
      setError(msg);
      console.error('[NAS 驗證]', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: '0.5rem' }}>輸入存取憑證</h2>
      <p className="subtitle">請依序輸入伺服器與儲存裝置的驗證資訊</p>

      {step === 'ssh' && (
        <div className="card">
          <div className="card-header">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-primary)' }}>
              <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path>
              <path d="M12 12v9"></path>
              <path d="m8 17 4 4 4-4"></path>
            </svg>
            SSH 遠端連線
          </div>
          
          <div className="grid-2-col">
            <div className="input-group">
              <label>主機 IP (HOST)</label>
              <input
                className="input-field"
                placeholder="10.9.82.57"
                value={ssh.host}
                onChange={(e) => setSsh((s) => ({ ...s, host: e.target.value }))}
              />
            </div>
            
            <div className="input-group">
              <label>使用者名稱 (USER)</label>
              <input
                className="input-field"
                placeholder="crownap"
                value={ssh.username}
                onChange={(e) => setSsh((s) => ({ ...s, username: e.target.value }))}
              />
            </div>
            
            <div className="input-group" style={{ gridColumn: '1 / -1' }}>
              <label>連線密碼 (PASSWORD)</label>
              <div className="input-with-icon">
                <input
                  className="input-field"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="密碼"
                  value={ssh.password}
                  onChange={(e) => setSsh((s) => ({ ...s, password: e.target.value }))}
                />
                <button
                  type="button"
                  className="input-icon-btn"
                  onClick={() => setShowPassword((v) => !v)}
                  title={showPassword ? '隱藏密碼' : '顯示密碼'}
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path><line x1="2" y1="2" x2="22" y2="22"></line></svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  )}
                </button>
              </div>
            </div>
          </div>

          {error && <div className="alert-error">{error}</div>}

          <div className="mt-4">
            <button className="btn btn-primary" onClick={verifySsh} disabled={loading}>
              {loading ? '驗證中...' : '驗證 SSH 連線'}
            </button>
          </div>
        </div>
      )}

      {step === 'sudo' && (
        <div className="card">
          <div className="card-header">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-primary)' }}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
            Root 權限驗證
          </div>
          
          <div className="input-group">
            <label>Sudo 密碼</label>
            <div className="input-with-icon">
              <input
                className="input-field"
                type={showPassword ? 'text' : 'password'}
                placeholder="sudo 密碼"
                value={sudoPwd}
                onChange={(e) => setSudoPwd(e.target.value)}
              />
              <button
                type="button"
                className="input-icon-btn"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path><line x1="2" y1="2" x2="22" y2="22"></line></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                )}
              </button>
            </div>
          </div>

          {error && <div className="alert-error">{error}</div>}

          <div className="mt-4">
            <button className="btn btn-primary" onClick={verifySudo} disabled={loading}>
              {loading ? '驗證中...' : '驗證 Root 權限'}
            </button>
          </div>
        </div>
      )}

      {step === 'nas' && (
        <div className="card">
          <div className="card-header">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-primary)' }}>
              <path d="M22 12H2"></path>
              <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
              <line x1="6" y1="16" x2="6.01" y2="16"></line>
              <line x1="10" y1="16" x2="10.01" y2="16"></line>
            </svg>
            NAS 儲存空間連線
          </div>
          
          <div className="grid-2-col">
            <div className="input-group">
              <label>主機 (HOST)</label>
              <input
                className="input-field"
                placeholder="10.9.82.22"
                value={nas.host}
                onChange={(e) => setNas((s) => ({ ...s, host: e.target.value }))}
              />
            </div>
            
            <div className="input-group">
              <label>網域 (DOMAIN)</label>
              <input
                className="input-field"
                placeholder="WORKGROUP"
                value={nas.domain}
                onChange={(e) => setNas((s) => ({ ...s, domain: e.target.value }))}
              />
            </div>
            
            <div className="input-group">
              <label>使用者 (USER)</label>
              <input
                className="input-field"
                placeholder="使用者"
                value={nas.username}
                onChange={(e) => setNas((s) => ({ ...s, username: e.target.value }))}
              />
            </div>
            
            <div className="input-group">
              <label>密碼</label>
              <div className="input-with-icon">
                <input
                  className="input-field"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="密碼"
                  value={nas.password}
                  onChange={(e) => setNas((s) => ({ ...s, password: e.target.value }))}
                />
                <button
                  type="button"
                  className="input-icon-btn"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path><line x1="2" y1="2" x2="22" y2="22"></line></svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  )}
                </button>
              </div>
            </div>
            
            <div className="input-group">
              <label>分享名稱 (SHARE)</label>
              <input
                className="input-field"
                placeholder="KE20.4.軟硬體系統備份記錄"
                value={nas.share}
                onChange={(e) => setNas((s) => ({ ...s, share: e.target.value }))}
              />
            </div>
            
            <div className="input-group">
              <label>目標路徑 (PATH)</label>
              <input
                className="input-field"
                placeholder="4.備份記錄/KE"
                value={nas.path}
                onChange={(e) => setNas((s) => ({ ...s, path: e.target.value }))}
              />
            </div>
          </div>

          {error && <div className="alert-error">{error}</div>}

          <div className="mt-4">
            <button className="btn btn-primary" onClick={verifyNas} disabled={loading}>
              {loading ? '驗證中...' : '驗證 NAS 並繼續'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
