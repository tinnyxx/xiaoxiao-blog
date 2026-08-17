---
title: 'DeepSeek 流式输出与 RAG 提示词工程'
description: '调用 DeepSeek 的 chat/completions 接口，解析 SSE 流式响应，并设计让模型「只依据资料、带引用」回答的系统提示词。'
pubDate: '2026-07-10'
---

大模型生成一个长回答通常要几秒到几十秒。如果等它全部生成完再一次性返回，用户体验会很差。流式输出（streaming）能让回答像打字一样逐字出现，这是现代 AI 应用的标配。这篇文章记录我接 DeepSeek 流式接口和写 RAG 提示词的过程。

## DeepSeek 接口：OpenAI 兼容

DeepSeek 的 `chat/completions` 接口兼容 OpenAI 格式，开启流式只需要把 `stream` 设成 `true`：

```ts
const response = await fetch('https://api.deepseek.com/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
  },
  body: JSON.stringify({
    model: 'deepseek-chat',
    messages,
    stream: true,
    temperature: 0.4,
    max_tokens: 1024,
  }),
});
```

响应体是 Server-Sent Events（SSE）格式，每一行 `data:` 后面跟一段 JSON，`choices[0].delta.content` 就是增量文本，最后以 `data: [DONE]` 结束。

## 解析 SSE：注意粘包

SSE 是按「事件」分隔的，但网络传输是按「字节块」来的，一个 TCP 包可能只包含半个事件，也可能包含多个事件。正确做法是维护一个缓冲区，按 `\n` 切行、按空行切事件：

```ts
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
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (payload === '[DONE]') return;
    const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
    if (delta) yield delta;
  }
}
```

`decoder.decode(value, { stream: true })` 里的 `stream: true` 很重要：它告诉解码器「后面还有字节」，避免多字节字符（中文）被从中间截断后乱码。

## 把流再转发给浏览器

我的服务端不是把 DeepSeek 的 SSE 原样转给前端，而是包一层自己的事件协议：

- `sources`：检索到的引用来源（先发，前端先渲染引用）；
- `delta`：增量文本；
- `done`：结束；
- `error`：出错信息。

这样前端不需要关心 DeepSeek 的细节，接口也更容易扩展。

## RAG 提示词：让模型克制

RAG 最容易翻车的地方是模型「无视资料、自由发挥」。我的系统提示词定了五条硬规则：

1. 只依据提供的参考资料回答，没有的信息明确说「没有提到」，绝不编造；
2. 用中文、Markdown 排版；
3. 引用资料用 [1][2] 序号标注，与文末参考资料一一对应；
4. 先结论后展开；
5. 无关问题礼貌拒绝。

把检索到的片段编号后拼进用户消息，模型就会顺着引用去组织答案。温度设 0.4，既保持信息密度又不至于太飘。

## 小结

流式输出和提示词是 RAG 应用体验的「临门一脚」：前者解决等待焦虑，后者解决可信度。两者都不难，但做对了整个产品质感会明显不一样。
