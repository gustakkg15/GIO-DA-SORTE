---
name: styling-and-design-tokens
description: Arquitetura sistemática de design tokens, variáveis CSS, padronização Tailwind v4 e gestão de cores semânticas no GIO DA SORTE PRO.
license: MIT
origin: danielteles/awesome-agent-skills
adapted_for: GIO DA SORTE PRO (Tokens Tailwind e CSS Variables)
---

# Styling & Design Tokens — GIO DA SORTE PRO

> **Origem:** Baseado no repositório open-source `danielteles/awesome-agent-skills` (Licença MIT), adaptado para o ecossistema de tokens CSS e classes utilitárias do Tailwind CSS v4 no GIO DA SORTE PRO.

---

## 1. Arquitetura de Tokens do GIO DA SORTE PRO

Todos os estilos visuais da plataforma devem ser derivados das variáveis e tokens definidos no CSS central (`src/index.css`) ou tokens utilitários Tailwind aprovados. Nunca utilize valores hexadecimais aleatórios diretamente nas tags sem antes mapeá-los para um papel semântico.

---

## 2. Dicionário de Tokens Semânticos

### 2.1. Tokens de Superfície e Fundo
| Token / Variável | Valor Hex | Papel no Produto |
| :--- | :--- | :--- |
| `--bg-primary` | `#050D20` | Fundo principal da página (Background da janela) |
| `--bg-secondary` | `#0B1730` | Fundo de painéis laterais, modais e containers secundários |
| `--bg-card` | `#101F3D` | Superfície de cards interativos e caixas de ferramentas |
| `--bg-card-hover` | `#14274E` | Estado hover de cartões interativos |
| `--border-subtle` | `rgba(255,255,255,0.08)` | Bordas divisórias de cards e tabelas |
| `--border-focus` | `rgba(8,102,245,0.5)` | Anel de foco para acessibilidade |

### 2.2. Tokens de Ação e Marca
| Token / Variável | Valor Hex | Papel no Produto |
| :--- | :--- | :--- |
| `--accent-primary` | `#0866F5` | Botão principal, link de destaque, toggle ativo |
| `--accent-hover` | `#00A9FF` | Estado hover do botão principal |
| `--accent-glow` | `rgba(0,169,255,0.15)` | Brilho sutil ao redor de seleções ativas |

### 2.3. Tokens Funcionais / Semânticos
| Token / Variável | Valor Hex | Papel no Produto |
| :--- | :--- | :--- |
| `--gold-primary` | `#F5B942` | Vencedor de sorteio, troféu, medalha de 1º lugar |
| `--gold-border` | `rgba(245,185,66,0.3)` | Borda iluminada do card de vencedor |
| `--pro-violet` | `#8B7CFF` | Badge de recurso PRO, texto de destaque PRO |
| `--pro-lavender` | `#C4B5FD` | Borda ou acento secundário do badge PRO |
| `--status-live` | `#20C997` | Indicador de LIVE do TikTok ativa |
| `--status-error` | `#EF4444` | Erros de validação, desconexão crítica |
| `--status-warning` | `#F59E0B` | Avisos de rate limit, alerta de participante duplicado |

---

## 3. Escala de Espaçamento e Grid

Utilize a progressão baseada no múltiplo de 4px:
- `p-1` / `m-1`: 4px (micro-espaçador)
- `p-2` / `m-2`: 8px (espaçamento entre badge e texto)
- `p-3` / `m-3`: 12px (espaçamento interno de inputs)
- `p-4` / `m-4`: 16px (padding de cards compactos)
- `p-6` / `m-6`: 24px (padding padrão de cards principais)
- `p-8` / `m-8`: 32px (separações de seções de página)

---

## 4. Diretrizes de Uso no Tailwind v4

No Tailwind v4, `@import "tailwindcss";` é utilizado no `index.css`.
- Use classes compostas ou variáveis CSS nativas: `bg-[var(--bg-card)]` ou `bg-[#101F3D]`.
- Mantenha classes previsíveis e legíveis.
- Evite criar estilos em linha (`style={{ ... }}`) no JSX.
- Centralize variantes repetidas em pequenos componentes auxiliares ou constantes tipadas.

---

## 5. Checklist de Tokens

- [ ] Todas as cores utilizadas possuem correspondência com a paleta oficial?
- [ ] O dourado está restrito a vencedores e prêmios?
- [ ] O violeta está restrito a recursos PRO?
- [ ] Não há gradientes aleatórios que desvirtuem a identidade visual azul marinho?
