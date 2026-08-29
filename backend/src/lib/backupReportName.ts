/**
 * 備份報告檔名（Asia/Taipei，含時分秒，避免同日覆蓋）
 */

function taipeiParts(
  d: Date,
  extra: Intl.DateTimeFormatOptions
): Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    ...extra,
  }).formatToParts(d);
}

function part(parts: Intl.DateTimeFormatPart[], type: string): string {
  return parts.find((p) => p.type === type)?.value ?? '';
}

/** yyyyMMdd */
export function formatTaipeiCompactDate(d: Date): string {
  const parts = taipeiParts(d, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${part(parts, 'year')}${part(parts, 'month')}${part(parts, 'day')}`;
}

/** HHmmss */
export function formatTaipeiCompactTime(d: Date): string {
  const parts = taipeiParts(d, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return `${part(parts, 'hour')}${part(parts, 'minute')}${part(parts, 'second')}`;
}

/**
 * 成功：{yyyyMMdd}_{HHmmss}_{備份月}_FineReport備份報告.md
 * 失敗：同上加 _失敗
 */
export function buildBackupReportFileName(
  d: Date,
  backupMonth: string,
  failed: boolean
): string {
  const date = formatTaipeiCompactDate(d);
  const time = formatTaipeiCompactTime(d);
  const suffix = failed ? '_失敗' : '';
  return `${date}_${time}_${backupMonth}_FineReport備份報告${suffix}.md`;
}
