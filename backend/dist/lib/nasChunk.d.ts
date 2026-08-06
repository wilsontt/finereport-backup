/**
 * NAS 分卷上傳：閾值與命名／還原輔助（純函式，便於單測）
 */
/** 單檔超過此大小（bytes）則拆成多個分卷上傳 */
export declare const NAS_CHUNK_BYTES: number;
/**
 * 是否應對封存檔進行分卷
 */
export declare function shouldChunkArchive(sizeBytes: number): boolean;
/**
 * split 前綴：`jar.tgz` → `jar.tgz.part`（後接 000、001…）
 */
export declare function partFilePrefix(tgzPathOrName: string): string;
/**
 * 分卷檔完整檔名（index 從 0）
 */
export declare function partFileName(tgzPathOrName: string, index: number): string;
/**
 * 報告／文件用的手動還原提示
 */
export declare function formatRestoreHint(baseTgzName: string): string;
//# sourceMappingURL=nasChunk.d.ts.map