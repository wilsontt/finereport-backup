import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseJobManifest, serializeJobManifest, type BackupJobManifest } from './backupJobManifest.js';

const sample: BackupJobManifest = {
  schemaVersion: 1,
  backupId: 'id-1',
  mode: 'full',
  status: 'failed',
  stagingPath: '/home/crownap/backup/202608',
  nasPath: '4.備份記錄/KE/2026/FineReport',
  backupMonth: '202608',
  startedAt: '2026-08-29 10:52:14',
  endedAt: null,
  reportFileName: null,
  previousReportFileName: null,
  sources: [],
};

describe('backupJobManifest', () => {
  it('parse 缺 schemaVersion 要 throw', () => {
    const { schemaVersion: _, ...rest } = sample;
    assert.throws(
      () => parseJobManifest(JSON.stringify(rest)),
      /schemaVersion/
    );
  });

  it('serialize／parse 往返', () => {
    const raw = serializeJobManifest(sample);
    const parsed = parseJobManifest(raw);
    assert.equal(parsed.schemaVersion, 1);
    assert.equal(parsed.backupId, 'id-1');
    assert.equal(parsed.sources.length, 0);
  });
});
