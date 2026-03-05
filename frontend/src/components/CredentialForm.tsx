import { useState } from 'react';
import { backupApi } from '../api/backup';
import { Terminal, Shield, HardDrive, Eye, EyeOff, Loader2 } from 'lucide-react';

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

  const InputStyle = "w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all duration-200";
  const LabelStyle = "block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider";

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
        <h2 className="text-2xl font-bold text-slate-900">存取憑證</h2>
        <p className="text-slate-500 mt-2">請依序輸入伺服器與儲存裝置的驗證資訊</p>
      </div>

      <div className="relative">
        {/* Progress Line */}
        <div className="absolute left-6 top-0 bottom-0 w-px bg-slate-100 -z-10" />

        <div className="space-y-8">
          {/* SSH Step */}
          <div className={`relative transition-all duration-300 ${step !== 'ssh' ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
            <div className="flex items-center gap-4 mb-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm border ${step === 'ssh' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-400'}`}>
                <Terminal className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">SSH 連線設定</h3>
            </div>
            
            {step === 'ssh' && (
              <div className="ml-16 space-y-5 bg-white border border-slate-100 shadow-sm rounded-2xl p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className={LabelStyle}>主機 (Host)</label>
                    <input className={InputStyle} value={ssh.host} onChange={e => setSsh(s => ({ ...s, host: e.target.value }))} placeholder="10.x.x.x" />
                  </div>
                  <div>
                    <label className={LabelStyle}>使用者 (User)</label>
                    <input className={InputStyle} value={ssh.username} onChange={e => setSsh(s => ({ ...s, username: e.target.value }))} placeholder="root" />
                  </div>
                </div>
                <div>
                  <label className={LabelStyle}>密碼 (Password)</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} className={InputStyle} value={ssh.password} onChange={e => setSsh(s => ({ ...s, password: e.target.value }))} placeholder="••••••••" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                <button onClick={verifySsh} disabled={loading} className="w-full flex justify-center items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white py-4 rounded-xl text-base font-medium transition-all active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 mt-5 shadow-md shadow-slate-900/10">
                  {loading ? <><Loader2 className="w-5 h-5 animate-spin"/> 驗證中...</> : '驗證 SSH 連線'}
                </button>
              </div>
            )}
          </div>

          {/* Sudo Step */}
          <div className={`relative transition-all duration-300 ${step !== 'sudo' ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
            <div className="flex items-center gap-4 mb-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm border ${step === 'sudo' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-400'}`}>
                <Shield className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Root 權限驗證</h3>
            </div>

            {step === 'sudo' && (
              <div className="ml-16 space-y-5 bg-white border border-slate-100 shadow-sm rounded-2xl p-6 animate-slide-up">
                <div className="bg-amber-50/50 border border-amber-200/50 text-amber-800 text-sm px-5 py-4 rounded-xl flex items-start gap-3">
                  <Shield className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <p>由於需要執行備份操作，請提供具備 sudo 權限的密碼。</p>
                </div>
                <div>
                  <label className={LabelStyle}>Sudo 密碼</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} className={InputStyle} value={sudoPwd} onChange={e => setSudoPwd(e.target.value)} placeholder="••••••••" autoFocus />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                <button onClick={verifySudo} disabled={loading} className="w-full flex justify-center items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white py-4 rounded-xl text-base font-medium transition-all active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 mt-5 shadow-md shadow-slate-900/10">
                  {loading ? <><Loader2 className="w-5 h-5 animate-spin"/> 驗證中...</> : '驗證 Root 權限'}
                </button>
              </div>
            )}
          </div>

          {/* NAS Step */}
          <div className={`relative transition-all duration-300 ${step !== 'nas' ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
            <div className="flex items-center gap-4 mb-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm border ${step === 'nas' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-400'}`}>
                <HardDrive className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">NAS 儲存空間連線</h3>
            </div>

            {step === 'nas' && (
              <div className="ml-16 space-y-5 bg-white border border-slate-100 shadow-sm rounded-2xl p-6 animate-slide-up">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div><label className={LabelStyle}>主機 (Host)</label><input className={InputStyle} value={nas.host} onChange={e => setNas(s => ({ ...s, host: e.target.value }))} placeholder="10.x.x.x" /></div>
                  <div><label className={LabelStyle}>網域 (Domain)</label><input className={InputStyle} value={nas.domain} placeholder="WORKGROUP" onChange={e => setNas(s => ({ ...s, domain: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div><label className={LabelStyle}>使用者 (User)</label><input className={InputStyle} value={nas.username} onChange={e => setNas(s => ({ ...s, username: e.target.value }))} placeholder="admin" /></div>
                  <div>
                    <label className={LabelStyle}>密碼</label>
                    <div className="relative">
                      <input type={showPassword ? 'text' : 'password'} className={InputStyle} value={nas.password} onChange={e => setNas(s => ({ ...s, password: e.target.value }))} placeholder="••••••••" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-5 border-t border-slate-100 mt-2">
                  <div><label className={LabelStyle}>分享名稱 (Share)</label><input className={InputStyle} value={nas.share} onChange={e => setNas(s => ({ ...s, share: e.target.value }))} placeholder="Backup" /></div>
                  <div><label className={LabelStyle}>目標路徑 (Path)</label><input className={InputStyle} value={nas.path} onChange={e => setNas(s => ({ ...s, path: e.target.value }))} placeholder="path/to/folder" /></div>
                </div>
                <button onClick={verifyNas} disabled={loading} className="w-full flex justify-center items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl text-base font-medium transition-all active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 mt-5 shadow-md shadow-blue-600/20">
                  {loading ? <><Loader2 className="w-5 h-5 animate-spin"/> 驗證中...</> : '驗證 NAS 並繼續'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-6 p-4 bg-red-50 text-red-600 border border-red-100 rounded-xl text-sm flex items-start gap-3 animate-slide-up">
          <div className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0 mt-0.5">
            <span className="font-bold text-xs">!</span>
          </div>
          <span className="leading-relaxed">{error}</span>
        </div>
      )}
    </div>
  );
}