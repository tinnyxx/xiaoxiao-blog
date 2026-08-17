---
title: '给博客装一个 RAG 问答助手：从 0 到 1'
description: '记录如何把一个纯静态的 Astro 博客改造成支持检索增强生成（RAG）的 AI 问答站点：混合渲染、本地向量化、流式生成与部署。'
pubDate: '2026-08-15'
---

这个博客一开始只是一个纯静态的 Astro 站点：文章用 Markdown 写，构建成 HTML，交给 Nginx 托管。后来我想给它加一个「能回答关于本站文章问题」的 AI 助手，于是就有了现在的 RAG 问答功能。这篇文章复盘整个改造过程。

## 目标与边界

我要的不是一个会闲聊的机器人，而是一个**只回答「本站文章相关」问题**的助手：用户问一个问题，系统先从文章里找到最相关的片段，再让大模型基于这些片段生成回答，并附上引用来源。这种「先检索、再生成」的范式就是检索增强生成（RAG）。

技术上给自己定了几个约束：

- 不引入重型向量数据库，博客量级用内存数组 + 余弦相似度就够；
- API Key 不暴露到浏览器，生成逻辑放在服务端；
- 回答要流式输出，不能让人干等；
- 文章有增删改时，索引要能自动感知并重建。

## 从静态到混合渲染

Astro 默认是静态输出，但 RAG 需要服务端接口（拿到 Key、跑检索、调模型）。这里没有把整个站点都改成服务端渲染，而是用了 Astro 的 **hybrid 模式**：博客、工具等页面继续保持预渲染（静态 HTML，快、省资源），只有 `/api/ask`、`/api/ingest` 这些端点跑在服务端。

```js
// astro.config.mjs
export default defineConfig({
  output: 'hybrid',
  adapter: node({ mode: 'standalone' }),
  // ...
});
```

`standalone` 模式会把服务端打包成一个 `entry.mjs`，用 `node dist/server/entry.mjs` 就能跑，配合 PM2 和 Nginx 反代即可上线。

## 向量化：本地模型，不花额外的钱

RAG 的第一步是把文章变成向量。生成用 DeepSeek（便宜、国内直连），但 DeepSeek 官方目前不提供 embedding 接口，所以向量化这一步我选在本地完成：用 `@huggingface/transformers` 加载 `Xenova/bge-small-zh-v1.5`（512 维中文向量），CPU 就能跑，没有额外的 API 成本。

```ts
const { pipeline } = await import('@huggingface/transformers');
const extractor = await pipeline('feature-extraction', 'Xenova/bge-small-zh-v1.5', {
  pooling: 'mean',
  normalize: true,
});
```

这里有一个工程细节：transformers.js 需要在运行时从 `node_modules` 加载 ONNX 模型文件，所以要在 Vite 的 SSR 配置里把它标记为 external，否则打包器会把模型资源路径打乱。

另外我还做了一层降级：如果本地模型下载失败（比如服务器离线），会回退到一个确定性的字符 n-gram 哈希向量，保证整条链路依然能跑通，方便开发调试。

## 分块：让检索命中「该中的地方」

把整篇文章直接向量化效果很差，因为一篇长文里可能同时聊好几个主题。我采用结构感知的分块策略：

1. 先按 Markdown 标题把文章切成章节；
2. 章节内部再按句子合并成约 480 字符的窗口，相邻窗口保留 80 字符重叠；
3. 每个 chunk 带上「文章标题 + 章节标题」作为前缀，让向量本身携带定位信息。

重叠是为了避免一句话被从中间切断，导致语义丢失。

## 检索与生成

检索就是算余弦相似度、取 top-K，没什么花哨的。真正影响体验的是提示词：我要求模型「只依据给的资料回答、绝不编造、引用时用 [1][2] 标注」，这样回答既克制又可信。

生成走 DeepSeek 的 `chat/completions`，开启 `stream: true`，服务端把返回的 SSE 增量转成自己的事件流（`sources` → `delta` → `done`），前端用 `fetch` + `ReadableStream` 逐字渲染，实现打字机效果。

## 部署

服务端跑在 PM2 里，Nginx 反代到 `127.0.0.1:4321`。因为要流式输出，Nginx 必须关掉缓冲：

```nginx
location / {
    proxy_pass http://127.0.0.1:4321;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 120s;
}
```

## 小结

这个项目麻雀虽小，但把 RAG 的关键环节都走了一遍：内容分块、向量化、相似度检索、提示词、流式生成、混合渲染和部署。对个人项目来说，重点不是用了多重的组件，而是每个环节都能讲清楚「为什么这么选」。
