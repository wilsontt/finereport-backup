export interface NasCredentials {
    host: string;
    username: string;
    password: string;
    share: string;
    path: string;
    domain?: string;
}
export interface MountResult {
    path: string;
    didMount: boolean;
}
export declare function mountNas(creds: NasCredentials, mountPoint: string): Promise<MountResult>;
/**
 * 卸載 NAS 掛載點
 */
export declare function unmountNas(mountPoint: string): Promise<void>;
/**
 * 驗證 NAS 連線（優先掛載測試，失敗則 fallback smbclient）
 * 含 20 秒逾時，避免 NAS 無回應時卡住
 */
export declare function verifyNas(creds: NasCredentials): Promise<{
    ok: boolean;
    fullPath: string;
}>;
/**
 * 列出 NAS 目錄內容（供瀏覽用，使用 smbclient）
 * smbclient ls 需先 cd 到目標路徑，ls 的參數是 mask 不是路徑
 * 輸出格式：  filename    DHS        0  Mon Oct  5 16:08:57 2020
 * 屬性 D=目錄, A=檔案, H=隱藏, R=唯讀, S=系統
 */
export declare function listNasDirectory(creds: NasCredentials, path: string): Promise<{
    name: string;
    isDir: boolean;
}[]>;
/**
 * 在 NAS 指定路徑下新增目錄（使用 smbclient mkdir）
 */
export declare function createNasDirectory(creds: NasCredentials, parentPath: string, dirName: string): Promise<void>;
//# sourceMappingURL=nasService.d.ts.map