---
title: 'Astro 的 SSR 与混合渲染：让静态博客长出后端'
description: '从纯静态到 hybrid 渲染，理解 Astro 如何让大部分页面保持预渲染的同时，只把需要服务端的端点放到运行时。'
pubDate: '2026-08-05'
---

Astro 以「默认零 JS、静态优先」著称，但静态不是它的全部。当你需要表单处理、鉴权、或者像我这样需要调大模型的接口时，就得让一部分路由跑在服务端。这篇文章聊聊 Astro 的三种输出模式和混合渲染。

## 三种输出模式

Astro 的 `output` 有三种取值：

- `static`：完全静态，构建产物是纯 HTML，任何服务端端点都会被拒绝；
- `server`：完全服务端渲染，每个请求都在运行时处理；
- `hybrid`：**默认静态预渲染，按页面选择性地开启 SSR**。

`hybrid` 是最适合「博客 + 少量后端能力」的模式。博客文章、工具页这些内容在构建时就生成了，依然享受静态站的性能；只有 `/api/*` 端点留在运行时。

## 预渲染与 SSR 的切换

在 hybrid 模式下，页面默认预渲染。如果你希望某个页面走 SSR，就在它的 frontmatter 里声明：

```astro
---
export const prerender = false;
---
```

API 端点（`src/pages/api/*.ts`）天然就是服务端渲染的，它们导出 `GET`、`POST` 等函数：

```ts
export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();
  return new Response(JSON.stringify({ ok: true }));
};
```

## 为什么我的 RAG 助手要用 hybrid

RAG 助手有三个必须在服务端做的事情：

1. **读 API Key**：DeepSeek 的 Key 只能放在服务端环境变量里，绝不能进浏览器；
2. **跑向量检索**：embedding 模型和向量库都在 Node 进程里；
3. **调大模型**：生成逻辑在服务端完成，前端只负责收发。

如果继续用纯静态站，这些能力一个都放不下；如果改成全量 SSR，又会丢掉博客原本的静态性能。hybrid 恰好两头兼顾。

## standalone 适配器

要用 Node 跑 Astro，需要装 `@astrojs/node`，并选择 `standalone` 模式。构建后目录大致是这样：

```text
dist/
├── client/          # 静态资源（_astro/、public/ 里的东西）
└── server/
    └── entry.mjs    # 服务端入口，node 直接跑
```

部署时，Nginx 负责把静态资源直接吐给浏览器（可以长期缓存），把其余请求反代给 Node 进程：

```nginx
root /var/www/site/client;
location / {
    try_files $uri $uri/ @node;
}
location @node {
    proxy_pass http://127.0.0.1:4321;
}
```

## 一句话总结

hybrid 渲染的本质是「让每一类路由用最适合它的方式运行」：能静态的就静态，必须动态的才动态。对内容型站点来说，这是性价比最高的一种折中。
