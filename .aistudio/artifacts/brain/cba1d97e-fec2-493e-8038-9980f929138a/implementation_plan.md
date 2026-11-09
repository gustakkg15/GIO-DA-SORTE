# GIO DA SORTE PRO — PLANEJAMENTO REDESIGN 2.0: ADMIN DASHBOARD & MOTION SYSTEM

Planejamento técnico e arquitetural do **Redesign 2.0 do Painel Administrativo** do GIO DA SORTE PRO, integrando a nova referência visual e de motion design ([Reel Instagram `_code_and_chill_`](https://www.instagram.com/reel/DffBnb2vlUn/)) com a identidade e regras estritas do produto.

---

## 1. Análise da Referência Visual e de Motion (`_code_and_chill_`)

### A. Limitação e Acesso ao Reel
- O link do Instagram (`https://www.instagram.com/reel/DffBnb2vlUn/`) pertence ao perfil de desenvolvimento front-end `_code_and_chill_`.
- Por se tratar de mídia sob barreira de login do Instagram e restrições de CSP/Auth da rede social, a inspeção baseou-se nos metadados OpenGraph (`og:image`, `_code_and_chill_`) e no padrão estrutural e de motion característico do autor para dashboards SaaS de alta performance.

### B. Elementos Estruturais e Composição Identificados:
1. **Sidebar Flutuante/Acoplada com Indicador Deslizante (Sliding Pill Indicator):**
   - Navegação vertical com pilar ativo que desliza suavemente (`translateY` com curva `cubic-bezier`) entre os itens do menu, em vez de um corte abrupto de cor.
   - Ícones limpos com alinhamento ótico estrito e rótulos concisos (sem emojis nos labels).
2. **Navegação Superior Contextual (Top Bar):**
   - Barra superior esbelta com busca contextual, breadcrumbs dinâmicos, status do sistema e perfil administrativo.
3. **Cards de Indicadores (KPIs):**
   - Hierarquia nítida: rótulo secundário em caixa alta sutil ou texto atenuado, valor numérico em destaque com fonte tabular (`font-variant-numeric: tabular-nums`), e delta de tendência (+X% ou badge de status).
4. **Tabelas e Gráficos Integrados:**
   - Tabelas com densidade ajustada, cabeçalhos contrastantes, zebra sutil ou bordas finas com separação sem ruído.
   - Gráficos integrados com curva fluida e cores semânticas atreladas aos indicadores.
5. **Microinterações e Transições:**
   - Feedback tátil em botões (`scale: 0.98` ao clique).
   - Transições de entrada escalonadas (*staggered entrance*) de 120ms a 200ms para cartões ao alternar abas.
   - Hover refinado com iluminação sutil de borda ou elevação discreta, sem efeitos pesados de glow ou borrões volumosos.

---

## 2. Direção Visual — Identidade Oficial GIO DA SORTE PRO

A referência atua como guia de **estrutura, proporção e comportamento cinético**, sem clonar a identidade de terceiros. A paleta oficial para o Redesign 2.0 é:

| Cor | Hex | Função Semântica |
|---|---|---|
| **Azul Royal** | `#0131CD` | Acento primário, botões de ação principal, seleções ativas e foco. |
| **Branco** | `#FFFFFF` | Texto de alto contraste em superfícies escuras, cartões em modo claro ou ícones destacados. |
| **Lima Neon** | `#B9FC01` | Destaque e acento vibrante (KPIs positivos, LIVE ativa, bilhetes premiados, chamadas de atenção). |
| **Preto Profundo** | `#080A0F` | Fundo principal da aplicação, criando contraste imersivo e profissional. |
| **Superfície Cartão** | `#10141E` | Superfície secundária dos cards para elevação sem ruído visual. |
| **Bordas Sutis** | `rgba(255, 255, 255, 0.08)` | Divisores e contornos com rigor de 1px. |

---

## 3. Direção de Motion Design & Acessibilidade

### A. Avaliação Técnica sobre Dependências (GSAP vs. Nativo / Tailwind / CSS)
- **Veredito:** **NÃO ADICIONAR GSAP**.
- **Justificativa Técnica:**
  - O bundle do GIO DA SORTE PRO utiliza Vite + React + Tailwind CSS v4.
  - As animações da referência (indicador deslizante na sidebar, entrada de cartões, hover states, elevação) são plenamente realizáveis via:
    1. **CSS Transitions / Keyframes acelerados por hardware** (`transform: translateY(...)`, `opacity`).
    2. Propriedade CSS `transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1), opacity 150ms ease`.
  - Adicionar o pacote GSAP inflaria desnecessariamente o bundle em dezenas de kilobytes sem oferecer vantagem perceptível para um dashboard operacional.
  - Segue a regra do `AGENTS.md`: *"Não adicione dependência sem justificar benefício, manutenção, tamanho e risco."*

### B. Respeito a `prefers-reduced-motion`
- Todo efeito cinético terá variante `@media (prefers-reduced-motion: reduce)`:
  - Animações de deslizamento e entrada escalonada são convertidas em transições instantâneas ou fade sutil de opacidade.
  - Zero distração ou gatilhos vestibulares para usuários que necessitam de movimento reduzido.

---

## 4. Aplicação Funcional aos Módulos Administrativos do GIO DA SORTE

O Redesign 2.0 será mapeado estritamente sobre as páginas e recursos existentes:

1. **Dashboard Geral:**
   - Métricas de faturamento (Mercado Pago), rifas ativas, bilhetes emitidos e sessões de LIVE TikTok recentes.
2. **Gestão de Sorteios e Rifas:**
   - Grid de campanhas com filtros por status (`Em andamento`, `Concluído`, `Pendente de sorteio`).
   - Cards com barra de progresso de bilhetes vendidos e contador regressivo.
3. **Participantes & Bilhetes:**
   - Tabela de participantes com busca rápida por telefone, bilhete ou nome, paginação e visualização de comprovantes.
4. **Resultados & Auditoria:**
   - Log imutável dos sorteios concluídos, hash SHA-256 da apuração criptográfica e semente pública.
5. **TikTok LIVE PRO:**
   - Painel de conexão com contadores de participantes ao vivo, status do worker WebSocket e histórico de presentes.
6. **Assinaturas & Planos:**
   - Status do plano FREE vs PRO do organizador, dados de faturamento e limites de participantes.
7. **Configurações Administrativas:**
   - Cofre de chaves de integração, logs de revogação de tokens e parâmetros gerais da conta.

---

## 5. Matriz de Skills Utilizadas no Planejamento

| Skill | Localização | Aplicação no Redesign 2.0 |
|---|---|---|
| **`unslop`** | `.agents/skills/unslop/` | Eliminação sistemática de AI slop: sem gradientes roxos aleatórios, sem emoji nos botões, tipografia tabular para números, espaçamento estrito em grade de 4px/8px e hierarquia visual silenciosa no chrome. |
| **`motion-design`** | `.agents/skills/motion-design/` | Diretrizes de movimento curto (120–250ms), suporte obrigatório a `prefers-reduced-motion` e foco em causa/efeito sem atrasar tarefas produtivas. |
| **`product-design-system`** | `.agents/skills/product-design-system/` | Hierarquia de dados em tabelas, preservação das regras de negócio do GIO DA SORTE e integração da paleta oficial (#0131CD, #FFFFFF, #B9FC01, #080A0F). |
| **`frontend-design`** | `.agents/skills/frontend-design/` | Escala espacial, acabamento tipográfico e disciplina de botões e cards sem decorações excessivas. |

---

## 6. Próximos Passos
- Este documento registra a referência oficial e o plano conceitual do Redesign 2.0.
- **Nenhum arquivo de código foi alterado nesta etapa.**
- A implementação prática dos componentes do Admin Dashboard aguarda autorização formal do usuário.
