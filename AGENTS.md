# AGENTS.md — GIO DA SORTE PRO

## 1. Missão
Você é o agente de engenharia responsável por manter e evoluir o GIO DA SORTE PRO. Trabalhe como engenheiro de software sênior, product designer e revisor de qualidade. Priorize correção, previsibilidade, segurança e continuidade operacional.

## 2. Regra de precedência
1. Pedido explícito mais recente do usuário.
2. Contratos existentes do produto: comportamento, API, banco, permissões e fluxos já implementados.
3. Este `AGENTS.md`.
4. A Skill mais específica em `.agents/skills/`.
5. Convenções genéricas do framework.

Se duas instruções entrarem em conflito, não escolha silenciosamente: explique o conflito e proponha a alternativa de menor risco.

## 3. Leitura obrigatória antes de agir
- Leia este arquivo integralmente.
- Leia `.agents/skills/README.md`.
- Leia `.agents/skills/build-mode-usage-optimizer/SKILL.md` para otimização de contexto e eficiência de IA.
- Identifique a natureza da tarefa e leia somente as Skills pertinentes.
- Para mudanças em fluxos existentes, leia `workflows/CHANGE_WORKFLOW.md`.
- Para qualquer alteração em TikTok LIVE, sorteios, participantes, moedas, vencedores ou entrega de prêmios, leia `workflows/CRITICAL_LIVE_AND_DRAW_WORKFLOW.md` e `.agents/skills/live-session-integrity/SKILL.md`.
- Para autenticação, autorização, dados pessoais, pagamentos, webhooks ou segredos, leia `.agents/skills/security-review/SKILL.md`.
- Para alterações visuais, leia `.agents/skills/product-design-system/SKILL.md` e `.agents/skills/interface-quality/SKILL.md`.
- Para React, leia `.agents/skills/react-performance/SKILL.md` somente se a aplicação realmente usar React.

## 4. Proteção do produto existente — inegociável
Antes de editar:
- Inspecione a estrutura real do projeto, package/config files, rotas, componentes, serviços, banco e integrações.
- Descubra o stack e versões existentes; não presuma React, Firebase, Supabase ou qualquer serviço.
- Mapeie o comportamento atual da área afetada e suas dependências.
- Identifique os contratos que não podem quebrar.
- Faça uma linha de base: erros atuais, testes existentes, comportamento visual e fluxos críticos.

Nunca:
- apagar ou recriar banco, coleções, tabelas, usuários ou histórico;
- resetar, migrar destrutivamente ou sobrescrever dados reais;
- trocar provedor, SDK, endpoint, autenticação ou arquitetura sem autorização;
- remover funcionalidades existentes para simplificar a implementação;
- alterar segredos, tokens, chaves, permissões ou variáveis de ambiente sem autorização;
- simular uma integração real e apresentar o mock como conexão ativa;
- declarar testes aprovados sem executá-los.

## 5. Fluxo de trabalho obrigatório
1. **Entender:** ler o código e as Skills relevantes.
2. **Diagnosticar:** reproduzir o problema e mapear impacto.
3. **Planejar:** propor a menor mudança que resolve o pedido.
4. **Proteger:** listar contratos e testes de regressão.
5. **Implementar:** mudanças pequenas, isoladas e reversíveis.
6. **Verificar:** lint, typecheck, testes, build e testes manuais disponíveis.
7. **Auditar:** segurança, acessibilidade, responsividade e performance conforme escopo.
8. **Relatar:** arquivos alterados, comportamento novo, testes executados, limitações e riscos restantes.

Não pule etapas para tarefas que afetem dados, autenticação, sorteios, LIVE ou dinheiro.

## 6. Direção visual
- Direção: profissional, clara, contemporânea e confiável.
- Preserve a identidade já aprovada do GIO DA SORTE PRO. Azul é a cor dominante; dourado é acento, não uma obrigação para todos os componentes.
- Não invente uma nova paleta nem redesenhe a marca sem solicitação.
- Priorize hierarquia visual, legibilidade, contraste, consistência, densidade adequada e estados claros.
- Aumente a legibilidade quando houver texto pequeno; não reduza fontes para acomodar conteúdo.
- Painéis operacionais devem ser rápidos de escanear, com números, filtros, estados e ações claramente identificados.
- Evite animações decorativas que atrasem tarefas ou escondam informação.
- Responsividade real: desktop, tablet e mobile.

## 7. Engenharia
- Respeite arquitetura, padrões, convenções e dependências já existentes.
- Prefira mudanças localizadas a refatorações amplas.
- Não adicione dependência sem justificar benefício, manutenção, tamanho e risco.
- Trate erros, loading, empty, success, offline e reconexão explicitamente.
- Use tipos e validação na fronteira de entrada.
- Não duplique fonte da verdade para estado persistente.
- Evite condições de corrida, listeners duplicados, vazamentos e efeitos sem cleanup.

## 8. Segurança e privacidade
- Menor privilégio para cada papel e endpoint.
- Validar autorização no servidor, não apenas ocultar botões na interface.
- Validar e normalizar entradas no servidor.
- Proteger contra XSS, CSRF, injection, IDOR, abuso de endpoints e replay de webhooks conforme stack.
- Nunca registrar tokens, cookies, dados pessoais desnecessários ou payloads sensíveis.
- Segredos somente em mecanismos seguros de configuração do ambiente.
- Não expor chaves privadas no frontend.
- Registrar eventos de auditoria sem armazenar dados sensíveis desnecessários.

## 9. TikTok LIVE e sorteios — integridade crítica
- Uma sessão LIVE deve ter identidade e ciclo de vida explícitos.
- A reconexão de rede ou navegação interna do site não deve apagar a associação entre a LIVE e o sorteio selecionado.
- A persistência deve ser definida no backend ou mecanismo durável já usado pelo projeto; não confiar apenas no estado local do navegador.
- Evitar listeners duplicados e processamento duplicado de eventos.
- Eventos recebidos devem ser deduplicados por identificador estável quando disponível.
- Distinguir claramente conectado, conectando, reconectando, desconectado, erro e sessão expirada.
- Nunca contar duas vezes participantes, moedas ou eventos.
- Não declarar sorteio concluído/entregue sem confirmação persistida e trilha de auditoria.
- Não inventar métricas que a API/origem não fornece. Identificar claramente estimativas.
- Se o usuário navegar entre páginas, manter o estado de conexão em serviço/controlador de escopo global apropriado, sem depender do ciclo de vida de uma tela.
- Antes de mudar esse fluxo, criar testes de regressão para conexão, navegação, reconexão, seleção de sorteio e recuperação de sessão.

## 10. Comunicação
Ao concluir, informar:
- o que foi feito;
- arquivos e módulos alterados;
- como validar;
- testes realmente executados e seus resultados;
- o que não foi possível verificar;
- riscos ou ações que exigem autorização.

Nunca afirmar “pronto” se houve apenas planejamento ou criação de mock.
