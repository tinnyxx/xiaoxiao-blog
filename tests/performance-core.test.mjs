import assert from 'node:assert/strict';
import test from 'node:test';
import { addRecord, failureRecord, parsePageSpeed, TARGET } from '../scripts/performance-core.mjs';

test('只读取 PageSpeed 有效的实验室数据，缺失指标保持缺失', () => {
  const record = parsePageSpeed({ lighthouseResult: {
    categories: { performance: { score: 0.87 } },
    audits: { 'largest-contentful-paint': { numericValue: 2400 }, 'cumulative-layout-shift': { numericValue: 0.08 } },
    lighthouseVersion: '13.0.0',
  } }, '2026-10-30T00:00:00.000Z');
  assert.equal(record.score, 87);
  assert.equal(record.lcpMs, 2400);
  assert.equal(record.tbtMs, null);
  assert.equal(record.status, 'ok');
});

test('无效分数不能发布为成功采样', () => {
  assert.throws(() => parsePageSpeed({}, '2026-10-30T00:00:00.000Z'));
});

test('同一天重试替换旧结果，并保留失败状态', () => {
  const old = failureRecord('2026-10-30T00:00:00.000Z', '超时');
  const current = { checkedAt: '2026-10-30T02:00:00.000Z', status: 'ok', score: 85 };
  const history = addRecord({ target: TARGET, records: [old] }, current);
  assert.deepEqual(history.records, [current]);
});
