import type { PhaseId, PhaseSample, ProbeAdapter, ProbeTrace } from './types';
import { hostOf, isSameOrigin } from './url';

const PHASE_IDS: PhaseId[] = ['dns', 'tcp', 'tls', 'ttfb', 'dom', 'load'];

function unavailable(id: PhaseId): PhaseSample {
	return { id, ms: null, status: 'unavailable' };
}

function ok(id: PhaseId, ms: number): PhaseSample {
	const value = Math.max(0, ms);
	if (value === 0 && (id === 'dns' || id === 'tcp' || id === 'tls')) {
		return unavailable(id);
	}
	return { id, ms: value, status: 'ok' };
}

function emptyPhases(): Record<PhaseId, PhaseSample> {
	return Object.fromEntries(PHASE_IDS.map((id) => [id, unavailable(id)])) as Record<
		PhaseId,
		PhaseSample
	>;
}

function readConnection(entry: PerformanceResourceTiming | PerformanceNavigationTiming) {
	const dns = entry.domainLookupEnd - entry.domainLookupStart;
	const tls =
		entry.secureConnectionStart > 0 ? entry.connectEnd - entry.secureConnectionStart : 0;
	const tcp = entry.connectEnd - entry.connectStart - tls;
	const ttfb =
		entry.requestStart > 0 ? entry.responseStart - entry.requestStart : entry.responseStart - entry.fetchStart;
	return {
		dns: dns > 0 ? dns : null,
		tcp: tcp > 0 ? tcp : null,
		tls: tls > 0 ? tls : null,
		ttfb: ttfb > 0 ? ttfb : null,
	};
}

function findResource(url: string): PerformanceResourceTiming | undefined {
	const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
	const exact = entries.filter((entry) => entry.name === url);
	return exact.at(-1) ?? entries.filter((entry) => entry.name.startsWith(url)).at(-1);
}

async function probeFetch(url: string, signal: AbortSignal): Promise<{ elapsed: number; entry?: PerformanceResourceTiming }> {
	const before = performance.getEntriesByType('resource').length;
	const started = performance.now();
	try {
		await fetch(url, {
			method: 'GET',
			mode: isSameOrigin(url) ? 'cors' : 'no-cors',
			cache: 'no-store',
			credentials: 'omit',
			referrerPolicy: 'no-referrer',
			signal,
		});
	} catch (error) {
		if ((error as Error).name === 'AbortError') throw error;
		// Opaque no-cors fetch rarely throws; a throw usually means network failure.
	}
	const elapsed = performance.now() - started;
	await new Promise((resolve) => setTimeout(resolve, 32));
	const entry =
		findResource(url) ??
		(performance.getEntriesByType('resource') as PerformanceResourceTiming[]).slice(before).at(-1);
	return { elapsed, entry };
}

export const navigationAdapter: ProbeAdapter = {
	id: 'navigation',
	label: 'This page',
	async run(url: string): Promise<ProbeTrace> {
		const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
		const phases = emptyPhases();
		if (!nav) {
			return {
				url,
				host: hostOf(url),
				source: 'navigation',
				probeMs: 0,
				totalMs: null,
				cached: false,
				detail: '当前页面没有 Navigation Timing 记录。',
				phases,
			};
		}
		const conn = readConnection(nav);
		if (conn.dns != null) phases.dns = ok('dns', conn.dns);
		if (conn.tcp != null) phases.tcp = ok('tcp', conn.tcp);
		if (conn.tls != null) phases.tls = ok('tls', conn.tls);
		if (conn.ttfb != null) phases.ttfb = ok('ttfb', conn.ttfb);
		const start = nav.startTime || nav.fetchStart;
		if (nav.domContentLoadedEventEnd > 0) {
			phases.dom = ok('dom', nav.domContentLoadedEventEnd - start);
		}
		if (nav.loadEventEnd > 0) {
			phases.load = ok('load', nav.loadEventEnd - start);
		}
		const total = nav.loadEventEnd > 0 ? nav.loadEventEnd - start : nav.duration;
		const cached = nav.transferSize === 0 && nav.decodedBodySize > 0;
		return {
			url,
			host: hostOf(url),
			source: 'navigation',
			probeMs: total,
			totalMs: total,
			cached,
			protocol: nav.nextHopProtocol,
			detail: '使用本页的 Navigation Timing，DNS / TCP / TLS / TTFB / DOM / Load 均为浏览器记录的真实值。',
			phases,
		};
	},
};

export const browserAdapter: ProbeAdapter = {
	id: 'browser',
	label: 'Browser probe',
	async run(url: string, signal: AbortSignal): Promise<ProbeTrace> {
		const phases = emptyPhases();
		const { elapsed, entry } = await probeFetch(url, signal);
		if (entry) {
			const conn = readConnection(entry);
			if (conn.dns != null) phases.dns = ok('dns', conn.dns);
			if (conn.tcp != null) phases.tcp = ok('tcp', conn.tcp);
			if (conn.tls != null) phases.tls = ok('tls', conn.tls);
			if (conn.ttfb != null) phases.ttfb = ok('ttfb', conn.ttfb);
		}
		const hasPhase = Object.values(phases).some((phase) => phase.status === 'ok');
		return {
			url,
			host: hostOf(url),
			source: 'browser',
			probeMs: elapsed,
			totalMs: elapsed,
			cached: entry ? entry.transferSize === 0 && entry.decodedBodySize > 0 : false,
			protocol: entry?.nextHopProtocol,
			detail: hasPhase
				? '使用 Resource Timing 读取这次探测请求的连接阶段。DOM / Load 需要完整页面，第三方文档无法读取。'
				: '请求已从你的浏览器发出，但目标未暴露 Timing-Allow-Origin，阶段明细被清零。下方总耗时是这次探测的真实等待时间。',
			phases,
		};
	},
};

