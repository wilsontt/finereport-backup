import { useState, useEffect } from 'react';
import { backupApi } from '../api/backup';
import { Search, Plus, FolderOpen, Edit2, Trash2, CheckCircle2, XCircle, HardDrive, Server, ArrowRight, Loader2 } from 'lucide-react';
import type { BackupSource } from '../types';
import { UI_PRO_MAX } from '../styles/designSystem';

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
    if (!addLabel.trim()) {
      setError('新增失敗：請輸入「標籤」名稱（例如：自訂範本）');
      return;
    }
    if (!addSourcePath.trim()) {
      setError('新增失敗：請選擇或輸入「來源路徑」');
      return;
    }
    if (!addDestPath.trim()) {
      setError('新增失敗：請選擇或輸入「目的路徑」');
      return;
    }
    setError('');
    
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
    if (!editingSource) return;
    if (!editLabel.trim()) {
      setError('儲存失敗：請輸入「標籤」名稱');
      return;
    }
    if (!editSourcePath.trim()) {
      setError('儲存失敗：請選擇或輸入「來源路徑」');
      return;
    }
    if (!editDestPath.trim()) {
      setError('儲存失敗：請選擇或輸入「目的路徑」');
      return;
    }
    setError('');
    
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
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className={UI_PRO_MAX.card}>
        <div className={UI_PRO_MAX.cardHeader}>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className={UI_PRO_MAX.cardTitle}>備份目錄設定</h2>
              <p className={UI_PRO_MAX.pSub}>請確認遠端來源與 NAS 儲存路徑</p>
            </div>
          </div>
        </div>

        <div className={UI_PRO_MAX.cardBody}>
          <div className={`space-y-8 transition-all duration-300 max-w-3xl mx-auto ${isBrowsing ? 'opacity-40 pointer-events-none' : ''}`}>
            
            {/* NAS Path Section */}
            <section>
              <h3 className={UI_PRO_MAX.sectionTitle}>
                <HardDrive className="w-5 h-5 text-slate-400" />
                NAS 備份目的路徑
              </h3>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
                <div className="flex gap-3">
                  <input
                    className={UI_PRO_MAX.input}
                    placeholder="例：4.備份記錄/KE/2026/FineReport"
                    value={nasPath}
                    onChange={(e) => setNasPath(e.target.value)}
                  />
                  <button 
                    type="button" 
                    onClick={() => setBrowseTarget('nasPath')} 
                    disabled={isBrowsing}
                    className={UI_PRO_MAX.buttonSecondary}
                  >
                    <FolderOpen className="w-4 h-4" />
                    瀏覽
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-500">預設為 NAS 驗證時輸入的路徑，可修改或點擊瀏覽重新選擇。</p>
              </div>
            </section>

            <hr className="border-slate-200" />

            {/* Remote Sources Section */}
            <section>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <h3 className={UI_PRO_MAX.sectionTitle + " mb-0"}>
                  <Server className="w-5 h-5 text-slate-400" />
                  遠端備份來源
                </h3>
                <div className="flex gap-2">
                  <button 
                    onClick={discover} 
                    disabled={loading}
                    className={UI_PRO_MAX.buttonSecondary}
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    自動探索
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setAddSourceOpen(true)} 
                    disabled={isBrowsing || addSourceOpen}
                    className={UI_PRO_MAX.buttonPrimary}
                  >
                    <Plus className="w-4 h-4" />
                    新增來源
                  </button>
                </div>
              </div>

              {sources.length === 0 && !addSourceOpen ? (
                <div className="text-center py-10 bg-slate-50 border border-dashed border-slate-300 rounded-xl">
                  <Server className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">目前沒有設定任何備份來源</p>
                  <p className="text-sm text-slate-400 mt-1">請點擊「自動探索」或「新增來源」</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {sources.map((s) => (
                    <div key={s.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm transition-shadow hover:shadow-md">
                      {editingSource?.id === s.id ? (
                        <div className="p-5 bg-slate-50 border-b border-slate-200">
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
                        </div>
                      ) : (
                        <div className="p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-5">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="font-semibold text-slate-900">{s.label}</span>
                              <span className={UI_PRO_MAX.badgeGray}>ID: {s.id.split('-').pop()}</span>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                                <span className="block text-xs font-semibold text-slate-400 mb-1">來源 (遠端)</span>
                                <code className="text-sm text-slate-700 break-all font-mono">{s.sourcePath}</code>
                              </div>
                              <div className="bg-blue-50/50 rounded-lg p-3 border border-blue-100">
                                <span className="block text-xs font-semibold text-blue-400 mb-1">目的 (NAS)</span>
                                <code className="text-sm text-blue-700 break-all font-mono">{s.destPath}</code>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 shrink-0 sm:pt-1">
                            <button 
                              type="button" 
                              onClick={() => startEdit(s)} 
                              disabled={isBrowsing}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-100"
                              title="編輯"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button 
                              type="button" 
                              onClick={() => removeSource(s.id)} 
                              disabled={isBrowsing}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
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
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 animate-in slide-in-from-top-4">
                      <h4 className="font-semibold text-slate-800 mb-5 flex items-center gap-2">
                        <Plus className="w-4 h-4 text-blue-600" />
                        新增自訂來源
                      </h4>
                      <div className="space-y-5 max-w-2xl">
                        <PathInputWithBrowse
                          label="來源標籤名稱"
                          value={addLabel}
                          onChange={setAddLabel}
                          placeholder="例如：自訂報表範本"
                        />
                        <PathInputWithBrowse
                          label="來源路徑 (遠端伺服器絕對路徑)"
                          value={addSourcePath}
                          onChange={setAddSourcePath}
                          placeholder="例：/opt/tomcat/webapps/webroot/reportlets"
                          onBrowse={() => setBrowseTarget('addSourcePath')}
                        />
                        <PathInputWithBrowse
                          label="目的路徑 (NAS 相對路徑)"
                          value={addDestPath}
                          onChange={setAddDestPath}
                          placeholder="例：webroot/reportlets"
                          onBrowse={() => setBrowseTarget('addDestPath')}
                        />
                        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                          <button 
                            onClick={() => setAddSourceOpen(false)}
                            className={UI_PRO_MAX.buttonSecondary}
                          >
                            取消
                          </button>
                          <button 
                            onClick={handleAddSource}
                            className={UI_PRO_MAX.buttonPrimary}
                          >
                            新增來源
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            <div className="pt-8 flex justify-end">
              <button
                onClick={onDone}
                disabled={sources.length === 0 || !nasPath.trim() || isBrowsing}
                className={UI_PRO_MAX.buttonPrimary}
              >
                確認設定並繼續
                <ArrowRight className="w-5 h-5 ml-1" />
              </button>
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

      {isBrowsing && (
        <PathBrowserModal
          title={isNasBrowse ? '選擇 NAS 路徑' : '選擇遠端來源路徑'}
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
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1.5">{label}</label>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={UI_PRO_MAX.inputSm}
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

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl shadow-slate-900/20 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-2xl shrink-0">
          <h4 className="font-semibold text-slate-800 flex items-center gap-2 text-lg">
            <FolderOpen className="w-5 h-5 text-blue-500" />
            {title}
          </h4>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
            <XCircle className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col flex-1 min-h-0">
          <div className="mb-5 shrink-0">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">目前路徑</label>
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder={mode === 'remote' ? '/' : '路徑'}
              className={UI_PRO_MAX.inputSm}
            />
          </div>
          
          {mode === 'nas' && (
            <div className="mb-5 bg-slate-50 p-4 rounded-xl border border-slate-100 shrink-0">
              <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">新增目錄</label>
              <div className="flex gap-2">
                <input
                  value={newDirName}
                  onChange={(e) => { setNewDirName(e.target.value); setCreateErr(''); }}
                  placeholder="輸入新目錄名稱"
                  className={UI_PRO_MAX.inputSm}
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
          
          <div className="flex flex-col flex-1 min-h-[250px]">
            <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider shrink-0">目錄內容</label>
            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl bg-white custom-scrollbar shadow-inner text-base">
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
                    <li className="px-4 py-8 text-center text-slate-400 text-base">
                      此目錄為空
                    </li>
                  ) : (
                    entries.map((e) => (
                      <li key={e.name}>
                        <button
                          type="button"
                          onClick={() => enterDir(e.name)}
                          className="w-full text-left px-5 py-3 text-base text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-3 group"
                        >
                          <FolderOpen className="w-5 h-5 text-slate-400 group-hover:text-blue-500 transition-colors" />
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
        
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-row-reverse gap-3 rounded-b-2xl shrink-0">
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