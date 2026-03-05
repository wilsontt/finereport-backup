/**
 * 4 碼數字驗證（防機器人）
 */
import { useState, useEffect } from 'react';
import { backupApi } from '../api/backup';
import { ShieldCheck, RefreshCw, Loader2, CheckCircle2 } from 'lucide-react';

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

  const InputStyle = "w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-center text-[1.75rem] tracking-[0.4em] font-mono font-medium text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all duration-200 h-14";

  if (verified) {
    return (
      <div className="animate-slide-up">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-900">安全驗證</h2>
          <p className="text-slate-500 mt-2">驗證已完成，您可以繼續進行下一步</p>
        </div>

        <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-8 text-center">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">驗證成功</h3>
          
          {verifiedNasPath && (
            <div className="mt-6 p-4 bg-slate-50 border border-slate-100 rounded-xl text-left">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">NAS 驗證路徑</p>
              <code className="block text-sm text-slate-800 break-all font-mono bg-white p-3 rounded-lg border border-slate-200">
                {verifiedNasPath}
              </code>
            </div>
          )}

          <button onClick={onDone} className="w-full mt-8 flex justify-center items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl text-base font-medium transition-all active:scale-[0.98] shadow-md shadow-blue-600/20">
            繼續設定備份目錄
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-slide-up">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900">安全驗證</h2>
        <p className="text-slate-500 mt-2">請輸入下方顯示的 4 碼數字以確認您的身分</p>
      </div>

      <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-8">
        <div className="flex flex-col items-center max-w-xs mx-auto">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6">
            <ShieldCheck className="w-6 h-6" />
          </div>
          
          <div className="w-full mb-6 relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-500" />
            <div className="relative bg-white border-2 border-slate-100 rounded-2xl p-6 flex flex-col items-center justify-center shadow-sm">
              {displayCode ? (
                <div className="text-4xl tracking-[0.25em] font-bold text-slate-800 font-mono pl-3">
                  {displayCode}
                </div>
              ) : (
                <div className="h-10 flex items-center">
                  <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                </div>
              )}
            </div>
          </div>

          <div className="w-full space-y-4">
            <input
              placeholder="0000"
              maxLength={4}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className={InputStyle}
              autoFocus
            />
            
            <button onClick={verify} disabled={loading || code.length !== 4} className="w-full flex justify-center items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white py-4 rounded-xl text-base font-medium transition-all active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 shadow-md shadow-slate-900/10">
              {loading ? <><Loader2 className="w-5 h-5 animate-spin"/> 驗證中...</> : '確認驗證'}
            </button>
            
            <button onClick={fetchCode} disabled={loading} className="w-full flex justify-center items-center gap-2 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 py-4 rounded-xl text-base font-medium transition-all active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              重新取得驗證碼
            </button>
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
