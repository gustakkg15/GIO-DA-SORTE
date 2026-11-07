---
name: react-performance
description: Use only when the existing application uses React or Next.js and the task touches components, rendering, data fetching, or bundle performance.
---

# React Performance — Conditional

Esta Skill é condicional. Se o projeto não usar React/Next.js, não a aplique.

- Evite waterfalls de chamadas independentes; paralelize quando seguro.
- Evite re-renderizações por estado amplo ou props instáveis.
- Mantenha estado próximo do componente que o utiliza, exceto estado global realmente compartilhado.
- Faça cleanup de efeitos e subscriptions.
- Carregue componentes pesados sob demanda quando isso melhorar o caminho crítico.
- Evite dependências grandes para tarefas triviais.
- Meça antes e depois; não use memoização indiscriminadamente.
- Preserve acessibilidade e comportamento ao otimizar.
- Não introduza cache que possa servir dados privados ou estados de LIVE desatualizados.
- Não copie regras de React para outro framework.
