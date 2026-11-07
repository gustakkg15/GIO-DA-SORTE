---
name: ui-ux-pro-max
description: Engenharia de fluxos de usuário, redução de carga cognitiva, arquitetura de informação e padrões de UX SaaS de alta conversão para o GIO DA SORTE PRO.
license: MIT
origin: nextlevelbuilder/ui-ux-pro-max-skill
adapted_for: GIO DA SORTE PRO (SaaS de Sorteios e Lives)
---

# UI/UX Pro Max — GIO DA SORTE PRO

> **Origem:** Baseado no repositório open-source `nextlevelbuilder/ui-ux-pro-max-skill` (Licença MIT), adaptado para otimização de fluxos operacionais, conversão de planos PRO e redução de fricção em sorteios ao vivo no GIO DA SORTE PRO.

---

## 1. Princípios de Experiência do Usuário (UX) no GIO DA SORTE

O usuário típico do GIO DA SORTE está operando uma transmissão ao vivo no TikTok ou organizando sorteios sob pressão de tempo e atenção da audiência. Qualquer lentidão, confusão de botões ou erro de feedback gera estresse imediato.

Diretrizes obrigatórias:
1. **Zero Ambiguidade:** O estado atual (ex: Conectado, Conectando, Sorteando, Concluído) deve ser compreendido em menos de 1 segundo de relance.
2. **Prevenção de Ações Irreversíveis:** Ações destrutivas (ex: reiniciar sorteio, limpar lista de ganhadores) exigem diálogo modal de confirmação com visual explícito.
3. **Fluxos de Entrada Guiados (Steppers):** Processos complexos (configurar sorteio $\rightarrow$ coletar participantes $\rightarrow$ rodar sorteio $\rightarrow$ validar vencedor) devem ser sequenciais e transparentes.

---

## 2. Padrões de Alta Conversão para Funcionalidades PRO

### 2.1. O Princípio do Desbloqueio Suave (Value-First Gating)
- O usuário deve ver o valor da funcionalidade PRO antes de ser convidado a assinar.
- O card do recurso PRO (ex: Sorteador de Comentários, Roleta Avançada, Múltiplos Vencedores) deve exibir:
  - Título atraente e descrição clara do benefício.
  - Badge PRO elegante com cores violeta (`#8B7CFF`) e lavanda (`#C4B5FD`).
  - Botão de ação explícito: "Desbloquear com PRO" ou "Testar 3 Dias Grátis".
- **Preços Oficiais Intocáveis:**
  - Plano Mensal: **R$ 29,90/mês**
  - Plano Anual: **R$ 199,90/ano**
  - Período de teste: **3 dias grátis**

### 2.2. Modal de Upgrade Não Obstrutivo
- Ao clicar em um recurso bloqueado, apresente um modal contextual focado no recurso desejado, destacando os 3 dias gratuitos e garantia sem fidelidade.

---

## 3. Arquitetura de Informação para Dashboards Operacionais

### 3.1. Hierarquia de 3 Níveis de Informação
1. **Nível Superior (Status Global):** Status da conexão TikTok LIVE, perfil logado e plano atual.
2. **Nível Médio (Painel de Ação):** O sorteador ativo, inputs de parâmetros (número de vencedores, palavras-chave, moedas mínimas).
3. **Nível Inferior (Histórico e Log de Auditoria):** Últimos sorteios realizados, vencedores confirmados e exportação de resultados.

### 3.2. Feedback Imediato a Ações do Usuário (Optimistic + Confirmation)
- Clique em "Sortear": O botão muda instantaneamente para estado de processamento (`Carregando...`), o sorteador inicia a animação e o botão é desabilitado contra cliques duplos.
- Confirmação de Entrega de Prêmio: Toast ou badge com tempo de permanência de 4 segundos e opção de desfazer se aplicável.

---

## 4. Checklist UX Pro Max

- [ ] Toda tela principal possui um CTA (Call to Action) principal inconfundível?
- [ ] Usuários gratuitos entendem imediatamente quais recursos são PRO sem frustração?
- [ ] Os dados de sorteios passados estão visíveis e facilmente exportáveis?
- [ ] Mensagens de erro orientam como consertar o problema em vez de culpar o usuário?
- [ ] O fluxo operacional de sorteio pode ser executado inteiramente pelo teclado?
