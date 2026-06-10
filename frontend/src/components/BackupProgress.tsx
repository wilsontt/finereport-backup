/**
 * 備份進度與報告
 */
import { useState, useEffect, useRef } from 'react';
import { backupApi } from '../api/backup';
import { PathBrowserModal } from './PathSelector';
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
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    backupApi.getStagingDefaultPath().then((res) => {
      if (!res.error && res.data?.path) setStagingPath(res.data.path);
    });
  }, []);

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
      sessionStorage.removeItem('finereport-backup-id');
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

  useEffect(() => {
    if (!backupId || done) return;
    startTimeRef.current = Date.now();
    setElapsedSeconds(0);
    const timer = setInterval(() => {
      if (startTimeRef.current !== null) {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [backupId, done]);

  if (!backupId) {
    return (
      <div style={{ position: 'relative' }}>
        <h2 style={{ marginBottom: '0.5rem' }}>4. 開始備份</h2>
        <p className="subtitle">請確認暫存目錄與舊備份保留設定</p>
        
        <div className="card">
          <div className="input-group">
            <label>暫存目錄（遠端伺服器）</label>
            <div className="flex gap-2">
              <input
                className="input-field"
                value={stagingPath}
                onChange={(e) => setStagingPath(e.target.value)}
                placeholder="例：/home/crownap/backup/202603"
                style={{ flex: 1 }}
              />
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setBrowseStaging(true)}
                disabled={stagingCreated}
              >
                瀏覽
              </button>
            </div>
            <small style={{ color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>預設為 /home/使用者/backup/YYYYMM，可修改或點「瀏覽」選擇</small>
          </div>
          
          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={deleteOldBackup}
                onChange={(e) => setDeleteOldBackup(e.target.checked)}
                style={{ width: '1rem', height: '1rem', accentColor: 'var(--color-primary)' }}
              />
              <span>
                {deleteOldBackup ? '刪除遠端舊備份' : '保留遠端備份（不刪除）'}
                {deleteOldBackup && <span style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', fontWeight: 400 }}>（範圍：/home/crownap/backup/）</span>}
              </span>
            </label>
            
            {deleteOldBackup && (
              <div style={{ marginLeft: '1.5rem', marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>保留期：</label>
                <select
                  className="input-field"
                  value={retentionMonths || 6}
                  onChange={(e) => setRetentionMonths(Number(e.target.value))}
                  style={{ width: 'auto', padding: '0.25rem 0.5rem' }}
                >
                  <option value={3}>3 個月</option>
                  <option value={6}>6 個月</option>
                  <option value={12}>1 年</option>
                  <option value={24}>2 年</option>
                </select>
              </div>
            )}
          </div>
          
          <div className="flex gap-4">
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={createStagingDir} disabled={stagingLoading || stagingCreated || !stagingPath.trim()}>
              {stagingLoading ? '建立中...' : stagingCreated ? '暫存目錄已建立' : '建立暫存目錄'}
            </button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={startBackup} disabled={loading || !stagingCreated}>
              {loading ? '啟動中...' : '開始備份'}
            </button>
          </div>
          
          {error && <div className="alert-error" style={{ marginBottom: 0 }}>{error}</div>}
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

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  // 35–90% 為 SFTP 下載或 SMB 上傳的長任務範圍
  const isIndeterminate = !done && percent >= 35 && percent < 90;

  const isComplete = done && percent >= 100;
  const showReport = isComplete && report && !report.includes('（報告產生中）');

  return (
    <div>
      <h2 style={{ marginBottom: '0.5rem' }}>備份進度</h2>
      <p className="subtitle">正在執行備份作業，請稍候</p>
      
      <div className="card">
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontWeight: 500 }}>
            <span style={{ color: done ? (backupFailed ? 'var(--color-error-text)' : 'var(--color-success)') : 'var(--color-primary)' }}>
              {done ? (backupFailed ? '備份失敗' : '備份完成') : '備份中...'}
            </span>
            <span>{percent}%</span>
          </div>
          <div
            style={{
              height: '0.75rem',
              background: 'var(--color-border)',
              borderRadius: '999px',
              overflow: 'hidden',
            }}
          >
            <>
              <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
              <div
                style={{
                  height: '100%',
                  width: `${percent}%`,
                  background: backupFailed
                    ? 'var(--color-error-text)'
                    : percent >= 100
                      ? 'var(--color-success)'
                      : 'var(--color-primary)',
                  transition: isIndeterminate ? 'none' : 'width 0.3s ease',
                  backgroundImage: isIndeterminate
                    ? 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%)'
                    : 'none',
                  backgroundSize: isIndeterminate ? '200% 100%' : 'auto',
                  animation: isIndeterminate ? 'shimmer 1.5s linear infinite' : 'none',
                }}
              />
            </>
          </div>
          {currentMessage && (
            <p style={{ margin: '0.75rem 0 0 0', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{currentMessage}</p>
          )}
          {!done && backupId && (
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
              已經過 {formatElapsed(elapsedSeconds)}
            </p>
          )}
        </div>
        
        {operationLogs.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>
              作業日誌
              <span style={{ fontSize: '0.9375rem', fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: '0.5rem' }}>
                （最新的在最上面）
              </span>
            </h3>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                background: '#1e1e1e',
                color: '#d4d4d4',
                padding: '1.25rem',
                borderRadius: 'var(--radius-md)',
                fontSize: '1.0625rem',
                lineHeight: 1.7,
                fontFamily: 'ui-monospace, monospace',
                maxHeight: '560px',
                overflowY: 'auto',
                margin: 0,
              }}
            >
              {[...operationLogs].reverse().map((log, i) => (
                <div key={i} style={{ marginBottom: '0.85rem' }}>
                  <span style={{ color: '#6a9955' }}>{'# '}{log.label}</span>
                  <br />
                  <span style={{ color: '#9cdcfe' }}>$ </span>
                  <span>{log.command}</span>
                  {log.output != null && log.output !== '' && (
                    <>
                      <br />
                      <span style={{ color: '#ce9178' }}>{log.output}</span>
                    </>
                  )}
                </div>
              ))}
            </pre>
          </div>
        )}
        
        {showReport && (
          <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>完成報告</h3>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                background: 'var(--color-bg)',
                padding: '1rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                fontSize: '0.875rem',
                fontFamily: 'ui-monospace, monospace',
                margin: 0,
                overflowX: 'auto',
              }}
            >
              {report}
            </pre>
          </div>
        )}
        {isComplete && !showReport && report && (
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>報告產生中...</p>
        )}
      </div>
    </div>
  );
}
