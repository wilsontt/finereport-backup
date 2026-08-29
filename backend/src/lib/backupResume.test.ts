import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ArtifactRecord, BackupJobManifest } from './backupJobManifest.js';
import {
  assertResumeCompatible,
  shouldSkipArtifact,
  shouldReuseRemoteArchive,
} from './backupResume.js';

const art = (over: Partial<ArtifactRecord> = {}): ArtifactRecord => ({
  fileName: 'schedule.tgz',
  size: 100,
  remotePath: '/tmp/schedule.tgz',
  nasRelPath: 'WEB-INF/schedule.tgz',
  nasVerified: false,
  ...over,
});

const manifest = (over: Partial<BackupJobManifest> = {}): BackupJobManifest => ({
  schemaVersion: 1,
  backupId: 'id-1',
  mode: 'full',
  status: 'failed',
  stagingPath: '/home/a/backup/202608',
  nasPath: '4.備份記錄/KE',
  backupMonth: '202608',
  startedAt: 't',
  endedAt: null,
  reportFileName: null,
  previousReportFileName: null,
  sources: [{ id: 'a', label: 'A', destPath: 'a', sourcePath: '/a', chunked: false, status: 'failed', artifacts: [] }],
  ...over,
});

describe('backupResume', () => {
  it('shouldSkipArtifact：未核對、size 0、不符 → false', () => {
    assert.equal(shouldSkipArtifact(art(), 100), false);
    assert.equal(shouldSkipArtifact(art({ nasVerified: true }), 0), false);
    assert.equal(shouldSkipArtifact(art({ nasVerified: true }), 99), false);
    assert.equal(shouldSkipArtifact(art({ nasVerified: true }), null), false);
  });

  it('shouldSkipArtifact：核對且 size 相符 → true', () => {
    assert.equal(shouldSkipArtifact(art({ nasVerified: true }), 100), true);
  });

  it('shouldReuseRemoteArchive', () => {
    assert.equal(shouldReuseRemoteArchive(art(), 100), true);
    assert.equal(shouldReuseRemoteArchive(art({ nasVerified: true }), 100), false);
    assert.equal(shouldReuseRemoteArchive(art(), 0), false);
  });

  it('assertResumeCompatible：路徑不同、id 集合不同要 throw', () => {
    const m = manifest();
    assert.throws(
      () => assertResumeCompatible(m, '/other', m.nasPath, ['a']),
      /路徑與上次不同/
    );
    assert.throws(
      () => assertResumeCompatible(m, m.stagingPath, '/other', ['a']),
      /路徑與上次不同/
    );
    assert.throws(
      () => assertResumeCompatible(m, m.stagingPath, m.nasPath, ['a', 'b']),
      /來源清單與上次不同/
    );
    assert.doesNotThrow(() =>
      assertResumeCompatible(m, m.stagingPath, m.nasPath, ['a'])
    );
  });
});
