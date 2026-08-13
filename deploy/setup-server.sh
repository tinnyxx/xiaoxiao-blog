#!/usr/bin/env bash
# 服务器首次部署：安装 Node 22、克隆仓库、构建并发布。
# 用法：
#   bash setup-server.sh git@github.com:你的用户名/xiao-blog.git
set -euo pipefail

REPO_URL="${1:-}"
REPO_DIR="${HOME}/xiao-blog"
WEB_DIR="/var/www/xiaoxiaoptopfile.top"

if [ -z "$REPO_URL" ]; then
  echo "用法: bash setup-server.sh git@github.com:你的用户名/xiao-blog.git"
  exit 1
fi

echo "==> 安装系统依赖"
sudo apt update
sudo apt install -y git rsync curl nginx build-essential python3

if ! command -v node >/dev/null || [ "$(node -p "process.versions.node.split('.')[0]")" -lt 22 ]; then
  echo "==> 安装 Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt install -y nodejs
fi

echo "Node $(node -v)  npm $(npm -v)"

sudo mkdir -p "$WEB_DIR"
sudo chown -R "$USER:$USER" "$WEB_DIR"

if [ ! -d "$REPO_DIR/.git" ]; then
  echo "==> 克隆仓库到 $REPO_DIR"
  git clone "$REPO_URL" "$REPO_DIR"
fi

bash "$REPO_DIR/deploy/update.sh"
