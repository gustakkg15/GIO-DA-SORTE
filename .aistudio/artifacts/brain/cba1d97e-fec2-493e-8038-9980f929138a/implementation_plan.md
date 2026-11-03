# GIO DA SORTE PRO — ETAPA 2: PERSISTÊNCIA E SINCRONIZAÇÃO AUTOMÁTICA DOS SORTEIOS (REVISADO)

Plano de arquitetura e implementação da Etapa 2 para persistir as regras operacionais de sorteio por organizador, vincular automaticamente sessões LIVE a campanhas Multi-LIVE com controle estrito de ciclo de entrega do prêmio, e registrar novos sorteios auditáveis para prêmios não reclamados com preservação integral de certificados e integridade criptográfica.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> **Decisões e travas obrigatórias aprovadas para a Etapa 2:**
> 1. **Controle de Ciclo por Entrega de Prêmio:** Um novo ciclo recorrente só é liberado para abertura quando o prêmio do ciclo anterior estiver oficialmente com status `DELIVERED`. Transmissões sucessivas são impedidas de abrir novos ciclos se houver prêmios pendentes (`PENDING_CONTACT`, `CONTACTED`), garantindo governança jurídica e responsabilidade na entrega.
> 2. **Novo Sorteio Auditável (`REDRAWN`):** Em caso de prazo esgotado sem contato (`UNCLAIMED_EXPIRED`), o novo sorteio só pode ser disparado mediante confirmação explícita do organizador. A execução gera um novo sorteio independente (`newDrawId`), exclui o ganhador anterior, valida a existência de outros participantes elegíveis, congela um novo snapshot com nova semente CSPRNG e novo hash SHA-256, mantendo o sorteio e certificado original intactos no histórico com amarração bilateral (`parentDrawId` e `redrawnAsDrawId`).
> 3. **Identidade Visual e Tipografia Oficiais:** Preservação estrita e inegociável da identidade **Grafite e Jade** (Fundo: `#171D1C`, Cards: `#222B28`, Superfícies Elevadas: `#2B3632`, Acento Jade: `#6EAA90`, Acento Dourado: `#C6A56A`) e tipografia **IBM Plex Sans** e **IBM Plex Mono**. Nenhuma alteração de layout, fontes ou paleta externa.
> 4. **Concorrência e Idempotência:** Abertura e avanço de ciclos recorrentes utilizam transações atômicas no Firestore (`runTransaction`) com chave idempotente determinística (`campaign_{id}_cycle_{index}`), evitando qualquer duplicação por reconexão, requisições simultâneas ou múltiplos nós backend.
> 5. **Preservação de Registros Legados:** Preservação integral de todas as sessões, campanhas, sorteios e certificados legados existentes, sem atribuição arbitrária de `ownerUid` e sem exclusão de dados antigos.

---

### 1. Overview & Core Concept

- **O que faz:**
  1. **Configuração Permanente do Sorteio por Organizador:**
     - Armazena no Firestore em `/users/{uid}/settings/raffle_config` a regra permanente do organizador: título padrão, prêmio padrão, moedas por bilhete (`currentRate`), mínimo de moedas (`minCoinsPerGift`), limite de bilhetes por participante (`maxTicketsPerUser`), limite total de bilhetes (`maxTotalTickets`), regras de elegibilidade e permissão de vencedores repetidos.
     - Carrega automaticamente essa configuração ao abrir a Arena de Presentes ou ao conectar uma nova sessão LIVE.
  2. **Sincronização Automática com Campanhas:**
     - Permite ao organizador selecionar uma campanha pré-configurada antes da conexão.
     - Vincula a sessão LIVE à campanha e ciclo ativo, persistindo a amarração no documento `/sessions/{sessionId}` e no cache local.
     - Mantém a vinculação estável durante navegação interna, recarregamento F5 e reconexões SSE da Etapa 1.
  3. **Campanhas Recorrentes com Governança de Prêmios:**
     - Modalidades:
       - `SINGLE_DRAW`: ciclo único finalizado no sorteio.
       - `RECURRING_RESET`: a cada novo ciclo entregue, os bilhetes reiniciam do zero para os participantes, mantendo o histórico de vencedores.
       - `RECURRING_CUMULATIVE`: participantes acumulam pontuação de forma contínua, mas cada ciclo possui seu congelamento de snapshot e sorteio próprio.
     - **Trava de governança:** a campanha permanece travada no ciclo corrente enquanto o resultado estiver em `PENDING_CONTACT` ou `CONTACTED`. Apenas após a marcação oficial de `DELIVERED` (ou resolução de `REDRAWN`) o próximo ciclo pode ser iniciado.
  4. **Controle de Entrega do Prêmio (Tracking Pós-Sorteio):**
     - Acompanhamento dos 5 status formais em `/draws/{drawId}`:
       - `PENDING_CONTACT`: aguardando comunicação inicial com o ganhador.
       - `CONTACTED`: ganhador contatado, em fase de validação e envio.
       - `DELIVERED`: prêmio recebido e comprovado (com data, método e notas registradas). Libera automaticamente o próximo ciclo da campanha.
       - `UNCLAIMED_EXPIRED`: prazo legal de retirada expirado sem êxito no contato.
       - `REDRAWN`: sorteio original arquivado por não comparecimento; substituição documentada e novo sorteio auditável emitido.
  5. **Novo Sorteio Auditável para Prêmio Não Reclamado:**
     - A partir de um sorteio em `UNCLAIMED_EXPIRED`, o organizador pode confirmar um novo sorteio.
     - O sistema valida se há participantes elegíveis remanescentes (excluindo os vencedores já contemplados), gera um novo snapshot congelado com semente CSPRNG e hash SHA-256 independentes, cria um novo registro em `/draws/{newDrawId}` com `parentDrawId = originalDrawId` e atualiza o original com `redrawnAsDrawId = newDrawId` e status `REDRAWN`.
     - O certificado auditável original não é modificado nem excluído, mantendo a rastreabilidade total do evento perante os participantes e auditorias.

---

### 2. User Experience & Visual Design

- **Identidade e Tipografia Estritamente Preservadas:**
  - **Fundo da Aplicação:** Grafite Profundo (`#171D1C`)
  - **Cards e Painéis:** Grafite Carvão (`#222B28`)
  - **Superfícies Elevadas e Bordas Sutis:** Grafite Elevado (`#2B3632` com bordas `#2B3632`)
  - **Acento Primário de Ação:** Verde Jade (`#6EAA90`)
  - **Acento de Destaque e Prêmios:** Dourado Âmbar (`#C6A56A`)
  - **Tipografia:** **IBM Plex Sans** (textos, títulos, labels e botões) e **IBM Plex Mono** (hashes, números de bilhetes, seeds, identificadores de ciclo e protocolo).
  - Nenhuma alteração visual fora da paleta aprovada.

- **Fluxo de Interação do Organizador:**
  1. *Arena de Presentes LIVE:* Ao entrar na tela, as regras permanentes salvas são exibidas no painel de configuração da coluna esquerda. Caso haja uma campanha vinculada, um seletor visual exibe a campanha e o ciclo ativo.
  2. *Início da Transmissão:* Conecta à LIVE respeitando integralmente a conexão persistente da Etapa 1. A sessão registra a campanha e o ciclo no Firestore.
  3. *Acompanhamento de Entrega no Histórico:*
     - A lista de sorteios e a visualização de detalhes do certificado exibem o seletor de status de entrega (`PENDING_CONTACT`, `CONTACTED`, `DELIVERED`, `UNCLAIMED_EXPIRED`).
     - Cada atualização exige autenticação e verifica `ownerUid === authUid` no backend.
     - Modal de confirmação para registro de método de entrega (ex: "PIX", "Envio Correios com rastreio", "Entrega pessoal") e notas de conformidade.
  4. *Ação de Novo Sorteio:*
     - Quando o status for `UNCLAIMED_EXPIRED`, exibe o botão com destaque em Dourado/Jade: "Realizar Novo Sorteio por Não Comparecimento".
     - Modal de aviso com confirmação explícita detalhando: exclusão do vencedor original, quantidade de participantes elegíveis remanescentes e geração de novo certificado com rastreabilidade bilateral.

---

### 3. Key Product Decisions & Trade-Offs

- **Decisão 1: Trava de ciclo recorrente condicionada a `DELIVERED` ou `REDRAWN` resolvido**
  - *Abordagem:* O backend bloqueia a criação de um novo ciclo (`cycleIndex + 1`) em campanhas recorrentes se o ciclo anterior tiver sorteio realizado mas ainda não entregue (`PENDING_CONTACT` ou `CONTACTED`).
  - *Por que:* Impede que criadores acumulem pendências jurídicas de prêmios não honrados e protege a credibilidade do sorteador e dos participantes.
  - *Alternativa descartada:* Abrir ciclo automaticamente a cada nova LIVE independentemente do status do prêmio anterior (geraria confusão operacional e risco de abandono de prêmios).

- **Decisão 2: Idempotência atômica via `campaign_{id}_cycle_{index}` com `runTransaction`**
  - *Abordagem:* Cada ciclo tem um ID determinístico no Firestore. Aberturas concorrentes executam dentro de uma transação que verifica se o ciclo atual já existe ou se o anterior ainda está em aberto.
  - *Por que:* Elimina 100% o risco de criação de múltiplos ciclos #2 simultâneos em caso de duplo clique ou reconexão em cluster multi-instância.

- **Decisão 3: Criptografia e isolamento do novo sorteio auditável**
  - *Abordagem:* O sorteio original (`drawId`) mantém seu registro congelado com `frozenRosterHash`, `seedCommitment` e certificado intactos. O novo sorteio (`newDrawId`) é um registro 100% novo que herda os bilhetes válidos exceto os do ganhador original, gerando nova semente e novo hash, com vínculos `parentDrawId` e `redrawnAsDrawId`.
  - *Por que:* Garante que o histórico comprove fielmente o que aconteceu no momento da LIVE e a posterior reexecução documentada da entrega.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

#### Diagrama de Arquitetura do Sistema e Fluxo de Dados

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    CLIENTE WEB (REACT SPA - GRAFITE & JADE)                     │
│                                                                                 │
│   TikTokLiveGiftsArenaView         RaffleHistoryView           CertificadoView  │
│   (Regras Permanentes / Campanha) (Tracking Entrega / Redraw) (Audit Bilateral) │
│            │                               │                          │         │
│            ▼                               ▼                          ▼         │
│   organizerSettingsService        raffleDeliveryService       campaignService   │
└────────────┬───────────────────────────────┬──────────────────────────┬─────────┘
             │                               │                          │
             │ Authorization: Bearer         │ Auth Bearer              │ Auth Bearer
             ▼                               ▼                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      BACKEND EXPRESS API (server.ts)                            │
│                                                                                 │
│   GET/POST /api/tiktok/pro/organizer-config  (Configuração permanente do user)  │
│   POST     /api/tiktok/pro/campaigns/sync    (Vínculo atômico sessão-campanha)  │
│   POST     /api/tiktok/pro/campaigns/cycle   (Abertura idempotente de ciclo)    │
│   POST     /api/tiktok/pro/draws/delivery    (Atualização auditada de entrega)  │
│   POST     /api/tiktok/pro/draws/redraw      (Novo sorteio auditável bilateral) │
│                                                                                 │
│   Middlewares: requireFirebaseAuth -> requireProPlan -> assertRecordOwnership   │
└────────────┬────────────────────────────────────────────────────────┬───────────┘
             │                                                        │
             ▼                                                        ▼
┌───────────────────────────────────────────────┐  ┌──────────────────────────────┐
│             FIRESTORE DATABASE                │  │    ETAPA 1 (PRESERVADA)      │
│                                               │  │                              │
│  /users/{uid}/settings/raffle_config          │  │  tiktokAdapter (Singleton)   │
│  /campaigns/{campaignId}/cycles/{cycleId}     │  │  tiktokEventQueue (WAL/Sse)  │
│  /draws/{drawId} (deliveryStatus/Tracking)    │  │  sseTicketService (30s TTL)  │
│  /sessions/{sessionId} (campaignId + cycleId) │  │  Multi-Instance Concurrency  │
└───────────────────────────────────────────────┘  └──────────────────────────────┘
```

#### Modelo de Dados e Extensões de Tipos (`src/types.ts`)

1. **`OrganizerRaffleDefaults`**:
   - `ownerUid: string`
   - `raffleTitle: string`
   - `prizeName: string`
   - `coinsPerTicket: number`
   - `minCoinsPerGift: number`
   - `maxTicketsPerUser: number | null`
   - `maxTotalTickets: number | null`
   - `allowDuplicateWinners: boolean`
   - `participationRulesNotes: string`
   - `preferredCampaignId?: string | null`
   - `updatedAt: number`

2. **Extensão de `SpecialCampaign` e Ciclos (`CampaignCycleRecord`)**:
   - `campaignMode: 'SINGLE_DRAW' | 'RECURRING_RESET' | 'RECURRING_CUMULATIVE'`
   - `currentCycleIndex: number`
   - `activeCycleId: string`
   - `pendingDeliveryCount: number` *(quantidade de ciclos com prêmio ainda não entregue)*
   - Documento `/campaigns/{id}/cycles/campaign_{id}_cycle_{cycleIndex}`:
     - `cycleId: string`
     - `campaignId: string`
     - `cycleIndex: number`
     - `status: 'ACTIVE' | 'DRAWN' | 'DELIVERED' | 'ARCHIVED'`
     - `startedAt: number`
     - `endedAt: number | null`
     - `drawId: string | null`
     - `snapshotId: string | null`
     - `prizeDeliveryStatus: 'PENDING_CONTACT' | 'CONTACTED' | 'DELIVERED' | 'UNCLAIMED_EXPIRED' | 'REDRAWN' | null`
     - `ownerUid: string`

3. **Extensão de Entrega e Redraw em `LiveDrawRecord`**:
   - `deliveryStatus: 'PENDING_CONTACT' | 'CONTACTED' | 'DELIVERED' | 'UNCLAIMED_EXPIRED' | 'REDRAWN'`
   - `deliveryDetails?: { contactedAt?: number; deliveredAt?: number; method?: string; notes?: string; operatorUid?: string }`
   - `parentDrawId?: string | null` *(aponta para o sorteio original expirado caso este seja um novo sorteio)*
   - `redrawnAsDrawId?: string | null` *(aponta para o novo sorteio substituto caso este tenha sido arquivado por não comparecimento)*

---

### 5. Plano de Verificação e Testes

Ao término da implementação do código da Etapa 2, será criada e executada uma suíte automatizada em `scripts/test_etapa2_raffle_persistence.ts` validando os 10 cenários obrigatórios:

1. **Persistência da Configuração Permanente:** Gravação de regras via API, recarregamento no navegador e recuperação após F5.
2. **Carregamento Automático ao Iniciar LIVE:** Criação de sessão sem parâmetros prévios adotando automaticamente a configuração do organizador.
3. **Vinculação Estrita Sessão-Campanha:** Sessão LIVE iniciada com campanha selecionada preserva o vínculo entre abas e após F5.
4. **Governança de Ciclo Recorrente:**
   - Ciclo com prêmio em `PENDING_CONTACT` ou `CONTACTED` bloqueia a abertura do próximo ciclo.
   - Atualização para `DELIVERED` desbloqueia e autoriza a abertura do próximo ciclo.
5. **Idempotência e Prevenção de Duplicidade:** Chamadas simultâneas de abertura de ciclo resultam em exatamente 1 ciclo criado com ID determinístico.
6. **Ciclo de Vida da Entrega:** Atualização sequencial dos 5 status (`PENDING_CONTACT` -> `CONTACTED` -> `DELIVERED`) com registro de data, método e notas.
7. **Isolamento de Segurança entre Usuários:** Tentativa de atualizar configuração ou entrega de outro organizador bloqueada com `HTTP 403 OWNERSHIP_FORBIDDEN`.
8. **Novo Sorteio Auditável (`REDRAWN`):**
   - Transição de `UNCLAIMED_EXPIRED` para `REDRAWN` mediante confirmação.
   - Exclusão estrita do ganhador anterior da lista de elegíveis.
   - Novo snapshot com nova semente CSPRNG e novo hash SHA-256.
   - Bloqueio se não houver participantes elegíveis remanescentes.
   - Preservação do registro e do certificado do sorteio anterior.
9. **Integridade de Registros Legados:** Verificação de que sessões, campanhas e certificados legados permanecem inalterados e verificáveis.
10. **Compatibilidade com a Etapa 1:** Garantia de que a conexão persistente SSE, tickets temporários de 30s e deduplicação continuam 100% aprovados.
