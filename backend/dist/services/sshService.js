/**
 * SSH 連線服務
 */
import { Client } from 'ssh2';
/**
 * 驗證 SSH 連線
 */
export async function verifySsh(creds) {
    return new Promise((resolve, reject) => {
        const client = new Client();
        client
            .on('ready', () => {
            client.end();
            resolve();
        })
            .on('error', (err) => {
            const msg = err.message?.toLowerCase() ?? '';
            if (msg.includes('auth') || msg.includes('password')) {
                reject(new Error('ERR_SSH_AUTH'));
            }
            else {
                reject(new Error('ERR_SSH_CONNECT'));
            }
        })
            .connect({
            host: creds.host,
            port: 22,
            username: creds.username,
            password: creds.password,
        });
    });
}
/**
 * 透過 SSH 執行指令（含 sudo）
 * @param usePty - 僅備份 cp 等指令需要；ls 若用 PTY 會導致輸出含 ANSI 或 \r 使目錄清單解析失敗
 */
export async function execWithSudo(creds, sudoPassword, command, usePty = false) {
    return new Promise((resolve, reject) => {
        const client = new Client();
        client
            .on('ready', () => {
            const fullCmd = `echo '${sudoPassword.replace(/'/g, "'\\''")}' | sudo -S ${command}`;
            const execOpts = usePty ? { pty: true } : {};
            client.exec(fullCmd, execOpts, (err, channel) => {
                if (err) {
                    client.end();
                    reject(err);
                    return;
                }
                let stdout = '';
                let stderr = '';
                channel.on('data', (data) => {
                    stdout += data.toString();
                });
                channel.stderr.on('data', (data) => {
                    stderr += data.toString();
                });
                channel.on('close', (code) => {
                    client.end();
                    resolve({ stdout, stderr, code: code ?? null });
                });
            });
        })
            .on('error', reject)
            .connect({
            host: creds.host,
            port: 22,
            username: creds.username,
            password: creds.password,
        });
    });
}
/**
 * 列出遠端目錄內容（供瀏覽用）
 * 使用 ls -1p：-1 每行一項，-p 目錄後加 /
 */
export async function listRemoteDirectory(creds, sudoPassword, path) {
    const safePath = (path || '/').replace(/"/g, '\\"');
    const { stdout, code } = await execWithSudo(creds, sudoPassword, `ls -1p "${safePath}" 2>/dev/null`);
    if (code !== 0) {
        throw new Error('ERR_REMOTE_PATH');
    }
    const entries = [];
    const lines = stdout.split('\n').filter((l) => l.trim());
    for (const line of lines) {
        const name = line.endsWith('/') ? line.slice(0, -1) : line;
        if (name && name !== '.' && name !== '..') {
            entries.push({ name, isDir: line.endsWith('/') });
        }
    }
    return entries;
}
/**
 * 驗證 sudo 密碼
 */
export async function verifySudo(creds, sudoPassword) {
    const { stdout, code } = await execWithSudo(creds, sudoPassword, 'whoami');
    if (code !== 0 || !stdout.trim().toLowerCase().includes('root')) {
        throw new Error('ERR_SUDO_FAILED');
    }
}
//# sourceMappingURL=sshService.js.map