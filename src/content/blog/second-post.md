---
title: '如何发布一篇新文章'
description: '在 src/content/blog 里新增 Markdown 文件，构建后就会出现在文章列表。'
pubDate: 'Aug 13 2026'
heroImage: '../../assets/blog-placeholder-4.jpg'
---

文章都放在 `src/content/blog/` 目录。新建一个 `.md` 文件即可，例如 `my-new-post.md`：

```markdown
---
title: '文章标题'
description: '列表页和首页会显示这段简介'
pubDate: 'Aug 20 2026'
heroImage: '../../assets/blog-placeholder-1.jpg'
---

这里写正文。
```

保存后本地执行：

```bash
npm run dev
```

打开 `/blog` 就能看到新文章。封面图可以使用 `src/assets/` 里已有的占位图，也可以换成自己的图片。
