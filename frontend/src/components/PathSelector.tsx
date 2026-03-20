/**
 * 遠端來源與 NAS 路徑確認
 */
import { useState, useEffect } from 'react';
import { backupApi } from '../api/backup';
import type { BackupSource } from '../types';

interface Props {
  onDone: () => void;
  sources: BackupSource[];
  setSources: (s: BackupSource[]) => void;
  nasPath: string;
  setNasPath: (p: string) => void;
}

type BrowseTarget = 'nasPath' | 'addSourcePath' | 'addDestPath' | 'editSourcePath' | 'editDestPath' | null;

export function PathSelector({
  onDone,
  sources,
  setSources,
  nasPath,
  setNasPath,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [browseTarget, setBrowseTarget] = useState<BrowseTarget>(null);
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<BackupSource | null>(null);
  const [addLabel, setAddLabel] = useState('');
  const [addSourcePath, setAddSourcePath] = useState('');
  const [addDestPath, setAddDestPath] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [editSourcePath, setEditSourcePath] = useState('');
  const [editDestPath, setEditDestPath] = useState('');

  const discover = async () => {
    setError('');
    setLoading(true);
    const res = await backupApi.discoverRemote();
    setLoading(false);
    if (res.error) {
      setError(res.message || '探索失敗');
      return;
    }
    if (res.data?.sources) {
      setSources(res.data.sources as BackupSource[]);
    }
  };

  const loadDefaultNasPath = async () => {
    const res = await backupApi.getNasDefaultPath();
    if (!res.error && res.data?.path && !nasPath) {
      setNasPath(res.data.path);
    }
  };

  useEffect(() => {
    discover();
    loadDefaultNasPath();
  }, []);

  const handleAddSource = async () => {
    if (!addLabel.trim() || !addSourcePath.trim() || !addDestPath.trim()) return;
    const res = await backupApi.addSource({
      label: addLabel,
      sourcePath: addSourcePath,
      destPath: addDestPath,
    });
    if (res.error) {
      setError(res.message || '新增失敗');
      return;
    }
    if (res.data) {
      setSources([...sources, res.data as BackupSource]);
      setAddSourceOpen(false);
      setAddLabel('');
      setAddSourcePath('');
      setAddDestPath('');
    }
  };

  const removeSource = (id: string) => {
    setSources(sources.filter((s) => s.id !== id));
  };

  const startEdit = (s: BackupSource) => {
    setEditingSource(s);
    setEditLabel(s.label);
    setEditSourcePath(s.sourcePath);
    setEditDestPath(s.destPath);
  };

  const updateSource = () => {
    if (!editingSource || !editLabel.trim() || !editSourcePath.trim() || !editDestPath.trim()) return;
    setSources(sources.map((s) =>
      s.id === editingSource.id
        ? { ...s, label: editLabel.trim(), sourcePath: editSourcePath.trim(), destPath: editDestPath.trim() }
        : s
    ));
    setEditingSource(null);
  };

  const getBrowseCurrentPath = (): string => {
    if (browseTarget === 'nasPath') return nasPath;
    if (browseTarget === 'addSourcePath') return addSourcePath;
    if (browseTarget === 'addDestPath') return addDestPath;
    if (browseTarget === 'editSourcePath') return editSourcePath;
    if (browseTarget === 'editDestPath') return editDestPath;
    return '';
  };

  const handleBrowseSelect = (path: string) => {
    if (browseTarget === 'nasPath') setNasPath(path);
    if (browseTarget === 'addSourcePath') setAddSourcePath(path);
    if (browseTarget === 'addDestPath') setAddDestPath(path);
    if (browseTarget === 'editSourcePath') setEditSourcePath(path);
    if (browseTarget === 'editDestPath') setEditDestPath(path);
    setBrowseTarget(null);
  };

  const isBrowsing = browseTarget !== null;
  const isNasBrowse = browseTarget === 'nasPath' || browseTarget === 'addDestPath' || browseTarget === 'editDestPath';
  const isRemoteBrowse = browseTarget === 'addSourcePath' || browseTarget === 'editSourcePath';
  const isDestPathBrowse = browseTarget === 'addDestPath' || browseTarget === 'editDestPath';

  const handleBrowseSelectWithBase = (path: string) => {
    if (isDestPathBrowse && nasPath && path.startsWith(nasPath + '/')) {
      handleBrowseSelect(path.slice(nasPath.length + 1));
    } else {
      handleBrowseSelect(path);
    }
  };

  const getBrowseInitialPath = (): string => {
    const current = getBrowseCurrentPath();
    if (isDestPathBrowse && nasPath && current) {
      return nasPath + '/' + current.replace(/^\//, '');
    }
    if (isDestPathBrowse && nasPath) return nasPath;
    return current || (isRemoteBrowse ? '/' : '');
  };

  return (
    <div>
      <h2 style={{ marginBottom: '0.5rem' }}>3. 確認備份目錄</h2>
      <p className="subtitle">請確認遠端來源與 NAS 備份路徑</p>
      
      <div className="card" style={{ opacity: isBrowsing ? 0.5 : 1, pointerEvents: isBrowsing ? 'none' : 'auto' }}>
        <div className="mb-4">
          <button className="btn btn-secondary w-full" onClick={discover} disabled={loading}>
            {loading ? '探索中...' : '探索遠端目錄'}
          </button>
        </div>
        
        {sources.length > 0 && (
          <div className="mb-4">
            <div className="flex justify-between items-center mb-4">
              <h3 style={{ margin: 0 }}>遠端來源</h3>
              <button className="btn btn-secondary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }} type="button" onClick={() => setAddSourceOpen(true)} disabled={isBrowsing}>
                新增自訂來源
              </button>
            </div>
            {/* 
              遠端來源列表：
              使用 index.css 中的 grid-2-col 類別，
              在 1024px 寬度內呈現 2 欄，並在手機版（<640px）自動切換為單欄，避免畫面擠壓。
              設定最小寬度，空間不夠時自動換行（推薦的進階響應式寫法）
            */}
            <ul className="grid-2-col" 
                  style={{ listStyle: 'none', padding: 0, gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))' }}>
              {sources.map((s) => (
                <li key={s.id} style={{ padding: '1rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', backgroundColor: '#fff', display: 'flex', flexDirection: 'column' }}>
                  {editingSource?.id === s.id ? (
                    <SourceEditForm
                      label={editLabel}
                      sourcePath={editSourcePath}
                      destPath={editDestPath}
                      onLabelChange={setEditLabel}
                      onSourcePathChange={setEditSourcePath}
                      onDestPathChange={setEditDestPath}
                      onSave={updateSource}
                      onCancel={() => setEditingSource(null)}
                      onBrowseSourcePath={() => setBrowseTarget('editSourcePath')}
                      onBrowseDestPath={() => setBrowseTarget('editDestPath')}
                    />
                  ) : (
                    // 卡片內容容器：設定 height: 100% 讓內容填滿卡片高度
                    <div className="flex" style={{ flexDirection: 'column', height: '100%' }}>
                      <div style={{ flex: 1, marginBottom: '1rem' }}>
                        <div style={{ fontWeight: 600, fontSize: '1.125rem', marginBottom: '0.5rem' }}>{s.label}</div>
                        {/* 針對路徑文字加上 wordBreak: 'break-all'，確保長路徑能自動換行 */}
                        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: '0.25rem', wordBreak: 'break-all' }}>
                          <div>來源: {s.sourcePath}</div>
                          <div>目的: {s.destPath}</div>
                        </div>
                      </div>
                      {/* 操作按鈕區：使用 marginTop: 'auto' 將按鈕推至卡片最底部對齊 */}
                      <div className="flex gap-2" style={{ justifyContent: 'flex-end', marginTop: 'auto' }}>
                        <button className="btn btn-secondary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem' }} type="button" onClick={() => startEdit(s)} disabled={isBrowsing}>
                          編輯
                        </button>
                        <button className="btn btn-secondary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem', color: 'var(--color-error-text)', borderColor: '#fecaca' }} type="button" onClick={() => removeSource(s.id)} disabled={isBrowsing}>
                          移除
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        
        <div className="mb-4">
          <h3 style={{ marginBottom: '0.5rem' }}>NAS 備份路徑</h3>
          <div className="flex gap-2">
            <input
              className="input-field"
              placeholder="例：4.備份記錄/KE/2026/FineReport"
              value={nasPath}
              onChange={(e) => setNasPath(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="btn btn-secondary" type="button" onClick={() => setBrowseTarget('nasPath')} disabled={isBrowsing}>
              瀏覽
            </button>
          </div>
          <small style={{ color: 'var(--color-text-muted)', display: 'block', marginTop: '0.25rem' }}>預設為 NAS 驗證時輸入的路徑，可修改或點「瀏覽」選擇</small>
        </div>
        
        <div className="mt-4">
          <button
            className="btn btn-primary"
            onClick={onDone}
            disabled={sources.length === 0 || !nasPath.trim() || isBrowsing}
          >
            確認並開始備份
          </button>
        </div>
      </div>
      {error && <div className="alert-error">{error}</div>}

      {addSourceOpen && (
        <div className="card" style={{ opacity: isBrowsing ? 0.5 : 1, pointerEvents: isBrowsing ? 'none' : 'auto', marginTop: '1rem' }}>
          <h4 style={{ marginBottom: '1rem' }}>新增自訂來源</h4>
          <PathInputWithBrowse
            label="標籤"
            value={addLabel}
            onChange={setAddLabel}
            placeholder="例如：自訂範本"
          />
          <PathInputWithBrowse
            label="來源路徑（遠端伺服器）"
            value={addSourcePath}
            onChange={setAddSourcePath}
            placeholder="例：/opt/tomcat/webapps/webroot/reportlets"
            onBrowse={() => setBrowseTarget('addSourcePath')}
            browseLabel="瀏覽"
          />
          <PathInputWithBrowse
            label="目的路徑（NAS 相對路徑）"
            value={addDestPath}
            onChange={setAddDestPath}
            placeholder="例：webroot/reportlets"
            onBrowse={() => setBrowseTarget('addDestPath')}
            browseLabel="瀏覽"
          />
          <div className="flex gap-2 mt-4">
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleAddSource}>新增</button>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setAddSourceOpen(false)}>取消</button>
          </div>
        </div>
      )}

      {isBrowsing && (
        <PathBrowserModal
          title={isNasBrowse ? '瀏覽 NAS 路徑' : '瀏覽遠端來源路徑'}
          currentPath={getBrowseInitialPath()}
          mode={isNasBrowse ? 'nas' : 'remote'}
          onSelect={handleBrowseSelectWithBase}
          onClose={() => setBrowseTarget(null)}
        />
      )}
    </div>
  );
}

/** 路徑輸入 + 瀏覽按鈕 */
function PathInputWithBrowse({
  label,
  value,
  onChange,
  placeholder,
  onBrowse,
  browseLabel = '瀏覽',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onBrowse?: () => void;
  browseLabel?: string;
}) {
  return (
    <div className="input-group">
      <label>{label}</label>
      <div className="flex gap-2">
        <input
          className="input-field"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ flex: 1 }}
        />
        {onBrowse && (
          <button className="btn btn-secondary" type="button" onClick={onBrowse}>
            {browseLabel}
          </button>
        )}
      </div>
    </div>
  );
}

/** 遠端來源編輯表單 */
function SourceEditForm({
  label,
  sourcePath,
  destPath,
  onLabelChange,
  onSourcePathChange,
  onDestPathChange,
  onSave,
  onCancel,
  onBrowseSourcePath,
  onBrowseDestPath,
}: {
  label: string;
  sourcePath: string;
  destPath: string;
  onLabelChange: (v: string) => void;
  onSourcePathChange: (v: string) => void;
  onDestPathChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onBrowseSourcePath: () => void;
  onBrowseDestPath: () => void;
}) {
  return (
    <div className="flex" style={{ flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
      <PathInputWithBrowse label="標籤" value={label} onChange={onLabelChange} placeholder="標籤" />
      <PathInputWithBrowse
        label="來源路徑"
        value={sourcePath}
        onChange={onSourcePathChange}
        placeholder="來源路徑"
        onBrowse={onBrowseSourcePath}
      />
      <PathInputWithBrowse
        label="目的路徑"
        value={destPath}
        onChange={onDestPathChange}
        placeholder="目的路徑"
        onBrowse={onBrowseDestPath}
      />
      <div className="flex gap-2 mt-4">
        <button className="btn btn-primary" style={{ flex: 1, padding: '0.5rem' }} type="button" onClick={onSave}>儲存</button>
        <button className="btn btn-secondary" style={{ flex: 1, padding: '0.5rem' }} type="button" onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}

/** 路徑瀏覽器 Modal（含全螢幕遮罩，鎖定其他操作）— 可匯出供其他元件使用 */
export function PathBrowserModal({
  title,
  currentPath,
  mode,
  onSelect,
  onClose,
}: {
  title: string;
  currentPath: string;
  mode: 'nas' | 'remote';
  onSelect: (path: string) => void;
  onClose: () => void;
}) {
  const [path, setPath] = useState(currentPath || (mode === 'remote' ? '/' : ''));
  const [entries, setEntries] = useState<{ name: string; isDir: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [newDirName, setNewDirName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState('');

  const browse = mode === 'nas' ? backupApi.browseNas : backupApi.browseRemote;

  useEffect(() => {
    if (!currentPath.trim() && mode === 'nas') {
      backupApi.getNasDefaultPath().then((res) => {
        if (!res.error && res.data?.path) setPath(res.data.path);
      });
    } else if (currentPath) {
      setPath(currentPath);
    } else if (mode === 'remote') {
      setPath('/');
    }
  }, [currentPath, mode]);

  const load = async (p: string) => {
    setLoading(true);
    setErr('');
    const res = await browse(mode === 'nas' ? (p || '.') : (p || '/'));
    setLoading(false);
    if (res.error) {
      setErr(res.message || '瀏覽失敗');
      return;
    }
    const list = res.data?.entries ?? [];
    setEntries(list.filter((e) => e.isDir));
  };

  useEffect(() => {
    load(path);
  }, [path]);

  const enterDir = (name: string) => {
    const newPath = path ? `${path.replace(/\/$/, '')}/${name}` : (mode === 'remote' ? `/${name}` : name);
    setPath(newPath);
  };

  const goUp = () => {
    if (mode === 'remote') {
      const parts = path.replace(/\/$/, '').split('/').filter(Boolean);
      parts.pop();
      setPath(parts.length ? `/${parts.join('/')}` : '/');
    } else {
      setPath(path.split('/').slice(0, -1).join('/'));
    }
  };

  const selectCurrent = async () => {
    if (path.trim()) {
      onSelect(path.trim());
      return;
    }
    if (mode === 'nas') {
      const res = await backupApi.getNasDefaultPath();
      if (!res.error && res.data?.path) {
        onSelect(res.data.path);
      } else {
        onSelect('.');
      }
    } else {
      onSelect('/');
    }
  };

  const canGoUp = mode === 'remote' ? path !== '/' : !!path;

  const handleCreateDir = async () => {
    if (!newDirName.trim() || mode !== 'nas') return;
    setCreating(true);
    setCreateErr('');
    const res = await backupApi.createNasDirectory(path || '.', newDirName.trim());
    setCreating(false);
    if (res.error) {
      setCreateErr(res.message || '新增失敗');
      return;
    }
    setNewDirName('');
    load(path);
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h4 className="modal-title">{title}</h4>
          <button className="modal-close" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        
        <div className="modal-body">
          <div className="input-group">
            <label>目前路徑</label>
            <input
              className="input-field"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder={mode === 'remote' ? '/' : '路徑'}
            />
          </div>
          
          {mode === 'nas' && (
            <div className="input-group">
              <label>新增目錄</label>
              <div className="flex gap-2">
                <input
                  className="input-field"
                  value={newDirName}
                  onChange={(e) => { setNewDirName(e.target.value); setCreateErr(''); }}
                  placeholder="輸入新目錄名稱"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateDir()}
                  style={{ flex: 1 }}
                />
                <button className="btn btn-secondary" type="button" onClick={handleCreateDir} disabled={creating || !newDirName.trim()}>
                  {creating ? '建立中...' : '新增'}
                </button>
              </div>
              {createErr && <div className="alert-error" style={{ padding: '0.5rem', marginTop: '0.5rem', marginBottom: 0 }}>{createErr}</div>}
            </div>
          )}
          
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label>當前目錄內容</label>
            <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', backgroundColor: '#fff', padding: '0.5rem' }}>
              {loading && <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>載入中...</div>}
              {err && <div className="alert-error" style={{ margin: 0 }}>{err}</div>}
              {!loading && !err && (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {canGoUp && (
                    <li>
                      <button
                        className="btn btn-secondary w-full"
                        style={{ justifyContent: 'flex-start', border: 'none', padding: '0.5rem', marginBottom: '0.25rem' }}
                        type="button"
                        onClick={goUp}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.5rem' }}><path d="m18 15-6-6-6 6"/></svg>
                        上一層
                      </button>
                    </li>
                  )}
                  {entries.length === 0 && !canGoUp && (
                    <li style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>空目錄</li>
                  )}
                  {entries.map((e) => (
                    <li key={e.name}>
                      <button
                        className="btn btn-secondary w-full"
                        style={{ justifyContent: 'flex-start', border: 'none', padding: '0.5rem', marginBottom: '0.25rem' }}
                        type="button"
                        onClick={() => enterDir(e.name)}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.5rem', color: 'var(--color-primary)' }}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                        {e.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button className="btn btn-secondary" type="button" onClick={onClose}>取消</button>
          <button className="btn btn-primary" style={{ width: 'auto' }} type="button" onClick={selectCurrent}>選擇此路徑</button>
        </div>
      </div>
    </div>
  );
}
