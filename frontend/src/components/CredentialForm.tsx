import { useState } from 'react';
import { backupApi } from '../api/backup';
import { Terminal, Shield, HardDrive, Eye, EyeOff, Loader2 } from 'lucide-react';
import { UI_PRO_MAX } from '../styles/designSystem';

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
    setError(''); setLoading(true);
    try {
      const res = await backupApi.verifySsh(ssh);
      if (res.error) { setError(res.message || 'SSH 驗證失敗'); return; }
      setStep('sudo'); setShowPassword(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SSH 連線失敗');
    } finally { setLoading(false); }
  };

  const verifySudo = async () => {
    setError(''); setLoading(true);
    try {
      const res = await backupApi.verifySudo({ sudoPassword: sudoPwd });
      if (res.error) { setError(res.message || 'sudo 驗證失敗'); return; }
      setStep('nas'); setShowPassword(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'sudo 驗證失敗');
    } finally { setLoading(false); }
  };

  const verifyNas = async () => {
    // 檢查是否有輸入使用者帳號
    if (!nas.username.trim()) {
      setError('請輸入使用者帳號');
      return;
    }
    if (!nas.password) {
      setError('請輸入密碼');
      return;
    }

    setError(''); setLoading(true);
    try {
      const res = await backupApi.verifyNas({
        ...nas, share: nas.share || undefined, path: nas.path || undefined,
      });
      if (res.error) { setError(res.message || res.code || 'NAS 驗證失敗'); return; }
      onDone(res.data?.fullPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'NAS 連線失敗');
    } finally { setLoading(false); }
  };

  return (
    <div className="animate-slide-up">
      <div className="mb-8">
        <h2 className={UI_PRO_MAX.h2}>存取憑證</h2>
        <p className={UI_PRO_MAX.pSub}>請依序輸入伺服器與儲存裝置的驗證資訊</p>
      </div>

      <div className="relative">
        {/* Progress Line */}
        <div className="absolute left-6 top-0 bottom-0 w-px bg-slate-100 -z-10" />

        <div className="space-y-8">
          {/* SSH Step */}
          <div className={`relative transition-all duration-300 ${step !== 'ssh' ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
            <div className="flex items-center gap-4 mb-4">
              <div className={step === 'ssh' ? UI_PRO_MAX.stepIconActive : UI_PRO_MAX.stepIconInactive}>
                <Terminal className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">SSH 連線設定</h3>
            </div>
            
            {step === 'ssh' && (
              <div className={UI_PRO_MAX.sectionCardInner}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className={UI_PRO_MAX.label}>主機 (Host)</label>
                    <input className={UI_PRO_MAX.input} value={ssh.host} onChange={e => setSsh(s => ({ ...s, host: e.target.value }))} placeholder="10.x.x.x" />
                  </div>
                  <div>
                    <label className={UI_PRO_MAX.label}>使用者 (User)</label>
                    <input className={UI_PRO_MAX.input} value={ssh.username} onChange={e => setSsh(s => ({ ...s, username: e.target.value }))} placeholder="root" />
                  </div>
                </div>
                <div>
                  <label className={UI_PRO_MAX.label}>密碼 (Password)</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} className={UI_PRO_MAX.input} value={ssh.password} onChange={e => setSsh(s => ({ ...s, password: e.target.value }))} placeholder="••••••••" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                <button onClick={verifySsh} disabled={loading} className={`${UI_PRO_MAX.buttonDark} mt-5`}>
                  {loading ? <><Loader2 className="w-5 h-5 animate-spin"/> 驗證中...</> : '驗證 SSH 連線'}
                </button>
              </div>
            )}
          </div>

          {/* Sudo Step */}
          <div className={`relative transition-all duration-300 ${step !== 'sudo' ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
            <div className="flex items-center gap-4 mb-4">
              <div className={step === 'sudo' ? UI_PRO_MAX.stepIconActive : UI_PRO_MAX.stepIconInactive}>
                <Shield className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Root 權限驗證</h3>
            </div>

            {step === 'sudo' && (
              <div className={`${UI_PRO_MAX.sectionCardInner} animate-slide-up`}>
                <div className="bg-amber-50/50 border border-amber-200/50 text-amber-800 text-sm px-5 py-4 rounded-xl flex items-start gap-3">
                  <Shield className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <p>由於需要執行備份操作，請提供具備 sudo 權限的密碼。</p>
                </div>
                <div>
                  <label className={UI_PRO_MAX.label}>Sudo 密碼</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} className={UI_PRO_MAX.input} value={sudoPwd} onChange={e => setSudoPwd(e.target.value)} placeholder="••••••••" autoFocus />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                <button onClick={verifySudo} disabled={loading} className={`${UI_PRO_MAX.buttonDark} mt-5`}>
                  {loading ? <><Loader2 className="w-5 h-5 animate-spin"/> 驗證中...</> : '驗證 Root 權限'}
                </button>
              </div>
            )}
          </div>

          {/* NAS Step */}
          <div className={`relative transition-all duration-300 ${step !== 'nas' ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
            <div className="flex items-center gap-4 mb-4">
              <div className={step === 'nas' ? UI_PRO_MAX.stepIconActive : UI_PRO_MAX.stepIconInactive}>
                <HardDrive className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">NAS 儲存空間連線</h3>
            </div>

            {step === 'nas' && (
              <div className={`${UI_PRO_MAX.sectionCardInner} animate-slide-up`}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div><label className={UI_PRO_MAX.label}>主機 (Host)</label><input className={UI_PRO_MAX.input} value={nas.host} onChange={e => setNas(s => ({ ...s, host: e.target.value }))} placeholder="10.x.x.x" /></div>
                  <div><label className={UI_PRO_MAX.label}>網域 (Domain)</label><input className={UI_PRO_MAX.input} value={nas.domain} placeholder="WORKGROUP" onChange={e => setNas(s => ({ ...s, domain: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div><label className={UI_PRO_MAX.label}>使用者 (User)</label><input className={UI_PRO_MAX.input} value={nas.username} onChange={e => setNas(s => ({ ...s, username: e.target.value }))} placeholder="admin" /></div>
                  <div>
                    <label className={UI_PRO_MAX.label}>密碼</label>
                    <div className="relative">
                      <input type={showPassword ? 'text' : 'password'} className={UI_PRO_MAX.input} value={nas.password} onChange={e => setNas(s => ({ ...s, password: e.target.value }))} placeholder="••••••••" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-5 border-t border-slate-100 mt-2">
                  <div><label className={UI_PRO_MAX.label}>分享名稱 (Share)</label><input className={UI_PRO_MAX.input} value={nas.share} onChange={e => setNas(s => ({ ...s, share: e.target.value }))} placeholder="Backup" /></div>
                  <div><label className={UI_PRO_MAX.label}>目標路徑 (Path)</label><input className={UI_PRO_MAX.input} value={nas.path} onChange={e => setNas(s => ({ ...s, path: e.target.value }))} placeholder="path/to/folder" /></div>
                </div>
                <button onClick={verifyNas} disabled={loading} className={`${UI_PRO_MAX.buttonPrimary} mt-5`}>
                  {loading ? <><Loader2 className="w-5 h-5 animate-spin"/> 驗證中...</> : '驗證 NAS 並繼續'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className={UI_PRO_MAX.alertError}>
          <div className={UI_PRO_MAX.alertErrorIconBox}>
            <span className="font-bold text-xs">!</span>
          </div>
          <span className="leading-relaxed">{error}</span>
        </div>
      )}
    </div>
  );
}