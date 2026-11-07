---
name: accessibility
description: Conformidade WCAG 2.1 nível AA, navegação completa por teclado, contraste cromático, anéis de foco e compatibilidade com leitores de tela no GIO DA SORTE PRO.
license: MIT
origin: danielteles/awesome-agent-skills
adapted_for: GIO DA SORTE PRO (WCAG 2.1 AA Compliance)
---

# Accessibility (WCAG 2.1 AA) — GIO DA SORTE PRO

> **Origem:** Baseado no repositório open-source `danielteles/awesome-agent-skills` (Licença MIT), adaptado para conformidade com as diretrizes WCAG 2.1 AA, navegação acessível e inclusão universal no GIO DA SORTE PRO.

---

## 1. Princípios de Acessibilidade no GIO DA SORTE

O GIO DA SORTE PRO deve ser plenamente operável por qualquer pessoa, incluindo criadores de conteúdo com deficiência visual, motora ou auditiva, através de:
1. **Perceptibilidade:** Contraste mínimo de cor e equivalentes em texto para elementos visuais.
2. **Operabilidade:** Navegação 100% possível via teclado, com ordem de foco lógica e sem armadilhas de teclado (keyboard traps).
3. **Compreensibilidade:** Rótulos claros em formulários, mensagens de erro descritivas e previsibilidade de ações.
4. **Robustez:** Código semântico HTML5 correto para interoperabilidade com leitores de tela (NVDA, VoiceOver, TalkBack).

---

## 2. Contraste de Cores (WCAG 2.1 AA)

- **Texto Normal (< 18pt ou < 14pt bold):** Contraste mínimo de **4.5:1** contra o fundo.
  - No fundo `#050D20` e `#0B1730`: use `text-slate-200` (`#E2E8F0` com taxa 12:1) ou `text-white` (taxa 18:1).
  - Nunca use `text-slate-600` sobre fundo azul marinho profundo (contraste falho).
- **Texto Grande (>= 18pt ou >= 14pt bold):** Contraste mínimo de **3:1**.
- **Componentes de Interface e Bordas de Input:** Mínimo de **3:1** contra superfícies adjacentes.

---

## 3. Navegação por Teclado e Foco Visível

### 3.1. Ordem do Foco e Anel de Foco (`focus-visible`)
- Todo elemento interativo deve ter um indicador visual claro de foco ao ser navegado por Tab:
  ```tsx
  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1730]"
  ```
- **Nunca aplique `outline: none` sem fornecer uma alternativa visível de foco.**

### 3.2. Gerenciamento de Foco em Modais
- Ao abrir um modal: o foco deve ser movido automaticamente para o primeiro elemento acionável (ou botão de fechar).
- Ao fechar o modal: o foco deve retornar ao botão que disparou a abertura.
- Tecla `Escape`: Deve fechar modais e popups imediatamente.
- Prender o foco (Focus Trap): O Tab dentro do modal não deve vazar para a página em segundo plano.

---

## 4. Semântica de Leitores de Tela (ARIA)

### 4.1. Botões de Ícones Puros
Todo botão que contenha apenas um ícone visual (ex: botão de fechar, botão de configurações, botão de copiar) DEVE possuir um rótulo textual:
```tsx
<button
  type="button"
  aria-label="Fechar janela de sorteio"
  className="..."
>
  <X className="w-5 h-5" aria-hidden="true" />
</button>
```

### 4.2. Notificações Vivas (Live Regions)
Quando um sorteio é concluído ou um novo participante entra durante a LIVE:
```tsx
<div aria-live="polite" aria-atomic="true" className="sr-only">
  {vencedor ? `Vencedor sorteado: ${vencedor.nome}` : ''}
</div>
```

---

## 5. Checklist de Verificação de Acessibilidade

- [ ] Todas as ações principais podem ser executadas apenas usando o teclado (Tab, Enter, Espaço, Esc)?
- [ ] Todos os inputs possuem rótulos `<label>` associados via `htmlFor` ou `aria-label`?
- [ ] O contraste de texto passa no validador com índice superior a 4.5:1?
- [ ] Os botões de ícone possuem `aria-label` explicativo?
- [ ] Não existem elementos `<div onClick={...}>` sem `role="button"`, `tabIndex={0}` e tratamento de teclado (`onKeyDown`)?
