# Workflow — Mudança segura

## Antes
- [ ] Ler AGENTS.md e Skills aplicáveis.
- [ ] Inspecionar implementação atual.
- [ ] Reproduzir o comportamento/problema.
- [ ] Mapear contratos, dados e integrações.
- [ ] Identificar riscos e plano de rollback.
- [ ] Definir testes de regressão.

## Durante
- [ ] Alterar o menor conjunto possível de arquivos.
- [ ] Preservar APIs e formatos existentes.
- [ ] Não misturar refatoração ampla com correção funcional.
- [ ] Não remover feature ou dado existente.
- [ ] Tratar loading, erro, retry, offline e permissões.

## Depois
- [ ] Executar verificações disponíveis.
- [ ] Revisar diff e possíveis segredos.
- [ ] Verificar responsividade e acessibilidade se UI foi alterada.
- [ ] Validar fluxos críticos afetados.
- [ ] Documentar resultado e limitações.
