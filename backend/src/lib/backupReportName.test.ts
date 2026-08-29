import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatTaipeiCompactDate,
  formatTaipeiCompactTime,
  buildBackupReportFileName,
} from './backupReportName.js';

describe('backupReportName', () => {
  // 2026-08-29 10:56:29 Asia/Taipei = 2026-08-29 02:56:29 UTC
  const sample = new Date('2026-08-29T02:56:29.000Z');

  it('formatTaipeiCompactDate 為 yyyyMMdd', () => {
    assert.equal(formatTaipeiCompactDate(sample), '20260829');
  });

  it('formatTaipeiCompactTime 為 HHmmss', () => {
    assert.equal(formatTaipeiCompactTime(sample), '105629');
  });

  it('成功檔名符合格式且不含 _失敗', () => {
    const name = buildBackupReportFileName(sample, '202608', false);
    assert.match(name, /^\d{8}_\d{6}_\d{6}_FineReport備份報告\.md$/);
    assert.equal(name.includes('_失敗'), false);
    assert.equal(name, '20260829_105629_202608_FineReport備份報告.md');
  });

  it('失敗檔名含 _失敗', () => {
    const name = buildBackupReportFileName(sample, '202608', true);
    assert.match(name, /^\d{8}_\d{6}_\d{6}_FineReport備份報告_失敗\.md$/);
    assert.equal(name, '20260829_105629_202608_FineReport備份報告_失敗.md');
  });
});
