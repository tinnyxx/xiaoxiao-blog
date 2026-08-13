#!/usr/bin/env bash
# 在服务器上拉取代码、构建静态站点，并发布到 Nginx 目录。
# 用法：bash deploy/update.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WEB_DIR="${WEB_DIR:-/var/www/xiaoxiaoptopfile.top}"

cd "$REPO_DIR"

echo "==> 拉取最新代码"
git pull --ff-only

echo "==> 安装依赖"
if ! command -v node >/dev/null; then
  echo "未找到 Node.js，请先安装 Node 22+"
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "当前 Node 版本是 $(node -v)，Astro 需要 22.12+"
  exit 1
fi

npm ci
npm run build

if [ ! -d dist ]; then
  echo "构建失败：没有 dist 目录"
  exit 1
fi

echo "==> 发布到 $WEB_DIR"
mkdir -p "$WEB_DIR"
rsync -a --delete dist/ "$WEB_DIR/"

if command -v nginx >/dev/null; then
  sudo nginx -t
  sudo systemctl reload nginx
fi

echo "发布完成：https://xiaoxiaoptopfile.top"
