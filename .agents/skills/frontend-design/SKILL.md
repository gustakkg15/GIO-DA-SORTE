---
name: frontend-design
description: Diretrizes universais de arquitetura de interface, estética intencional e combate ao visual genérico de IA (anti-AI slop) para o GIO DA SORTE. Use ao construir, refinar ou auditar telas, dashboards, modais e componentes.
---

# Frontend Design — Diretrizes Universais de Interface

## Atribuição e Licença
- **Origem:** Repositório oficial `anthropics/skills` (`frontend-design`).
- **Licença:** Apache License 2.0.
- **Adaptação para Build Mode:** Removidos comandos de CLIs externos e hooks de automação proprietários. Convertido em guia declarativo portátil alinhado à identidade visual Dark Tech Navy do GIO DA SORTE.

---

## 1. Objetivo e Situações de Utilização
Esta Skill estabelece a constituição visual de frontend para garantir que todas as interfaces do GIO DA SORTE possuam acabamento de software comercial de alto padrão, eliminando padrões visuais previsíveis de IA (*AI slop*).

### Quando utilizar:
- Ao criar, editar ou estilizar qualquer tela, modal, tabela ou componente interativo.
- Na definição de paletas, contraste, hierarquia tipográfica e ritmo espacial.
- Ao auditar telas para assegurar que não pareçam modelos genéricos de inteligência artificial.

---

## 2. Ordem de Resolução e Princípios Fundamentais

Quando houver tensão entre requisitos de design, resolva na seguinte ordem:

1. **Função Real:** Todo controle interativo deve ter handler funcional (`onClick`, `onChange`, `onSubmit`). Proibidos botões inertes ou caixas fictícias sem comportamento.
2. **Legibilidade e Acessibilidade:** Contraste mínimo WCAG 2.1 AA (4.5:1 para texto normal, 3:1 para texto grande), anéis de foco visíveis (`focus-visible`), alvos de toque $\ge 40\text{px}$ (mobile $\ge 44\text{px}$) e suporte a `prefers-reduced-motion`.
3. **Integridade de Layout:** Linha de base desktop de 1440px (largura de conteúdo entre 1024px e 1400px ou layout fluido com barra lateral fixa). Nada transborda a tela horizontalmente (`min-w-0`, `truncate` para textos longos).
4. **Matemática Espacial e Tipográfica:**
   - Preenchimento externo do container sempre maior ou igual ao espaçamento interno entre filhos: $\text{padding}_{\text{outer}} \ge \text{padding}_{\text{inner}}$ (mínimo 16px).
   - Proporção em botões: padding horizontal aproximadamente o dobro do vertical (`py-2 px-4` ou `py-2.5 px-5`).
   - Matemática de raios aninhados: $r_{\text{inner}} = r_{\text{outer}} - \text{padding}$.
5. **Direção Estética:** Identidade consistente, paleta azul corporativa/tech com acentos semânticos e disciplina anti-slop.

---

## 3. Disciplina Anti-Slop (Proibições Estéticas)

Interfaces geradas por IA frequentemente caem em clichês visuais descartáveis. No GIO DA SORTE, as seguintes práticas são **estritamente proibidas**:

- ❌ **Zero-Pill para Metadados Estáticos:** Não envolva dados estáticos (categorias, tags, contadores, datas, hashes) em cápsulas com bordas arredondadas tipo "pílula". Metadados informativos devem ser renderizados como texto limpo e legível com separadores discretos (`·`, `•` ou `/`).
  - *Exceção autorizada:* Badges semânticos de status de alto valor operacional (ex.: `.gio-badge-pro` para recursos PRO, `.gio-badge-live` para transmissão ao vivo e `.gio-badge-free` para recursos gratuitos).
- ❌ **Proibição de Gradientes Excessivos:** Fundos devem ser cores sólidas e profundas do design system (`#050D20`, `#0B1730`, `#101F3D`). Não aplique gradientes diagonais roxos/rosas genéricos.
- ❌ **Proibição de Ícones Decorativos Desnecessários:** Não decore cada linha de texto ou título com ícones de brilho (`Sparkles`), foguetes ou lâmpadas a menos que representem uma ação ou estado real.
- ❌ **Proibição de Cartões Flutuantes com Sombras Desproporcionais:** Use bordas sólidas sutis (`border-[#182943]`) e sombras profundas controladas (`shadow-lg`, `shadow-[#020817]/50`), nunca sombras difusas esbranquiçadas ou neon.

---

## 4. Aplicação no Sistema de Design GIO DA SORTE

| Elemento | Token Oficial GIO DA SORTE | Diretriz de Uso |
|---|---|---|
| **Fundo da Aplicação** | `#050D20` | Superfície base profunda |
| **Superfície Secundária** | `#0B1730` | Sidebar, cabeçalhos de tabela, cards de fundo |
| **Card Elevado / Módulo** | `#101F3D` | Superfície operacional principal com `border-[#182943]` |
| **Azul Principal** | `#0866F5` / `#00A9FF` | Botões primários, links principais, destaque de foco |
| **Acento PRO** | `#8B7CFF` / `#C4B5FD` | Exclusivo para recursos, badges e planos PRO |
| **Acento Sorteio / Ganhador** | `#F5B942` | Troféus, pódios de ganhadores, bilhetes sorteados |
| **Acento Sucesso / LIVE** | `#20C997` | Indicador de conexão ao vivo, status de confirmação |
| **Tipografia Primária** | `Inter`, sans-serif | Títulos, rótulos, parágrafos |
| **Tipografia de Dados** | `IBM Plex Mono`, monospace | Números, bilhetes, moedas, hashes SHA-256 (`tabular-nums`) |

---

## 5. Critérios de Qualidade e Checklist

- [ ] Nenhum texto estático desnecessariamente encapsulado em pílulas decorativas.
- [ ] Fontes numéricas e métricas utilizam `font-mono` com `tabular-nums`.
- [ ] Alvos de clique possuem altura mínima de `38px` (desktop) e `44px` (mobile).
- [ ] Elementos flexíveis possuem `min-w-0` e textos extensos possuem `truncate` para evitar quebra de layout.
- [ ] Estados `loading`, `empty`, `error` e `success` tratados explicitamente.
