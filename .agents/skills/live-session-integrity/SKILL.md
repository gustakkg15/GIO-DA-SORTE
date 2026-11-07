---
name: live-session-integrity
description: Mandatory for TikTok LIVE connection, reconnect, navigation persistence, selected draw binding, audience metrics, gifts/coins, participant events, winner selection, and prize delivery.
---

# LIVE Session & Draw Integrity

## Invariantes
- Uma sessão LIVE tem identificador estável, estado explícito e histórico de transições.
- A sessão e o sorteio associado não podem depender do componente visual atualmente montado.
- Navegar dentro do site não deve encerrar nem reiniciar a conexão.
- Reconexões não podem duplicar subscriptions nem reprocessar eventos já confirmados.
- Eventos devem ser deduplicados com chave de origem estável quando disponível.
- Participantes e métricas precisam de regra de contagem documentada.
- Métricas não fornecidas pela fonte devem ser marcadas como estimadas ou indisponíveis.
- Um sorteio precisa manter associação persistente até a entrega/encerramento confirmado, conforme regra do produto.
- Seleção de vencedor, confirmação e entrega precisam de trilha de auditoria.

## Máquina de estados sugerida
`idle → connecting → connected → reconnecting → connected`
Estados terminais/alternativos: `disconnected`, `error`, `expired`, `completed`.

Não imponha essa máquina sem primeiro mapear a implementação atual e a API usada.

## Checklist de implementação
1. Identificar o serviço que mantém a conexão e o ciclo de vida.
2. Confirmar se o estado sobrevive a troca de rota e re-render.
3. Confirmar persistência no backend ou armazenamento durável existente.
4. Implementar cleanup determinístico e reconexão com backoff limitado.
5. Evitar múltiplos listeners por sessão.
6. Persistir cursor/ID do último evento processado se a fonte suportar.
7. Tornar operações críticas idempotentes.
8. Separar contadores em tempo real, snapshots e agregados.
9. Confirmar que encerrar uma tela não encerra a sessão.
10. Testar queda de rede, refresh, navegação, retorno, token expirado e duplicação de evento.

## Proibições
- Não inventar suporte de API TikTok.
- Não simular conexão como se fosse real.
- Não selecionar ou declarar vencedor sem a lógica e autorização já existentes.
- Não apagar participantes ou histórico em reconexão.
- Não mudar critérios do sorteio sem autorização explícita.
