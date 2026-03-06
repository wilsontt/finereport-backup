/**
 * 4 碼數字驗證（防機器人）
 */
import { useState, useEffect } from 'react';
import { backupApi } from '../api/backup';
import { ShieldCheck, RefreshCw, Loader2, CheckCircle2 } from 'lucide-react';
import { UI_PRO_MAX } from '../styles/designSystem';

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
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className={UI_PRO_MAX.card}>
          <div className={UI_PRO_MAX.cardHeader}>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className={UI_PRO_MAX.cardTitle}>安全驗證已通過</h2>
                <p className={UI_PRO_MAX.pSub}>您可以繼續進行下一步</p>
              </div>
            </div>
          </div>

          <div className={UI_PRO_MAX.cardBody}>
            <div className="max-w-2xl mx-auto py-4">
              <div className={UI_PRO_MAX.alertSuccess}>
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <p className="font-medium text-emerald-900">身分驗證成功</p>
                  <p className="text-emerald-800/80 mt-1">系統已確認您的操作權限。</p>
                </div>
              </div>
              
              {verifiedNasPath && (
                <div className="mt-6 p-5 bg-slate-50 border border-slate-200 rounded-xl">
                  <p className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-slate-400" />
                    已授權存取 NAS 路徑：
                  </p>
                  <div className={UI_PRO_MAX.codeBlock}>
                    {verifiedNasPath}
                  </div>
                </div>
              )}

              <div className="mt-8 flex justify-end">
                <button onClick={onDone} className={UI_PRO_MAX.buttonPrimary}>
                  繼續設定備份目錄
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className={UI_PRO_MAX.card}>
        <div className={UI_PRO_MAX.cardHeader}>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className={UI_PRO_MAX.cardTitle}>安全驗證</h2>
              <p className={UI_PRO_MAX.pSub}>請輸入下方顯示的 4 碼數字以確認您的身分</p>
            </div>
          </div>
        </div>

        <div className={UI_PRO_MAX.cardBody}>
          <div className="flex flex-col items-center max-w-sm mx-auto py-8">
            <div className="w-full mb-8 relative group">
              <div className="absolute inset-0 bg-slate-100 rounded-xl transform translate-y-2 group-hover:translate-y-3 transition-transform" />
              <div className="relative bg-white border border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center shadow-sm">
                {displayCode ? (
                  <div className="text-5xl tracking-[0.2em] font-bold text-slate-800 font-mono">
                    {displayCode}
                  </div>
                ) : (
                  <div className="h-12 flex items-center">
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                  </div>
                )}
              </div>
            </div>

            <div className="w-full space-y-5">
              <input
                placeholder="0000"
                maxLength={4}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className={UI_PRO_MAX.inputVerification}
                autoFocus
              />
              
              <div className="grid grid-cols-2 gap-3">
                <button onClick={fetchCode} disabled={loading} className={`${UI_PRO_MAX.buttonSecondary} w-full`}>
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  重新取得
                </button>
                <button onClick={verify} disabled={loading || code.length !== 4} className={`${UI_PRO_MAX.buttonPrimary} w-full bg-slate-900 hover:bg-slate-800 focus:ring-slate-900`}>
                  {loading ? <><Loader2 className="w-5 h-5 animate-spin"/> 驗證中</> : '確認驗證'}
                </button>
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
