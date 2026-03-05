/**
 * 預設備份來源常數
 */
export interface BackupSourceItem {
    id: string;
    label: string;
    sourcePath: string;
    destPath: string;
    isAbsoluteSource?: boolean;
}
export declare const DEFAULT_BACKUP_SOURCES: BackupSourceItem[];
//# sourceMappingURL=defaultBackupSources.d.ts.map