import { streamChatCompletion, type ChatMessage } from './deepseek';
import type { IndexEntry } from './knowledge';

const SYSTEM_PROMPT = `你是「小小博客」站点的 AI 助手，知识来自站点作者写的技术文章。
请严格遵守以下规则：
1. 只依据下面给出的【参考资料】回答；资料里没有的信息，明确说「文章里没有提到」，绝不编造。
2. 用简体中文回答，使用 Markdown 排版；涉及代码时用代码块。
3. 回答中引用资料时，用 [1]、[2] 这样的序号标注，与文末的「参考资料」一一对应。
4. 先给结论，再展开；保持简洁、准确。
5. 如果问题与本站文章内容完全无关，礼貌说明你主要回答本站文章相关的问题。`;

function buildContextBlock(context: IndexEntry[]): string {
	return context
		.map((entry, index) => {
			const heading = entry.source.heading ? `（${entry.source.heading}）` : '';
			return `[${index + 1}]《${entry.source.title}》${heading}\n${entry.text}`;
		})
		.join('\n\n---\n\n');
}

function buildMessages(question: string, history: ChatMessage[], context: IndexEntry[]): ChatMessage[] {
	const contextBlock = buildContextBlock(context);
	const userContent = `以下是可参考的资料片段：\n\n${contextBlock}\n\n---\n\n用户问题：${question}`;

	const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }];
	for (const message of history.slice(-6)) {
		if (message.role !== 'user' && message.role !== 'assistant') continue;
		messages.push({ role: message.role, content: message.content.slice(0, 4000) });
	}
	messages.push({ role: 'user', content: userContent });
	return messages;
}

/** 结合检索结果，流式生成回答。 */
export async function* answerStream(
	question: string,
	history: ChatMessage[],
	context: IndexEntry[],
): AsyncGenerator<string, void, unknown> {
	yield* streamChatCompletion(buildMessages(question, history, context));
}
