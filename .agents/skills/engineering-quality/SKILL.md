---
name: engineering-quality
description: Use for implementation, debugging, architecture, API, persistence, state management, refactoring, and maintainability.
---

# Engineering Quality

1. Descubra stack, versões e convenções no repositório.
2. Preserve contratos públicos e comportamento existente.
3. Mantenha separação entre UI, domínio, integração e persistência conforme arquitetura atual.
4. Valide entradas em fronteiras confiáveis.
5. Trate erros de rede, timeout, cancelamento, retry e concorrência.
6. Use idempotência em operações que possam ser repetidas.
7. Faça cleanup de listeners, subscriptions, timers e conexões.
8. Evite estado duplicado e fontes da verdade concorrentes.
9. Prefira mudanças pequenas e revisáveis.
10. Documente decisões não óbvias e limitações.

Antes de adicionar dependências, avalie se o stack já oferece solução adequada. Nunca invente comandos: confira scripts existentes em `package.json` ou equivalente.
