---
name: ui-animation
description: Princípios de física de movimento, curvas de aceleração (easing), micro-interações performáticas e suporte a acessibilidade motora (prefers-reduced-motion) para o GIO DA SORTE PRO.
license: MIT
origin: mblode/agent-skills
adapted_for: GIO DA SORTE PRO (Motion Design & Easing)
---

# UI Animation & Motion Principles — GIO DA SORTE PRO

> **Origem:** Baseado no repositório open-source `mblode/agent-skills` (Licença MIT), adaptado para micro-interações, roletas de sorteio e transições de tela no GIO DA SORTE PRO.

---

## 1. O Papel da Animação no GIO DA SORTE PRO

Em uma plataforma de sorteios e lives:
- **A animação serve à verdade funcional:** Informar o estado do sorteio, confirmar o clique de um botão ou revelar o vencedor com suspense calibrado.
- **Não crie animações decorativas gratuitas:** Nenhuma animação deve atrasar a tomada de decisão do usuário ou tornar o painel lento.
- **60 FPS constantes:** Todas as animações devem usar exclusivamente as propriedades aceleradas por GPU (`transform`, `opacity`). Nunca anime `width`, `height`, `top` ou `left`.

---

## 2. Curvas de Aceleração (Easing) e Durações Recomendadas

### 2.1. Tabela de Durações
| Tipo de Interação | Duração | Easing Recomendado | Exemplo de Aplicação |
| :--- | :--- | :--- | :--- |
| **Micro-interações (Hover/Active)** | 100ms a 150ms | `cubic-bezier(0.4, 0, 0.2, 1)` | Botões, badges, links |
| **Abertura de Modais/Drawers** | 200ms a 250ms | `cubic-bezier(0, 0, 0.2, 1)` | Modal de upgrade PRO, diálogo de confirmação |
| **Fechamento de Modais** | 150ms a 200ms | `cubic-bezier(0.4, 0, 1, 1)` | Fechar popup ou dismiss de toast |
| **Animação de Sorteio / Roleta** | 3000ms a 5000ms | `cubic-bezier(0.12, 0.8, 0.32, 1)` | Desaceleração física gradual até o ganhador |
| **Celebração de Vencedor** | 400ms a 600ms | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Efeito pop/scale suave da coroa ou troféu |

---

## 3. Animação da Roleta e Revelação de Sorteio

A experiência de revelação do ganhador é o ápice emocional do produto:
1. **Fase 1 (Aceleração rápida):** 0s a 1.2s — Os nomes ou números passam em alta velocidade (`blur-sm` sutil opcional).
2. **Fase 2 (Desaceleração gradual):** 1.2s a 3.5s — O ritmo diminui gradualmente, gerando expectativa nos espectadores da LIVE.
3. **Fase 3 (Fixação e Revelação):** 3.5s a 4.0s — O nome do vencedor para no centro, há um flash sutil e o card dourado de vencedor ganha destaque com escala `scale-105`.

---

## 4. Acessibilidade Motora (`prefers-reduced-motion`)

É imperativo respeitar as preferências de acessibilidade de usuários sensíveis a movimento:
```css
@media (prefers-reduced-motion: reduce) {
  *,
  ::before,
  ::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```
No Tailwind:
- Utilize a classe `motion-reduce:transition-none` ou `motion-reduce:animate-none` em componentes que apresentem rotação contínua ou pulsos de tela.

---

## 5. Checklist de Animação

- [ ] Toda transição de botão dura entre 100ms e 200ms?
- [ ] O sorteio gera suspense sem demorar excessivamente (máximo de 5 segundos)?
- [ ] Nenhuma animação causa `reflow` ou `layout shift` (CLS)?
- [ ] O `prefers-reduced-motion` é respeitado em animações contínuas?
