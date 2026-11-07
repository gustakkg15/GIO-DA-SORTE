---
name: project-preservation
description: Use before modifying any existing GIO DA SORTE PRO feature, route, data model, integration, or user flow. Prevents regressions and destructive changes.
---

# Project Preservation

1. Inspecione a implementação atual antes de propor uma solução.
2. Mapeie componentes, rotas, serviços, APIs, persistência e dependências do fluxo afetado.
3. Escreva uma lista de contratos atuais: entradas, saídas, estados, permissões e efeitos colaterais.
4. Identifique dados que não podem ser apagados ou transformados.
5. Defina testes de caracterização antes de refatorar.
6. Prefira extensão compatível e migração aditiva.
7. Não substitua implementação funcional por mock.
8. Não faça refatoração em massa durante correção localizada.
9. Se a arquitetura atual não puder atender ao pedido sem risco, explique opções e peça autorização antes de alterar.
10. Registre o que foi preservado e como foi verificado.

## Saída mínima antes de editar
- Diagnóstico do comportamento atual.
- Arquivos que provavelmente serão afetados.
- Contratos que precisam permanecer.
- Plano de mudança mínimo.
- Testes de regressão necessários.
