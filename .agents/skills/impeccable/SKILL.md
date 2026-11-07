---
name: impeccable
description: Padrões de precisão cirúrgica, alinhamento pixel-perfect, refinamento de micro-espaçamento e acabamento sem defeito visual para o GIO DA SORTE PRO.
license: MIT
origin: pbakaus/impeccable
adapted_for: GIO DA SORTE PRO (Acabamento de Alta Fidelidade)
---

# Impeccable Design Quality — GIO DA SORTE PRO

> **Origem:** Baseado no repositório open-source `pbakaus/impeccable` (Licença MIT), adaptado para manter acabamento impecável, alinhamento rigoroso e zero débito visual no GIO DA SORTE PRO.

---

## 1. O Padrão "Impeccable"

Um produto classificado como "impeccable" não tem desalinhamentos acidentais de 1 pixel, textos truncados de forma deselegante, cantos arredondados conflitantes entre elementos pai e filho, ou espaçamentos desiguais.

No **GIO DA SORTE PRO**:
Toda interface deve transmitir solidez industrial. Se um usuário operar um sorteio ao vivo para milhares de espectadores, a interface deve passar segurança absoluta, precisão matemática e ausência de falhas visuais.

---

## 2. Princípios de Alinhamento e Geometria

### 2.1. Regra dos Raios Concêntricos (Corner Radius Nesting)
Quando um elemento arredondado está contido dentro de outro elemento arredondado:
$$\text{radius}_{\text{filho}} = \max(0, \text{radius}_{\text{pai}} - \text{padding})$$

- Se o card pai tem `rounded-2xl` (16px) e `p-3` (12px), o elemento filho interno deve ter no máximo `rounded-sm` a `rounded-md` (4px).
- **Erro comum:** Colocar `rounded-2xl` no container e `rounded-2xl` no botão interno colado à borda. Isso cria deformidade ótica.

### 2.2. Alinhamento Ótico de Ícones com Texto
- Ícones que acompanham texto devem ter altura consistente com o tamanho da linha (line-height) e alinhamento centrado verticalmente: `flex items-center gap-2`.
- O tamanho do ícone deve acompanhar o peso da fonte:
  - Texto `text-sm` (14px) $\rightarrow$ Ícone de 16px (`w-4 h-4`)
  - Texto `text-base` (16px) $\rightarrow$ Ícone de 18px a 20px (`w-5 h-5`)
  - Texto `text-lg` / `text-xl` $\rightarrow$ Ícone de 20px a 24px (`w-5 h-5` ou `w-6 h-6`)
- Nunca deixe o ícone flutuar ligeiramente acima ou abaixo do baseline do texto.

---

## 3. Micro-espaçamento e Ritmo Vertical

### 3.1. Proximidade Semântica
- **Rótulo e Campo:** Devem estar próximos (`gap-1.5` ou `mb-1.5`, 6px).
- **Campos Consecutivos:** Devem ter separação média (`gap-4` ou `space-y-4`, 16px).
- **Seções Distintas:** Devem ter respiração ampla (`gap-6` a `gap-8`, 24px a 32px).
- **Margens Internas de Cards:** O padding interno nunca deve ser menor que a distância entre os elementos internos. Exemplo: se o espaçamento interno é de 16px (`space-y-4`), o padding do card deve ser no mínimo `p-5` ou `p-6` (20px ou 24px).

---

## 4. Estados e Micro-interações Impecáveis

1. **Focus Rings Precisos:**
   - Todo campo interativo ou botão deve possuir `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1730]`.
   - O anel de foco nunca deve cortar ou ser sobreposto por `overflow-hidden` descuidado.

2. **Estados Vazios (Empty States) Construtivos:**
   - Nenhum estado vazio deve ser uma tela em branco com texto "Sem dados".
   - Deve conter:
     - Ícone temático discreto em superfície suave (`bg-blue-950/40 p-3 rounded-xl`).
     - Título claro do estado ("Nenhum participante conectado").
     - Instrução acionável ("Inicie a LIVE do TikTok para carregar os espectadores").

3. **Truncamento Elegante de Nomes de Usuários:**
   - Usuários do TikTok frequentemente possuem nomes longos ou caracteres especiais.
   - Sempre utilize `truncate` com `title={username}` no elemento HTML para permitir tooltip nativo em hover.
   - Combine com `min-w-0` em containers flexíveis para impedir que o texto force a quebra do layout do grid.

---

## 5. Checklist de Verificação Impeccable

- [ ] Os raios de curvatura dos elementos filhos respeitam a fórmula concêntrica?
- [ ] Todos os campos interativos possuem estados `:hover`, `:active`, `:focus-visible` e `:disabled`?
- [ ] O cursor é `cursor-pointer` em elementos clicáveis e `cursor-not-allowed` em desabilitados?
- [ ] Números e cronômetros utilizam `tabular-nums` e não pulam a largura da tela?
- [ ] Não há barras de rolagem horizontais involuntárias em nenhuma resolução de 360px a 2560px?
