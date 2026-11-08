# GIO DA SORTE PRO — FASE 11: IMPLEMENTAÇÃO CONSOLIDADA TIKTOK LOGIN, IDENTIDADE E AUTENTICAÇÃO MULTIUSUÁRIO (REVISADO)

## Resumo do Projeto
Implementar a autenticação oficial com o TikTok Login Kit (v2) integrada ao Firebase Auth, separando explicitamente o **Fluxo de Primeiro Acesso / Login** do **Fluxo de Vinculação de Contas Existentes**, com proteção transacional contra condições de corrida, armazenamento criptografado AES-256-GCM no backend e suíte completa de testes automatizados.

---

## Decisões e Correções Incorporadas no Plano

> [!IMPORTANT]
> **Separação Obrigatória dos Fluxos de Autenticação e Vinculação:**

1. **Fluxo 1: Primeiro Acesso / Login Direto com TikTok:**
   - Validar a autorização OAuth no servidor e resgatar o `open_id` diretamente da API oficial do TikTok.
   - **Se o `open_id` já estiver vinculado:** Localizar o Firebase UID correspondente e emitir um `CustomToken` para autenticar o usuário na sua conta existente.
   - **Se o `open_id` não estiver vinculado:** Criar de forma controlada e transacional uma nova identidade GIO (usuário no Firebase Auth + documento no Firestore).
   - **Garantia:** Impedir a criação de contas duplicadas quando o `open_id` já possuir vínculo estabelecido.

2. **Fluxo 2: Vinculação de TikTok a uma Conta GIO Existente (Link Account):**
   - **Exigência 1:** O cliente precisa possuir uma sessão Firebase Auth ativa.
   - **Exigência 2:** Exigir reautenticação prévia (senha ou Google Auth, conforme o método principal do usuário GIO).
   - **Exigência 3:** Validar a conta TikTok via OAuth no servidor para obter o `open_id`.
   - **Verificação Transacional:** Confirmar se o `open_id` já pertence a outro Firebase UID. Se pertencer, **bloquear o conflito imediatamente** e impedir qualquer transferência automática ou sobrescrita silenciosa.

---

## 1. Visão Geral e Conceito Central

- **O que faz:** Permite o login direto com o TikTok ou a vinculação segura de um perfil do TikTok a uma conta GIO pré-existente via Firebase Auth Admin SDK.
- **Público-Alvo:** Criadores de conteúdo no TikTok LIVE, organizadores de sorteios e participantes do GIO DA SORTE PRO.
- **Valor Principal:** Segurança total da conta e dos sorteios, rastreabilidade transacional da identidade, zero vazamento de tokens e total conformidade com o TikTok Login Kit (v2) e as regras do Firestore (Fase 10.4).

---

## 2. Experiência do Usuário e Design Visual

- **Interface de Login / Cadastro:**
  - Botão principal oficial **"Continuar com TikTok"**.
  - Fluxo transparente: direcionamento ao TikTok OAuth v2 -> retorno ao callback do backend -> emissão de `CustomToken` -> `signInWithCustomToken` no cliente.

- **Interface de Perfil (Vinculação de Contas):**
  - Painel de conexões mostrando a conta TikTok vinculada (com avatar e `@username` oficiais autorizados).
  - Botão **"Vincular Conta TikTok"**: solicita reautenticação (Google / Senha) antes de iniciar o OAuth.
  - Em caso de conflito (`open_id` já em uso em outro UID): mensagem clara de erro em português indicando que o TikTok já está associado a outra conta GIO.
  - Botão **"Desconectar TikTok"**: remove o vínculo de autenticação sem encerrar a conta GIO nem interromper os workers de LIVE autorizados.

- **Identidade Visual:**
  - Preservação da paleta oficial Premium Tech do GIO DA SORTE PRO (`#050D20` fundo, `#0B1730` painéis, `#101F3D` cards, `#0866F5` azul principal, `#F5B942` dourado).
  - Respeito às regras do `frontend-design` (sem badges falsas, sem pontos pulsantes decorativos, sem pílulas soltas).

---

## 3. Arquitetura de Identidade e Segurança de Tokens

### A. Separação Estrita de Identidades
- **Firebase Auth UID:** Identidade única e imutável no GIO DA SORTE.
- **TikTok `open_id`:** Identificador externo permanente da conta TikTok.
- **TikTok `@username`:** Rótulo de exibição sujeito a alterações (nunca usado como chave primária de autenticação).

### B. Proteção contra CSRF e Replay em OAuth
- Geração de `state` criptograficamente seguro (32 bytes aleatórios).
- Armazenamento temporário do `state` no backend associado à sessão/cookie do solicitante.
- Validação estrita e de uso único (rejeitar `state` expirado, reutilizado ou divergente).

### C. Criptografia dos Tokens TikTok
- Armazenamento restrito na subcoleção `/users/{userId}/private_tokens/tiktok`.
- Criptografia autenticada **AES-256-GCM** com IV único por operação.
- Acesso do Client SDK a `/private_tokens/` estritamente bloqueado em `firestore.rules` (`allow read, write: if false;`).
- Tokens do TikTok (`access_token`, `refresh_token`) **jamais são enviados ao navegador ou registrados em logs**.

---

## 4. Diagrama de Fluxos do Sistema

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ FLUXO 1: PRIMEIRO ACESSO / LOGIN COM TIKTOK                                             │
└────────────────────────────────────────────────────────────────────────────────────────┘
 Navegador                        Backend (GIO Server)                   TikTok API v2
     │                                    │                                    │
     │ 1. GET /api/auth/tiktok/login     │                                    │
     ├───────────────────────────────────►│ (Gera state seguro)                │
     │ 2. Redireciona para TikTok OAuth   │                                    │
     │◄──────────────────────────────────┤                                    │
     │ 3. Autoriza no TikTok             │                                    │
     ├────────────────────────────────────────────────────────────────────────►│
     │ 4. Callback /api/auth/tiktok/callback?code=XYZ&state=ABC               │
     ├───────────────────────────────────►│                                    │
     │                                    │ 5. Troca code por Token (Server)   │
     │                                    ├───────────────────────────────────►│
     │                                    │ 6. Obtém open_id & user.info.basic │
     │                                    │◄───────────────────────────────────┤
     │                                    │                                    │
     │                                    │ 7. Busca open_id no Firestore      │
     │                                    │    - Se EXISTE: obtém UID          │
     │                                    │    - Se NÃO EXISTE: cria novo UID  │
     │                                    │ 8. Gera Firebase CustomToken       │
     │ 9. Retorna CustomToken             │                                    │
     │◄───────────────────────────────────┤                                    │
     │ 10. signInWithCustomToken()        │                                    │
     ├───────────────────────────────────►│ (Sessão GIO Ativa)                 │

┌────────────────────────────────────────────────────────────────────────────────────────┐
│ FLUXO 2: VINCULAÇÃO A UMA CONTA GIO EXISTENTE (LINK ACCOUNT)                           │
└────────────────────────────────────────────────────────────────────────────────────────┘
 Navegador                        Backend (GIO Server)                   TikTok API v2
     │                                    │                                    │
     │ 1. Reautentica no GIO (Senha/Google)                                   │
     │ 2. GET /api/auth/tiktok/link (com Auth Token Firebase)                 │
     ├───────────────────────────────────►│ (Valida UID da sessão atual)      │
     │ 3. Redireciona para TikTok OAuth   │                                    │
     │◄──────────────────────────────────┤                                    │
     │ 4. Callback /api/auth/tiktok/link/callback?code=XYZ&state=ABC          │
     ├───────────────────────────────────►│                                    │
     │                                    │ 5. Obtém open_id do TikTok         │
     │                                    ├───────────────────────────────────►│
     │                                    │◄───────────────────────────────────┤
     │                                    │ 6. Transação no Firestore:         │
     │                                    │    - open_id já é de outro UID?    │
     │                                    │      -> SIM: REJEITA (Erro 409)    │
     │                                    │      -> NÃO: Grava vínculo no UID  │
     │ 7. Retorna Sucesso ou Conflito     │                                    │
     │◄───────────────────────────────────┤                                    │
```

---

## 5. Plano de Suíte de Testes Automatizados (30+ Cenários)

A nova suíte `scripts/test_phase11_tiktok_auth.ts` cobrirá:

1. **OAuth & State Security (1-9):**
   - `state` válido, `state` inválido, `state` expirado, reutilização de `state`, callback sem código, erro de recusa do TikTok, code expirado, falha de troca de token, redirect URI divergente.
2. **Identidade e Vinculação (10-16):**
   - Login com `open_id` já vinculado (retorna UID existente sem duplicar).
   - Primeiro login (criação transacional de nova conta).
   - Vinculação com sessão ativa GIO.
   - Tentativa de vincular `open_id` já pertencente a outro UID (bloqueio de conflito 409).
   - Tentativa de enviar `open_id` falsificado pelo frontend (rejeição).
   - Tentativa de login por username sem OAuth (rejeição).
   - Concorrência na vinculação do mesmo `open_id` por duas conexões paralelas (proteção transacional).
3. **Tokens, Sessões e Isolamento (17-25):**
   - Garantir que `access_token` e `refresh_token` nunca chegam no payload da resposta HTTP ao cliente.
   - Garantir que tokens não são impressos em logs.
   - Teste de rotação e refresh de token TikTok.
   - Logout no cliente (limpa estado local sem apagar documentos no Firestore nem encerrar workers LIVE autorizados no servidor).
   - Teste de isolamento de dados entre Usuário A e Usuário B.
4. **Regressão de Módulos (26-30):**
   - Execução de `test_sec01_firestore_rules.ts`.
   - Execução de `test_server_port_resolution.ts`.
   - Execução de `test_traditional_raffle_v2.ts`.
   - Execução de `test_worker_dual_auth.ts`.
   - Execução de `test_tiktok_live_pro_complete.ts`.
   - Execução de `npx tsc --noEmit` e `compile_applet`.

---

## 6. Verificação e Entregáveis da Fase 11

Ao finalizar a implementação:
- Emissão do relatório final completo com os 15 itens requeridos pelas instruções oficiais.
- Apresentação do SHA-256 de todos os arquivos criados e modificados.
- Confirmação expressa de ausência de deploy em ambiente de produção.
