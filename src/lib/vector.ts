/**
 * 极简向量工具：余弦相似度 + top-K 检索。
 * 博客量级（几十到几百个 chunk）用内存 + 线性扫描完全够用，
 * 不引入额外向量数据库，检索逻辑一目了然。
 */

export interface VectorItem {
	embedding: number[];
}

export function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;
	const length = Math.min(a.length, b.length);
	for (let i = 0; i < length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	const denominator = Math.sqrt(normA) * Math.sqrt(normB);
	return denominator === 0 ? 0 : dot / denominator;
}

export function topK<T extends VectorItem>(query: number[], items: T[], k: number): T[] {
	return items
		.map((item) => ({ item, score: cosineSimilarity(query, item.embedding) }))
		.sort((a, b) => b.score - a.score)
		.slice(0, k)
		.map((entry) => entry.item);
}
