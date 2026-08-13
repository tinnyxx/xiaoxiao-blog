---
title: '如何添加一个在线工具'
description: '先登记到工具列表，再新增一个页面，就可以挂到 /tools。'
pubDate: 'Aug 13 2026'
heroImage: '../../assets/blog-placeholder-5.jpg'
---

小工具分两步添加。

## 1. 登记工具

打开 `src/data/tools.ts`，在数组里加一项：

```ts
{
  id: 'uuid-generator',
  title: 'UUID 生成器',
  description: '批量生成 UUID。',
  href: '/tools/uuid-generator',
}
```

## 2. 新建页面

在 `src/pages/tools/` 下新增对应页面，例如 `uuid-generator.astro`。工具逻辑写在页面里的 `<script>` 中即可，数据不会发到服务器。

首页和 `/tools` 会自动读取 `tools.ts`，不用再改导航。
