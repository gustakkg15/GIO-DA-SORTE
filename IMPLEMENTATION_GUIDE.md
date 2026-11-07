# Implementação no Google AI Studio Build

## Objetivo
Adicionar instruções operacionais ao projeto existente sem alterar o produto nesta etapa.

## Etapa 1 — Backup e inspeção
1. Abra o projeto GIO DA SORTE PRO no Google AI Studio Build.
2. Garanta uma versão recuperável do estado atual (controle de versão ou cópia de segurança).
3. Peça ao agente para identificar stack, estrutura, rotas, banco, autenticação e integrações.
4. Não permita que ele faça alterações funcionais durante essa inspeção.

Prompt sugerido:
> Faça somente uma inspeção read-only do projeto. Identifique stack, estrutura de diretórios, arquivo de entrada, rotas, serviços, persistência, autenticação, integração TikTok LIVE, módulos de sorteio e scripts de teste/build. Não edite arquivos nem execute migrações. Apresente um resumo e os riscos.

## Etapa 2 — Adicionar os arquivos
1. Adicione `AGENTS.md` na raiz do projeto.
2. Adicione a pasta `.agents/skills/` com as Skills deste pacote.
3. Adicione `workflows/` e `quality/`.
4. Adicione `UPSTREAM_SOURCES.md` e `UPSTREAM_LOCK.json`.
5. Se o Build não aceitar pastas ocultas, mantenha os arquivos em `project-guidance/` e ajuste os caminhos no `AGENTS.md`. O nome da pasta não é requisito funcional.

## Etapa 3 — Ensinar o agente a consultar as Skills
Cole no contexto do Build:

> Antes de qualquer tarefa neste repositório, leia o arquivo AGENTS.md na raiz. Para cada pedido, identifique a Skill aplicável em .agents/skills/README.md e leia o SKILL.md correspondente antes de agir. Leia os workflows obrigatórios para alterações em funcionalidades existentes e especialmente TikTok LIVE/sorteios. Se não conseguir acessar arquivos locais automaticamente, peça para eu fornecer o conteúdo relevante ou use o conteúdo já anexado ao contexto. Não afirme que uma Skill foi carregada se não a leu.

## Etapa 4 — Testar o mecanismo
Peça ao agente:
> Sem alterar o código, explique quais instruções e Skills você leu para esta tarefa. Resuma as cinco regras mais importantes de preservação do projeto e descreva como trataria uma mudança na conexão TikTok LIVE.

Se o agente não conseguir localizar os arquivos, forneça o `AGENTS.md` e as Skills pertinentes no contexto da conversa. Não presuma que o Build tenha suporte nativo a descoberta automática de Skills.

## Etapa 5 — Auditoria inicial
Depois da instalação documental, execute uma auditoria read-only:
- arquitetura e dependências;
- fluxos existentes;
- permissões e segurança;
- performance;
- responsividade e acessibilidade;
- TikTok LIVE e integridade de sorteios;
- testes existentes e lacunas.

A auditoria deve gerar relatório, não aplicar correções automaticamente.

## Etapa 6 — Ativar mudanças graduais
Somente depois de revisar a auditoria:
1. escolha um problema de baixo risco;
2. peça plano com arquivos afetados e testes;
3. aprove o plano;
4. implemente uma mudança pequena;
5. execute regressão;
6. revise o diff;
7. só então avance para o próximo item.

## Prompt de auditoria inicial (copiar e colar)
> Leia AGENTS.md e as Skills aplicáveis. Faça uma auditoria completa, mas estritamente read-only, do GIO DA SORTE PRO. Não altere código, dados, banco, credenciais, integrações nem configurações. Analise UX/UI profissional, acessibilidade, responsividade, arquitetura, qualidade de código, performance, segurança, autenticação/autorização, integração TikTok LIVE, persistência da sessão, associação com sorteios, deduplicação de eventos, métricas e testes de regressão. Para cada achado, informe severidade P0–P3, evidência concreta, arquivo/módulo, impacto, recomendação e teste de validação. Separe fatos verificados de hipóteses e não invente capacidades da API TikTok. Termine com um plano priorizado, sem executar nenhuma correção.

## Limitação importante
Este pacote fornece arquivos e instruções. Ele não instala os arquivos diretamente no workspace do Google AI Studio nem garante que o Build carregue Skills automaticamente. A instalação no projeto deve ser feita pelo usuário ou pelo agente dentro do próprio workspace, com confirmação explícita.
