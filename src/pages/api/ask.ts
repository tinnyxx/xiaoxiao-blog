import type { APIRoute } from 'astro';
import { answerStream } from '../../lib/rag';
import { retrieve } from '../../lib/knowledge';
import { hasApiKey } from '../../lib/deepseek';

export const prerender = false;

interface AskBody {
	question?: string;
	history?: { role?: string; content?: string }[];
}

function encodeSSE(data: unknown): Uint8Array {
	return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

export const POST: APIRoute = async ({ request }) => {
	let body: AskBody;
	try {
		body = (await request.json()) as AskBody;
	} catch {
		return new Response(JSON.stringify({ error: '请求体不是合法 JSON' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	const question = (body.question ?? '').trim();
	if (!question) {
		return new Response(JSON.stringify({ error: 'question 不能为空' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}
	if (question.length > 2000) {
		return new Response(JSON.stringify({ error: '问题过长，请控制在 2000 字以内' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	const history = (body.history ?? [])
		.slice(-6)
		.map((message) => ({
			role: message.role === 'assistant' ? ('assistant' as const) : ('user' as const),
			content: String(message.content ?? '').slice(0, 4000),
		}));

	let cancelled = false;
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const send = (data: unknown) => {
				if (!cancelled) controller.enqueue(encodeSSE(data));
			};

			try {
				if (!hasApiKey()) {
					send({
						type: 'error',
						message: '服务端尚未配置 DEEPSEEK_API_KEY。请参考 README 的「配置」一节完成设置。',
					});
					send({ type: 'done' });
					return;
				}

				const { entries } = await retrieve(question, 4);
				send({
					type: 'sources',
					sources: entries.map((entry) => ({
						title: entry.source.title,
						slug: entry.source.slug,
						heading: entry.source.heading,
					})),
				});

				if (entries.length === 0) {
					send({
						type: 'delta',
						text: '抱歉，当前知识库还没有收录相关内容，暂时无法回答这个问题。你可以先去看看[文章归档](/blog)。',
					});
				} else {
					for await (const delta of answerStream(question, history, entries)) {
						if (cancelled) break;
						send({ type: 'delta', text: delta });
					}
				}
				send({ type: 'done' });
			} catch (error) {
				const message = error instanceof Error ? error.message : '生成回答时出错了';
				send({ type: 'error', message });
				send({ type: 'done' });
			} finally {
				controller.close();
			}
		},
		cancel() {
			cancelled = true;
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream; charset=utf-8',
			'Cache-Control': 'no-cache, no-transform',
			// 阻止 nginx 缓冲 SSE 流
			'X-Accel-Buffering': 'no',
			Connection: 'keep-alive',
		},
	});
};
