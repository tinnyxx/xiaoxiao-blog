import type { PhaseId, PhaseSample, ProbeAdapter, ProbeTrace } from './types';
import { hostOf } from './url';

function hashHost(host: string): number {
	let hash = 2166136261;
	for (let i = 0; i < host.length; i++) {
		hash ^= host.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function mulberry32(seed: number) {
	let a = seed;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function lerp(rand: () => number, min: number, max: number): number {
	return Math.round(min + rand() * (max - min));
}

function sample(id: PhaseId, ms: number): PhaseSample {
	return { id, ms, status: 'ok' };
}

/** Deterministic, clearly-labeled lab sample. Same host → same shape. */
export const demoAdapter: ProbeAdapter = {
	id: 'demo',
	label: 'Lab sample',
	async run(url: string, signal: AbortSignal): Promise<ProbeTrace> {
		const host = hostOf(url);
		const rand = mulberry32(hashHost(host));
		const dns = lerp(rand, 8, 55);
		const tcp = lerp(rand, 12, 48);
		const tls = lerp(rand, 28, 96);
		const ttfb = lerp(rand, 90, 420);
		const after = lerp(rand, 180, 720);
		const rest = lerp(rand, 220, 980);
		const dom = dns + tcp + tls + ttfb + after;
		const load = dom + rest;
		await wait(720 + Math.round(rand() * 480), signal);
		return {
			url,
			host,
			source: 'demo',
			probeMs: load,
			totalMs: load,
			cached: false,
			protocol: 'h2',
			detail: '实验室样本：按域名生成的完整加载时间轴，不是该站点的实测。',
			phases: {
				dns: sample('dns', dns),
				tcp: sample('tcp', tcp),
				tls: sample('tls', tls),
				ttfb: sample('ttfb', ttfb),
				dom: sample('dom', dom),
				load: sample('load', load),
			},
		};
	},
};

function wait(ms: number, signal?: AbortSignal) {
	return new Promise<void>((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener(
			'abort',
			() => {
				clearTimeout(timer);
				reject(new DOMException('Aborted', 'AbortError'));
			},
			{ once: true },
		);
	});
}
