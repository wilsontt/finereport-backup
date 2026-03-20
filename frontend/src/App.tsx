/**
 * FineReport 備份工具 — 主應用
 */
import { useState } from 'react';
import { CredentialForm } from './components/CredentialForm';
import { HumanVerification } from './components/HumanVerification';
import { PathSelector } from './components/PathSelector';
import { BackupProgress } from './components/BackupProgress';
import { StepIndicator } from './components/StepIndicator';
import type { BackupSource } from './types';
import logoUrl from './assets/CROWN_logo.png';

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
    <div style={{ minHeight: '100vh', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: 1024, margin: '0 auto' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
            <img 
              src={logoUrl}
              alt="Company Logo" 
              style={{ height: '40px', marginRight: '10px' }} 
            />
            <h1 style={{ margin: 0, color: 'var(--color-primary)' }}>
              FineReport 備份工具
            </h1>
          </div>
          <StepIndicator currentStep={step} />
        </div>
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
  );
}

export default App;
