#!/bin/zsh
set -e
cd "${0:A:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if curl -fsS http://localhost:5173/ 2>/dev/null | grep -q 'Seal Bay'; then
  open http://localhost:5173/
  exit 0
fi
if ! command -v node >/dev/null 2>&1; then
  print '请先安装 Node.js 22.12 或更新版本，再打开海豹湾。'
  read '?按回车关闭。'
  exit 1
fi
if [[ ! -d node_modules ]]; then
  npm install
fi
print '海豹湾正在打开。保留这个窗口，就能继续投喂小海豹。'
npm run dev -- --port 5173 --open
