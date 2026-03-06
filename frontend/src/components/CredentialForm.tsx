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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const verifySsh = async () => {
    setError(''); setFieldErrors({});
    const errors: Record<string, string> = {};
    if (!ssh.host.trim()) errors.sshHost = '請輸入主機 IP';
    if (!ssh.username.trim()) errors.sshUsername = '請輸入使用者名稱';
    if (!ssh.password) errors.sshPassword = '請輸入連線密碼';
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    try {
      const res = await backupApi.verifySsh(ssh);
      if (res.error) { setError(res.message || 'SSH 驗證失敗'); return; }
      setStep('sudo'); setShowPassword(false); setFieldErrors({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SSH 連線失敗');
    } finally { setLoading(false); }
  };

  const verifySudo = async () => {
    setError(''); setFieldErrors({});
    if (!sudoPwd) {
      setFieldErrors({ sudoPwd: '請輸入 Sudo 密碼' });
      return;
    }

    setLoading(true);
    try {
      const res = await backupApi.verifySudo({ sudoPassword: sudoPwd });
      if (res.error) { setError(res.message || 'sudo 驗證失敗'); return; }
      setStep('nas'); setShowPassword(false); setFieldErrors({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'sudo 驗證失敗');
    } finally { setLoading(false); }
  };

  const verifyNas = async () => {
    setError(''); setFieldErrors({});
    const errors: Record<string, string> = {};
    if (!nas.host.trim()) errors.nasHost = '請輸入 NAS 主機 IP';
    if (!nas.username.trim()) errors.nasUsername = '請輸入使用者帳號';
    if (!nas.password) errors.nasPassword = '請輸入密碼';
    if (!nas.share.trim()) errors.nasShare = '請輸入共用資料夾';
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
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
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className={UI_PRO_MAX.card}>
        <div className={UI_PRO_MAX.cardHeader}>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl mb-4">
            <Shield className="w-8 h-8" />
          </div>
          <h2 className={UI_PRO_MAX.cardTitle}>系統存取憑證</h2>
          <p className={UI_PRO_MAX.pSub}>請依序完成伺服器與儲存裝置的連線驗證</p>
        </div>
        
        <div className={UI_PRO_MAX.cardBody}>
          <div className="relative max-w-2xl mx-auto">
            {/* Progress Line */}
            <div className="absolute left-5 top-10 bottom-10 w-0.5 bg-slate-100 -z-10" />

            <div className="space-y-8">
              {/* SSH Step */}
              <div className={`relative transition-all duration-300 ${step !== 'ssh' ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
                <div className="flex items-center gap-4 mb-5">
                  <div className={step === 'ssh' ? UI_PRO_MAX.stepIconActive : (step === 'sudo' || step === 'nas' ? UI_PRO_MAX.stepIconCompleted : UI_PRO_MAX.stepIconInactive)}>
                    <Terminal className="w-5 h-5" />
                  </div>
                  <h3 className={UI_PRO_MAX.h3}>SSH 遠端連線</h3>
                </div>
                
                {step === 'ssh' && (
                  <div className="ml-14 space-y-5 bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className={UI_PRO_MAX.label}>主機 IP (Host)</label>
                        <input className={fieldErrors.sshHost ? UI_PRO_MAX.inputError : UI_PRO_MAX.input} value={ssh.host} onChange={e => { setSsh(s => ({ ...s, host: e.target.value })); setFieldErrors(err => ({...err, sshHost: ''}))}} placeholder="10.x.x.x" />
                        {fieldErrors.sshHost && <div className={UI_PRO_MAX.errorText}>{fieldErrors.sshHost}</div>}
                      </div>
                      <div>
                        <label className={UI_PRO_MAX.label}>使用者名稱 (User)</label>
                        <input className={fieldErrors.sshUsername ? UI_PRO_MAX.inputError : UI_PRO_MAX.input} value={ssh.username} onChange={e => { setSsh(s => ({ ...s, username: e.target.value })); setFieldErrors(err => ({...err, sshUsername: ''}))}} placeholder="root" />
                        {fieldErrors.sshUsername && <div className={UI_PRO_MAX.errorText}>{fieldErrors.sshUsername}</div>}
                      </div>
                    </div>
                    <div>
                      <label className={UI_PRO_MAX.label}>連線密碼 (Password)</label>
                      <div className="relative">
                        <input type={showPassword ? 'text' : 'password'} className={fieldErrors.sshPassword ? UI_PRO_MAX.inputError : UI_PRO_MAX.input} value={ssh.password} onChange={e => { setSsh(s => ({ ...s, password: e.target.value })); setFieldErrors(err => ({...err, sshPassword: ''}))}} placeholder="••••••••" />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                      {fieldErrors.sshPassword && <div className={UI_PRO_MAX.errorText}>{fieldErrors.sshPassword}</div>}
                    </div>
                    <div className="pt-4">
                      <button onClick={verifySsh} disabled={loading} className={`${UI_PRO_MAX.buttonPrimary} w-full`}>
                        {loading ? <><Loader2 className="w-5 h-5 animate-spin"/> 驗證中...</> : '驗證 SSH 連線'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Sudo Step */}
              <div className={`relative transition-all duration-300 ${step !== 'sudo' ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
                <div className="flex items-center gap-4 mb-5">
                  <div className={step === 'sudo' ? UI_PRO_MAX.stepIconActive : (step === 'nas' ? UI_PRO_MAX.stepIconCompleted : UI_PRO_MAX.stepIconInactive)}>
                    <Shield className="w-5 h-5" />
                  </div>
                  <h3 className={UI_PRO_MAX.h3}>Root 權限驗證</h3>
                </div>

                {step === 'sudo' && (
                  <div className="ml-14 space-y-5 bg-white border border-slate-200 rounded-xl p-6 shadow-sm animate-in fade-in slide-in-from-top-4">
                    <div className={UI_PRO_MAX.alertWarning}>
                      <Shield className="w-5 h-5 text-amber-600 shrink-0" />
                      <div>
                        <p className="font-semibold text-amber-900 mb-0.5">需要管理員權限</p>
                        <p className="text-amber-800/80">系統需要執行底層備份操作，請提供具備 sudo 權限的密碼。</p>
                      </div>
                    </div>
                    <div>
                      <label className={UI_PRO_MAX.label}>Sudo 密碼</label>
                      <div className="relative">
                        <input type={showPassword ? 'text' : 'password'} className={fieldErrors.sudoPwd ? UI_PRO_MAX.inputError : UI_PRO_MAX.input} value={sudoPwd} onChange={e => { setSudoPwd(e.target.value); setFieldErrors(err => ({...err, sudoPwd: ''}))}} placeholder="••••••••" autoFocus />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                      {fieldErrors.sudoPwd && <div className={UI_PRO_MAX.errorText}>{fieldErrors.sudoPwd}</div>}
                    </div>
                    <div className="pt-4">
                      <button onClick={verifySudo} disabled={loading} className={`${UI_PRO_MAX.buttonPrimary} w-full`}>
                        {loading ? <><Loader2 className="w-5 h-5 animate-spin"/> 驗證中...</> : '驗證 Root 權限'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* NAS Step */}
              <div className={`relative transition-all duration-300 ${step !== 'nas' ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
                <div className="flex items-center gap-4 mb-5">
                  <div className={step === 'nas' ? UI_PRO_MAX.stepIconActive : UI_PRO_MAX.stepIconInactive}>
                    <HardDrive className="w-5 h-5" />
                  </div>
                  <h3 className={UI_PRO_MAX.h3}>NAS 儲存空間連線</h3>
                </div>

                {step === 'nas' && (
                  <div className="ml-14 space-y-5 bg-white border border-slate-200 rounded-xl p-6 shadow-sm animate-in fade-in slide-in-from-top-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className={UI_PRO_MAX.label}>主機 IP (Host)</label>
                        <input className={fieldErrors.nasHost ? UI_PRO_MAX.inputError : UI_PRO_MAX.input} value={nas.host} onChange={e => { setNas(s => ({ ...s, host: e.target.value })); setFieldErrors(err => ({...err, nasHost: ''}))}} placeholder="10.x.x.x" />
                        {fieldErrors.nasHost && <div className={UI_PRO_MAX.errorText}>{fieldErrors.nasHost}</div>}
                      </div>
                      <div>
                        <label className={UI_PRO_MAX.label}>網域 (Domain)</label>
                        <input className={UI_PRO_MAX.input} value={nas.domain} placeholder="WORKGROUP" onChange={e => setNas(s => ({ ...s, domain: e.target.value }))} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className={UI_PRO_MAX.label}>使用者名稱 (User)</label>
                        <input className={fieldErrors.nasUsername ? UI_PRO_MAX.inputError : UI_PRO_MAX.input} value={nas.username} onChange={e => { setNas(s => ({ ...s, username: e.target.value })); setFieldErrors(err => ({...err, nasUsername: ''}))}} placeholder="admin" />
                        {fieldErrors.nasUsername && <div className={UI_PRO_MAX.errorText}>{fieldErrors.nasUsername}</div>}
                      </div>
                      <div>
                        <label className={UI_PRO_MAX.label}>密碼 (Password)</label>
                        <div className="relative">
                          <input type={showPassword ? 'text' : 'password'} className={fieldErrors.nasPassword ? UI_PRO_MAX.inputError : UI_PRO_MAX.input} value={nas.password} onChange={e => { setNas(s => ({ ...s, password: e.target.value })); setFieldErrors(err => ({...err, nasPassword: ''}))}} placeholder="••••••••" />
                          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                          </button>
                        </div>
                        {fieldErrors.nasPassword && <div className={UI_PRO_MAX.errorText}>{fieldErrors.nasPassword}</div>}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-5 pt-5 border-t border-slate-100 mt-2">
                      <div>
                        <label className={UI_PRO_MAX.label}>共用資料夾 (Share)</label>
                        <input className={fieldErrors.nasShare ? UI_PRO_MAX.inputError : UI_PRO_MAX.input} value={nas.share} onChange={e => { setNas(s => ({ ...s, share: e.target.value })); setFieldErrors(err => ({...err, nasShare: ''}))}} placeholder="Backup" />
                        {fieldErrors.nasShare && <div className={UI_PRO_MAX.errorText}>{fieldErrors.nasShare}</div>}
                      </div>
                      <div>
                        <label className={UI_PRO_MAX.label}>目標路徑 (Path)</label>
                        <input className={UI_PRO_MAX.input} value={nas.path} onChange={e => setNas(s => ({ ...s, path: e.target.value }))} placeholder="path/to/folder" />
                      </div>
                    </div>
                    <div className="pt-4">
                      <button onClick={verifyNas} disabled={loading} className={`${UI_PRO_MAX.buttonPrimary} w-full bg-slate-900 hover:bg-slate-800 focus:ring-slate-900`}>
                        {loading ? <><Loader2 className="w-5 h-5 animate-spin"/> 驗證中...</> : '完成驗證並繼續'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className={UI_PRO_MAX.alertError + " mt-6"}>
          <div className={UI_PRO_MAX.alertErrorIconBox}>!</div>
          <span className="leading-relaxed">{error}</span>
        </div>
      )}
    </div>
  );
}