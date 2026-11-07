---
name: ui-design
description: Fundamentos estruturais de interface, composição de layouts, hierarquia de cards, contraste e padrões visuais de software profissional para o GIO DA SORTE PRO.
license: MIT
origin: mblode/agent-skills
adapted_for: GIO DA SORTE PRO (UI Component Library & Standards)
---

# UI Design Fundamentals — GIO DA SORTE PRO

> **Origem:** Baseado no repositório open-source `mblode/agent-skills` (Licença MIT), adaptado para padronização de componentes de interface, grid de dados e cartões de ferramentas do GIO DA SORTE PRO.

---

## 1. Fundamentos de Interface no GIO DA SORTE

Toda interface do GIO DA SORTE PRO é construída em torno de superfícies hierárquicas escuras, com alto contraste de legibilidade, cartões de ferramentas padronizados e navegação fluida.

---

## 2. Anatomia de um Card de Ferramenta / Sorteador

Um card de ferramenta operacional no GIO DA SORTE PRO deve seguir este layout estrito:

```
+-------------------------------------------------------+
|  [Ícone de Categoria]             [Badge de Status]   |
|                                                       |
|  Título da Ferramenta (Ex: Sorteador de Comentários)  |
|  Descrição clara e sucinta em 1 ou 2 linhas.          |
|                                                       |
|  [Estatística / Meta: ex: 1.420 comentários lidos]    |
|                                                       |
|  [Botão de Ação Primária ou Configurar]               |
+-------------------------------------------------------+
```

### 2.1. Classes Tailwind Recomendadas para o Card:
- **Container:** `bg-[#101F3D]/80 hover:bg-[#101F3D] border border-white/10 hover:border-blue-500/30 rounded-2xl p-6 transition-all duration-200 shadow-lg`
- **Ícone:** `w-12 h-12 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-400 flex items-center justify-center`
- **Badge:**
  - PRO: `bg-violet-950/60 text-violet-300 border border-violet-500/30 font-semibold px-2.5 py-0.5 rounded-full text-xs`
  - Ativo / LIVE: `bg-emerald-950/60 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full text-xs font-medium`
- **Título:** `text-lg font-bold text-white tracking-tight mt-4`
- **Descrição:** `text-sm text-slate-400 mt-1 line-clamp-2`

---

## 3. Padrões de Tabelas e Listas de Participantes

Para listas de participantes de lives do TikTok e histórico de ganhadores:
- **Linhas Alternadas Sutis:** `odd:bg-transparent even:bg-white/[0.02]`
- **Hover na Linha:** `hover:bg-white/[0.04] transition-colors`
- **Coluna de Avatar:** Avatar circular de 32px (`w-8 h-8 rounded-full border border-white/10 bg-slate-800`) com iniciais em fallback.
- **Coluna de Moedas / Pontos:** Alinhada à direita com `text-amber-400 font-mono font-medium`.
- **Coluna de Timestamp:** `text-xs text-slate-500 font-mono`.

---

## 4. Botões e Controles de Entrada

### 4.1. Botão Primário (Ação Principal)
- `bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-xl shadow-md transition-all duration-150`

### 4.2. Botão Secundário / Contorno
- `bg-white/5 hover:bg-white/10 active:bg-white/15 text-slate-200 border border-white/10 px-4 py-2 rounded-xl transition-all duration-150`

### 4.3. Botão Dourado de Celebração (Sorteio Concluído)
- `bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold px-6 py-3 rounded-xl shadow-lg shadow-amber-500/20 transition-all duration-150`

### 4.4. Campos de Texto / Selects
- `bg-[#0B1730] border border-white/10 focus:border-blue-500 text-white placeholder-slate-500 rounded-xl px-4 py-2.5 text-sm transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500`

---

## 5. Checklist de UI Design

- [ ] Os cards mantêm altura consistente em layouts de grid (`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6`)?
- [ ] O contraste do texto atende no mínimo 4.5:1 para texto normal e 3:1 para texto grande?
- [ ] Nenhum componente possui cantos vivos de 90° em botões ou cards modernos?
- [ ] Ícones são do Lucide React ou equivalentes SVG homogêneos em espessura de traço (stroke-width: 2)?
