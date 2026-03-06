/**
 * 備份進度與報告
 */
import { useState, useEffect, useRef } from 'react';
import { backupApi } from '../api/backup';
import { PathBrowserModal } from './PathSelector';
import { CheckCircle2, XCircle, Loader2, Terminal, FolderOpen, CalendarDays, Play } from 'lucide-react';
import type { BackupSource } from '../types';

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

  const InputStyle = "w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all duration-200";
  const LabelStyle = "block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider";

  if (!backupId) {
    return (
      <div className="animate-slide-up">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-900">開始備份</h2>
          <p className="text-slate-500 mt-2">設定暫存目錄與保留策略後即可開始備份</p>
        </div>

        <div className="space-y-6 bg-white border border-slate-100 shadow-sm rounded-2xl p-6">
          <div>
            <label className={LabelStyle}>暫存目錄（遠端伺服器）</label>
            <div className="flex gap-3">
              <input
                className={InputStyle}
                value={stagingPath}
                onChange={(e) => setStagingPath(e.target.value)}
                placeholder="例：/home/crownap/backup/202603"
              />
              <button 
                type="button" 
                onClick={() => setBrowseStaging(true)}
                disabled={stagingCreated}
                className="shrink-0 px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-base font-medium rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <FolderOpen className="w-5 h-5" />
                瀏覽
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">預設為 /home/使用者/backup/YYYYMM，可修改或點「瀏覽」選擇</p>
          </div>

          <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
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
                {deleteOldBackup ? '刪除遠端舊備份' : '保留遠端備份（不刪除）'}
              </span>
            </label>
            
            {deleteOldBackup && (
              <div className="mt-4 ml-8 flex items-center gap-3 animate-slide-up">
                <CalendarDays className="w-4 h-4 text-slate-400" />
                <label className="text-sm text-slate-600">保留期：</label>
                <select
                  value={retentionMonths || 6}
                  onChange={(e) => setRetentionMonths(Number(e.target.value))}
                  className="bg-white border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2 outline-none"
                >
                  <option value={3}>3 個月</option>
                  <option value={6}>6 個月</option>
                  <option value={12}>1 年</option>
                  <option value={24}>2 年</option>
                </select>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 pt-2">
            <button 
              onClick={createStagingDir} 
              disabled={stagingLoading || stagingCreated || !stagingPath.trim()}
              className={`flex-1 flex justify-center items-center gap-2 py-4 rounded-xl text-base font-medium transition-all active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 ${stagingCreated ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm'}`}
            >
              {stagingLoading ? <><Loader2 className="w-5 h-5 animate-spin"/> 建立中...</> : stagingCreated ? <><CheckCircle2 className="w-5 h-5"/> 暫存目錄已建立</> : <><FolderOpen className="w-5 h-5"/> 建立暫存目錄</>}
            </button>
            <button 
              onClick={startBackup} 
              disabled={loading || !stagingCreated || !stagingPath.trim() || !nasPath.trim()}
              className="flex-1 flex justify-center items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl text-base font-medium transition-all active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 shadow-md shadow-blue-600/20"
            >
              {loading ? <><Loader2 className="w-5 h-5 animate-spin"/> 啟動中...</> : <><Play className="w-5 h-5"/> 開始備份</>}
            </button>
          </div>
          
          {error && (
            <div className="p-4 bg-red-50 text-red-600 border border-red-100 rounded-xl text-sm flex items-start gap-3 animate-slide-up">
              <div className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0 mt-0.5">
                <span className="font-bold text-xs">!</span>
              </div>
              <span className="leading-relaxed whitespace-pre-wrap">{error}</span>
            </div>
          )}
        </div>

        {browseStaging && (
          <PathBrowserModal
            title="瀏覽遠端暫存目錄"
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
    <div className="animate-slide-up">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900">備份進度</h2>
        <p className="text-slate-500 mt-2">
          {done ? (backupFailed ? '備份過程中發生錯誤' : '備份作業已順利完成') : '正在執行備份作業，請稍候...'}
        </p>
      </div>

      <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-6 mb-6">
        <div className="flex justify-between items-end mb-3">
          <div>
            <div className="flex items-center gap-2">
              {done ? (
                backupFailed ? <XCircle className="w-5 h-5 text-red-500" /> : <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              ) : (
                <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
              )}
              <span className={`font-semibold ${done ? (backupFailed ? 'text-red-600' : 'text-emerald-600') : 'text-blue-600'}`}>
                {done ? (backupFailed ? '備份失敗' : '備份完成') : '備份中'}
              </span>
            </div>
            {currentMessage && (
              <p className="text-sm text-slate-500 mt-1.5">{currentMessage}</p>
            )}
          </div>
          <span className="text-2xl font-bold text-slate-800 tabular-nums">{percent}%</span>
        </div>
        
        <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
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

      {operationLogs.length > 0 && (
        <div className="mb-6 animate-slide-up">
          <div className="flex items-center gap-2 mb-3">
            <Terminal className="w-5 h-5 text-slate-700" />
            <h3 className="font-semibold text-slate-800">作業日誌</h3>
          </div>
          <div className="bg-[#0D1117] rounded-2xl p-5 overflow-hidden shadow-inner border border-slate-800">
            <div ref={logContainerRef} className="font-mono text-[13px] leading-relaxed max-h-[320px] overflow-y-auto custom-scrollbar pr-2 scroll-smooth">
              {operationLogs.map((log, i) => (
                <div key={i} className="mb-4 last:mb-0">
                  <div className="text-[#6A9955] mb-1"># {log.label}</div>
                  <div className="text-slate-300 break-all">
                    <span className="text-[#569CD6] select-none">$ </span>
                    <span className="text-[#D4D4D4]">{log.command}</span>
                  </div>
                  {log.output != null && log.output !== '' && (
                    <div className="text-[#CE9178] mt-1 whitespace-pre-wrap break-all pl-4 border-l-2 border-slate-700/50">
                      {log.output}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showReport && (
        <div className="animate-slide-up">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <h3 className="font-semibold text-slate-800">完成報告</h3>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
            <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700 leading-relaxed">
              {report}
            </pre>
          </div>
        </div>
      )}
      
      {isComplete && !showReport && report && (
        <div className="flex items-center justify-center gap-2 text-slate-500 py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">報告產生中...</span>
        </div>
      )}
    </div>
  );
}
