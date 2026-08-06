import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  NAS_CHUNK_BYTES,
  shouldChunkArchive,
  partFilePrefix,
  partFileName,
  formatRestoreHint,
} from './nasChunk.js';

describe('nasChunk', () => {
  it('NAS_CHUNK_BYTES 為 30 MiB', () => {
    assert.equal(NAS_CHUNK_BYTES, 30 * 1024 * 1024);
  });

  it('shouldChunkArchive：0 與等於 30MiB 不分卷，超過才分卷', () => {
    assert.equal(shouldChunkArchive(0), false);
    assert.equal(shouldChunkArchive(NAS_CHUNK_BYTES), false);
    assert.equal(shouldChunkArchive(NAS_CHUNK_BYTES + 1), true);
  });

  it('partFilePrefix／partFileName 命名', () => {
    assert.equal(partFilePrefix('jar.tgz'), 'jar.tgz.part');
    assert.equal(partFilePrefix('/tmp/a/webroot/jar.tgz'), 'jar.tgz.part');
    assert.equal(partFileName('jar.tgz', 0), 'jar.tgz.part000');
    assert.equal(partFileName('jar.tgz', 12), 'jar.tgz.part012');
  });

  it('formatRestoreHint 含 cat 與 tar', () => {
    const hint = formatRestoreHint('jar.tgz');
    assert.match(hint, /cat jar\.tgz\.part\* > jar\.tgz/);
    assert.match(hint, /tar xzf jar\.tgz/);
  });
});
