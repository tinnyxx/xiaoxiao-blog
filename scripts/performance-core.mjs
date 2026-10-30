export const TARGET = 'https://xiaoxiaoptopfile.top/';
export const MAX_RECORDS = 90;

function metric(audits, key) {
  const value = audits?.[key]?.numericValue;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function parsePageSpeed(payload, checkedAt) {
  const result = payload?.lighthouseResult;
  const audits = result?.audits;
  const rawScore = result?.categories?.performance?.score;
  if (typeof rawScore !== 'number' || !Number.isFinite(rawScore) || rawScore < 0 || rawScore > 1) {
    throw new Error('PageSpeed 未返回有效的性能分数');
  }
  return {
    checkedAt,
    status: 'ok',
    score: Math.round(rawScore * 100),
    lcpMs: metric(audits, 'largest-contentful-paint'),
    cls: metric(audits, 'cumulative-layout-shift'),
    tbtMs: metric(audits, 'total-blocking-time'),
    fcpMs: metric(audits, 'first-contentful-paint'),
    lighthouseVersion: result.lighthouseVersion ?? null,
  };
}

export function failureRecord(checkedAt, reason) {
  return { checkedAt, status: 'failed', reason: String(reason).slice(0, 160) };
}

export function addRecord(history, record) {
  if (history?.target !== TARGET || !Array.isArray(history.records)) {
    throw new Error('性能历史文件格式不正确');
  }
  const day = record.checkedAt.slice(0, 10);
  const records = history.records
    .filter((item) => typeof item.checkedAt === 'string' && item.checkedAt.slice(0, 10) !== day)
    .concat(record)
    .sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))
    .slice(0, MAX_RECORDS);
  return { target: TARGET, records };
}
