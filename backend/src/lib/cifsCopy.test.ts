import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { copyFileViaStream } from './cifsCopy.js';

describe('cifsCopy', () => {
  it('複製 64KiB 後 size 與內容一致', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cifs-copy-'));
    const src = path.join(dir, 'src.bin');
    const dest = path.join(dir, 'sub', 'dest.bin');
    const buf = Buffer.alloc(64 * 1024);
    for (let i = 0; i < buf.length; i++) buf[i] = i % 256;
    fs.writeFileSync(src, buf);
    await copyFileViaStream(src, dest);
    const got = fs.readFileSync(dest);
    assert.equal(fs.statSync(dest).size, buf.length);
    assert.ok(got.equals(buf));
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
