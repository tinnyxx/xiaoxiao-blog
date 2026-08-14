import { browserAdapter, navigationAdapter } from './browser';
import { demoAdapter } from './demo';
import { evaluate } from './evaluate';
import type { LabResult, ProbeAdapter } from './types';
import { isSameOrigin, normalizeUrl } from './url';

export { formatMs, formatResult } from './evaluate';
export { normalizeUrl } from './url';
export { PHASES } from './types';
export type { LabGrade, LabMode, LabResult, PhaseId, ProbeSource } from './types';

export type RunOptions = {
	demo?: boolean;
	signal?: AbortSignal;
};

function currentPage(url: string): boolean {
	const target = new URL(url);
	return target.origin === location.origin && target.pathname === location.pathname;
}

export function selectAdapter(url: string, demo = false): ProbeAdapter {
	if (demo) return demoAdapter;
	if (currentPage(url)) return navigationAdapter;
	return browserAdapter;
}

/**
 * Run a probe then score it. Adapters are swappable so a future
 * PageSpeed / Lighthouse / server runner can sit behind the same shape.
 */
export async function runLab(input: string, options: RunOptions = {}): Promise<LabResult> {
	const url = normalizeUrl(input);
	const adapter = selectAdapter(url, options.demo);
	const controller = options.signal ?? new AbortController().signal;
	const trace = await adapter.run(url, controller);
	return {
		...trace,
		...evaluate(trace),
		measuredAt: Date.now(),
		url,
		host: new URL(url).host,
	};
}

export function adapterLabel(url: string, demo = false): string {
	if (demo) return 'simulation';
	if (isSameOrigin(url) && currentPage(url)) return 'navigation';
	return 'browser-probe';
}
