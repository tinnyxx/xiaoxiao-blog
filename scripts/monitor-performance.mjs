import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { addRecord, failureRecord, parsePageSpeed, TARGET } from './performance-core.mjs';

const historyPath = fileURLToPath(new URL('../src/data/performance-history.json', import.meta.url));
const checkedAt = new Date().toISOString();
const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
endpoint.searchParams.set('url', TARGET);
endpoint.searchParams.set('strategy', 'mobile');
endpoint.searchParams.set('category', 'performance');
if (process.env.PAGESPEED_API_KEY) endpoint.searchParams.set('key', process.env.PAGESPEED_API_KEY);

let record;
try {
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`PageSpeed HTTP ${response.status}`);
  record = parsePageSpeed(await response.json(), checkedAt);
  console.log(`移动端实验室分数：${record.score}；LCP：${record.lcpMs ?? '缺失'} ms`);
} catch (error) {
  const reason = error instanceof Error
    ? [error.message, error.cause instanceof Error ? error.cause.message : null].filter(Boolean).join('：')
    : '未知错误';
  record = failureRecord(checkedAt, reason);
  console.error(`采样失败：${record.reason}`);
  process.exitCode = 1;
}

const history = JSON.parse(await readFile(historyPath, 'utf8'));
await writeFile(historyPath, `${JSON.stringify(addRecord(history, record), null, 2)}\n`);
