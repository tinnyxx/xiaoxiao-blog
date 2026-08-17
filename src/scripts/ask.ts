import { marked } from 'marked';
import DOMPurify from 'dompurify';

type Role = 'user' | 'assistant';

interface ChatMessage {
	role: Role;
	content: string;
}

interface SourceRef {
	title: string;
	slug: string;
	heading?: string;
}

type AskEvent =
	| { type: 'sources'; sources: SourceRef[] }
	| { type: 'delta'; text: string }
	| { type: 'error'; message: string }
	| { type: 'done' };

interface Persisted {
	history: ChatMessage[];
	sources: (SourceRef[] | null)[];
}

const STORAGE_KEY = 'ask-history-v1';

function renderMarkdown(markdown: string): string {
	const html = marked.parse(markdown, { async: false }) as string;
	return DOMPurify.sanitize(html);
}

function loadPersisted(): Persisted {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { history: [], sources: [] };
		const parsed = JSON.parse(raw) as Partial<Persisted>;
		const history = Array.isArray(parsed.history) ? parsed.history.slice(-20) : [];
		const sources = Array.isArray(parsed.sources) ? parsed.sources.slice(-20) : [];
		return { history, sources };
	} catch {
		return { history: [], sources: [] };
	}
}

export function mountAsk(root: HTMLElement): void {
	const messagesEl = root.querySelector<HTMLElement>('[data-messages]');
	const emptyEl = root.querySelector<HTMLElement>('[data-empty]');
	const input = root.querySelector<HTMLTextAreaElement>('[data-input]');
	const form = root.querySelector<HTMLFormElement>('[data-composer]');
	const statusEl = root.querySelector<HTMLElement>('[data-status]');
	const suggestionButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-suggest]'));

	if (!messagesEl || !emptyEl || !input || !form || !statusEl) return;

	const persisted = loadPersisted();
	const history: ChatMessage[] = persisted.history;
	const sources: (SourceRef[] | null)[] = persisted.sources;
	while (sources.length < history.length) sources.push(null);

	let busy = false;

	function savePersisted(): void {
		try {
			const data: Persisted = { history: history.slice(-20), sources: sources.slice(-20) };
			localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
		} catch {
			// localStorage 不可用时忽略
		}
	}

	function setBusy(value: boolean): void {
		busy = value;
		input.disabled = value;
		form.setAttribute('data-busy', String(value));
	}

	function setStatus(message: string): void {
		statusEl.textContent = message;
	}

	function autoResize(): void {
		input.style.height = 'auto';
		input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
	}

	function render(): void {
		const hasMessages = history.length > 0;
		emptyEl.hidden = hasMessages;
		messagesEl.hidden = !hasMessages;
		messagesEl.innerHTML = '';

		history.forEach((message, index) => {
			const wrapper = document.createElement('div');
			wrapper.className = `msg ${message.role}`;

			const bubble = document.createElement('div');
			bubble.className = 'bubble';

			const isStreaming = busy && index === history.length - 1 && message.role === 'assistant';

			if (message.role === 'user') {
				bubble.textContent = message.content;
			} else if (isStreaming) {
				// 流式阶段用纯文本渲染，避免每次增量都重新解析 Markdown；
				// 结束拿到 done 后再渲染成排版好的 Markdown。
				bubble.textContent = message.content;
				const cursor = document.createElement('span');
				cursor.className = 'cursor';
				cursor.setAttribute('aria-hidden', 'true');
				bubble.appendChild(cursor);
			} else if (message.content) {
				bubble.innerHTML = renderMarkdown(message.content);
			}

			wrapper.appendChild(bubble);

			const refs = sources[index];
			if (message.role === 'assistant' && refs && refs.length > 0 && !isStreaming) {
				const list = document.createElement('ol');
				list.className = 'sources';
				for (const ref of refs) {
					const item = document.createElement('li');
					const link = document.createElement('a');
					link.href = `/blog/${ref.slug}/`;
					link.textContent = ref.heading ? `${ref.title} · ${ref.heading}` : ref.title;
					item.appendChild(link);
					list.appendChild(item);
				}
				wrapper.appendChild(list);
			}

			messagesEl.appendChild(wrapper);
		});

		messagesEl.scrollTop = messagesEl.scrollHeight;
	}

	async function handleEvent(event: AskEvent): Promise<void> {
		switch (event.type) {
			case 'sources': {
				sources[history.length - 1] = event.sources;
				break;
			}
			case 'delta': {
				const last = history[history.length - 1];
				last.content += event.text;
				render();
				break;
			}
			case 'error': {
				setStatus(event.message);
				break;
			}
			case 'done':
			default:
				break;
		}
	}

	async function parseSSE(
		body: ReadableStream<Uint8Array>,
		onEvent: (event: AskEvent) => Promise<void>,
	): Promise<void> {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });

			const events = buffer.split('\n\n');
			buffer = events.pop() ?? '';

			for (const rawEvent of events) {
				const line = rawEvent.split('\n').find((l) => l.startsWith('data:'));
				if (!line) continue;
				const payload = line.slice(5).trim();
				if (!payload) continue;
				try {
					await onEvent(JSON.parse(payload) as AskEvent);
				} catch {
					// 忽略无法解析的事件
				}
			}
		}
	}

	async function send(question: string): Promise<void> {
		const q = question.trim();
		if (!q || busy) return;

		history.push({ role: 'user', content: q });
		history.push({ role: 'assistant', content: '' });
		sources.push(null);
		setBusy(true);
		setStatus('');
		input.value = '';
		autoResize();
		render();

		try {
			const response = await fetch('/api/ask', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ question: q, history: history.slice(0, -2) }),
			});

			if (!response.ok || !response.body) {
				const data = (await response.json().catch(() => null)) as { error?: string } | null;
				throw new Error(data?.error ?? `HTTP ${response.status}`);
			}

			await parseSSE(response.body, handleEvent);
		} catch (error) {
			const message = error instanceof Error ? error.message : '请求失败，请稍后重试';
			const last = history[history.length - 1];
			if (last.role === 'assistant' && !last.content) {
				last.content = `（出错了：${message}）`;
			}
			setStatus(message);
		} finally {
			setBusy(false);
			savePersisted();
			render();
			input.focus();
		}
	}

	form.addEventListener('submit', (event) => {
		event.preventDefault();
		void send(input.value);
	});

	input.addEventListener('keydown', (event) => {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			void send(input.value);
		}
	});

	input.addEventListener('input', autoResize);

	for (const button of suggestionButtons) {
		button.addEventListener('click', () => {
			void send(button.textContent ?? '');
		});
	}

	render();
	autoResize();
}
