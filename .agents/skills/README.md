# Índice de Skills — GIO DA SORTE PRO

O Google AI Studio Build pode não carregar automaticamente pastas `.agents/skills`. Por isso, o `AGENTS.md` instrui explicitamente o agente a abrir os arquivos relevantes. Se o ambiente não respeitar essa instrução, consulte os arquivos específicos da tarefa.

---

## 1. Skills de Engenharia e Operação do Projeto

| Skill | Quando consultar |
|---|---|
| `project-preservation` | Toda tarefa em projeto existente para garantir proteção contra regressões |
| `build-mode-usage-optimizer` | Otimização de contexto, tokens e eficiência de IA em Build Mode |
| `product-design-system` | Identidade visual GIO DA SORTE PRO, paleta Navy/Gold/Violet |
| `interface-quality` | Revisão de telas, estados (empty/loading/error) e fluxos de navegação |
| `motion-design` | Animações, transições e feedback visual de sorteios |
| `engineering-quality` | Arquitetura, contratos de dados, endpoints e manutenibilidade |
| `react-performance` | Profiling de re-renderizações e ciclos de vida React |
| `security-review` | Auth, permissões, dados sensíveis, webhooks, segredos |
| `live-session-integrity` | TikTok LIVE, sorteios, integridade de participantes e moedas |
| `qa-regression` | Testes, auditoria, validação de build e releases |

---

## 2. As 10 Skills Profissionais de Design e Frontend (GitHub Open-Source)

Integradas e adaptadas com rigor à identidade visual e stack técnico do GIO DA SORTE PRO:

| # | Skill | Repositório Original | Licença | Domínio & Quando Consultar |
|---|---|---|---|---|
| 1 | `frontend-design` | `anthropics/skills` | Apache-2.0 | Constituição visual, anti-AI slop, banimento de pills e gradientes aleatórios, escala espacial de 4px/8px. |
| 2 | `design-taste-frontend` | `leonxlnx/taste-skill` | MIT | Bom gosto, contenção visual, tipografia intencional, regra 80/15/5 de contraste e sobriedade. |
| 3 | `impeccable` | `pbakaus/impeccable` | MIT | Acabamento sem defeito visual, fórmula de raios concêntricos, alinhamento ótico de ícones, ritmo vertical. |
| 4 | `ui-ux-pro-max` | `nextlevelbuilder/ui-ux-pro-max-skill` | MIT | Arquitetura de informação SaaS, redução de carga cognitiva, fluxos de conversão PRO e steppers guiados. |
| 5 | `ui-design` | `mblode/agent-skills` | MIT | Anatomia de cards de ferramentas, tabelas de participantes, hierarquia de botões e seletores. |
| 6 | `styling-and-design-tokens` | `danielteles/awesome-agent-skills` | MIT | Dicionário de tokens CSS (`--bg-primary`, `--accent-primary`), classes Tailwind v4 e gestão de cores semânticas. |
| 7 | `ui-animation` | `mblode/agent-skills` | MIT | Física de movimento, curvas easing (`cubic-bezier`), micro-interações de 100-250ms e `prefers-reduced-motion`. |
| 8 | `accessibility` | `danielteles/awesome-agent-skills` | MIT | WCAG 2.1 AA, navegação completa por teclado, anéis de foco visíveis, contraste >= 4.5:1 e semântica ARIA. |
| 9 | `vercel-react-best-practices` | `vercel-labs/agent-skills` | Apache-2.0 / MIT | Co-localização de estado, limpeza de `useEffect`, hooks performáticos, prevenção de re-renders e tipagem estrita. |
| 10 | `web-performance` | `danielteles/awesome-agent-skills` | MIT | Metas de Core Web Vitals (LCP <= 1.8s, INP <= 100ms, CLS <= 0.05), prevenção de layout shift e otimização Vite. |

---

## 3. Regra de Seleção e Precedência

1. **Precedência:** `AGENTS.md` tem prioridade soberana sobre qualquer Skill.
2. **Seleção Cirúrgica:** Leia apenas as 1 a 3 Skills diretamente relacionadas ao escopo da tarefa antes de editar código.
3. **Tarefas Críticas:** Para mudanças que envolvam sorteios ou TikTok LIVE, SEMPRE combine com `live-session-integrity` e `project-preservation`.
4. **Tarefas de Design/Frontend:** Consulte `frontend-design`, `design-taste-frontend` e `impeccable` antes de qualquer alteração visual.

---

## 4. Preservação do Ambiente
- **Zero CLIs ou dependências externas:** Nenhuma ferramenta CLI adicional (como `npx skills`) foi instalada.
- **Formato Portável:** Todos os arquivos seguem o formato de Agent Skill com frontmatter YAML (`name`, `description`, `license`, `origin`) e documentação detalhada em Markdown.
- **Código Intocado:** Nenhuma alteração foi efetuada no código de produção da aplicação durante a instalação das Skills.

