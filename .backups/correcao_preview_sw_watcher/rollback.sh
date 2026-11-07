#!/usr/bin/env bash
set -euo pipefail
cp .backups/correcao_preview_sw_watcher/vite.config.ts vite.config.ts
cp .backups/correcao_preview_sw_watcher/server.ts server.ts
cp .backups/correcao_preview_sw_watcher/main.tsx src/main.tsx
if [ -f .backups/correcao_preview_sw_watcher/nginx.conf.bak ]; then
  cp .backups/correcao_preview_sw_watcher/nginx.conf.bak /etc/nginx/nginx.conf
  cp .backups/correcao_preview_sw_watcher/nginx.conf.bak /etc/nginx/nginx.conf.template
  nginx -s reload
fi
echo "[ROLLBACK] vite.config.ts, server.ts, src/main.tsx e /etc/nginx/nginx.conf restaurados com sucesso."
