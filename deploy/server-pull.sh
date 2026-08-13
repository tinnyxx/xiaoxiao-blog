#!/usr/bin/env bash
# 备用方案：在服务器上拉取 GitHub 私有仓库并构建。
# 推荐优先使用 GitHub Actions（.github/workflows/deploy.yml），服务器只收静态文件。
set -euo pipefail

REPO_DIR="${HOME}/xiao-blog"
WEB_DIR="/var/www/xiaoxiaoptopfile.top"

cd "$REPO_DIR"
git pull --ff-only
npm ci
npm run build
rsync -a --delete dist/ "$WEB_DIR/"
echo "Deployed to $WEB_DIR"
