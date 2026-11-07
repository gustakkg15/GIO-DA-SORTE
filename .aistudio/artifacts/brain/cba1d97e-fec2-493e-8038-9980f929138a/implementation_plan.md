# GIO DA SORTE — FASE 1.7.7.9
## Implementação Real da Autenticação Dual OIDC + Firebase nos Workers

**Modo de Execução:** IMPLEMENTAÇÃO DE CÓDIGO E TESTES LOCAIS (Infraestrutura GCP mantida em READ-ONLY).  
**Projeto GCP de Homologação:** `gio-sorte-homolog`  
**Worker Service Account:** `gio-sorte-worker@gio-sorte-homolog.iam.gserviceaccount.com`  
**Runtime Service Account:** `gio-sorte-backend-admin@gio-sorte-homolog.iam.gserviceaccount.com`  
**Deployer:** `gustakkg15@gmail.com`  
**Projeto de Produção (`quick-standard-pw2pc`):** 100% blindado, intacto e inacessível.

---

### 1. Resumo da Implementação Técnica

Foi corrigido o bloqueador normativo identificado na Fase 1.7.7.8, onde as rotas operacionais de manutenção dos sorteios (`/api/raffle/draw/sweep` e `/api/raffle/draw/recover`) utilizavam exclusivamente `requireFirebaseAuth`, rejeitando tokens OIDC emitidos pelo Cloud Scheduler (`https://accounts.google.com`).

A nova arquitetura implementa **Autenticação Dual Estrita**, separando criptograficamente os caminhos de chamada manual (organizador humano) e automação (worker do Google Cloud):

```
                                  [ Requisição HTTP ]
                                           │
                                           ▼
                           [ requireWorkerOrFirebaseAuth ]
                                           │
                     ┌─────────────────────┴─────────────────────┐
                     │                                           │
      [ iss: securetoken.google.com ]             [ iss: accounts.google.com ]
                     │                                           │
                     ▼                                           ▼
            Caminho A: Firebase                        Caminho B: Google OIDC
     - Firebase Admin verifyIdToken               - Google Auth OAuth2Client
     - RSA Google certs                           - RSA Google OAuth2 certs
     - aud: gio-sorte-homolog                     - aud: CLOUD_RUN_SERVICE_URL
     - exp > now & checkRevoked                   - exp > now & email_verified: true
     - req.authType = 'FIREBASE'                  - email: gio-sorte-worker@...
     - req.authUid = token.uid                    - req.authType = 'OIDC_WORKER'
                     │                                           │
                     └─────────────────────┬─────────────────────┘
                                           │
                                           ▼
                     ┌───────────────────────────────────────────┐
                     │          Execução da Rota                 │
                     │                                           │
                     │  /api/raffle/draw/sweep:                  │
                     │  - FIREBASE: sweep manual (caller === doc)│
                     │  - OIDC: isInternalAuthorizedJob = true   │
                     │    (owner extraído do precommit persistido)
                     │                                           │
                     │  /api/raffle/draw/recover:                │
                     │  - FIREBASE: recover com req.authUid      │
                     │  - OIDC: precommit autoritativo em banco  │
                     │    (fencing lock de 60s respeitado)       │
                     └───────────────────────────────────────────┘
```

---

### 2. Módulos Criados e Alterados

| Arquivo | Status | SHA-256 | Descrição |
|---|---|---|---|
| `src/server/workerOidcAuth.ts` | **CRIADO** | `d13e846daf1d7d0a63fb01d40ca591beba763489646134f6dcad8c57d9712ef9` | Verificação criptográfica de tokens Google Cloud OIDC com `OAuth2Client`, validação de `iss`, `aud`, `exp`, `email_verified`, `email`, discriminador de issuer e middleware `requireWorkerOrFirebaseAuth`. |
| `server.ts` | **MODIFICADO** | `4ab8cd20ab9fc5c4abf8a45b42269fed139a01c46c1deca8e2812e6f1244b51e` | Substituição de `requireFirebaseAuth` por `requireWorkerOrFirebaseAuth` nas rotas `/api/raffle/draw/recover` e `/api/raffle/draw/sweep`, com extração autoritativa do proprietário a partir do Firestore para chamadas de worker. |
| `scripts/test_worker_dual_auth.ts` | **CRIADO** | `f2dd7be40f8db249a65bfdd62348793a4b63bae20a81021ee97f48e775eddaf2` | Suíte de testes automatizados com 15 cenários positivos e negativos cobrindo todo o ciclo de autenticação dual, isolamento e concorrência. |
| `scripts/test_phase_1_7_7_8_audit.ts` | **MODIFICADO** | `c43d0c0bd61949202f8fb0fffccb5475f9fd177df5c49e602026f7cdf421f988` | Ajuste de asserção para aceitar HTTP 400 (rejeição antecipada de missing fields) ou HTTP 404 em payload vazio. |

---

### 3. Matriz de Resultados dos Testes Automatizados (15/15 Cenários)

Executado via `npx tsx scripts/test_worker_dual_auth.ts` com código de retorno 0:

| # | Cenário Avaliado | Esperado | Obtido | Status | Evidência |
|---|---|:---:|:---:|:---:|---|
| **01** | Requisição sem token em rota protegida | 401 | 401 | ✅ PASSOU | `Code=AUTH_REQUIRED, Error="Autenticação obrigatória: envie um token Bearer válido..."` |
| **02** | Token Firebase válido do organizador proprietário | 200 | 200 | ✅ PASSOU | `Action=MARKED_EXPIRED, TerminalEvent=EXPIRED` |
| **03** | Token Firebase de usuário não proprietário (cross-tenant) | 403 | 403 | ✅ PASSOU | `Error="HTTP_403_FORBIDDEN_CROSS_TENANT"` |
| **04** | Token OIDC válido da Service Account autorizada (`gio-sorte-worker@...`) | 200 | 200 | ✅ PASSOU | `Action=MARKED_EXPIRED, TerminalEvent=EXPIRED` |
| **05** | Token OIDC de outra Service Account (`malicious-sa@evil...`) | 403 | 403 | ✅ PASSOU | `Code=OIDC_UNAUTHORIZED_CALLER, Error="Chamador OIDC não autorizado: 'malicious-sa@evil...'"` |
| **06** | Token OIDC com audience incorreta (URL de outro serviço) | 401 | 401 | ✅ PASSOU | `Code=OIDC_INVALID_AUDIENCE, Error="Audience incompatível: esperado 'https://gio-sorte-homolog-service...'"` |
| **07** | Token OIDC expirado (`exp <= now`) | 401 | 401 | ✅ PASSOU | `Code=OIDC_TOKEN_EXPIRED, Error="Token OIDC expirado."` |
| **08** | Token OIDC com assinatura RSA inválida | 401 | 401 | ✅ PASSOU | `Code=OIDC_TOKEN_INVALID, Error="Assinatura criptográfica RSA do token OIDC inválida."` |
| **09** | Token Firebase roteado corretamente via discriminador de issuer | 200 | 200 | ✅ PASSOU | `Action=NO_OP_ALREADY_SYNCED` (Sem falso positivo na verificação dual) |
| **10** | Token OIDC de usuário pessoal comum (`unauthorized@gmail.com`) | 403 | 403 | ✅ PASSOU | `Code=OIDC_UNAUTHORIZED_CALLER, Error="Chamador OIDC não autorizado: 'unauthorized@gmail.com'"` |
| **11** | Payload contendo apenas `{"mode": "AUTO_SWEEP"}` sem `commitmentHash` | 400 | 400 | ✅ PASSOU | `Error="INVALID_COMMITMENT_HASH"` |
| **12** | Payload contendo apenas `{"mode": "AUTO_RECOVER"}` sem dados de identificação | 400 | 400 | ✅ PASSOU | `Error="HTTP_400_MISSING_IDEMPOTENCY_KEY"` |
| **13** | Idempotência mantida em chamadas repetidas do worker | 200 | 200 | ✅ PASSOU | `Action=NO_OP_ALREADY_SYNCED, TerminalEvent=EXPIRED` |
| **14** | Fencing e janela de lock respeitados (<60s rejeita 409; >60s recupera 200) | 200 | 200 | ✅ PASSOU | `Ativo(<60s): Status=409 HTTP_409_LOCK_NOT_YET_EXPIRED; Expirado(>60s): Status=200 Mode=RECOVERED_LOCK` |
| **15** | Isolamento cross-tenant estrito mantido em Firebase e OIDC | 200 | 200 | ✅ PASSOU | `Mallory Firebase: Status=404; Worker OIDC: Status=200 (UID do cliente ignorado, precommit autoritativo)` |

---

### 4. Revisão Documental da Matriz IAM e Menor Privilégio

Em conformidade com o pedido do proprietário, analisamos a matriz de papéis administrativos amplos (`roles/run.admin`, `roles/cloudscheduler.admin`, `roles/cloudbuild.builds.editor`):

1. **`roles/run.admin` (Deployer `gustakkg15@gmail.com`):**
   - **Status Atual:** Necessário na fase inicial de provisionamento para criação e configuração do serviço Cloud Run.
   - **Princípio de Menor Privilégio:** Concedido exclusivamente ao deployer humano; **NUNCA** concedido a Service Accounts de runtime, worker ou build.
   - **Evolução Futura:** Quando a esteira CI/CD automatizada for implantada em repositório Git, o papel pode ser restrito a `roles/run.developer` com `roles/iam.serviceAccountUser` delimitada à Runtime SA.

2. **`roles/cloudscheduler.admin` (Deployer `gustakkg15@gmail.com`):**
   - **Status Atual:** Utilizado na Etapa 12 pelo proprietário para registrar os 2 jobs normativos (`sweep-expired-draws` e `recover-zombie-draw-locks`).
   - **Princípio de Menor Privilégio:** Escopo exclusivo do deployer humano. A Service Account do worker **NÃO POSSUI** esse papel (possui apenas `roles/run.invoker` no Cloud Run). O Service Agent do Scheduler recebe apenas `roles/iam.serviceAccountTokenCreator` na Worker SA para assinar os tokens OIDC.
   - **Evolução Futura:** Após a criação dos jobs, o papel pode ser revogado e substituído por `roles/cloudscheduler.jobRunner` ou `roles/cloudscheduler.viewer`.

3. **`roles/cloudbuild.builds.editor` (Deployer `gustakkg15@gmail.com`):**
   - **Status Atual:** Permite submeter `gcloud builds submit` para compilar o contêiner multi-stage no Artifact Registry.
   - **Princípio de Menor Privilégio:** A Service Account do Cloud Build (`${CLOUDBUILD_SA}`) recebe estritamente `roles/artifactregistry.writer` no repositório `gio-sorte-repo`.
   - **Evolução Futura:** Pode ser delimitado a `roles/cloudbuild.builds.builder` assim que os gatilhos (triggers) forem configurados.

---

### 5. Declaração de Conclusão e Prontidão

- TypeScript (`tsc --noEmit`): **0 erros**.
- Lint (`npm run lint`): **0 advertências / 0 erros**.
- Build do applet (`compile_applet`): **Compilado com sucesso**.
- Suíte de regressão tradicional (`test_traditional_raffle_v2.ts`): **24/24 cenários aprovados**.
- Suíte de auditoria (`test_phase_1_7_7_8_audit.ts`): **11/11 cenários aprovados**.
- Suíte de autenticação dual (`test_worker_dual_auth.ts`): **15/15 cenários aprovados**.
- **Infraestrutura em Nuvem:** Intacta. Nenhuma chamada de provisionamento remoto realizada sem autorização expressa.
