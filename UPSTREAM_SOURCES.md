# Catálogo de Skills externas e proveniência

Este pacote mantém as Skills próprias do GIO DA SORTE PRO separadas dos projetos externos. Os repositórios abaixo são fontes oficiais; não copie conteúdo sem preservar arquivo original, autoria e licença.

## Fontes selecionadas

| Fonte | Skills recomendadas | Uso no GIO DA SORTE PRO | Licença verificada |
|---|---|---|---|
| [Emil Kowalski — skills](https://github.com/emilkowalski/skills) | `emil-design-eng`, `animate`, `review-animations`, `improve-animations`, `animation-performance`, `break-ui` | Design engineering, motion e testes extremos de UI | MIT (LICENSE consultado) |
| [Garden Skills — Conard Li](https://github.com/ConardLi/garden-skills) | `web-design-engineer` | Design engineering e auditoria visual de páginas e dashboards | MIT (LICENSE consultado) |
| [Elaya Design — AI Design Skills](https://github.com/elayadesign/ai-design-skills) | `landing-page-design` | Páginas públicas, marketing e conversão; adaptar com cautela para dashboards | MIT (LICENSE consultado) |
| [Jakub Krehel — skills](https://github.com/jakubkrehel/skills) | `better-interface`, `better-ui`, `better-layout`, `better-typography`, `better-colors`, `better-accessibility`, `interface-review`, `state-machine` | Revisão de interface, acessibilidade, layout e estados | MIT (LICENSE consultado) |
| [Meng To — Skills](https://github.com/MengTo/Skills) | `build-awwwards-quality-sites` | Referência para páginas de alto impacto visual; não aplicar automaticamente ao painel operacional | MIT (LICENSE consultado) |
| [Vercel Labs — agent-skills](https://github.com/vercel-labs/agent-skills) | `react-best-practices` | Performance React/Next.js, somente se esse for o stack | A Skill declara MIT no frontmatter; arquivo LICENSE na raiz não foi localizado na verificação realizada. Verificar licença no repositório antes de redistribuir. |

## Procedimento de incorporação
1. Abra o repositório oficial.
2. Baixe a pasta da Skill desejada integralmente, incluindo `SKILL.md` e referências locais exigidas.
3. Copie sem editar para `.agents/skills/upstream/<nome-da-skill>/`.
4. Preserve o frontmatter, nome, autoria, links, avisos e licença.
5. Salve a licença original em `.agents/skills/upstream/<nome-da-skill>/LICENSE` ou registre a localização oficial, conforme a licença.
6. Não misture o texto original com as regras locais. As regras de adaptação do projeto ficam neste pacote.
7. Registre versão, commit SHA e data de importação em `UPSTREAM_LOCK.json`.
8. Se não for possível confirmar licença e arquivos dependentes, mantenha somente o link de referência; não redistribua.

## Compatibilidade
O formato `SKILL.md` é Markdown portátil, mas o Google AI Studio Build pode não oferecer carregamento automático de diretórios de Skills. O `AGENTS.md` e a colagem explícita das instruções são a camada de compatibilidade.

## Observação
O conteúdo e as licenças podem mudar. Revalidar no repositório oficial antes de redistribuir ou publicar o pacote.
