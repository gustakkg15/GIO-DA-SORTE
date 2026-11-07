# GIO DA SORTE PRO — AI Project Context & Architectural Memory

## 1. Arquitetura Geral
- **Stack:** React SPA (Vite) + Node.js/Express Backend (`server.ts`) em TypeScript.
- **Estilização:** Tailwind CSS v4 (`@import "tailwindcss";`) com Design System Dark Tech Navy (`--gio-*`).
- **Persistência:** Firebase Firestore (`ai-studio-siteremixgiodaso-cba1d97e-fec2-493e-8038-9980f929138a`) + Armazenamento local/session para estado efêmero.
- **Integração de Pagamentos:** Mercado Pago (assinatura comercial PRO, licenças, webhooks HMAC-SHA256).

## 2. Organização dos Módulos Principais (`src/`)
- `src/components/layout/`: Sidebar, AppHeader, Footer.
- `src/components/MainDashboard.tsx`: Painel principal com KPIs, atalhos rápidos e métricas.
- `src/components/ParticipantManager.tsx`: Gestão de participantes, moedas e probabilidades.
- `src/components/DrawSection.tsx`: Mesa de sorteio (Tambor 3D, Roleta, Battle Royale).
- `src/components/TikTokLiveManager.tsx` & `TikTokLiveGiftsArenaView.tsx`: Módulo TikTok LIVE PRO.
- `src/server/`: Adaptadores backend (TikTok Webcast, WAL, SSE tickets, autenticação admin).
- `src/utils/`: Serviços de negócio (sorteios, campanhas, conformidade LGPD, criptografia SHA-256).

## 3. Segurança, Autenticação & Autorização
- Firebase Authentication (login com Google e E-mail/Senha).
- Restrição de recursos PRO validada no backend (`requireProPlan`) e frontend (`entitlement.active`).
- Proteção anti-reuso de tickets SSE (tokens efêmeros de 30s com prefixo `tk_sse_`).

## 4. Integração TikTok LIVE & Sorteios
- Conexão Webcast persistente com recriação resiliente de sessão.
- Deduplicação rigorosa de eventos (`msgId`) com WAL e Outbox.
- Sorteio determinístico por CSPRNG com geração de hashes SHA-256 para trilha de auditoria.

## 5. Regras de Preservação (Invioláveis)
- Nunca modificar autenticação, Firestore rules, lógica do Mercado Pago, motor de sorteios ou integração TikTok LIVE sem autorização explícita.
