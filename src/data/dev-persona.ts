export const STATS = [
	{ id: 'night', label: '夜行', en: 'Night' },
	{ id: 'craft', label: '工艺', en: 'Craft' },
	{ id: 'hunt', label: '狩猎', en: 'Hunt' },
	{ id: 'reuse', label: '复用', en: 'Reuse' },
	{ id: 'vision', label: '架构', en: 'Vision' },
	{ id: 'prompt', label: '驯兽', en: 'Prompt' },
] as const;

export type StatId = (typeof STATS)[number]['id'];
export type PersonaId = 'midnight' | 'paste' | 'hunter' | 'architect' | 'pixel' | 'whisper';

export interface Persona {
	id: PersonaId;
	name: string;
	en: string;
	glyph: string;
	avatar: string;
	tags: string[];
	blurb: string;
	quote: string;
	/** Baseline radar 0–100, mixed with answers so the type still reads as itself. */
	radar: Record<StatId, number>;
}

export interface AnswerOption {
	label: string;
	persona: Partial<Record<PersonaId, number>>;
	stats: Partial<Record<StatId, number>>;
}

export interface Question {
	kicker: string;
	title: string;
	options: [AnswerOption, AnswerOption, AnswerOption, AnswerOption];
}

export const personas: Record<PersonaId, Persona> = {
	midnight: {
		id: 'midnight',
		name: '午夜重构师',
		en: 'Midnight Refactorer',
		glyph: '☽',
		avatar: '/persona/midnight.webp',
		tags: ['night-shift', 'refactor', 'git blame'],
		blurb:
			'你相信代码的寿命比功能更长。别人在睡觉时，你把「能跑」磨成「值得留下来」。提交记录里，凌晨的 message 往往最短，也最诚实。',
		quote: '能跑不是终点。三点十七分，才是重构的黄金窗口。',
		radar: { night: 94, craft: 82, hunt: 48, reuse: 28, vision: 70, prompt: 36 },
	},
	paste: {
		id: 'paste',
		name: 'Ctrl+C / Ctrl+V 大师',
		en: 'Paste Maestro',
		glyph: '⌘',
		avatar: '/persona/paste.webp',
		tags: ['search-first', 'compose', 'no-wheel'],
		blurb:
			'你不崇拜从零造轮子。你崇拜定位、筛选、微调——把别人验证过的片段，嵌进自己系统里刚好合适的位置。这不是偷懒，是检索的最高段位。',
		quote: '最好的代码，是已经有人写过、而且写对了的那种。',
		radar: { night: 42, craft: 38, hunt: 46, reuse: 96, vision: 52, prompt: 64 },
	},
	hunter: {
		id: 'hunter',
		name: 'Bug 猎人',
		en: 'Bug Hunter',
		glyph: '◎',
		avatar: '/persona/hunter.webp',
		tags: ['repro', 'stack-trace', 'green'],
		blurb:
			'报错在你眼里不是事故，是猎物留下的足迹。你享受缩小范围：复现、对照、设断点，直到那一行终于露出马脚。测试变绿的时候，世界会安静半秒。',
		quote: '栈追踪是藏宝图。红字，是它在向你眨眼。',
		radar: { night: 72, craft: 54, hunt: 96, reuse: 40, vision: 48, prompt: 32 },
	},
	architect: {
		id: 'architect',
		name: '架构预言家',
		en: 'Architecture Oracle',
		glyph: '⌬',
		avatar: '/persona/architect.webp',
		tags: ['boundaries', 'deps', 'later-you'],
		blurb:
			'你总是比当前需求多想两步。目录、边界、依赖方向——别人觉得是过早优化，你觉得是在给未来的自己写信。三周后的变更，常常印证你的预感。',
		quote: '先画边界，再写实现。未来的你会回来谢你。',
		radar: { night: 50, craft: 68, hunt: 40, reuse: 46, vision: 96, prompt: 48 },
	},
	pixel: {
		id: 'pixel',
		name: '像素级强迫症',
		en: 'Pixel Perfectionist',
		glyph: '▦',
		avatar: '/persona/pixel.webp',
		tags: ['1px', 'naming', 'align'],
		blurb:
			'一像素的偏移会在你视野里发光。命名、间距、主题色、提交前的空行，都有必须被安放好的位置。别人说你较真，你只是还没找到能让眼睛休息的那一版。',
		quote: '差一个像素，和差一个等号，同样无法合并。',
		radar: { night: 46, craft: 96, hunt: 50, reuse: 24, vision: 58, prompt: 34 },
	},
	whisper: {
		id: 'whisper',
		name: 'AI 驯兽师',
		en: 'AI Whisperer',
		glyph: '✶',
		avatar: '/persona/whisper.webp',
		tags: ['context', 'review', 'taste'],
		blurb:
			'你把模型当成会写代码的实习生：给上下文、改提示、验收、再喂回去。你清楚它的幻觉边界，也清楚判断该在哪一刻介入。工具在变，品味还是你的。',
		quote: '它不会取代我。它只是我养的、偶尔跑偏的实习生。',
		radar: { night: 56, craft: 42, hunt: 44, reuse: 72, vision: 60, prompt: 96 },
	},
};

export const questions: Question[] = [
	{
		kicker: 'Habit / 01',
		title: '凌晨两点，屏幕还亮着。你最可能在？',
		options: [
			{
				label: '重构一段「其实能跑」的模块',
				persona: { midnight: 3, pixel: 1 },
				stats: { night: 3, craft: 2, vision: 1 },
			},
			{
				label: '把 GitHub 上的片段改到刚好能用',
				persona: { paste: 3 },
				stats: { reuse: 3, night: 1, prompt: 1 },
			},
			{
				label: '盯着一个只在生产环境出现的 bug',
				persona: { hunter: 3 },
				stats: { hunt: 3, night: 2 },
			},
			{
				label: '和 AI 来回打磨同一段提示词',
				persona: { whisper: 3 },
				stats: { prompt: 3, night: 2 },
			},
		],
	},
	{
		kicker: 'Debug / 02',
		title: '终端突然刷红。你的第一反应是？',
		options: [
			{
				label: '从栈顶第一行开始读，像读侦探小说',
				persona: { hunter: 3 },
				stats: { hunt: 3, craft: 1 },
			},
			{
				label: '整段复制，丢进搜索框',
				persona: { paste: 3, whisper: 1 },
				stats: { reuse: 3, hunt: 1 },
			},
			{
				label: '先怀疑是分层或依赖出了问题',
				persona: { architect: 3 },
				stats: { vision: 3, hunt: 1 },
			},
			{
				label: '丢给 AI，自己去倒杯水',
				persona: { whisper: 3 },
				stats: { prompt: 3, reuse: 1 },
			},
		],
	},
	{
		kicker: 'Boot / 03',
		title: '新仓库初始化完毕。你接下来会？',
		options: [
			{
				label: '先定目录、边界和依赖方向',
				persona: { architect: 3 },
				stats: { vision: 3, craft: 1 },
			},
			{
				label: '把 lint、prettier、editorconfig 一次拉齐',
				persona: { pixel: 3 },
				stats: { craft: 3, vision: 1 },
			},
			{
				label: 'clone 个最热的 starter，删到只剩骨架',
				persona: { paste: 3 },
				stats: { reuse: 3, vision: 1 },
			},
			{
				label: '让 AI 搭好脚手架，自己再修剪',
				persona: { whisper: 3, architect: 1 },
				stats: { prompt: 3, vision: 1 },
			},
		],
	},
	{
		kicker: 'Stamina / 04',
		title: 'Debug 进入第三小时。你会？',
		options: [
			{
				label: '继续。谁先眨眼谁输',
				persona: { hunter: 3, midnight: 1 },
				stats: { hunt: 3, night: 2 },
			},
			{
				label: '删了重写，那两百行已经看不下去',
				persona: { midnight: 3 },
				stats: { craft: 2, night: 2, vision: 1 },
			},
			{
				label: '停。带着疲劳提交是对代码的不尊重',
				persona: { pixel: 3, architect: 1 },
				stats: { craft: 3 },
			},
			{
				label: '把相关文件全扔给模型，自己当评审',
				persona: { whisper: 3 },
				stats: { prompt: 3, hunt: 1 },
			},
		],
	},
	{
		kicker: 'Taste / 05',
		title: '功能完美，但有人把 Tab 和空格混用了。你？',
		options: [
			{
				label: '阻塞合并。格式就是契约',
				persona: { pixel: 3 },
				stats: { craft: 3 },
			},
			{
				label: '只修自己碰过的文件，保持礼貌',
				persona: { architect: 3 },
				stats: { vision: 2, craft: 1 },
			},
			{
				label: 'squash 时顺手 format 全文件',
				persona: { midnight: 3, pixel: 1 },
				stats: { craft: 2, night: 1 },
			},
			{
				label: '能跑就行，今晚还有别的火',
				persona: { paste: 3, hunter: 1 },
				stats: { reuse: 2, hunt: 1 },
			},
		],
	},
	{
		kicker: 'Joy / 06',
		title: '编程里最让你上瘾的瞬间？',
		options: [
			{
				label: '测试从红变绿，世界安静半秒',
				persona: { hunter: 3 },
				stats: { hunt: 3, craft: 1 },
			},
			{
				label: '乱麻被你拆成干净的模块边界',
				persona: { architect: 3, midnight: 1 },
				stats: { vision: 3, craft: 1 },
			},
			{
				label: '某一个像素、某一行命名终于「对了」',
				persona: { pixel: 3 },
				stats: { craft: 3 },
			},
			{
				label: '模型一次生成到位，你只改了三行',
				persona: { whisper: 3, paste: 1 },
				stats: { prompt: 3, reuse: 1 },
			},
		],
	},
	{
		kicker: 'Learn / 07',
		title: '学一门新框架，你的打开方式是？',
		options: [
			{
				label: '官方文档和 RFC，从原理往下走',
				persona: { architect: 3, pixel: 1 },
				stats: { vision: 3, craft: 1 },
			},
			{
				label: '找 star 最多的示例，改着玩',
				persona: { paste: 3 },
				stats: { reuse: 3, hunt: 1 },
			},
			{
				label: '通宵做一个没用但很酷的 demo',
				persona: { midnight: 3 },
				stats: { night: 3, craft: 2 },
			},
			{
				label: '让 AI 当私教，边问边写',
				persona: { whisper: 3 },
				stats: { prompt: 3, reuse: 1 },
			},
		],
	},
	{
		kicker: 'Prod / 08',
		title: '周五 17:50，生产报警。你？',
		options: [
			{
				label: '打开日志，猎人模式启动',
				persona: { hunter: 3 },
				stats: { hunt: 3, night: 1 },
			},
			{
				label: '先回滚，活下来再复盘',
				persona: { architect: 3 },
				stats: { vision: 3, hunt: 1 },
			},
			{
				label: '把报错丢给 AI，边看边修',
				persona: { whisper: 3 },
				stats: { prompt: 3, hunt: 1 },
			},
			{
				label: '从聊天记录里翻出上次类似的修复',
				persona: { paste: 3 },
				stats: { reuse: 3, hunt: 1 },
			},
		],
	},
	{
		kicker: 'Review / 09',
		title: '代码评审里你最常留下的是？',
		options: [
			{
				label: '这个命名还可以更精确',
				persona: { pixel: 3 },
				stats: { craft: 3 },
			},
			{
				label: '这里会不会有边界情况？',
				persona: { hunter: 3 },
				stats: { hunt: 3, vision: 1 },
			},
			{
				label: '我们是不是在重复造轮子？',
				persona: { paste: 3, architect: 1 },
				stats: { reuse: 3, vision: 1 },
			},
			{
				label: '这段可以抽一层，以后会感谢自己',
				persona: { architect: 3, midnight: 1 },
				stats: { vision: 3, craft: 1 },
			},
		],
	},
	{
		kicker: 'Desk / 10',
		title: '如果用桌面形容你现在的心智？',
		options: [
			{
				label: '深色主题，ligature 字体，窗口像素对齐',
				persona: { pixel: 3 },
				stats: { craft: 3, night: 1 },
			},
			{
				label: '终端铺满，tmux 切了无数块',
				persona: { midnight: 3, hunter: 1 },
				stats: { night: 3, hunt: 2 },
			},
			{
				label: '浏览器四十个标签，从文档到 Stack Overflow',
				persona: { paste: 3 },
				stats: { reuse: 3, hunt: 1 },
			},
			{
				label: '左边编辑器，右边对话窗，中间一杯咖啡',
				persona: { whisper: 3 },
				stats: { prompt: 3, night: 1 },
			},
		],
	},
];

export interface PersonaResult {
	persona: Persona;
	radar: Record<StatId, number>;
	serial: string;
	picks: number[];
}

const PERSONA_IDS = Object.keys(personas) as PersonaId[];

function serialFrom(picks: number[]): string {
	let hash = 2166136261;
	for (const pick of picks) {
		hash ^= pick + 1;
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16).toUpperCase().padStart(4, '0').slice(0, 4);
}

function clampStat(value: number): number {
	return Math.round(Math.min(96, Math.max(28, value)));
}

export function evaluate(picks: number[]): PersonaResult {
	const personaScore = Object.fromEntries(PERSONA_IDS.map((id) => [id, 0])) as Record<
		PersonaId,
		number
	>;
	const rawStats = Object.fromEntries(STATS.map((s) => [s.id, 0])) as Record<StatId, number>;

	picks.forEach((optionIndex, questionIndex) => {
		const option = questions[questionIndex]?.options[optionIndex];
		if (!option) return;
		for (const [id, n] of Object.entries(option.persona) as [PersonaId, number][]) {
			personaScore[id] += n;
		}
		for (const [id, n] of Object.entries(option.stats) as [StatId, number][]) {
			rawStats[id] += n;
		}
	});

	const serial = serialFrom(picks);
	const ranked = [...PERSONA_IDS].sort((a, b) => {
		const diff = personaScore[b] - personaScore[a];
		if (diff !== 0) return diff;
		return (serial.charCodeAt(0) + a.charCodeAt(0)) % 2 === 0 ? -1 : 1;
	});
	const persona = personas[ranked[0]];

	const maxStat = Math.max(...STATS.map((s) => rawStats[s.id]), 1);
	const radar = Object.fromEntries(
		STATS.map((s) => {
			const mixed = (rawStats[s.id] / maxStat) * 0.62 + (persona.radar[s.id] / 100) * 0.38;
			return [s.id, clampStat(28 + mixed * 68)];
		}),
	) as Record<StatId, number>;

	return { persona, radar, serial, picks };
}
