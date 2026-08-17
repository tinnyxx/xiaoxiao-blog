/**
 * 语料分块：把 Markdown 文章切成适合 embedding 与检索的小块。
 *
 * 策略：
 * 1. 按 Markdown 标题（# ~ ######）把文章切成「章节」；
 * 2. 章节内部再按句子级单元合并成约 480 字符的窗口，相邻窗口保留
 *    约 80 字符重叠，避免关键句被从中间切断；
 * 3. 每个 chunk 带上「文章标题 + 章节标题」作为上下文前缀，让向量
 *    本身也能携带一点定位信息。
 */

export interface ChunkSource {
	slug: string;
	title: string;
	heading?: string;
}

export interface Chunk {
	id: string;
	text: string;
	source: ChunkSource;
}

const CHUNK_SIZE = 480;
const OVERLAP = 80;

/** 去掉 Markdown 语法，得到适合 embedding 的纯文本。 */
export function markdownToText(md: string): string {
	return md
		// 代码块：去掉围栏标记与语言名，保留代码内容本身
		.replace(/```[a-zA-Z0-9_+-]*\s*/g, '\n')
		.replace(/~~~[a-zA-Z0-9_+-]*\s*/g, '\n')
		// 图片 ![alt](url) -> alt
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
		// 链接 [text](url) -> text
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		// 行内代码 `code` -> code
		.replace(/`([^`]*)`/g, '$1')
		// 标题标记
		.replace(/^\s{0,3}#{1,6}\s+/gm, '')
		// 强调 **bold** / __bold__ / *italic* / _italic_
		.replace(/(\*\*|__)(.*?)\1/g, '$2')
		.replace(/(\*|_)(.*?)\1/g, '$2')
		// 列表标记
		.replace(/^\s{0,3}[-*+]\s+/gm, '')
		.replace(/^\s{0,3}\d{1,3}[.)]\s+/gm, '')
		// 引用
		.replace(/^\s{0,3}>\s?/gm, '')
		// 水平线
		.replace(/^\s{0,3}([-*_])(\s*\1){2,}\s*$/gm, '')
		// 残留 HTML 标签
		.replace(/<[^>]+>/g, '')
		// 收尾
		.split('\n')
		.map((line) => line.trimEnd())
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

interface Section {
	heading: string;
	body: string;
}

/** 按标题切分章节；标题之前的导语作为 heading 为空的第一个章节。 */
function splitSections(md: string): Section[] {
	const sections: Section[] = [];
	let heading = '';
	let buffer: string[] = [];

	const flush = () => {
		const body = buffer.join('\n').trim();
		if (body) sections.push({ heading, body });
		buffer = [];
	};

	for (const line of md.split(/\r?\n/)) {
		const match = /^(#{1,6})\s+(.*)$/.exec(line);
		if (match) {
			flush();
			heading = markdownToText(match[2]);
		} else {
			buffer.push(line);
		}
	}
	flush();
	return sections;
}

/** 把一段纯文本切成带重叠的窗口。 */
function splitWindow(text: string): string[] {
	const clean = markdownToText(text);
	// 先切成句子级单元，方便按长度拼接
	const units: string[] = [];
	for (const para of clean.split(/\n+/)) {
		const sentences = para.match(/[^。！？!?]+[。！？!?]?/g);
		if (sentences && sentences.length) {
			for (const s of sentences) {
				const t = s.trim();
				if (t) units.push(t);
			}
		} else {
			const t = para.trim();
			if (t) units.push(t);
		}
	}

	const chunks: string[] = [];
	let current = '';
	for (const unit of units) {
		if (current && current.length + unit.length > CHUNK_SIZE) {
			chunks.push(current.trim());
			current = current.slice(-OVERLAP) + unit;
		} else {
			current += unit;
		}
	}
	if (current.trim()) chunks.push(current.trim());
	return chunks;
}

export function chunkMarkdown(md: string, source: Omit<ChunkSource, 'heading'>): Chunk[] {
	const chunks: Chunk[] = [];
	for (const section of splitSections(md)) {
		for (const piece of splitWindow(section.body)) {
			const heading = section.heading || undefined;
			chunks.push({
				id: `${source.slug}--${chunks.length}`,
				text: heading ? `${heading}\n${piece}` : piece,
				source: { slug: source.slug, title: source.title, heading },
			});
		}
	}
	return chunks;
}
