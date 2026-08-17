---
title: '在 Node 里用 Transformers.js 跑中文 Embedding'
description: '不调付费向量接口，在服务端用 @huggingface/transformers 加载中文向量模型，把文本转成 512 维向量。'
pubDate: '2026-07-22'
---

做 RAG 一定绕不开「把文本变成向量」。商业向量接口（如 OpenAI 的 text-embedding）方便但要额外花钱、还要多管一把 Key。如果你的场景量级不大，完全可以在自己的服务器上用 Transformers.js 跑一个本地 embedding 模型。

## 选模型：bge-small-zh-v1.5

中文 embedding 里，BAAI 的 bge 系列是很常用的选择。我用的是 `Xenova/bge-small-zh-v1.5`，它是 bge-small-zh-v1.5 的 ONNX 转换版，专门给 Transformers.js 用。名字里的 small 意味着模型小、快，512 维向量，CPU 上就能流畅跑，非常适合个人项目。

## 加载与调用

Transformers.js 的 feature-extraction pipeline 一行就能建好：

```ts
import { pipeline } from '@huggingface/transformers';

const extractor = await pipeline('feature-extraction', 'Xenova/bge-small-zh-v1.5', {
  pooling: 'mean',
  normalize: true,
});

const output = await extractor('这是一段待向量化的中文文本');
const vector = Array.from(output.data); // 512 维浮点数组
```

两个关键参数：

- `pooling: 'mean'`：对最后一层隐藏状态做平均池化。bge 系列推荐 mean pooling，比直接取 CLS token 更稳；
- `normalize: true`：把向量做 L2 归一化。归一化后，余弦相似度就退化成点积，检索更稳定。

## 两个工程坑

**坑一：模型文件别让打包器碰。** Transformers.js 在运行时动态读取 `node_modules` 里的 ONNX 文件。如果被 Vite/Astro 打包内联，模型路径就会失效。解决办法是在 SSR 配置里把它 external：

```js
vite: {
  ssr: {
    external: ['@huggingface/transformers'],
  },
}
```

**坑二：首次运行要联网下载。** 第一次调用会从 HuggingFace 下载模型（几十 MB）并缓存到本地。服务器部署时建议先预热一次，避免流量来了才慢慢下载。

## 为什么要留降级方案

本地模型有个软肋：离线或下载失败时，整条 RAG 链路就断了。我额外实现了一个确定性的字符 n-gram 哈希向量作为兜底——把文本切成二元/三元字符组，哈希到 512 维并做符号累加，再归一化。它的语义能力远不如真模型，但能保证「没有模型也能把全流程跑通」，这对开发调试和 CI 很有价值。

## 小结

本地 embedding 用「一次性的环境搭建成本」换来了「零边际调用成本」和「数据不出服务器」。如果你的 RAG 语料量级在几万 chunk 以内、对并发要求不高，这通常是更划算的选择。
