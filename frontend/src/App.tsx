/**
 * FineReport 備份工具 — 主應用
 */
import { useState } from 'react';
import { CredentialForm } from './components/CredentialForm';
import { HumanVerification } from './components/HumanVerification';
import { PathSelector } from './components/PathSelector';
import { BackupProgress } from './components/BackupProgress';
import { DatabaseBackup } from 'lucide-react';
import type { BackupSource } from './types';
import logoUrl from './assets/CROWN_logo.png';
import { UI_PRO_MAX } from './styles/designSystem';

type Step = 'credentials' | 'human' | 'paths' | 'backup';

function App() {
  const [step, setStep] = useState<Step>('credentials');
  const [sources, setSources] = useState<BackupSource[]>([]);
  const [nasPath, setNasPath] = useState('');
  const [verifiedNasPath, setVerifiedNasPath] = useState('');
  const [backupId, setBackupId] = useState<string | null>(null);

  const onCredentialsDone = (nasFullPath?: string) => {
    setVerifiedNasPath(nasFullPath ?? '');
    setStep('human');
  };
  const onHumanDone = () => setStep('paths');
  const onPathsDone = () => setStep('backup');
  const onBackupStart = (id: string) => {
    setBackupId(id);
  };

  return (
    <div className={UI_PRO_MAX.appContainer}>
      <div className={UI_PRO_MAX.pageWrapper}>
        {/* Header */}
        <header className={UI_PRO_MAX.header}>
          <div className="inline-flex items-center justify-center p-4 bg-white rounded-2xl shadow-sm mb-4">
            <img 
              src={logoUrl}
              alt="CROWN Logo" 
              className="h-10 object-contain ml-2 mr-4"
            />
            <div className="w-px h-10 bg-slate-200 mx-2" />
            <div className="px-4">
              <DatabaseBackup className="w-8 h-8 text-blue-500" />
            </div>
          </div>
          <h1 className={UI_PRO_MAX.headerTitle}>FineReport 備份管理</h1>
          <p className={UI_PRO_MAX.headerSubtitle}>企業級自動化備份與還原工具</p>
        </header>

        {/* Main Content Area */}
        <main className="space-y-6 p4 mt-8">
          {step === 'credentials' && (
            <CredentialForm onDone={onCredentialsDone} />
          )}
          {step === 'human' && (
            <HumanVerification
              verifiedNasPath={verifiedNasPath}
              onDone={onHumanDone}
            />
          )}
          {step === 'paths' && (
            <PathSelector
              onDone={onPathsDone}
              sources={sources}
              setSources={setSources}
              nasPath={nasPath}
              setNasPath={setNasPath}
            />
          )}
          {step === 'backup' && (
            <BackupProgress
              backupId={backupId}
              onStart={onBackupStart}
              sources={sources}
              nasPath={nasPath}
            />
          )}
        </main>
        
        {/* Footer */}
        <footer className="mt-16 text-center text-sm text-slate-500">
          <p>&copy; {new Date().getFullYear()} Crownap IT Infrastructure. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
}

export default App;
