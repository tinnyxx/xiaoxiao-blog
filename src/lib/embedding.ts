import { loadEnvFile } from './env';

loadEnvFile();

/**
 * Embedding 后端：可插拔 + 自动降级。
 *
 * - LocalEmbedder：用 @huggingface/transformers 在 Node 里跑
 *   Xenova/bge-small-zh-v1.5（512 维中文向量），CPU 即可，无需 GPU。
 * - HashEmbedder：离线降级方案，用字符 n-gram 哈希得到确定性向量，
 *   保证没有网络 / 模型损坏时整条 RAG 链路依然能跑通。
 */

export interface Embedder {
	readonly name: string;
	readonly dim: number;
	embed(texts: string[]): Promise<number[][]>;
}

function l2Normalize(vector: number[]): number[] {
	let sum = 0;
	for (const x of vector) sum += x * x;
	const norm = Math.sqrt(sum) || 1;
	return vector.map((x) => x / norm);
}

function fnv1a(input: string): number {
	let hash = 2166136261;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function* ngramsOf(text: string, n: number): Iterable<string> {
	for (let i = 0; i + n <= text.length; i++) yield text.slice(i, i + n);
}

function hashEmbed(text: string, dim: number): number[] {
	const vector = new Array<number>(dim).fill(0);
	const lower = text.toLowerCase();
	for (const gram of [...ngramsOf(lower, 2), ...ngramsOf(lower, 3)]) {
		const hash = fnv1a(gram);
		const index = hash % dim;
		vector[index] += (hash & 1) === 0 ? 1 : -1;
	}
	return l2Normalize(vector);
}

export class HashEmbedder implements Embedder {
	readonly name = 'hash-ngram (offline fallback)';
	readonly dim = 512;

	async embed(texts: string[]): Promise<number[][]> {
		return texts.map((text) => hashEmbed(text, this.dim));
	}
}

type FeatureExtractionPipeline = (text: string, options?: Record<string, unknown>) => Promise<{
	data: Float32Array | number[];
}>;

export class LocalEmbedder implements Embedder {
	readonly name = 'local: Xenova/bge-small-zh-v1.5';
	readonly dim = 512;

	private pipeline: FeatureExtractionPipeline | null = null;
	private loadPromise: Promise<void> | null = null;

	async ensureLoaded(): Promise<void> {
		if (!this.loadPromise) {
			this.loadPromise = (async () => {
				const { pipeline } = await import('@huggingface/transformers');
				this.pipeline = (await pipeline('feature-extraction', 'Xenova/bge-small-zh-v1.5', {
					pooling: 'mean',
					normalize: true,
				})) as FeatureExtractionPipeline;
			})();
		}
		return this.loadPromise;
	}

	async embed(texts: string[]): Promise<number[][]> {
		await this.ensureLoaded();
		const results: number[][] = [];
		for (const text of texts) {
			const output = await this.pipeline!(text, { pooling: 'mean', normalize: true });
			results.push(Array.from(output.data as ArrayLike<number>));
		}
		return results;
	}
}

let cached: Embedder | null = null;

/** 返回单例 embedder；本地模型加载失败时自动降级为 hash。 */
export async function getEmbedder(): Promise<Embedder> {
	if (cached) return cached;

	const provider = (process.env.EMBEDDING_PROVIDER ?? 'local').toLowerCase();
	if (provider === 'hash') {
		cached = new HashEmbedder();
		return cached;
	}

	const local = new LocalEmbedder();
	try {
		await local.ensureLoaded();
		cached = local;
	} catch (error) {
		console.warn('[embedding] 本地模型加载失败，降级为 hash embedder：', error);
		cached = new HashEmbedder();
	}
	return cached;
}
