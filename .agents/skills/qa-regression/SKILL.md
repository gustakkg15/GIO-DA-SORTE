---
name: qa-regression
description: Use before and after changes, especially for critical user flows, data, LIVE, draws, permissions, and releases.
---

# QA & Regression

1. Identifique testes existentes e comandos reais do projeto.
2. Crie ou atualize testes de caracterização para o comportamento que deve permanecer.
3. Teste o caminho feliz e falhas previsíveis.
4. Teste estados loading, empty, error, offline, reconnecting e success.
5. Teste permissões por papel, incluindo acesso negado.
6. Teste responsividade, teclado, foco e movimento reduzido para mudanças de UI.
7. Execute lint, typecheck, unit, integration, e2e e build somente se disponíveis.
8. Registre comandos executados e saída relevante.
9. Não marque teste não executado como aprovado.
10. Se não houver infraestrutura de teste, descreva o teste manual reproduzível e a limitação.

## Matriz crítica
- login/logout e sessão;
- navegação sem perda de conexão LIVE;
- reconexão sem duplicar eventos;
- persistência do sorteio escolhido;
- contagem sem duplicação;
- permissões e ações administrativas;
- seleção de vencedor e entrega;
- histórico e auditoria;
- mobile e desktop.
