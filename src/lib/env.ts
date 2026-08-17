import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * 在 standalone 运行时手动加载 .env。
 *
 * 原因：`astro dev` 会由 Vite 自动加载 .env，但生产环境用
 * `node dist/server/entry.mjs` 直接跑时，进程不会自动读取 .env，
 * PM2 默认也不会。为了让「把 DEEPSEEK_API_KEY 写进 .env」这件事
 * 在本地开发和生产部署上行为一致，这里在首次读取环境变量前手动
 * 把 .env 合并进 process.env（已存在的真实环境变量优先）。
 */
export function loadEnvFile(): void {
	try {
		const file = path.join(process.cwd(), '.env');
		const raw = readFileSync(file, 'utf8');
		for (const line of raw.split(/\r?\n/)) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) continue;
			const eq = trimmed.indexOf('=');
			if (eq === -1) continue;
			const key = trimmed.slice(0, eq).trim();
			let value = trimmed.slice(eq + 1).trim();
			if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
				value = value.slice(1, -1);
			}
			if (key && process.env[key] === undefined) {
				process.env[key] = value;
			}
		}
	} catch {
		// 没有 .env 文件时忽略：环境变量可能已通过 PM2 / systemd 注入。
	}
}
