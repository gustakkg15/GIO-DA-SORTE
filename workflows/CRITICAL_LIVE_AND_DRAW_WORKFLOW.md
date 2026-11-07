# Workflow — TikTok LIVE e sorteios

Mudanças nesta área são de risco elevado.

1. Mapear conexão, SDK/API, autenticação, eventos, subscriptions e persistência.
2. Desenhar o ciclo de vida atual e o fluxo do sorteio selecionado.
3. Identificar o que ocorre ao navegar, atualizar a página, perder rede e reconectar.
4. Definir identificadores de sessão e de evento disponíveis na integração real.
5. Definir estratégia idempotente para eventos repetidos.
6. Preservar dados históricos e participantes.
7. Implementar em passos pequenos e com rollback.
8. Testar com ambiente de teste ou dados controlados antes de produção.

## Casos obrigatórios
- iniciar LIVE e vincular sorteio;
- navegar para outra área e voltar sem perder conexão;
- atualizar a tela e recuperar estado, se o produto promete essa capacidade;
- perda e retorno de rede;
- expiração de credencial;
- eventos duplicados e fora de ordem;
- sessão encerrada pelo host;
- sorteio entregue e encerramento persistido.

Não inferir métricas que a API não fornece. Não usar dados fictícios em relatórios reais.
