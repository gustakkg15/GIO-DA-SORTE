---
name: web-performance
description: Otimização de Core Web Vitals (LCP, INP, CLS), redução de payload de bundle, carregamento assíncrono de recursos e estabilidade de rendering no GIO DA SORTE PRO.
license: MIT
origin: danielteles/awesome-agent-skills
adapted_for: GIO DA SORTE PRO (Performance Web & Core Web Vitals)
---

# Web Performance & Core Web Vitals — GIO DA SORTE PRO

> **Origem:** Baseado no repositório open-source `danielteles/awesome-agent-skills` (Licença MIT), adaptado para métricas de velocidade, Core Web Vitals e renderização eficiente do GIO DA SORTE PRO.

---

## 1. Metas de Performance no GIO DA SORTE PRO

Para garantir agilidade instantânea tanto em computadores potentes quanto em smartphones modestos de criadores de conteúdo durante transmissões:

| Métrica | Limite Ideal | Impacto no Usuário |
| :--- | :--- | :--- |
| **LCP (Largest Contentful Paint)** | $\le 1.8\text{ s}$ | O dashboard e o sorteador principal carregam quase instantaneamente. |
| **INP (Interaction to Next Paint)** | $\le 100\text{ ms}$ | O clique no botão "Sortear" ou filtros responde imediatamente sem engasgos. |
| **CLS (Cumulative Layout Shift)** | $\le 0.05$ | Zero pulos na tela quando avatares, imagens de presentes ou fontes são carregados. |
| **TBT (Total Blocking Time)** | $\le 150\text{ ms}$ | A CPU da máquina não fica travada processando scripts longos. |

---

## 2. Prevenção de Deslocamento de Layout (CLS Zero)

1. **Dimensões Explícitas em Avatares e Mídias:**
   - Sempre forneça `width` e `height` (ou classes com tamanho fixo como `w-10 h-10 aspect-square`) em tags `<img>` e containers de avatares.
2. **Esqueletos de Carregamento (Skeletons) com Altura Fixada:**
   - Durante o carregamento da lista de participantes ou comentários, use skeletons que ocupem exatamente a mesma altura e largura que os itens reais ocuparão após carregados.
3. **Fontes de Sistema e Fallbacks Compatíveis:**
   - As fontes carregadas não devem causar layout shift drástico ao renderizar (use `font-display: swap` com métricas ajustadas).

---

## 3. Minimização de Trabalho na Thread Principal (Otimização de INP)

1. **Chunking de Listas Grandes:**
   - Se uma LIVE possuir 20.000 comentários, nunca tente renderizar 20.000 nós no DOM de uma só vez.
   - Utilize paginação virtualizada ou renderize apenas os 50 mais recentes, mantendo o total computado em memória para o sorteio.
2. **Uso de Web Workers ou Micro-tarefas para Sorteios Gigantescos:**
   - O sorteio algorítmico (Fisher-Yates shuffle ou sorteio criptograficamente seguro via `crypto.getRandomValues`) deve ser executado de forma rápida sem bloquear o loop de animação da interface.

---

## 4. Otimização de Assets e Bundling (Vite)

1. **Tree-shaking e Imports Específicos:**
   - Nunca faça `import * as Lucide from 'lucide-react'`. Importe estritamente os ícones necessários: `import { Trophy, Users, Play } from 'lucide-react'`.
2. **Compressão e Cache no Servidor Express:**
   - O servidor de produção deve entregar arquivos estáticos com cabeçalhos de cache duradouros (`Cache-Control: public, max-age=31536000, immutable` para arquivos com hash no nome gerados pelo Vite).
3. **Pré-carregamento Inteligente:**
   - Pré-carregue rotas e recursos de modais críticos sem sobrecarregar a largura de banda inicial.

---

## 5. Checklist de Web Performance

- [ ] Imagens e avatares possuem dimensões declaradas para evitar layout shift?
- [ ] O tamanho do bundle principal não contém dependências não utilizadas?
- [ ] Listas com mais de 100 itens utilizam paginação ou janela virtualizada?
- [ ] O cálculo de sorteios roda sem congelar a thread de animação da interface?
- [ ] O build de produção (`npm run build`) gera chunks otimizados sem warnings de tamanho excessivo descontrolado?
