# GIO DA SORTE PRO — Skills Pack para Google AI Studio Build

Pacote de instruções operacionais para orientar o agente de desenvolvimento do GIO DA SORTE PRO. O foco é evolução segura de um produto existente: preservar funcionalidades, dados, integrações e regras de sorteio enquanto melhora UX, interface, engenharia, performance, segurança e qualidade.

## Configuração escolhida
- Direção visual: **Professional**.
- Identidade: manter o sistema visual existente do GIO DA SORTE PRO; azul como cor dominante e dourado como acento quando já fizerem parte dos tokens oficiais. Não rebrandear nem substituir a logomarca.
- Engenharia, performance e segurança: ativadas.
- Auditoria e testes de regressão: ativados.
- Conteúdo de terceiros: manter fontes, autoria, licenças e arquivos originais sem alterações.

## Conteúdo
- `AGENTS.md`: instrução principal do agente.
- `.agents/skills/`: Skills específicas do projeto e adaptadores operacionais.
- `workflows/`: procedimentos para auditoria, mudanças, bugs e releases.
- `quality/`: critérios de aceite, matriz de regressão e checklist de segurança.
- `UPSTREAM_SOURCES.md`: catálogo de Skills externas, origem e situação de licença.
- `IMPLEMENTATION_GUIDE.md`: como instalar no Google AI Studio Build.

## Importante sobre Skills externas
Este pacote **não redistribui nem reescreve** os arquivos originais de terceiros. Ele registra as fontes oficiais e fornece instruções de integração específicas para o projeto. Para usar uma Skill externa, obtenha o arquivo original diretamente do repositório, preserve seu conteúdo, frontmatter, autoria e licença, e coloque-o na pasta indicada em `UPSTREAM_SOURCES.md`. Não remova avisos de copyright.

## Princípio de segurança
A primeira instalação deve ser somente documental. Não alterar código, banco, regras, credenciais, variáveis de ambiente, webhooks, integração TikTok LIVE ou dados reais durante a instalação das Skills.
