import type { LabGrade, LabVerdict, PhaseId, ProbeTrace } from './types';

const BUDGETS: Record<PhaseId, { good: number; poor: number; weight: number }> = {
	dns: { good: 20, poor: 120, weight: 0.1 },
	tcp: { good: 20, poor: 140, weight: 0.08 },
	tls: { good: 40, poor: 200, weight: 0.1 },
	ttfb: { good: 200, poor: 1000, weight: 0.3 },
	dom: { good: 800, poor: 3000, weight: 0.18 },
	load: { good: 1500, poor: 5000, weight: 0.24 },
};

const GRADE: { min: number; grade: LabGrade; zh: string }[] = [
	{ min: 90, grade: 'Excellent', zh: '优秀' },
	{ min: 75, grade: 'Good', zh: '良好' },
	{ min: 55, grade: 'Fair', zh: '一般' },
	{ min: 0, grade: 'Poor', zh: '较慢' },
];

function scoreMs(ms: number, good: number, poor: number): number {
	if (ms <= good) return 100;
	if (ms >= poor) return 8;
	return 8 + (1 - (ms - good) / (poor - good)) * 92;
}

export function evaluate(trace: ProbeTrace): LabVerdict {
	let weighted = 0;
	let mass = 0;
	for (const [id, budget] of Object.entries(BUDGETS) as [PhaseId, (typeof BUDGETS)[PhaseId]][]) {
		const ms = trace.phases[id].ms;
		if (ms == null || trace.phases[id].status !== 'ok') continue;
		weighted += scoreMs(ms, budget.good, budget.poor) * budget.weight;
		mass += budget.weight;
	}
	const score = mass === 0
		? trace.totalMs != null
			? Math.round(scoreMs(trace.totalMs, BUDGETS.load.good, BUDGETS.load.poor))
			: 0
		: Math.round(weighted / mass);
	const band = GRADE.find((item) => score >= item.min) ?? GRADE[GRADE.length - 1];
	return {
		score,
		grade: band.grade,
		gradeZh: band.zh,
		headline: headline(trace, band.zh),
		notes: notes(trace),
	};
}

function headline(trace: ProbeTrace, gradeZh: string): string {
	if (trace.source === 'demo') return `实验室样本 · 综合${gradeZh}`;
	if (trace.source === 'navigation') return `当前页面实测 · 综合${gradeZh}`;
	const available = Object.values(trace.phases).filter((p) => p.status === 'ok').length;
	if (available <= 1) return '探测已完成，但跨域限制挡住了大部分阶段';
	return `来自你浏览器的连接探测 · 综合${gradeZh}`;
}

function notes(trace: ProbeTrace): string[] {
	const lines: string[] = [];
	const dns = trace.phases.dns.ms;
	const ttfb = trace.phases.ttfb.ms;
	const tls = trace.phases.tls.ms;
	const load = trace.phases.load.ms;
	const dom = trace.phases.dom.ms;

	if (ttfb != null) {
		if (ttfb <= 200) lines.push('TTFB 表现优秀，首字节回来得很快。');
		else if (ttfb <= 500) lines.push('TTFB 尚可，服务器或回源还有一点余量。');
		else lines.push('TTFB 偏慢，优先检查源站响应、CDN 命中和回源距离。');
	}

	if (dns != null) {
		if (dns <= 25) lines.push('DNS 解析干净利落。');
		else if (dns > 80) lines.push('DNS 偏慢，可考虑更快的解析或预解析。');
	}

	if (tls != null && tls > 150) {
		lines.push('TLS 握手偏长，会话复用或 HTTP/2+/3 可能有帮助。');
	}

	if (load != null && dom != null) {
		const rest = load - dom;
		if (load > 3500 && rest > 800) {
			lines.push('DOM 之后仍耗了不少时间，图片或第三方脚本可能拖住了完整加载。');
		} else if (load <= 1500) {
			lines.push('完整加载时间很短，资源体量控制得不错。');
		} else if (load > 4000) {
			lines.push('完整加载偏慢，建议从图片体积、字体和长任务入手。');
		}
	}

	if (trace.cached) {
		lines.push('这次命中了浏览器缓存，数字会比冷启动更漂亮。');
	}

	if (trace.source === 'browser') {
		const missing = Object.values(trace.phases).filter((p) => p.status === 'unavailable');
		if (missing.length) {
			lines.push(
				'第三方站点通常不返回 Timing-Allow-Origin，所以 DNS / TCP / TLS 等阶段会被浏览器清零。这里只展示真实拿到的值。',
			);
		}
		if (trace.phases.dom.status === 'unavailable') {
			lines.push('DOM 与 Load 需要完整页面导航，当前沙箱读不到第三方文档的解析过程。');
		}
	}

	if (trace.source === 'demo') {
		lines.push('当前为实验室样本，用于预览完整仪表盘。不要把它当成该网站的真实成绩。');
	}

	if (!lines.length) lines.push('探测完成。可用阶段已经标在时间轴上。');
	return lines.slice(0, 3);
}

export function formatMs(ms: number | null): string {
	if (ms == null || !Number.isFinite(ms)) return '—';
	if (ms < 10) return `${ms.toFixed(1)} ms`;
	return `${Math.round(ms)} ms`;
}

export function formatResult(result: ProbeTrace & LabVerdict): string {
	const rows = (Object.values(result.phases) as ProbeTrace['phases'][PhaseId][])
		.map((phase) => `${phase.id.toUpperCase().padEnd(6)} ${formatMs(phase.ms)}`)
		.join('\n');
	const mode =
		result.source === 'demo' ? 'SIMULATION' : result.source === 'navigation' ? 'LIVE / this page' : 'LIVE / probe';
	return [
		'Website Speed Lab',
		result.url,
		`Mode   ${mode}`,
		`Score  ${result.score} / 100  ${result.grade}`,
		`Total  ${formatMs(result.totalMs)}`,
		'',
		rows,
		'',
		result.headline,
		...result.notes.map((note) => `- ${note}`),
	].join('\n');
}
