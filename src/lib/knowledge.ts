import { getCollection } from 'astro:content';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chunkMarkdown, type Chunk } from './chunker';
import { getEmbedder } from './embedding';
import { topK } from './vector';
import { loadEnvFile } from './env';

loadEnvFile();

export interface IndexEntry extends Chunk {
	embedding: number[];
}

export interface RagIndex {
	version: number;
	/** 内容指纹：文章有增删改时自动触发重建。 */
	fingerprint: string;
	/** 构建时使用的 embedding 后端名。 */
	model: string;
	/** 构建时使用的 provider（local / hash），变更时触发重建。 */
	provider: string;
	generatedAt: string;
	entries: IndexEntry[];
}

function dataDir(): string {
	return process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
}

function indexPath(): string {
	return path.join(dataDir(), 'rag-index.json');
}

function hashFingerprint(items: { id: string; body: string }[]): string {
	const hash = createHash('sha1');
	for (const item of items) hash.update(`${item.id}\u0000${item.body}`);
	return hash.digest('hex');
}

async function collectionFingerprint(): Promise<string> {
	const posts = await getCollection('blog');
	return hashFingerprint(posts.map((post) => ({ id: post.id, body: post.body ?? '' })));
}

async function buildIndex(): Promise<RagIndex> {
	const posts = await getCollection('blog');
	const embedder = await getEmbedder();

	const entries: IndexEntry[] = [];
	for (const post of posts) {
		const body = post.body ?? '';
		const chunks = chunkMarkdown(body, { slug: post.id, title: post.data.title });
		if (chunks.length === 0) continue;

		const vectors = await embedder.embed(chunks.map((chunk) => chunk.text));
		chunks.forEach((chunk, index) => {
			entries.push({ ...chunk, embedding: vectors[index] });
		});
	}

	const index: RagIndex = {
		version: 1,
		fingerprint: await collectionFingerprint(),
		model: embedder.name,
		provider: process.env.EMBEDDING_PROVIDER ?? 'local',
		generatedAt: new Date().toISOString(),
		entries,
	};

	await mkdir(dataDir(), { recursive: true });
	await writeFile(indexPath(), JSON.stringify(index), 'utf8');
	console.log(`[rag] 索引构建完成：${entries.length} 个 chunk，模型 ${embedder.name}`);
	return index;
}

let index: RagIndex | null = null;
let pending: Promise<RagIndex> | null = null;

async function loadIndex(force: boolean): Promise<RagIndex> {
	if (!force) {
		try {
			const raw = await readFile(indexPath(), 'utf8');
			const parsed = JSON.parse(raw) as RagIndex;
			const currentProvider = process.env.EMBEDDING_PROVIDER ?? 'local';
			if (parsed.fingerprint === (await collectionFingerprint()) && parsed.provider === currentProvider) {
				index = parsed;
				return parsed;
			}
			console.log('[rag] 内容或 embedding 后端有变化，重建索引…');
		} catch {
			// 缓存不存在或损坏，走重建
		}
	}
	const built = await buildIndex();
	index = built;
	return built;
}

export async function getIndex(force = false): Promise<RagIndex> {
	if (index && !force) return index;
	if (!pending) {
		pending = loadIndex(force).finally(() => {
			pending = null;
		});
	}
	return pending;
}

export interface RetrievalResult {
	entries: IndexEntry[];
	model: string;
}

/** 检索与问题最相关的 top-k 个 chunk。 */
export async function retrieve(query: string, k = 4): Promise<RetrievalResult> {
	const idx = await getIndex();
	if (idx.entries.length === 0) return { entries: [], model: idx.model };

	const embedder = await getEmbedder();
	const queryVector = (await embedder.embed([query]))[0];
	const entries = topK(queryVector, idx.entries, Math.min(k, idx.entries.length));
	return { entries, model: idx.model };
}
