#!/usr/bin/env bash
# 在服务器上拉取代码、构建静态站点，并发布到 Nginx 目录。
# 用法：bash deploy/update.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WEB_DIR="${WEB_DIR:-/var/www/xiaoxiaoptopfile.top}"

cd "$REPO_DIR"

echo "==> 拉取最新代码"
echo "当前提交：$(git rev-parse --short HEAD) $(git log -1 --format=%s)"
git fetch origin
if ! git pull --ff-only; then
  echo "拉取失败：本地有冲突或提交。确认服务器上没有要保留的修改后，执行："
  echo "  git reset --hard origin/\$(git rev-parse --abbrev-ref HEAD)"
  exit 1
fi
echo "目标提交：$(git rev-parse --short HEAD) $(git log -1 --format=%s)"

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

echo "==> 构建（先清掉上一次的产物和缓存）"
rm -rf dist node_modules/.astro
npm run build

if [ ! -d dist ]; then
  echo "构建失败：没有 dist 目录"
  exit 1
fi

# 每个页面都必须带上新版界面的标记，避免把半旧的产物发上线。
echo "==> 校验构建产物"
for page in "index.html" "blog/index.html" "tools/index.html" "about/index.html"; do
  if [ ! -f "dist/$page" ]; then
    echo "缺少页面：dist/$page"
    exit 1
  fi
  # -i：页面里是 "Personal digital garden"，大写是 CSS text-transform 的效果。
  if ! grep -qi "personal digital garden" "dist/$page"; then
    echo "dist/$page 不是新版界面（缺少侧边栏标记），构建可能用了旧代码"
    exit 1
  fi
done
echo "共 $(find dist -name '*.html' | wc -l) 个页面，校验通过"

echo "==> 发布到 $WEB_DIR"
mkdir -p "$WEB_DIR"
rsync -a --delete dist/ "$WEB_DIR/"

if command -v nginx >/dev/null; then
  sudo nginx -t
  sudo systemctl reload nginx
fi

echo "发布完成：https://xiaoxiaoptopfile.top"
echo "已发布提交：$(git rev-parse --short HEAD)"
echo "如果浏览器里还是旧界面，按 Ctrl+Shift+R 强制刷新一次。"
