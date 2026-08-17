import type { APIRoute } from 'astro';
import { getIndex } from '../../lib/knowledge';

export const prerender = false;

/**
 * 手动重建 RAG 索引（预下载 embedding 模型 + 重新向量化）。
 * 部署后用 `curl -X POST https://域名/api/ingest` 预热一次，
 * 之后新增文章也可以用它强制刷新。
 */
export const POST: APIRoute = async () => {
	const startedAt = Date.now();
	try {
		const index = await getIndex(true);
		return new Response(
			JSON.stringify({
				ok: true,
				chunks: index.entries.length,
				model: index.model,
				elapsedMs: Date.now() - startedAt,
			}),
			{ headers: { 'Content-Type': 'application/json; charset=utf-8' } },
		);
	} catch (error) {
		return new Response(
			JSON.stringify({
				ok: false,
				error: error instanceof Error ? error.message : '索引构建失败',
			}),
			{ status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
		);
	}
};
