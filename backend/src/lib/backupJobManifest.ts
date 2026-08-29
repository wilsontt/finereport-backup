/**
 * 備份作業清單（不含密碼）
 */

export type BackupRunMode = 'full' | 'resume';
export type JobStatus = 'running' | 'success' | 'failed';

export interface ArtifactRecord {
  fileName: string;
  size: number;
  remotePath: string;
  nasRelPath: string;
  nasVerified: boolean;
}

export interface SourceRecord {
  id: string;
  label: string;
  destPath: string;
  sourcePath: string;
  chunked: boolean;
  status: 'pending' | 'packed' | 'success' | 'failed' | 'skipped';
  artifacts: ArtifactRecord[];
}

export interface BackupJobManifest {
  schemaVersion: 1;
  backupId: string;
  mode: BackupRunMode;
  status: JobStatus;
  stagingPath: string;
  nasPath: string;
  backupMonth: string;
  startedAt: string;
  endedAt: string | null;
  reportFileName: string | null;
  previousReportFileName: string | null;
  sources: SourceRecord[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * 解析 manifest；schemaVersion 必須為 1。
 */
export function parseJobManifest(raw: string): BackupJobManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('作業清單不是有效 JSON');
  }
  if (!isRecord(parsed)) {
    throw new Error('作業清單格式錯誤');
  }
  if (parsed.schemaVersion !== 1) {
    throw new Error('作業清單缺少 schemaVersion 或版本不支援');
  }
  if (!Array.isArray(parsed.sources)) {
    throw new Error('作業清單缺少 sources');
  }
  const required = [
    'backupId',
    'mode',
    'status',
    'stagingPath',
    'nasPath',
    'backupMonth',
  ] as const;
  for (const key of required) {
    if (typeof parsed[key] !== 'string' || !parsed[key]) {
      throw new Error(`作業清單缺少欄位：${key}`);
    }
  }
  return parsed as unknown as BackupJobManifest;
}

export function serializeJobManifest(m: BackupJobManifest): string {
  return JSON.stringify(m, null, 2);
}
