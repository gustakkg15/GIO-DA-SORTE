# Matriz de regressão

| Área | Cenário | Resultado esperado |
|---|---|---|
| Autenticação | Login e logout | Sessão e redirecionamento corretos |
| Permissões | Usuário sem permissão tenta ação restrita | Servidor nega a operação |
| Navegação | Trocar de página durante LIVE | Conexão e associação persistem |
| LIVE | Queda e retorno de rede | Reconexão controlada, sem duplicidade |
| Eventos | Mesmo evento recebido duas vezes | Uma única contabilização |
| Sorteio | Reabrir painel | Sorteio associado recuperado conforme regra |
| Participantes | Evento repetido ou fora de ordem | Contagem consistente |
| Métricas | Fonte não fornece uma métrica | Mostrar indisponível/estimada, não inventar |
| Vencedor | Seleção e confirmação | Critério e registro auditáveis |
| Entrega | Confirmar prêmio | Estado persistido e histórico mantido |
| Interface | Tela estreita/mobile | Ações essenciais acessíveis |
| Acessibilidade | Navegação por teclado | Foco visível e ordem lógica |
