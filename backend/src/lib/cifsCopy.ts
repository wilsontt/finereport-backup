/**
 * 寫入 CIFS／NAS 掛載點時禁止使用 fs.copyFile／copyFileSync
 *（Linux copy_file_range 可能寫成 0 byte）。改以 stream 複製後 fsync。
 */
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

export async function copyFileViaStream(srcPath: string, destPath: string): Promise<void> {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  await pipeline(fs.createReadStream(srcPath), fs.createWriteStream(destPath));
  const fd = fs.openSync(destPath, 'r+');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
