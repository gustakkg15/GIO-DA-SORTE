# GIO DA SORTE PRO — FASE 11.2: PLANO ARQUITETURAL DO LOGIN TIKTOK E VÍNCULO SEGURO DE IDENTIDADE

Plano de execução arquiteturalmente revisado para o **TikTok Login Kit Web (OAuth 2.0)** no GIO DA SORTE PRO, resolvendo a separação estrita entre **Identidade de Autenticação** e **Conexão de Integração**, com tolerância a falhas parciais, rotação de chaves AES-256-GCM, cookies isolados por aba e 38 cenários de teste automatizado.

---

## User Review & Critical Decisions

> [!IMPORTANT] Decisões Arquiteturais e Salvaguardas da Fase 11.2:
> 1. **Separação entre Identidade de Autenticação e Conexão de Integração**:
>    - **Identidade de Autenticação (`/tiktok_identities/{sha256(open_id)}`)**: Mapeia o `open_id` estável ao `uid` do Firebase Auth. Permite ao usuário entrar na sua conta original do GIO DA SORTE.
>    - **Conexão de Integração (`/users/{uid}/private_tokens/tiktok`)**: Armazena os tokens de API para recursos do GIO DA SORTE PRO.
>    - **Desconexão da Integração**: Revoga os tokens e bloqueia novos recursos de LIVE/PRO, **mas preserva o mapeamento de autenticação** (`/tiktok_identities`). Se o usuário reconectar no futuro, **ele é reconhecido no mesmo UID original**, evitando a criação de UIDs duplicados ou perda de conta.
>    - **Remoção Definitiva do Método de Login**: Se o usuário desejar excluir a identidade TikTok como método de autenticação, o sistema valida obrigatoriamente se existe outro método de acesso ativo (Email/Senha ou Google Auth) antes de permitir a remoção.
> 2. **Fluxo Idempotente de Criação de Conta**:
>    - Firebase Auth e Firestore pertencem a sistemas diferentes. Em criações simultâneas ou falhas parciais (ex: Firebase Auth criado, mas gravação Firestore falhou), a tentativa seguinte detecta a conta pelo `open_id` e conclui a amarração no mesmo UID sem criar contas órfãs.
> 3. **Segurança de Cookie e Isolamento Multi-Aba**:
>    - Cookie `__Host-oauth_state`: `Path=/`, sem atributo `Domain`, `HttpOnly`, `Secure` e `SameSite=Lax`.
>    - Suporte a múltiplas abas: cada requisição utiliza um `state` único armazenado no Firestore, evitando que a abertura de nova aba sobrescreva a transação da aba anterior.
> 4. **Cofre Criptografado com Rotação de Chaves (`keyVersion`)**:
>    - Envelope contendo `{ cipherText, iv, authTag, keyVersion }`.
>    - Suporte a múltiplas versões de chaves (`OAUTH_TOKEN_ENCRYPTION_KEY_V1`, `V2`). Permite descriptografar com a chave legada e recriptografar com a chave mais recente.
> 5. **Renovação de Tokens Exclusiva do Backend**:
>    - Endpoint `/api/auth/tiktok/refresh` restrito a chamas internas do backend/worker com chave de serviço. Clientes públicos são rejeitados com `HTTP 403`.

---

## 1. Mapeamento Arquitetural de Dados

```
  Identidade de Autenticação (Persistente)          Conexão de Integração (Revogável)
 ┌────────────────────────────────────────┐       ┌──────────────────────────────────────┐
 │ /tiktok_identities/tid_{sha256(open_id)}│      │ /users/{uid}/private_tokens/tiktok   │
 │ - openIdHash: "fa28c33b..."            │       │ - cipherText: "..." (AES-256-GCM)   │
 │ - uid: "gio_user_123"                  │       │ - iv: "..." (12 bytes)               │
 │ - createdAt: 1742080000000             │       │ - authTag: "..." (16 bytes)          │
 └───────────────────┬────────────────────┘       │ - keyVersion: "v1"                   │
                     │                            │ - status: "ACTIVE" | "PENDING_REVOKE"│
                     │ Mapeia ao mesmo UID        └───────────────────┬──────────────────┘
                     ▼                                                │
 ┌────────────────────────────────────────────────────────────────────┴─┐
 │                       /users/{uid} (Perfil GIO)                      │
 │ - uid: "gio_user_123"                                                │
 │ - email: "organizador@email.com"                                     │
 │ - tiktokLinked: true                                                 │
 │ - tiktokProfile: { displayName: "Maria", username: "maria_live" }    │
 └──────────────────────────────────────────────────────────────────────┘
```

---

## 2. Endpoints e Contratos de API Backend

- `GET /api/auth/tiktok/login`: Gera `state` de 256 bits (`purpose: 'LOGIN' | 'LINK'`), registra cookie `__Host-oauth_state` e redireciona para autorização no TikTok.
- `GET /api/auth/tiktok/callback`: Valida `state` no cookie e Firestore, consome o `state` atomicamente, troca `code` por `open_id`, resolve a identidade e emite Firebase Custom Token.
- `POST /api/auth/tiktok/link`: Exige Firebase ID Token do usuário logado, valida a finalidade `LINK`, e vincula a nova identidade ao UID atual sem alterar a conta principal.
- `POST /api/auth/tiktok/unlink`: Exige confirmação. Tenta revogar os tokens na API do TikTok. Se falhar, marca o status como `PENDING_REVOKE`, remove os tokens ativos e atualiza a interface mantendo a conta GIO e rifas 100% intactas.
- `POST /api/auth/tiktok/refresh`: Endpoint **exclusivo do backend/worker interno** com autenticação de Service Account. Rejeitado para requisições diretas de clientes públicos.

---

## 3. Roteiro de Implementação

### Passo 1: Backend Refinement (`src/server/tiktokOAuthService.ts` & `server.ts`)
- Implementar envelope de criptografia com `keyVersion`.
- Implementar fluxo idempotente de criação e amarração de contas.
- Configurar cookie `__Host-oauth_state` com isolamento multi-aba.
- Configurar rotas e middlewares de autorização.

### Passo 2: Componentes da Interface UI (`src/components/LoginModal.tsx`, `src/components/UserProfile.tsx`)
- Adicionar botão principal **"Continuar com TikTok"** na tela de Login e Cadastro.
- Adicionar Cartão **"Conta TikTok vinculada"** no perfil com indicador de status, avatar e ação de desconexão.
- Adicionar modal de confirmação ao desconectar e validação de métodos de login alternativos (Email/Senha ou Google).

### Passo 3: Suíte Ampliada de Testes em `scripts/test_tiktok_oauth.ts` (38 Cenários)
Covertura total de 38 testes automatizados:
1. Início correto do OAuth
2. Geração segura de state (256 bits)
3. State inválido
4. State expirado
5. Reutilização de state
6. Finalidade OAuth incorreta
7. Callback sem code
8. Falha na troca de code
9. Open ID válido
10. Login de identidade já vinculada
11. Criação de nova identidade
12. Concorrência na criação do vínculo
13. Tentativa de vínculo cruzado
14. Injeção de `open_id` via Client SDK
15. Leitura de tokens privados via Client SDK
16. Custom Token sem OAuth validado
17. Renovação simultânea de tokens
18. Rotação de refresh token
19. Falha parcial na renovação
20. Desconexão e revogação
21. Desconexão sem exclusão de dados do GIO
22. Proteção contra vazamento de tokens em respostas e logs
23. **Desconectar e reautenticar com TikTok mantendo o mesmo UID original**
24. **Desconectar integração mantendo acesso garantido por Email/Senha ou Google**
25. **Recuperação de falha parcial entre criação no Firebase Auth e gravação no Firestore**
26. **Duas criações simultâneas da mesma identidade TikTok (concorrência atômica)**
27. **Falha na revogação da API TikTok com estado PENDING_REVOKE e nova tentativa segura**
28. **Descriptografia com chave AES legada (v1) e re-encriptação automática na chave atual (v2)**
29. **Tentativa de acesso ao endpoint de refresh por cliente público não autorizado (HTTP 403)**
30. **Duas transações OAuth simultâneas em abas diferentes sem colisão de estado**
31-38. **Validações de contorno, perfis sem `@username` e sanitização de logs de erro**

---

## 4. Execução de Regressão Integral

1. `scripts/test_official_rules_emulator.ts` (14 cenários)
2. `scripts/test_sec01_firestore_rules.ts` (30 cenários)
3. `scripts/test_phase11_1_security_audit.ts` (7 cenários)
4. `scripts/test_worker_dual_auth.ts` (15 cenários)
5. `scripts/test_traditional_raffle_v2.ts` (24 cenários)
6. `scripts/test_tiktok_live_pro_complete.ts` (16 cenários)
7. `scripts/test_tiktok_oauth.ts` (38 cenários)
8. `npx tsc --noEmit` (`lint_applet`)
9. `npm run build` (`compile_applet`)

---

## 5. Pendências no TikTok Developer Portal

Para ativação em produção real com chaves da aplicação:
1. **Developer Portal**: Cadastrar App Web no TikTok Developer Portal.
2. **Redirect URI**: Registrar exatamente a URL HTTPS do callback.
3. **Escopos**: Solicitar aprovação do escopo `user.info.basic`.
