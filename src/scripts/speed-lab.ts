import { PHASES, formatMs, formatResult, normalizeUrl, runLab, type LabResult } from '../lib/speed-lab';

const SCAN_LINES = [
	'$ probe --url {host}',
	'resolving host ..................',
	'opening socket ..................',
	'tls handshake ...................',
	'waiting for first byte ..........',
	'stitching timeline ..............',
];

function prefersReducedMotion(): boolean {
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function mountSpeedLab(root: HTMLElement) {
	const form = root.querySelector<HTMLFormElement>('[data-form]')!;
	const input = root.querySelector<HTMLInputElement>('[data-url]')!;
	const errorEl = root.querySelector<HTMLElement>('[data-error]')!;
	const scanLog = root.querySelector<HTMLElement>('[data-scan-log]')!;
	const gaugeFill = root.querySelector<SVGCircleElement>('[data-gauge-fill]')!;
	const scoreEl = root.querySelector<HTMLElement>('[data-score]')!;
	const gradeEl = root.querySelector<HTMLElement>('[data-grade]')!;
	const gradeZh = root.querySelector<HTMLElement>('[data-grade-zh]')!;
	const headline = root.querySelector<HTMLElement>('[data-headline]')!;
	const sourceEl = root.querySelector<HTMLElement>('[data-source]')!;
	const hostEl = root.querySelector<HTMLElement>('[data-host]')!;
	const detailEl = root.querySelector<HTMLElement>('[data-detail]')!;
	const totalEl = root.querySelector<HTMLElement>('[data-total]')!;
	const notesEl = root.querySelector<HTMLElement>('[data-notes]')!;
	const waterfallEl = root.querySelector<HTMLElement>('[data-waterfall]')!;
	const copyStatus = root.querySelector<HTMLElement>('[data-copy-status]')!;
	const tiles = root.querySelector<HTMLElement>('[data-tiles]')!;

	let latest: LabResult | null = null;
	let abort: AbortController | null = null;
	let busy = false;

	function show(mode: 'idle' | 'scan' | 'result') {
		root.dataset.mode = mode;
		for (const panel of root.querySelectorAll<HTMLElement>('[data-panel]')) {
			const on = panel.dataset.panel === mode;
			panel.hidden = !on;
			panel.classList.toggle('is-on', on);
		}
	}

	function setError(message: string) {
		errorEl.textContent = message;
		errorEl.hidden = !message;
	}

	async function analyze(demo: boolean, preset?: string) {
		if (busy) return;
		const raw = preset ?? input.value;
		try {
			normalizeUrl(raw);
		} catch (error) {
			setError(error instanceof Error ? error.message : 'URL 无效。');
			return;
		}
		setError('');
		busy = true;
		abort?.abort();
		abort = new AbortController();
		latest = null;
		show('scan');
		const scanDone = playScan(raw);
		try {
			const started = performance.now();
			const result = await runLab(raw, { demo, signal: abort.signal });
			const pad = prefersReducedMotion() ? 0 : Math.max(0, 2000 - (performance.now() - started));
			await Promise.all([scanDone, wait(pad)]);
			latest = result;
			renderResult(result);
			show('result');
		} catch (error) {
			await scanDone.catch(() => undefined);
			if ((error as Error).name === 'AbortError') return;
			setError(error instanceof Error ? error.message : '探测失败。');
			show('idle');
		} finally {
			busy = false;
		}
	}

	async function playScan(raw: string) {
		scanLog.replaceChildren();
		let host = raw.trim() || 'target';
		try {
			host = new URL(/^https?:/i.test(raw) ? raw : `https://${raw}`).host;
		} catch {
			host = raw;
		}
		const chips = [...root.querySelectorAll<HTMLElement>('[data-chip]')];
		chips.forEach((chip) => chip.classList.remove('is-live'));
		for (let i = 0; i < SCAN_LINES.length; i++) {
			const line = SCAN_LINES[i].replace('{host}', host);
			const row = document.createElement('div');
			row.className = 'term-line';
			scanLog.append(row);
			if (prefersReducedMotion()) row.textContent = line;
			else {
				for (const ch of line) {
					row.textContent += ch;
					await wait(7);
				}
			}
			chips[i]?.classList.add('is-live');
			await wait(prefersReducedMotion() ? 40 : 160);
		}
	}

	function renderResult(result: LabResult) {
		const live = result.source !== 'demo';
		sourceEl.textContent = live ? (result.source === 'navigation' ? 'LIVE · PAGE' : 'LIVE · PROBE') : 'SIMULATION';
		sourceEl.dataset.kind = live ? 'live' : 'demo';
		hostEl.textContent = result.host;
		headline.textContent = result.headline;
		detailEl.textContent = result.detail;
		gradeEl.textContent = result.grade;
		gradeZh.textContent = result.gradeZh;
		copyStatus.textContent = '';
		roll(scoreEl, result.score, 0, 900);
		if (result.totalMs == null) totalEl.textContent = '—';
		else roll(totalEl, result.totalMs, 1, 900);
		setGauge(result.score);
		renderTiles(result);
		renderWaterfall(result);
		notesEl.replaceChildren(
			...result.notes.map((note) => {
				const li = document.createElement('li');
				li.textContent = note;
				return li;
			}),
		);
		root.querySelector('[data-result]')?.classList.remove('is-reveal');
		void root.offsetWidth;
		root.querySelector('[data-result]')?.classList.add('is-reveal');
	}

	function renderTiles(result: LabResult) {
		tiles.replaceChildren(
			...PHASES.map((phase, index) => {
				const sample = result.phases[phase.id];
				const card = document.createElement('article');
				card.className = `tile${sample.status === 'unavailable' ? ' is-void' : ''}`;
				card.style.setProperty('--i', String(index));
				card.innerHTML = `<p class="kicker mono">${phase.en}</p><h3>${phase.label}</h3><p class="tile-val mono" data-v></p>`;
				const val = card.querySelector('[data-v]')!;
				if (sample.status === 'unavailable' || sample.ms == null) val.textContent = '—';
				else roll(val, sample.ms, 1, 700 + index * 70);
				return card;
			}),
		);
	}

	function renderWaterfall(result: LabResult) {
		let cursor = 0;
		const rows = PHASES.map((phase) => {
			const sample = result.phases[phase.id];
			if (sample.status !== 'ok' || sample.ms == null) {
				return { ...phase, ms: null as number | null, start: 0, width: 0, missing: true };
			}
			if (phase.id === 'dom' || phase.id === 'load') {
				return { ...phase, ms: sample.ms, start: 0, width: sample.ms, missing: false };
			}
			const row = { ...phase, ms: sample.ms, start: cursor, width: sample.ms, missing: false };
			cursor += sample.ms;
			return row;
		});
		const span = Math.max(result.totalMs ?? 0, cursor, ...rows.map((row) => row.start + row.width), 1);
		waterfallEl.replaceChildren(
			...rows.map((row) => {
				const el = document.createElement('div');
				el.className = `wf-row${row.missing ? ' is-void' : ''}`;
				const left = (row.start / span) * 100;
				const width = Math.max(row.missing ? 0 : 1.2, (row.width / span) * 100);
				el.innerHTML = `<span class="wf-name mono">${row.label}</span><span class="wf-track"><span class="wf-bar" style="left:${left}%;width:${width}%"></span></span><span class="wf-ms mono">${formatMs(row.ms)}</span>`;
				return el;
			}),
		);
	}

	function setGauge(score: number) {
		const radius = 54;
		const circ = 2 * Math.PI * radius;
		gaugeFill.style.strokeDasharray = `${circ}`;
		gaugeFill.style.strokeDashoffset = `${circ}`;
		const reduced = prefersReducedMotion();
		const start = performance.now();
		const from = circ;
		const to = circ * (1 - score / 100);
		const tick = (now: number) => {
			const t = reduced ? 1 : Math.min(1, (now - start) / 1100);
			const eased = 1 - (1 - t) ** 3;
			gaugeFill.style.strokeDashoffset = `${from + (to - from) * eased}`;
			if (t < 1) requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	}

	function roll(el: Element, target: number, decimals: 0 | 1, duration: number) {
		if (prefersReducedMotion()) {
			el.textContent = decimals ? formatMs(target) : String(Math.round(target));
			return;
		}
		const start = performance.now();
		const tick = (now: number) => {
			const t = Math.min(1, (now - start) / duration);
			const eased = 1 - (1 - t) ** 3;
			const current = target * eased;
			el.textContent = decimals ? formatMs(current) : String(Math.round(current));
			if (t < 1) requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	}

	form.addEventListener('submit', (event) => {
		event.preventDefault();
		void analyze(false);
	});
	root.querySelector('[data-action="page"]')?.addEventListener('click', () => {
		input.value = location.origin + location.pathname;
		void analyze(false, input.value);
	});
	root.querySelector('[data-action="demo"]')?.addEventListener('click', () => {
		if (!input.value.trim()) input.value = 'https://example.com';
		void analyze(true);
	});
	root.querySelector('[data-action="retry"]')?.addEventListener('click', () => {
		abort?.abort();
		show('idle');
		input.focus();
	});
	root.querySelector('[data-action="copy"]')?.addEventListener('click', async () => {
		if (!latest) return;
		try {
			await navigator.clipboard.writeText(formatResult(latest));
			copyStatus.textContent = '已复制。';
		} catch {
			copyStatus.textContent = '复制失败，请手动选择。';
		}
	});

	show('idle');
	input.placeholder = 'https://xiaoxiaoptopfile.top';
}
