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
    <div className="min-h-screen flex flex-col py-12 px-4 sm:px-6 lg:px-8 font-sans relative overflow-x-hidden overflow-y-auto w-full custom-scrollbar">
      {/* Premium Background Effects */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[100px] pointer-events-none fixed" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 rounded-full blur-[100px] pointer-events-none fixed" />
      
      <div className="w-full max-w-3xl relative z-10 mx-auto">
        {/* Header - Make it shrinkable so it doesn't take up too much space when scrolling */}
        <div className="text-center mb-8 animate-slide-up shrink-0">
          <div className="inline-flex items-center justify-center p-3 mb-6 bg-white/80 backdrop-blur-xl rounded-3xl shadow-glass border border-white/50">
            <img 
              src={logoUrl}
              alt="Company Logo" 
              style={{ height: '48px', marginRight: '16px' }} 
            />
            <div className="w-px h-10 bg-slate-200 mx-2" />
            <div className="px-4">
              <DatabaseBackup className="w-8 h-8 text-blue-600" />
            </div>
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900">
            FineReport 備份工具
          </h1>
          <p className="mt-3 text-lg text-slate-500 font-medium">安全、高效的自動化備份解決方案</p>
        </div>

        {/* Main Card */}
        <div className={UI_PRO_MAX.mainCard} style={{ animationDelay: '0.1s' }}>
          <div className="p-8 sm:p-12">
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
          </div>
        </div>
        
        {/* Footer */}
        <div className="mt-10 text-center text-sm font-medium text-slate-400 tracking-wide">
          &copy; {new Date().getFullYear()} Crownap. All rights reserved.
        </div>
      </div>
    </div>
  );
}

export default App;
