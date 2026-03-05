export interface SshCredentials {
    host: string;
    username: string;
    password: string;
}
/**
 * 驗證 SSH 連線
 */
export declare function verifySsh(creds: SshCredentials): Promise<void>;
/**
 * 透過 SSH 執行指令（含 sudo）
 * @param usePty - 僅備份 cp 等指令需要；ls 若用 PTY 會導致輸出含 ANSI 或 \r 使目錄清單解析失敗
 */
export declare function execWithSudo(creds: SshCredentials, sudoPassword: string, command: string, usePty?: boolean): Promise<{
    stdout: string;
    stderr: string;
    code: number | null;
}>;
/**
 * 列出遠端目錄內容（供瀏覽用）
 * 使用 ls -1p：-1 每行一項，-p 目錄後加 /
 */
export declare function listRemoteDirectory(creds: SshCredentials, sudoPassword: string, path: string): Promise<{
    name: string;
    isDir: boolean;
}[]>;
/**
 * 驗證 sudo 密碼
 */
export declare function verifySudo(creds: SshCredentials, sudoPassword: string): Promise<void>;
//# sourceMappingURL=sshService.d.ts.map