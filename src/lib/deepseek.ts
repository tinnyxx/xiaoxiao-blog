import { loadEnvFile } from './env';

loadEnvFile();

export interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

const BASE_URL = process.env.DEEPSEEK_API_BASE ?? 'https://api.deepseek.com';
const MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';

export class DeepSeekError extends Error {
	constructor(
		message: string,
		readonly status?: number,
	) {
		super(message);
		this.name = 'DeepSeekError';
	}
}

export function hasApiKey(): boolean {
	return Boolean(process.env.DEEPSEEK_API_KEY);
}

/**
 * 调用 DeepSeek 的 chat/completions（OpenAI 兼容），以 SSE 流式返回
 * 生成内容。返回一个 async generator，每次 yield 一段增量文本。
 */
export async function* streamChatCompletion(
	messages: ChatMessage[],
	options: { temperature?: number; maxTokens?: number } = {},
): AsyncGenerator<string, void, unknown> {
	const apiKey = process.env.DEEPSEEK_API_KEY;
	if (!apiKey) {
		throw new DeepSeekError('服务端未配置 DEEPSEEK_API_KEY，请先在 .env 中设置。');
	}

	const response = await fetch(`${BASE_URL}/chat/completions`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			model: MODEL,
			messages,
			stream: true,
			temperature: options.temperature ?? 0.4,
			max_tokens: options.maxTokens ?? 1024,
		}),
	});

	if (!response.ok || !response.body) {
		const text = await response.text().catch(() => '');
		throw new DeepSeekError(
			`DeepSeek 请求失败（HTTP ${response.status}）：${text.slice(0, 300)}`,
			response.status,
		);
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });

		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed.startsWith('data:')) continue;
			const payload = trimmed.slice(5).trim();
			if (payload === '[DONE]') return;
			try {
				const json = JSON.parse(payload) as {
					choices?: { delta?: { content?: string } }[];
				};
				const delta = json.choices?.[0]?.delta?.content;
				if (typeof delta === 'string' && delta.length > 0) yield delta;
			} catch {
				// 忽略无法解析的行（例如心跳/注释）
			}
		}
	}
}
