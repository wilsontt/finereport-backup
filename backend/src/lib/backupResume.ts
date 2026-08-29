/**
 * 續傳略過與路徑一致性
 */
import type { ArtifactRecord, BackupJobManifest } from './backupJobManifest.js';

export function assertResumeCompatible(
  manifest: BackupJobManifest,
  stagingPath: string,
  nasPath: string,
  sourceIds: string[]
): void {
  if (manifest.stagingPath.trim() !== stagingPath.trim()) {
    throw new Error('續傳路徑與上次不同，請用全部重來或改回原路徑');
  }
  if (manifest.nasPath.trim() !== nasPath.trim()) {
    throw new Error('續傳路徑與上次不同，請用全部重來或改回原路徑');
  }
  const prev = [...manifest.sources.map((s) => s.id)].sort();
  const next = [...sourceIds].sort();
  if (prev.length !== next.length || prev.some((id, i) => id !== next[i])) {
    throw new Error('來源清單與上次不同');
  }
}

export function shouldSkipArtifact(a: ArtifactRecord, nasSize: number | null): boolean {
  return a.nasVerified && nasSize !== null && nasSize === a.size && nasSize > 0;
}

export function shouldReuseRemoteArchive(
  a: ArtifactRecord,
  remoteSize: number | null
): boolean {
  return !a.nasVerified && remoteSize !== null && remoteSize === a.size && remoteSize > 0;
}
