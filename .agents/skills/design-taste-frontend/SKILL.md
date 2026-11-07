---
name: design-taste-frontend
description: Diretrizes de refinamento estético, contenção visual, tipografia intencional e eliminação de designs genéricos ou clichês de IA no frontend do GIO DA SORTE PRO.
license: MIT
origin: leonxlnx/taste-skill
adapted_for: GIO DA SORTE PRO (Design System Navy/Gold/Violet)
---

# Design Taste Frontend — GIO DA SORTE PRO

> **Origem:** Baseado no repositório open-source `leonxlnx/taste-skill` (Licença MIT), adaptado especificamente para o stack e contratos visuais do GIO DA SORTE PRO.

---

## 1. Princípio Fundamental: Bom Gosto & Contenção

Design de excelência não é sobre adicionar ornamentos, e sim sobre **deliberação, moderação e peso visual cirúrgico**. A grande maioria dos designs gerados por inteligência artificial falha por hiperatividade visual: fundos espalhafatosos, gradientes em excesso, múltiplos cards brilhantes competindo por atenção e bordas multicoloridas.

No **GIO DA SORTE PRO**:
1. **A quietude é o padrão:** O fundo azul marinho profundo (`#050D20`, `#0B1730`) deve ser sóbrio, permitindo que os elementos de trabalho (sorteador, métricas, lista de participantes, ranking) tenham contraste natural.
2. **Um único ponto focal por viewport:** Se um elemento é dourado (vencedor) ou violeta (PRO), o resto da tela deve ser neutro e acolhedor.
3. **Menos camadas, mais clareza:** Evite empilhar cards dentro de cards com sombras difusas. Prefira superfícies sólidas com bordas sutis (`border-white/10`).

---

## 2. O que Diferencia o Design Profissional do "Design Genérico de IA"

| Aspecto | Clichê Genérico de IA (PROIBIDO) | Padrão GIO DA SORTE PRO (OBRIGATÓRIO) |
| :--- | :--- | :--- |
| **Paleta** | Gradientes arco-íris (roxo para azul para rosa em tudo) | Azul marinho com papéis semânticos estritos (Azul = Ação, Dourado = Prêmio, Violeta = PRO) |
| **Botões** | Pílulas arredondadas `rounded-full` em botões de ação padrão | Bordas calculadas `rounded-xl` ou `rounded-lg`, geometria equilibrada |
| **Cards** | Vidro fosco pesado com reflexos brilhantes sem contexto | Cards sólidos `#101F3D` com bordas sutis de 1px e hierarquia de profundidade |
| **Tipografia** | Mistura de fontes sem propósito, tamanhos arbitrários | Família Sans limpa para interface (`Inter`/`Plus Jakarta Sans`), mono para dados |
| **Espaçamento** | Elementos colados com paddings irregulares | Grid de 4px/8px rigoroso, respiração proporcional |
| **Ícones** | Ícones coloridos aleatórios dentro de círculos fluorescentes | Ícones neutros (`text-slate-400` / `text-white`), com cor apenas em estados ativos |

---

## 3. Regras de Tipografia e Equilíbrio Visual

### 3.1. Escala Tipográfica Restrita
Nunca use mais do que 4 níveis tipográficos em uma mesma visão operacional:
- **Display / Título Principal:** `text-2xl` a `text-3xl font-bold tracking-tight text-white`
- **Subtítulo / Cabeçalho de Seção:** `text-base` a `text-lg font-semibold text-slate-200`
- **Corpo / Rótulos:** `text-sm font-medium text-slate-300` ou `text-slate-400`
- **Metadados / Auxiliar:** `text-xs font-normal text-slate-400` (nunca inferior a 11px)

### 3.2. Números e Métricas Operacionais
Sempre renderize números de sorteio, contagem de participantes, moedas e valores monetários com:
- `font-mono tracking-tight tabular-nums`
- Evita oscilação de largura durante atualizações em tempo real (TikTok LIVE).

---

## 4. Tratamento de Cores e Hierarquia de Acento

### 4.1. Regra dos 80 / 15 / 5
- **80% Neutros e Superfícies:** Escuros profundos (`#050D20`, `#0B1730`, `#101F3D`) e textos em ardósia (`text-slate-200`, `text-slate-400`).
- **15% Marca e Navegação:** Azul royal (`#0866F5`, `#00A9FF`) para ações primárias, seleções ativas e links de fluxo.
- **5% Acentos Específicos:**
  - **Dourado (`#F5B942`):** Reservado EXCLUSIVAMENTE para troféus, vencedores e coroação.
  - **Violeta (`#8B7CFF` / `#C4B5FD`):** Reservado para selos e funcionalidades PRO.
  - **Esmeralda (`#20C997`):** Reservado para status ativo de LIVE e confirmações de entrega.

---

## 5. Micro-detalhes de Acabamento (Taste Checklist)

Antes de aprovar qualquer tela ou componente:
- [ ] O componente parece uma ferramenta profissional de trabalho ou um template promocional?
- [ ] Há excesso de brilhos, gradientes ou sombras nebulosas? Se sim, simplifique.
- [ ] As bordas possuem opacidade refinada (`border-white/10` ou `border-blue-500/20`) em vez de linhas opacas duras?
- [ ] O contraste de texto atende a legibilidade sem parecer lavado ou invisível?
- [ ] A tela passa sensação de estabilidade, robustez e alta confiabilidade?
