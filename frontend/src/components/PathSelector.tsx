import { useState, useEffect } from 'react';
import { backupApi } from '../api/backup';
import { Search, Plus, FolderOpen, Edit2, Trash2, CheckCircle2, XCircle, HardDrive, Server, ArrowRight, Loader2 } from 'lucide-react';
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

  const InputStyle = "w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all duration-200";

  return (
    <div className="animate-slide-up relative">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900">確認備份目錄</h2>
        <p className="text-slate-500 mt-2">請確認遠端來源與 NAS 儲存路徑</p>
      </div>

      <div className={`space-y-8 transition-all duration-300 ${isBrowsing ? 'opacity-50 pointer-events-none blur-[2px]' : ''}`}>
        
        {/* NAS Path Section */}
        <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <HardDrive className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">NAS 備份路徑</h3>
          </div>
          <div>
            <div className="flex gap-3">
              <input
                className={InputStyle}
                placeholder="例：4.備份記錄/KE/2026/FineReport"
                value={nasPath}
                onChange={(e) => setNasPath(e.target.value)}
              />
              <button 
                type="button" 
                onClick={() => setBrowseTarget('nasPath')} 
                disabled={isBrowsing}
                className="shrink-0 px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-base font-medium rounded-xl transition-colors flex items-center gap-2"
              >
                <FolderOpen className="w-5 h-5" />
                瀏覽
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">預設為 NAS 驗證時輸入的路徑，可修改或點「瀏覽」選擇</p>
          </div>
        </div>

        {/* Remote Sources Section */}
        <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Server className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">遠端來源</h3>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={discover} 
                disabled={loading}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-base font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                自動探索
              </button>
              <button 
                type="button" 
                onClick={() => setAddSourceOpen(true)} 
                disabled={isBrowsing || addSourceOpen}
                className="px-5 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-base font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                新增來源
              </button>
            </div>
          </div>

          {sources.length === 0 && !addSourceOpen ? (
            <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <Server className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-base">目前沒有備份來源，請點擊「自動探索」或「新增來源」</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sources.map((s) => (
                <div key={s.id} className="group bg-slate-50 border border-slate-100 rounded-xl p-4 transition-all hover:border-slate-200 hover:shadow-sm">
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
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="font-semibold text-slate-800">{s.label}</span>
                        </div>
                        <div className="flex items-center gap-2 text-base text-slate-500 font-mono bg-white px-3 py-2 rounded-lg border border-slate-100">
                          <span className="truncate" title={s.sourcePath}>{s.sourcePath}</span>
                          <ArrowRight className="w-4 h-4 shrink-0 text-slate-300" />
                          <span className="truncate text-blue-600" title={s.destPath}>{s.destPath}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button 
                          type="button" 
                          onClick={() => startEdit(s)} 
                          disabled={isBrowsing}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="編輯"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          type="button" 
                          onClick={() => removeSource(s.id)} 
                          disabled={isBrowsing}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="移除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {addSourceOpen && (
                <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-5 animate-slide-up">
                  <h4 className="font-semibold text-indigo-900 mb-4 flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    新增自訂來源
                  </h4>
                  <div className="space-y-4">
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
                    />
                    <PathInputWithBrowse
                      label="目的路徑（NAS 相對路徑）"
                      value={addDestPath}
                      onChange={setAddDestPath}
                      placeholder="例：webroot/reportlets"
                      onBrowse={() => setBrowseTarget('addDestPath')}
                    />
                    <div className="flex gap-3 pt-2">
                      <button 
                        onClick={handleAddSource}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3.5 rounded-xl font-medium transition-colors text-base"
                      >
                        新增
                      </button>
                      <button 
                        onClick={() => setAddSourceOpen(false)}
                        className="flex-1 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 py-3.5 rounded-xl font-medium transition-colors text-base"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <button
          onClick={onDone}
          disabled={sources.length === 0 || !nasPath.trim() || isBrowsing}
          className="w-full flex justify-center items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-medium transition-all active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 shadow-xl shadow-blue-600/20 text-lg"
        >
          確認並開始備份
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>

      {error && (
        <div className="mt-6 p-4 bg-red-50 text-red-600 border border-red-100 rounded-xl text-sm flex items-start gap-3 animate-slide-up">
          <div className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0 mt-0.5">
            <span className="font-bold text-xs">!</span>
          </div>
          <span className="leading-relaxed">{error}</span>
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

function PathInputWithBrowse({
  label,
  value,
  onChange,
  placeholder,
  onBrowse,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onBrowse?: () => void;
}) {
  const InputStyle = "w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all";
  
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1.5">{label}</label>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={InputStyle}
        />
        {onBrowse && (
          <button 
            type="button" 
            onClick={onBrowse}
            className="shrink-0 px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors flex items-center justify-center"
            title="瀏覽"
          >
            <FolderOpen className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

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
    <div className="space-y-4 bg-white p-5 rounded-xl border border-blue-100 shadow-sm">
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
      <div className="flex gap-3 pt-3">
        <button 
          type="button" 
          onClick={onSave}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl text-base font-medium transition-colors flex items-center justify-center gap-2"
        >
          <CheckCircle2 className="w-5 h-5" />
          儲存
        </button>
        <button 
          type="button" 
          onClick={onCancel}
          className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl text-base font-medium transition-colors flex items-center justify-center gap-2"
        >
          <XCircle className="w-5 h-5" />
          取消
        </button>
      </div>
    </div>
  );
}

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

  const InputStyle = "w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all";

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl shadow-slate-900/20 flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-2xl">
          <h4 className="font-semibold text-slate-800 flex items-center gap-2 text-lg">
            <FolderOpen className="w-5 h-5 text-blue-500" />
            {title}
          </h4>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
            <XCircle className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar min-h-0">
          <div className="mb-5">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">目前路徑</label>
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder={mode === 'remote' ? '/' : '路徑'}
              className={InputStyle}
            />
          </div>
          
          {mode === 'nas' && (
            <div className="mb-5 bg-slate-50 p-4 rounded-xl border border-slate-100">
              <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">新增目錄</label>
              <div className="flex gap-2">
                <input
                  value={newDirName}
                  onChange={(e) => { setNewDirName(e.target.value); setCreateErr(''); }}
                  placeholder="輸入新目錄名稱"
                  className={InputStyle}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateDir()}
                />
                <button 
                  type="button" 
                  onClick={handleCreateDir} 
                  disabled={creating || !newDirName.trim()}
                  className="shrink-0 px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-base font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : '新增'}
                </button>
              </div>
              {createErr && <p className="text-red-500 text-xs mt-2 flex items-center gap-1"><XCircle className="w-3 h-3" />{createErr}</p>}
            </div>
          )}
          
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">目錄內容</label>
            <div className="h-[280px] overflow-y-auto border border-slate-200 rounded-xl bg-white custom-scrollbar shadow-inner text-base">
              {loading && (
                <div className="h-full flex items-center justify-center text-slate-400 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" /> 載入中...
                </div>
              )}
              {err && (
                <div className="h-full flex items-center justify-center text-red-500 gap-2 p-4 text-center">
                  <XCircle className="w-5 h-5 shrink-0" /> {err}
                </div>
              )}
              {!loading && !err && (
                <ul className="py-1">
                  {canGoUp && (
                    <li>
                      <button 
                        type="button" 
                        onClick={goUp} 
                        className="w-full text-left px-5 py-3 text-base text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-colors flex items-center gap-3"
                      >
                        <span className="w-6 h-6 flex items-center justify-center bg-slate-100 rounded text-slate-500 font-bold">↑</span>
                        回上一層
                      </button>
                    </li>
                  )}
                  {entries.length === 0 && !canGoUp ? (
                    <li className="px-4 py-8 text-center text-sm text-slate-400">
                      此目錄為空
                    </li>
                  ) : (
                    entries.map((e) => (
                      <li key={e.name}>
                        <button
                          type="button"
                          onClick={() => enterDir(e.name)}
                          className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-2 group"
                        >
                          <FolderOpen className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
                          <span className="truncate">{e.name}</span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          </div>
        </div>
        
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-row-reverse gap-3 rounded-b-2xl shrink-0 mt-auto shadow-[0_-4px_10px_-4px_rgba(0,0,0,0.05)] relative z-10">
          <button 
            type="button" 
            onClick={selectCurrent}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-medium transition-colors shadow-sm text-base"
          >
            選擇此路徑
          </button>
          <button 
            type="button" 
            onClick={onClose}
            className="w-32 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 py-3 rounded-xl font-medium transition-colors text-base"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}