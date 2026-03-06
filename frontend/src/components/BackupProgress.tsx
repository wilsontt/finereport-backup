/**
 * 備份進度與報告
 */
import { useState, useEffect, useRef } from 'react';
import { backupApi } from '../api/backup';
import { PathBrowserModal } from './PathSelector';
import { CheckCircle2, XCircle, Loader2, Terminal, FolderOpen, CalendarDays, Play } from 'lucide-react';
import type { BackupSource } from '../types';
import { UI_PRO_MAX } from '../styles/designSystem';

interface OperationLog {
  label: string;
  command: string;
  output?: string;
}

interface ProgressItem {
  step: string;
  percent: number;
  message: string;
  logs?: OperationLog[];
}

interface Props {
  backupId: string | null;
  onStart: (id: string) => void;
  sources: BackupSource[];
  nasPath: string;
}

export function BackupProgress({
  backupId,
  onStart,
  sources,
  nasPath,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [stagingLoading, setStagingLoading] = useState(false);
  const [error, setError] = useState('');
  const [percent, setPercent] = useState(0);
  const [currentMessage, setCurrentMessage] = useState('');
  const [operationLogs, setOperationLogs] = useState<OperationLog[]>([]);
  const [report, setReport] = useState('');
  const [done, setDone] = useState(false);
  const [backupFailed, setBackupFailed] = useState(false);
  const [stagingPath, setStagingPath] = useState('');
  const [stagingCreated, setStagingCreated] = useState(false);
  const [browseStaging, setBrowseStaging] = useState(false);
  const [deleteOldBackup, setDeleteOldBackup] = useState(false);
  const [retentionMonths, setRetentionMonths] = useState(0);
  
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    backupApi.getStagingDefaultPath().then((res) => {
      if (!res.error && res.data?.path) setStagingPath(res.data.path);
    });
  }, []);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [operationLogs]);

  const createStagingDir = async () => {
    if (!stagingPath.trim()) {
      setError('請輸入或選擇暫存目錄路徑');
      return;
    }
    setError('');
    setStagingLoading(true);
    const res = await backupApi.createStagingDir({ stagingPath: stagingPath.trim() });
    setStagingLoading(false);
    if (res.error) {
      setError(res.message || '建立暫存目錄失敗');
      return;
    }
    setStagingCreated(true);
    if (res.data?.path) setStagingPath(res.data.path);
  };

  const startBackup = async () => {
    if (!stagingPath.trim()) {
      setError('請輸入或選擇暫存目錄路徑');
      return;
    }
    setError('');
    setLoading(true);
    const res = await backupApi.startBackup({
      stagingPath: stagingPath.trim(),
      sources,
      nasPath,
      deleteOldBackup,
      retentionMonths: deleteOldBackup ? (retentionMonths || 6) : 0,
    });
    setLoading(false);
    if (res.error) {
      setError(res.message || '啟動失敗');
      return;
    }
    if (res.data?.backupId) {
      onStart(res.data.backupId);
    }
  };

  useEffect(() => {
    if (!backupId) return;
    setOperationLogs([]);
    setBackupFailed(false);
    const es = backupApi.getProgressStream(backupId);
    es.addEventListener('progress', (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data) as ProgressItem;
        setPercent(d.percent ?? 0);
        setCurrentMessage(d.message ?? '');
        if (d.logs && d.logs.length > 0) setOperationLogs(d.logs);
      } catch {
        // ignore
      }
    });
    es.addEventListener('done', (e: MessageEvent) => {
      try {
        const d = (e.data ? JSON.parse(e.data) : {}) as { logs?: OperationLog[]; success?: boolean };
        if (d.logs && d.logs.length > 0) setOperationLogs(d.logs);
        setBackupFailed(d.success === false);
      } catch {
        // ignore
      }
      setDone(true);
      setPercent(100);
      es.close();
      backupApi.getReport(backupId).then((r) => {
        if (r.data?.content) {
          setReport(r.data.content);
          if (r.data.content.includes('備份失敗')) setBackupFailed(true);
        }
      });
    });
    return () => es.close();
  }, [backupId]);

  if (!backupId) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className={UI_PRO_MAX.card}>
          <div className={UI_PRO_MAX.cardHeader}>
            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl mb-4">
              <Play className="w-8 h-8 ml-1" />
            </div>
            <h2 className={UI_PRO_MAX.cardTitle}>開始備份</h2>
            <p className={UI_PRO_MAX.pSub}>設定暫存目錄與保留策略後即可開始備份</p>
          </div>

          <div className={UI_PRO_MAX.cardBody}>
            <div className="space-y-8 max-w-3xl mx-auto">
              <section>
                <h3 className={UI_PRO_MAX.sectionTitle}>
                  <FolderOpen className="w-5 h-5 text-slate-400" />
                  遠端伺服器暫存目錄
                </h3>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
                  <div className="flex gap-3">
                    <input
                      className={UI_PRO_MAX.input}
                      value={stagingPath}
                      onChange={(e) => setStagingPath(e.target.value)}
                      placeholder="例：/home/crownap/backup/202603"
                    />
                    <button 
                      type="button" 
                      onClick={() => setBrowseStaging(true)}
                      disabled={stagingCreated}
                      className={UI_PRO_MAX.buttonSecondary}
                    >
                      <FolderOpen className="w-4 h-4" />
                      瀏覽
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">預設為 /home/使用者/backup/YYYYMM，可修改或點擊瀏覽重新選擇。</p>
                </div>
              </section>

              <section>
                <h3 className={UI_PRO_MAX.sectionTitle}>
                  <CalendarDays className="w-5 h-5 text-slate-400" />
                  備份保留策略
                </h3>
                <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative flex items-center">
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={deleteOldBackup}
                        onChange={(e) => setDeleteOldBackup(e.target.checked)}
                      />
                      <div className="w-5 h-5 border-2 border-slate-300 rounded peer-checked:bg-blue-600 peer-checked:border-blue-600 transition-colors flex items-center justify-center">
                        <CheckCircle2 className="w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
                      </div>
                    </div>
                    <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">
                      {deleteOldBackup ? '啟用自動清理 (刪除遠端舊備份)' : '保留所有遠端備份（不刪除）'}
                    </span>
                  </label>
                  
                  {deleteOldBackup && (
                    <div className="mt-4 ml-8 flex items-center gap-3 animate-in slide-in-from-top-2">
                      <label className="text-sm text-slate-600">保留期設定：</label>
                      <select
                        value={retentionMonths || 6}
                        onChange={(e) => setRetentionMonths(Number(e.target.value))}
                        className="bg-white border border-slate-300 text-slate-700 text-sm rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 block p-2 outline-none shadow-sm"
                      >
                        <option value={3}>保留 3 個月</option>
                        <option value={6}>保留 6 個月</option>
                        <option value={12}>保留 1 年</option>
                        <option value={24}>保留 2 年</option>
                      </select>
                    </div>
                  )}
                </div>
              </section>

              <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-slate-200 mt-6">
                <button 
                  onClick={createStagingDir} 
                  disabled={stagingLoading || stagingCreated || !stagingPath.trim()}
                  className={stagingCreated ? `${UI_PRO_MAX.buttonSmSecondary} bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100` : UI_PRO_MAX.buttonSmSecondary}
                >
                  {stagingLoading ? <><Loader2 className="w-5 h-5 animate-spin"/> 建立中...</> : stagingCreated ? <><CheckCircle2 className="w-5 h-5"/> 暫存目錄已準備</> : <><FolderOpen className="w-5 h-5"/> 1. 建立暫存目錄</>}
                </button>
                <button 
                  onClick={startBackup} 
                  disabled={loading || !stagingCreated || !stagingPath.trim() || !nasPath.trim()}
                  className={UI_PRO_MAX.buttonSmPrimary}
                >
                  {loading ? <><Loader2 className="w-5 h-5 animate-spin"/> 啟動中...</> : <><Play className="w-5 h-5 fill-current"/> 2. 開始執行備份</>}
                </button>
              </div>
              
              {error && (
                <div className={UI_PRO_MAX.alertErrorInline}>
                  <div className={UI_PRO_MAX.alertErrorIconBox}>!</div>
                  <span className="leading-relaxed whitespace-pre-wrap">{error}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {browseStaging && (
          <PathBrowserModal
            title="選擇遠端暫存目錄"
            currentPath={stagingPath || '/'}
            mode="remote"
            onSelect={(path) => {
              setStagingPath(path);
              setBrowseStaging(false);
            }}
            onClose={() => setBrowseStaging(false)}
          />
        )}
      </div>
    );
  }

  const isComplete = done && percent >= 100;
  const showReport = isComplete && report && !report.includes('（報告產生中）');

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className={UI_PRO_MAX.card}>
        <div className={UI_PRO_MAX.cardHeader}>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl mb-4">
            {done ? (backupFailed ? <XCircle className="w-8 h-8 text-red-500" /> : <CheckCircle2 className="w-8 h-8 text-emerald-500" />) : <Play className="w-8 h-8 ml-1" />}
          </div>
          <h2 className={UI_PRO_MAX.cardTitle}>備份執行進度</h2>
          <p className={UI_PRO_MAX.pSub}>
            {done ? (backupFailed ? '備份過程中發生錯誤' : '備份作業已順利完成') : '系統正在處理備份作業中...'}
          </p>
        </div>

        <div className={UI_PRO_MAX.cardBody}>
          <div className="max-w-4xl mx-auto space-y-6">
            
            {/* Progress Bar Section */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
              <div className="flex justify-between items-end mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {!done && <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />}
                    <span className={`font-medium ${done ? (backupFailed ? 'text-red-600' : 'text-emerald-600') : 'text-blue-700'}`}>
                      {done ? (backupFailed ? '備份中斷' : '備份成功') : '執行中'}
                    </span>
                  </div>
                  {currentMessage && (
                    <p className="text-sm text-slate-600 font-medium">{currentMessage}</p>
                  )}
                </div>
                <span className="text-3xl font-bold text-slate-800 tabular-nums tracking-tight">{percent}%</span>
              </div>
              
              <div className="h-4 w-full bg-slate-200 rounded-full overflow-hidden shadow-inner">
                <div
                  className={`h-full rounded-full transition-all duration-500 ease-out ${backupFailed ? 'bg-red-500' : percent >= 100 ? 'bg-emerald-500' : 'bg-blue-500 relative overflow-hidden'}`}
                  style={{ width: `${percent}%` }}
                >
                  {!done && !backupFailed && (
                    <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]" style={{ backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)', transform: 'skewX(-20deg)' }} />
                  )}
                </div>
              </div>
            </div>

      {/* Terminal Logs */}
      {operationLogs.length > 0 && (
        <div className="animate-in slide-in-from-top-4">
          <div className="flex items-center gap-2 mb-3">
            <Terminal className="w-5 h-5 text-slate-700" />
            <h3 className="font-semibold text-slate-800">作業日誌</h3>
          </div>
          <div className={UI_PRO_MAX.logContainer}>
            <div ref={logContainerRef} className={UI_PRO_MAX.logContent}>
              {operationLogs.map((log, i) => (
                <div key={i} className="mb-4 last:mb-0">
                  <div className="text-emerald-400/90 font-semibold mb-1"># {log.label}</div>
                  <div className="text-slate-300 break-all pl-2 border-l-2 border-slate-700">
                    <span className="text-blue-400 select-none mr-2">$</span>
                    <span>{log.command}</span>
                  </div>
                  {log.output != null && log.output !== '' && (
                    <div className="text-amber-200/80 mt-1.5 whitespace-pre-wrap break-all pl-6">
                      {log.output}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Report */}
      {showReport && (
        <div className="animate-in slide-in-from-top-4 pt-4">
          <div className={UI_PRO_MAX.alertSuccess + " mb-4"}>
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <p className="font-medium text-emerald-900">作業報告已產生</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 shadow-sm">
            <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700 leading-relaxed">
              {report}
            </pre>
          </div>
        </div>
      )}
      
      {isComplete && !showReport && report && (
        <div className="flex items-center justify-center gap-3 text-slate-500 py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="font-medium">系統正在彙整備份報告，請稍候...</span>
        </div>
      )}
          </div>
        </div>
      </div>
    </div>
  );
}
