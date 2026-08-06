/**
 * NAS 分卷上傳：閾值與命名／還原輔助（純函式，便於單測）
 */

/** 單檔超過此大小（bytes）則拆成多個分卷上傳 */
export const NAS_CHUNK_BYTES = 30 * 1024 * 1024;

/**
 * 是否應對封存檔進行分卷
 */
export function shouldChunkArchive(sizeBytes: number): boolean {
  return sizeBytes > NAS_CHUNK_BYTES;
}

/**
 * split 前綴：`jar.tgz` → `jar.tgz.part`（後接 000、001…）
 */
export function partFilePrefix(tgzPathOrName: string): string {
  const base = tgzPathOrName.replace(/\\/g, '/').split('/').pop() ?? tgzPathOrName;
  return `${base}.part`;
}

/**
 * 分卷檔完整檔名（index 從 0）
 */
export function partFileName(tgzPathOrName: string, index: number): string {
  const n = String(index).padStart(3, '0');
  return `${partFilePrefix(tgzPathOrName)}${n}`;
}

/**
 * 報告／文件用的手動還原提示
 */
export function formatRestoreHint(baseTgzName: string): string {
  const name = baseTgzName.replace(/\\/g, '/').split('/').pop() ?? baseTgzName;
  return `cat ${name}.part* > ${name} && tar xzf ${name}`;
}
