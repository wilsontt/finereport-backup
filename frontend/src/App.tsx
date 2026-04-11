/**
 * FineReport 備份工具 — 主應用
 */
import { useState } from 'react';
import { PortalFooter } from '@shared-ui/portal-footer';
import { CredentialForm } from './components/CredentialForm';
import { HumanVerification } from './components/HumanVerification';
import { PathSelector } from './components/PathSelector';
import { BackupProgress } from './components/BackupProgress';
import { StepIndicator } from './components/StepIndicator';
import { TopTitleNav } from './components/TopTitleNav';
import { APP_VERSION } from './constants/appVersion';
import type { BackupSource } from './types';

export type Step = 'credentials' | 'human' | 'paths' | 'backup';

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
    <div className="flex min-h-screen flex-col">
      <div className="flex-1" style={{ padding: '2rem 1rem' }}>
        <div style={{ maxWidth: 1024, margin: '0 auto' }}>
          <TopTitleNav />
          <StepIndicator currentStep={step} />
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
          <PortalFooter
            leading={<span>© 2026 海灣國際 · FineReport 備份工具</span>}
            trailing={<span>v{APP_VERSION}</span>}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
