import {
	evaluate,
	personas,
	questions,
	STATS,
	type PersonaResult,
	type StatId,
} from '../data/dev-persona';

const KEYS = ['A', 'B', 'C', 'D'] as const;
const COMPILE_LINES = [
	'$ compile --persona --from traces',
	'collecting 10 answers ........... ok',
	'mapping habits to archetypes .... ok',
	'resolving type .................. ok',
	'emitting result',
];

function prefersReducedMotion(): boolean {
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function polarPoint(cx: number, cy: number, r: number, index: number, total: number) {
	const angle = -Math.PI / 2 + (index / total) * Math.PI * 2;
	return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
}

export function mountPersona(root: HTMLElement) {
	const panels = {
		start: root.querySelector<HTMLElement>('[data-panel="start"]')!,
		quiz: root.querySelector<HTMLElement>('[data-panel="quiz"]')!,
		compile: root.querySelector<HTMLElement>('[data-panel="compile"]')!,
		result: root.querySelector<HTMLElement>('[data-panel="result"]')!,
	};
	const startBtn = root.querySelector<HTMLButtonElement>('[data-action="start"]')!;
	const retryBtn = root.querySelector<HTMLButtonElement>('[data-action="retry"]')!;
	const shareBtn = root.querySelector<HTMLButtonElement>('[data-action="share"]')!;
	const shareStatus = root.querySelector<HTMLElement>('[data-share-status]')!;
	const progressFill = root.querySelector<HTMLElement>('[data-progress-fill]')!;
	const progressLabel = root.querySelector<HTMLElement>('[data-progress-label]')!;
	const card = root.querySelector<HTMLElement>('[data-q-card]')!;
	const kicker = root.querySelector<HTMLElement>('[data-q-kicker]')!;
	const title = root.querySelector<HTMLElement>('[data-q-title]')!;
	const optionsEl = root.querySelector<HTMLElement>('[data-q-options]')!;
	const compileLog = root.querySelector<HTMLElement>('[data-compile-log]')!;
	const particleCanvas = root.querySelector<HTMLCanvasElement>('[data-particles]')!;

	let picks: number[] = [];
	let index = 0;
	let busy = false;
	let result: PersonaResult | null = null;
	let particleStop: (() => void) | undefined;

	function show(name: keyof typeof panels) {
		for (const [key, el] of Object.entries(panels)) {
			const on = key === name;
			el.hidden = !on;
			el.classList.toggle('is-on', on);
		}
		root.dataset.mode = name;
		if (name === 'quiz') {
			root.scrollIntoView({
				behavior: prefersReducedMotion() ? 'auto' : 'smooth',
				block: 'start',
			});
		}
	}

	function setProgress() {
		const total = questions.length;
		const current = Math.min(index + 1, total);
		progressLabel.textContent = `${String(current).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
		progressFill.style.width = `${(index / total) * 100}%`;
	}

	function renderQuestion(animate: boolean) {
		const q = questions[index];
		kicker.textContent = q.kicker;
		title.textContent = q.title;
		optionsEl.replaceChildren(
			...q.options.map((option, optionIndex) => {
				const btn = document.createElement('button');
				btn.type = 'button';
				btn.className = 'opt';
				btn.dataset.index = String(optionIndex);
				btn.innerHTML = `<span class="opt-key mono">${KEYS[optionIndex]}</span><span class="opt-text">${option.label}</span>`;
				btn.addEventListener('click', () => void choose(optionIndex));
				return btn;
			}),
		);
		setProgress();
		if (animate && !prefersReducedMotion()) {
			card.classList.remove('is-enter');
			void card.offsetWidth;
			card.classList.add('is-enter');
		}
	}

	async function choose(optionIndex: number) {
		if (busy || panels.quiz.hidden) return;
		busy = true;
		const buttons = [...optionsEl.querySelectorAll<HTMLButtonElement>('.opt')];
		buttons.forEach((btn, i) => {
			btn.disabled = true;
			btn.classList.toggle('is-picked', i === optionIndex);
		});
		picks.push(optionIndex);
		progressFill.style.width = `${((index + 1) / questions.length) * 100}%`;
		await wait(prefersReducedMotion() ? 80 : 280);

		if (index + 1 >= questions.length) {
			await compileAndReveal();
			busy = false;
			return;
		}

		if (!prefersReducedMotion()) {
			card.classList.add('is-leave');
			await wait(280);
			card.classList.remove('is-leave');
		}
		index += 1;
		renderQuestion(true);
		busy = false;
	}

	async function compileAndReveal() {
		result = evaluate(picks);
		show('compile');
		compileLog.replaceChildren();
		const reduced = prefersReducedMotion();
		for (const line of COMPILE_LINES) {
			const row = document.createElement('div');
			row.className = 'term-line';
			compileLog.append(row);
			if (reduced) {
				row.textContent = line;
				continue;
			}
			await typeLine(row, line, line.startsWith('$') ? 16 : 10);
			await wait(line.startsWith('$') ? 180 : 220);
		}
		const stamp = document.createElement('div');
		stamp.className = 'term-line term-done';
		stamp.textContent = `✓ ${result.persona.name}`;
		compileLog.append(stamp);
		await wait(reduced ? 120 : 640);
		renderResult(result);
		show('result');
	}

	async function typeLine(el: HTMLElement, text: string, delay: number) {
		el.textContent = '';
		for (const ch of text) {
			el.textContent += ch;
			await wait(delay);
		}
	}

	function renderResult(next: PersonaResult) {
		const { persona, radar, serial } = next;
		const avatar = root.querySelector<HTMLImageElement>('[data-r-avatar]')!;
		avatar.src = persona.avatar;
		avatar.alt = persona.name;
		root.querySelector('[data-r-name]')!.textContent = persona.name;
		root.querySelector('[data-r-en]')!.textContent = persona.en;
		root.querySelector('[data-r-blurb]')!.textContent = persona.blurb;
		root.querySelector('[data-r-quote]')!.textContent = `「${persona.quote}」`;
		root.querySelector('[data-r-serial]')!.textContent = `0x${serial}`;
		const tags = root.querySelector('[data-r-tags]')!;
		tags.replaceChildren(
			...persona.tags.map((tag) => {
				const el = document.createElement('span');
				el.className = 'tag mono';
				el.textContent = tag;
				return el;
			}),
		);
		drawRadar(root.querySelector<SVGSVGElement>('[data-radar]')!, radar);
		const bars = root.querySelector('[data-r-bars]')!;
		bars.replaceChildren(
			...STATS.map((stat) => {
				const row = document.createElement('div');
				row.className = 'bar';
				row.innerHTML = `<span class="bar-label mono">${stat.label}</span><span class="bar-track"><span class="bar-fill" style="--v:${radar[stat.id]}"></span></span><span class="bar-val mono">${radar[stat.id]}</span>`;
				return row;
			}),
		);
		shareStatus.textContent = '';
		panels.result.classList.remove('is-reveal');
		void panels.result.offsetWidth;
		panels.result.classList.add('is-reveal');
	}

	function drawRadar(svg: SVGSVGElement, radar: Record<StatId, number>) {
		const size = 280;
		const cx = size / 2;
		const cy = size / 2;
		const r = 96;
		const n = STATS.length;
		const ns = 'http://www.w3.org/2000/svg';
		svg.replaceChildren();
		svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
		svg.setAttribute('aria-hidden', 'true');

		for (const ring of [0.33, 0.66, 1]) {
			const pts = STATS.map((_, i) => {
				const p = polarPoint(cx, cy, r * ring, i, n);
				return `${p.x},${p.y}`;
			}).join(' ');
			const poly = document.createElementNS(ns, 'polygon');
			poly.setAttribute('points', pts);
			poly.setAttribute('class', 'radar-ring');
			svg.append(poly);
		}

		for (let i = 0; i < n; i++) {
			const p = polarPoint(cx, cy, r, i, n);
			const line = document.createElementNS(ns, 'line');
			line.setAttribute('x1', String(cx));
			line.setAttribute('y1', String(cy));
			line.setAttribute('x2', String(p.x));
			line.setAttribute('y2', String(p.y));
			line.setAttribute('class', 'radar-axis');
			svg.append(line);
			const labelPos = polarPoint(cx, cy, r + 22, i, n);
			const text = document.createElementNS(ns, 'text');
			text.setAttribute('x', String(labelPos.x));
			text.setAttribute('y', String(labelPos.y));
			text.setAttribute('class', 'radar-label');
			text.setAttribute('text-anchor', 'middle');
			text.setAttribute('dominant-baseline', 'middle');
			text.textContent = STATS[i].label;
			svg.append(text);
		}

		const shape = STATS.map((stat, i) => {
			const p = polarPoint(cx, cy, r * (radar[stat.id] / 100), i, n);
			return `${p.x},${p.y}`;
		}).join(' ');
		const fill = document.createElementNS(ns, 'polygon');
		fill.setAttribute('points', shape);
		fill.setAttribute('class', 'radar-fill');
		svg.append(fill);
		const stroke = document.createElementNS(ns, 'polygon');
		stroke.setAttribute('points', shape);
		stroke.setAttribute('class', 'radar-stroke');
		svg.append(stroke);
	}

	async function downloadCard() {
		if (!result) return;
		shareBtn.disabled = true;
		shareStatus.textContent = '正在绘制卡片…';
		try {
			await document.fonts.ready;
			const blob = await renderShareCard(result);
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `persona-${result.persona.id}-${result.serial}.png`;
			a.click();
			URL.revokeObjectURL(url);
			shareStatus.textContent = '已保存结果卡片。';
		} catch {
			shareStatus.textContent = '生成失败，请再试一次。';
		} finally {
			shareBtn.disabled = false;
		}
	}

	function reset() {
		picks = [];
		index = 0;
		result = null;
		busy = false;
		show('start');
	}

	function onKey(event: KeyboardEvent) {
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		if (!panels.start.hidden && (event.key === 'Enter' || event.key === ' ')) {
			event.preventDefault();
			startBtn.click();
			return;
		}
		if (panels.quiz.hidden || busy) return;
		const map: Record<string, number> = { '1': 0, '2': 1, '3': 2, '4': 3, a: 0, b: 1, c: 2, d: 3 };
		const next = map[event.key.toLowerCase()];
		if (next === undefined) return;
		event.preventDefault();
		void choose(next);
	}

	startBtn.addEventListener('click', () => {
		picks = [];
		index = 0;
		show('quiz');
		renderQuestion(true);
	});
	retryBtn.addEventListener('click', reset);
	shareBtn.addEventListener('click', () => void downloadCard());
	document.addEventListener('keydown', onKey);
	particleStop = startParticles(particleCanvas, root);
	void Promise.all(Object.values(personas).map((persona) => loadImage(persona.avatar).catch(() => null)));
	show('start');

	return () => {
		document.removeEventListener('keydown', onKey);
		particleStop?.();
	};
}

function startParticles(canvas: HTMLCanvasElement, root: HTMLElement) {
	const ctx = canvas.getContext('2d');
	if (!ctx || prefersReducedMotion()) return;

	const dots = Array.from({ length: 42 }, () => ({
		x: Math.random(),
		y: Math.random(),
		r: Math.random() * 1.15 + 0.25,
		vx: (Math.random() - 0.5) * 0.00018,
		vy: (Math.random() - 0.5) * 0.00026,
		a: Math.random() * 0.35 + 0.12,
	}));

	let frame = 0;
	let running = true;

	const resize = () => {
		const rect = root.getBoundingClientRect();
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width = Math.max(1, Math.floor(rect.width * dpr));
		canvas.height = Math.max(1, Math.floor(rect.height * dpr));
		canvas.style.width = `${rect.width}px`;
		canvas.style.height = `${rect.height}px`;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	};

	const ro = new ResizeObserver(resize);
	ro.observe(root);
	resize();

	const tick = () => {
		if (!running) return;
		frame = requestAnimationFrame(tick);
		const w = canvas.clientWidth;
		const h = canvas.clientHeight;
		ctx.clearRect(0, 0, w, h);
		for (const dot of dots) {
			dot.x += dot.vx;
			dot.y += dot.vy;
			if (dot.x < 0 || dot.x > 1) dot.vx *= -1;
			if (dot.y < 0 || dot.y > 1) dot.vy *= -1;
			ctx.beginPath();
			ctx.fillStyle = `rgba(138, 162, 255, ${dot.a})`;
			ctx.arc(dot.x * w, dot.y * h, dot.r, 0, Math.PI * 2);
			ctx.fill();
		}
	};
	tick();

	return () => {
		running = false;
		cancelAnimationFrame(frame);
		ro.disconnect();
	};
}

async function renderShareCard(result: PersonaResult): Promise<Blob> {
	const { persona, radar, serial } = result;
	const width = 1080;
	const height = 1440;
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('canvas');

	ctx.fillStyle = '#0a0d14';
	ctx.fillRect(0, 0, width, height);

	const grid = ctx.createLinearGradient(0, 0, 0, height);
	grid.addColorStop(0, 'rgba(255,255,255,0.055)');
	grid.addColorStop(1, 'rgba(255,255,255,0.02)');
	ctx.strokeStyle = grid;
	ctx.lineWidth = 1;
	for (let x = 48; x < width; x += 48) {
		ctx.beginPath();
		ctx.moveTo(x, 0);
		ctx.lineTo(x, height);
		ctx.stroke();
	}
	for (let y = 48; y < height; y += 48) {
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(width, y);
		ctx.stroke();
	}

	const glowA = ctx.createRadialGradient(860, 180, 20, 860, 180, 520);
	glowA.addColorStop(0, 'rgba(59, 91, 208, 0.38)');
	glowA.addColorStop(1, 'rgba(59, 91, 208, 0)');
	ctx.fillStyle = glowA;
	ctx.fillRect(0, 0, width, height);

	const glowB = ctx.createRadialGradient(180, 1280, 20, 180, 1280, 460);
	glowB.addColorStop(0, 'rgba(226, 182, 87, 0.18)');
	glowB.addColorStop(1, 'rgba(226, 182, 87, 0)');
	ctx.fillStyle = glowB;
	ctx.fillRect(0, 0, width, height);

	const sans = '"Inter", "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", sans-serif';
	const mono = '"JetBrains Mono", ui-monospace, Consolas, monospace';

	ctx.fillStyle = '#8b93a7';
	ctx.font = `500 22px ${mono}`;
	ctx.letterSpacing = '0.22em';
	ctx.fillText('XIAOXIAO  ·  PERSONA TEST', 88, 110);

	const avatar = await loadImage(persona.avatar);
	drawRoundedImage(ctx, avatar, 88, 148, 220, 220, 18);
	ctx.strokeStyle = 'rgba(138, 162, 255, 0.45)';
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.roundRect(88, 148, 220, 220, 28);
	ctx.stroke();

	ctx.fillStyle = '#e8ecf4';
	ctx.letterSpacing = '0px';
	const nameSize = persona.name.length > 8 ? 44 : 64;
	ctx.font = `800 ${nameSize}px ${sans}`;
	ctx.fillText(persona.name, 344, 236);

	ctx.fillStyle = '#8aa2ff';
	ctx.font = `500 24px ${mono}`;
	ctx.letterSpacing = '0.14em';
	ctx.fillText(persona.en.toUpperCase(), 344, 286);

	ctx.fillStyle = '#8b93a7';
	ctx.font = `500 22px ${mono}`;
	ctx.letterSpacing = '0.12em';
	ctx.fillText(`0x${serial}`, 344, 332);

	ctx.letterSpacing = '0px';
	ctx.fillStyle = 'rgba(255,255,255,0.12)';
	ctx.fillRect(88, 404, 160, 2);

	wrapText(ctx, persona.blurb, 88, 478, width - 176, 42, `400 28px ${sans}`, '#c5cad6');

	const quote = `「${persona.quote}」`;
	wrapText(ctx, quote, 88, 720, width - 176, 44, `500 28px ${sans}`, '#e2b657');

	let barY = 980;
	ctx.font = `500 20px ${mono}`;
	for (const stat of STATS) {
		ctx.fillStyle = '#8b93a7';
		ctx.fillText(stat.label, 88, barY);
		ctx.fillStyle = 'rgba(255,255,255,0.08)';
		ctx.beginPath();
		ctx.roundRect(200, barY - 16, 680, 10, 2);
		ctx.fill();
		const w = 680 * (radar[stat.id] / 100);
		const barGrad = ctx.createLinearGradient(200, 0, 880, 0);
		barGrad.addColorStop(0, '#3b5bd0');
		barGrad.addColorStop(1, '#8aa2ff');
		ctx.fillStyle = barGrad;
		ctx.beginPath();
		ctx.roundRect(200, barY - 16, w, 10, 2);
		ctx.fill();
		ctx.fillStyle = '#e8ecf4';
		ctx.fillText(String(radar[stat.id]), 900, barY);
		barY += 48;
	}

	ctx.fillStyle = '#8b93a7';
	ctx.font = `500 20px ${mono}`;
	ctx.letterSpacing = '0.16em';
	ctx.fillText(`XIAOXIAOPTOPFILE.TOP  ·  0x${serial}`, 88, 1368);

	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (blob) resolve(blob);
			else reject(new Error('blob'));
		}, 'image/png');
	});
}

function wrapText(
	ctx: CanvasRenderingContext2D,
	text: string,
	x: number,
	y: number,
	maxWidth: number,
	lineHeight: number,
	font: string,
	color: string,
) {
	ctx.font = font;
	ctx.fillStyle = color;
	let line = '';
	let cursorY = y;
	for (const ch of text) {
		const next = line + ch;
		if (ctx.measureText(next).width > maxWidth && line) {
			ctx.fillText(line, x, cursorY);
			line = ch;
			cursorY += lineHeight;
		} else {
			line = next;
		}
	}
	if (line) ctx.fillText(line, x, cursorY);
}

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error(src));
		img.src = src;
	});
}

function drawRoundedImage(
	ctx: CanvasRenderingContext2D,
	img: HTMLImageElement,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
) {
	ctx.save();
	ctx.beginPath();
	ctx.roundRect(x, y, w, h, r);
	ctx.clip();
	ctx.imageSmoothingEnabled = false;
	ctx.drawImage(img, x, y, w, h);
	ctx.restore();
}
