# 部署指南（服务器落地）

本文档说明如何在 **Ubuntu 服务器**上把这个项目跑起来。因为加入了 RAG 功能，部署方式从「纯静态」变成了「Node 进程 + Nginx 反代」。

## 前置条件

- Ubuntu 20.04+（其它 Linux 同理）
- Node.js ≥ 22.12
- Nginx、git
- PM2（进程守护）

## 1. 安装依赖

```bash
sudo apt update
sudo apt install -y git curl nginx build-essential

# 安装 Node 22（如已有 ≥22.12 可跳过）
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# 安装 PM2
sudo npm install -g pm2
```

验证：

```bash
node -v   # 需要 ≥ v22.12.0
pm2 -v
```

## 2. 拉代码 + 装依赖

```bash
git clone git@github.com:你的用户名/xiaoxiao-blog.git ~/xiaoxiao-blog
cd ~/xiaoxiao-blog
npm ci
```

## 3. 配置 API Key

```bash
cp .env.example .env
vim .env    # 填入 DEEPSEEK_API_KEY=sk-xxxx
```

`.env` 里的 `DEEPSEEK_API_KEY` 是**唯一必填**项。它不会被提交（已在 `.gitignore`），只留在服务器上。

## 4. 构建

```bash
npm run build
```

构建产物：

```text
dist/
├── client/          # 静态资源（_astro/、public/ 里的东西）
└── server/
    └── entry.mjs    # 服务端入口
```

## 5. 发布并启动服务

把产物放到站点目录（下面用 `/var/www/xiaoxiaoptopfile.top`，可自行替换）：

```bash
sudo mkdir -p /var/www/xiaoxiaoptopfile.top
sudo chown -R "$USER:$USER" /var/www/xiaoxiaoptopfile.top

rsync -a --delete dist/ /var/www/xiaoxiaoptopfile.top/

# 把 .env 也放过去（服务进程从自己的 cwd 读取）
cp .env /var/www/xiaoxiaoptopfile.top/.env

# 用 PM2 启动（配置见 deploy/ecosystem.config.cjs）
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup   # 开机自启（按提示执行输出的命令）
```

PM2 配置 `deploy/ecosystem.config.cjs` 关键点：

```js
{
  script: 'server/entry.mjs',   // 相对 cwd
  cwd: '/var/www/xiaoxiaoptopfile.top',
  env: { HOST: '127.0.0.1', PORT: 4321 },
}
```

服务默认监听 `127.0.0.1:4321`，只对 Nginx 暴露，不直接对公网。

## 6. 预热 embedding 模型

首次运行时本地 embedding 模型要从 HuggingFace 下载（几十 MB）。建议在流量进来前预热一次，同时重建索引：

```bash
curl -X POST http://127.0.0.1:4321/api/ingest
```

返回类似：

```json
{ "ok": true, "chunks": 42, "model": "local: Xenova/bge-small-zh-v1.5", "elapsedMs": 12034 }
```

> 模型缓存在 HuggingFace 的默认缓存目录（通常是 `~/.cache/huggingface`），重启进程不会重复下载。

## 7. 配置 Nginx

把 `deploy/nginx.conf` 的内容放到你的站点配置里（`/etc/nginx/sites-available/xiaoxiaoptopfile.top`）：

```nginx
server {
    listen 80;
    server_name xiaoxiaoptopfile.top www.xiaoxiaoptopfile.top;

    root /var/www/xiaoxiaoptopfile.top/client;
    index index.html;

    # 构建产物（带哈希）长期缓存
    location ^~ /_astro/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|webp|woff|woff2)$ {
        expires 7d;
        add_header Cache-Control "public";
    }

    # 其余交给 Node（SSR + API）
    location / {
        try_files $uri $uri/ @node;
    }

    location @node {
        proxy_pass http://127.0.0.1:4321;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # SSE 流式输出：必须关缓冲
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 120s;
        add_header Cache-Control "no-cache";
    }
}
```

启用并重载：

```bash
sudo ln -s /etc/nginx/sites-available/xiaoxiaoptopfile.top /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

> **关键**：`proxy_buffering off` 不能省，否则流式回答会被 Nginx 缓冲成一整块才返回，打字机效果就没了。

## 8. 配置 HTTPS（可选）

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d xiaoxiaoptopfile.top -d www.xiaoxiaoptopfile.top
```

## 日常更新

以后每次改了文章或代码，在服务器上跑：

```bash
cd ~/xiaoxiao-blog && bash deploy/update.sh
```

`deploy/update.sh` 会自动：拉代码 → `npm ci` → 构建 → 发布 → 重启 PM2 → 预热索引 → 重载 Nginx。

新增/修改文章后，如果没跑 update.sh，也可以直接触发索引刷新：

```bash
curl -X POST http://127.0.0.1:4321/api/ingest
```

## 常见问题

**Q：问答返回「服务端未配置 DEEPSEEK_API_KEY」？**
检查 `/var/www/xiaoxiaoptopfile.top/.env` 是否存在且填了 Key，然后 `pm2 restart xiaoxiao-blog`。

**Q：embedding 显示降级成了 hash？**
说明本地模型下载失败。检查服务器能否访问 `huggingface.co`，或手动触发一次 `/api/ingest` 观察日志。纯调试阶段用 hash 也能跑通。

**Q：回答不是流式的、一次性出现？**
多半是 Nginx 没关 `proxy_buffering`，或中间还有一层 CDN/反代在缓冲。确认 `X-Accel-Buffering: no` 响应头已带上。

**Q：想看服务日志？**
```bash
pm2 logs xiaoxiao-blog
```
