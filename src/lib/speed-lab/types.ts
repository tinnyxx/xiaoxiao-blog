export const PHASES = [
	{ id: 'dns', label: 'DNS', en: 'Lookup' },
	{ id: 'tcp', label: 'TCP', en: 'Connect' },
	{ id: 'tls', label: 'TLS', en: 'Handshake' },
	{ id: 'ttfb', label: 'TTFB', en: 'First byte' },
	{ id: 'dom', label: 'DOM', en: 'Interactive' },
	{ id: 'load', label: 'Load', en: 'Complete' },
] as const;

export type PhaseId = (typeof PHASES)[number]['id'];

export type ProbeSource = 'navigation' | 'browser' | 'demo';
export type PhaseStatus = 'ok' | 'unavailable';
export type LabGrade = 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Unscored';
export type LabMode = 'idle' | 'scan' | 'result' | 'error';

export interface PhaseSample {
	id: PhaseId;
	ms: number | null;
	status: PhaseStatus;
}

export interface ProbeTrace {
	url: string;
	host: string;
	source: ProbeSource;
	/** Wall-clock time for the probe itself. */
	probeMs: number;
	/** Full page load when available (navigation / demo). */
	totalMs: number | null;
	phases: Record<PhaseId, PhaseSample>;
	cached: boolean;
	protocol?: string;
	detail: string;
}

export interface LabVerdict {
	score: number | null;
	grade: LabGrade;
	gradeZh: string;
	headline: string;
	notes: string[];
}

export interface LabResult extends ProbeTrace, LabVerdict {
	measuredAt: number;
}

export interface ProbeAdapter {
	id: ProbeSource;
	label: string;
	run(url: string, signal: AbortSignal): Promise<ProbeTrace>;
}
