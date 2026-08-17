#!/usr/bin/env bash
# 在服务器上拉取代码、构建 SSR 产物、重启 Node 服务并预热索引。
# 用法：bash deploy/update.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WEB_DIR="${WEB_DIR:-/var/www/xiaoxiaoptopfile.top}"
PM2_APP="xiaoxiao-blog"

cd "$REPO_DIR"

echo "==> 拉取最新代码"
echo "当前提交：$(git rev-parse --short HEAD) $(git log -1 --format=%s)"
git fetch origin
if ! git pull --ff-only; then
  echo "拉取失败：本地有冲突或提交。确认服务器上没有要保留的修改后执行："
  echo "  git reset --hard origin/\$(git rev-parse --abbrev-ref HEAD)"
  exit 1
fi
echo "目标提交：$(git rev-parse --short HEAD) $(git log -1 --format=%s)"

if ! command -v node >/dev/null; then
  echo "未找到 Node.js，请先安装 Node 22+"
  exit 1
fi
NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "当前 Node 版本是 $(node -v)，Astro 需要 22.12+"
  exit 1
fi

echo "==> 安装依赖"
npm ci

echo "==> 构建"
rm -rf dist
npm run build

if [ ! -f dist/server/entry.mjs ]; then
  echo "构建失败：缺少 dist/server/entry.mjs"
  exit 1
fi

echo "==> 发布到 $WEB_DIR"
mkdir -p "$WEB_DIR"
rsync -a --delete dist/ "$WEB_DIR/"

# 服务进程从自己的 cwd 读取 .env；首次部署从示例生成，之后保留服务器上的 Key。
if [ ! -f "$WEB_DIR/.env" ]; then
  cp "$REPO_DIR/.env.example" "$WEB_DIR/.env"
  echo "已生成 $WEB_DIR/.env，请填入 DEEPSEEK_API_KEY 后重新运行本脚本。"
  exit 1
fi

echo "==> 重启服务"
if command -v pm2 >/dev/null; then
  pm2 startOrReload "$REPO_DIR/deploy/ecosystem.config.cjs"
  pm2 save
else
  echo "未安装 pm2，请先：sudo npm install -g pm2"
  exit 1
fi

echo "==> 预热 embedding 模型 + 重建索引"
if ! curl -sf -X POST "http://127.0.0.1:4321/api/ingest" >/dev/null; then
  echo "预热失败：可稍后手动执行 curl -X POST http://127.0.0.1:4321/api/ingest"
fi

echo "==> 重载 Nginx"
if command -v nginx >/dev/null; then
  sudo nginx -t
  sudo systemctl reload nginx
fi

echo "发布完成：https://xiaoxiaoptopfile.top"
echo "已发布提交：$(git rev-parse --short HEAD)"
