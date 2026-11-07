import { db } from '../firebase.ts';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import type {
  LegalDocument,
  LegalDocumentSlug,
  LegalDocumentVersion,
  DocumentAcceptanceRecord,
  CookieConsentRecord,
  CookieConsentCategories,
  LgpdRequestRecord,
  LgpdRequestType,
  LgpdRequestStatus,
  SupportTicketRecord,
  SupportTicketCategory,
  SupportTicketStatus,
  CompanyLegalSettings,
  CommercialSubscriptionConfig,
  SubscriptionStatusState,
} from '../types.ts';

export const CURRENT_COOKIE_NOTICE_VERSION = '2025.1';

const STORAGE_KEYS = {
  LEGAL_DOCS: 'giodasorte_legal_docs_v1',
  LEGAL_VERSIONS: 'giodasorte_legal_versions_v1',
  ACCEPTANCES: 'giodasorte_doc_acceptances_v1',
  COOKIE_CONSENT: 'giodasorte_cookie_consent_v1',
  COOKIE_CONSENT_LOGS: 'giodasorte_cookie_logs_v1',
  LGPD_REQUESTS: 'giodasorte_lgpd_requests_v1',
  SUPPORT_TICKETS: 'giodasorte_support_tickets_v1',
  COMPANY_SETTINGS: 'giodasorte_company_settings_v1',
  COMMERCIAL_SETTINGS: 'giodasorte_commercial_settings_v1',
  SUBSCRIPTION_STATE: 'giodasorte_subscription_state_v1',
};

const BASE_TIMESTAMP = 1740787200000; // Initial publication reference

export const DEFAULT_COMPANY_SETTINGS: CompanyLegalSettings = {
  razaoSocial: '',
  nomeFantasia: 'GIO DA SORTE',
  cnpj: '',
  vatOrTaxId: '',
  enderecoEmpresarial: '',
  emailAtendimento: '',
  canalPrivacidade: '',
  representanteLegal: '',
  dpoEncarregado: '',
  telefoneOuContato: '',
  identificacaoOrganizador: '',
  updatedAt: BASE_TIMESTAMP,
  updatedBy: 'sistema',
};

export const DEFAULT_COMMERCIAL_CONFIG: CommercialSubscriptionConfig = {
  planName: 'GIO DA SORTE PRO (Mensal e Anual)',
  billingCycle: 'Mensal (1 mês) ou Anual (12 meses)',
  priceDisplay: 'R$ 29,90/mês ou R$ 199,90/ano (3 dias grátis)',
  currency: 'BRL',
  paymentMethodsInfo: 'Mercado Pago — Assinatura Recorrente',
  renewalPolicy:
    'Ambos os planos incluem 3 dias de teste gratuito para contas elegíveis (1 teste por UID). Após o término dos 3 dias, a assinatura é renovada automaticamente (R$ 29,90 a cada 1 mês no plano Mensal ou R$ 199,90 integral a cada 12 meses no plano Anual) até que seja cancelada.',
  cancellationPolicy:
    'O cancelamento pode ser feito a qualquer momento pelo próprio usuário, inclusive durante os 3 dias de teste. O envio do status "canceled" ao Mercado Pago interrompe todas as cobranças futuras, e o backend mantém o acesso PRO ativo até o término do período já concedido (trialEndDate ou currentPeriodEnd).',
  refundPolicySummary:
    'Nenhuma cobrança é realizada se o cancelamento ocorrer antes do fim dos 3 dias de teste gratuito. Solicitações de reembolso seguem o Código de Defesa do Consumidor e os termos vigentes.',
  delinquencyGracePeriodDays: 0,
  configuredByAdmin: true,
  updatedAt: BASE_TIMESTAMP,
  monthlyPrice: 29.90,
  annualPrice: 199.90,
  freeTrialDays: 3,
  trialOfferEnabled: true,
  priceVersion: 'v1.0.0',
  mpMonthlyPlanId: '',
  mpAnnualPlanId: '',
  mpPlansVerified: false,
  mpPlansVerifiedAt: null,
  activeCheckoutFlow: 'INDIVIDUAL_HOSTED_PREAPPROVAL',
  mpHomologationStatus: 'PENDING_CREDENTIALS',
  mpHomologationReport: null,
};

export const INITIAL_LEGAL_DOCUMENTS: LegalDocument[] = [
  {
    id: 'sobre-nos',
    slug: 'sobre-nos',
    title: 'Sobre Nós',
    subtitle: 'Conheça a missão, arquitetura de transparência e tecnologia do GIO DA SORTE',
    category: 'PLATAFORMA',
    version: '1.0.0',
    publishedAt: BASE_TIMESTAMP,
    updatedAt: BASE_TIMESTAMP,
    effectiveAt: BASE_TIMESTAMP,
    isMandatoryAcceptance: false,
    status: 'PUBLISHED',
    summary:
      'O GIO DA SORTE é uma plataforma tecnológica SaaS voltada à organização, contabilização proporcional por moedas, emissão auditável de bilhetes e realização de sorteios com verificação criptográfica SHA-256.',
    relatedSlugs: ['termos-de-uso', 'aviso-de-independencia-do-tiktok', 'politica-de-seguranca'],
    sections: [
      {
        id: 'missao',
        title: '1. Nossa Missão e Propósito',
        content:
          'O GIO DA SORTE foi desenvolvido para eliminar o trabalho manual, erros de planilha e incertezas na condução de sorteios interativos e transmissões ao vivo. Oferecemos ferramentas de contabilização automatizada, geração determinística e auditável de bilhetes e sorteio com prova criptográfica SHA-256.',
      },
      {
        id: 'funcionamento',
        title: '2. Como a Plataforma Funciona',
        content:
          'A plataforma disponibiliza motores dedicados para sorteios tradicionais (por moedas e bilhetes) e os módulos exclusivos do plano PRO (TIKTOK LIVE PRO e Sorteador de Comentários do TikTok), capazes de acompanhar eventos públicos de presentes em tempo real, converter moedas enviadas em bilhetes numerados individualmente, extrair comentários e congelar listas imutáveis antes de cada apuração.',
      },
      {
        id: 'compromisso',
        title: '3. Compromisso com Transparência e Auditabilidade',
        content:
          'Cada sorteio gera um snapshot imutável da lista de concorrentes elegíveis, acompanhado de hash SHA-256 e compromisso de semente (seed commitment) com entropia CSPRNG. Qualquer participante ou auditor pode verificar a integridade da rodada e exportar certificados em PDF.',
      },
    ],
  },
  {
    id: 'termos-de-uso',
    slug: 'termos-de-uso',
    title: 'Termos de Uso',
    subtitle: 'Regras contratuais de utilização da plataforma GIO DA SORTE',
    category: 'LEGAL',
    version: '1.0.0',
    publishedAt: BASE_TIMESTAMP,
    updatedAt: BASE_TIMESTAMP,
    effectiveAt: BASE_TIMESTAMP,
    isMandatoryAcceptance: true,
    status: 'PUBLISHED',
    summary:
      'Estabelece as condições gerais de acesso, responsabilidades dos organizadores, regras de uso dos planos FREE e PRO, limitações técnicas e obrigações de conformidade legal.',
    relatedSlugs: [
      'politica-de-privacidade',
      'politica-de-uso-aceitavel',
      'aviso-legal-e-isencao-de-responsabilidade',
    ],
    sections: [
      {
        id: 'objeto',
        title: '1. Objeto e Aceitação',
        content:
          'Estes Termos de Uso regulam o acesso e a utilização da plataforma GIO DA SORTE. Ao criar uma conta, conectar integrações ou utilizar qualquer funcionalidade, o usuário declara ter lido, compreendido e aceitado integralmente este instrumento.',
      },
      {
        id: 'responsabilidade-organizador',
        title: '2. Responsabilidade Exclusiva do Organizador',
        content:
          'O GIO DA SORTE fornece exclusivamente infraestrutura tecnológica de processamento e sorteio. O organizador da campanha ou transmissão é o único e exclusivo responsável pela definição das regras promocionais, obtenção de eventuais autorizações governamentais ou regulatórias exigidas em sua jurisdição, cumprimento da legislação aplicável e entrega efetiva dos prêmios prometidos aos participantes.',
      },
      {
        id: 'contas-e-seguranca',
        title: '3. Cadastro, Contas e Credenciais',
        content:
          'O usuário compromete-se a fornecer informações verdadeiras e manter a confidencialidade de suas credenciais de acesso. O uso de integrações com terceiros (como TikTok Login Kit) ocorre mediante autorização explícita do titular.',
      },
      {
        id: 'disponibilidade-e-limitacoes',
        title: '4. Disponibilidade Técnica e Serviços de Terceiros',
        content:
          'A captura de eventos em tempo real depende da estabilidade da rede do usuário e da disponibilidade das plataformas externas (como o TikTok). Oscilações externas, mudanças de protocolo de terceiros ou indisponibilidades de rede não geram dever de indenização por parte da plataforma.',
      },
    ],
  },
  {
    id: 'politica-de-privacidade',
    slug: 'politica-de-privacidade',
    title: 'Política de Privacidade e Proteção de Dados (LGPD)',
    subtitle: 'Transparência sobre coleta, finalidade, bases legais, retenção e direitos do titular',
    category: 'LEGAL',
    version: '1.0.0',
    publishedAt: BASE_TIMESTAMP,
    updatedAt: BASE_TIMESTAMP,
    effectiveAt: BASE_TIMESTAMP,
    isMandatoryAcceptance: true,
    status: 'PUBLISHED',
    summary:
      'Detalha quais dados pessoais são tratados pelo GIO DA SORTE, as finalidades operacionais e de auditoria, o tratamento de dados oriundos do TikTok e como exercer os direitos previstos na LGPD (Lei nº 13.709/2018).',
    relatedSlugs: [
      'politica-de-cookies',
      'politica-de-exclusao-de-conta-e-dados',
      'politica-de-seguranca',
    ],
    sections: [
      {
        id: 'dados-coletados',
        title: '1. Dados Coletados e Origem',
        content:
          'Coletamos apenas os dados estritamente necessários para a prestação do serviço: (a) Dados cadastrais do organizador (nome, e-mail, foto de perfil opcional); (b) Dados da integração opcional TikTok Login Kit (open_id, union_id, display_name, avatar_url) mediante autorização OAuth 2.0; (c) Dados públicos de eventos de participação em sorteios e transmissões (identificador técnico do remetente, apelido público, @username quando disponível no payload, presentes enviados, moedas contabilizadas e bilhetes emitidos).',
      },
      {
        id: 'finalidades-bases-legais',
        title: '2. Finalidades e Bases Legais de Tratamento',
        content:
          'O tratamento fundamenta-se na execução de contrato (prestação das ferramentas de sorteio e contabilização), no legítimo interesse (prevenção à fraude, deduplicação técnica e auditoria pública dos resultados dos sorteios) e no cumprimento de obrigação legal ou regulatória (guarda de registros de auditoria e aceites).',
      },
      {
        id: 'compartilhamento-seguranca',
        title: '3. Armazenamento, Criptografia e Compartilhamento',
        content:
          'Os dados são armazenados em infraestrutura segura Google Cloud / Firebase Firestore. Tokens de acesso OAuth 2.0 são protegidos no servidor com criptografia autenticada AES-256-GCM e jamais são expostos ao navegador. Não comercializamos dados pessoais com terceiros.',
      },
      {
        id: 'direitos-titular',
        title: '4. Direitos do Titular (LGPD)',
        content:
          'Por meio da área "Minha Privacidade", qualquer titular pode solicitar confirmação de tratamento, acesso, correção, portabilidade, informações sobre compartilhamento, revogação de consentimento e exclusão de dados (observadas as hipóteses legais de retenção obrigatória para auditoria de sorteios já concluídos).',
      },
    ],
  },
  {
    id: 'politica-de-cookies',
    slug: 'politica-de-cookies',
    title: 'Política de Cookies',
    subtitle: 'Uso de cookies, armazenamento local e gerenciamento de preferências de privacidade',
    category: 'LEGAL',
    version: '1.0.0',
    publishedAt: BASE_TIMESTAMP,
    updatedAt: BASE_TIMESTAMP,
    effectiveAt: BASE_TIMESTAMP,
    isMandatoryAcceptance: false,
    status: 'PUBLISHED',
    summary:
      'Explica como utilizamos cookies HTTP seguros e armazenamento local do navegador nas categorias Essenciais, Preferências, Estatísticas e Marketing.',
    relatedSlugs: ['politica-de-privacidade', 'politica-de-seguranca'],
    sections: [
      {
        id: 'categorias-cookies',
        title: '1. Categorias de Cookies e Tecnologias Similares',
        content:
          'Utilizamos quatro categorias claras: (1) Essenciais: indispensáveis para sessão segura OAuth (cookie HttpOnly, Secure, SameSite=None), autenticação, segurança CSRF e funcionamento básico do painel; (2) Preferências: salvam configurações de áudio, tema visual e layout; (3) Estatísticas: métricas agregadas de desempenho e latência; (4) Marketing: comunicações promocionais opcionais (desativadas por padrão).',
      },
      {
        id: 'gestao-consentimento',
        title: '2. Como Alterar suas Preferências a Qualquer Momento',
        content:
          'Você pode aceitar todos os cookies, rejeitar os não essenciais ou personalizar cada categoria no banner de consentimento ou clicando a qualquer momento no link permanente "Configurações de Cookies" localizado no rodapé de todas as páginas.',
      },
    ],
  },
  {
    id: 'politica-de-assinaturas-e-pagamentos',
    slug: 'politica-de-assinaturas-e-pagamentos',
    title: 'Política de Assinaturas e Pagamentos',
    subtitle: 'Condições comerciais dos planos FREE e PRO, ciclo de cobrança e estados da assinatura',
    category: 'TRANSPARENCIA',
    version: '1.0.0',
    publishedAt: BASE_TIMESTAMP,
    updatedAt: BASE_TIMESTAMP,
    effectiveAt: BASE_TIMESTAMP,
    isMandatoryAcceptance: true,
    status: 'PUBLISHED',
    summary:
      'Descreve os recursos compreendidos nos planos FREE e PRO, os estados de assinatura validados no backend e as regras aplicáveis a pagamentos e inadimplência.',
    relatedSlugs: ['politica-de-cancelamento-e-reembolso', 'termos-de-uso'],
    sections: [
      {
        id: 'comparativo-planos',
        title: '1. Estrutura dos Planos FREE e PRO',
        content:
          'O Plano FREE permite o uso dos sorteadores manuais (moedas e comentários) e a consulta permanente ao histórico de participantes, bilhetes e sorteios anteriores. O Plano PRO desbloqueia a conexão em tempo real com TikTok LIVE, contabilização automática de presentes, emissão atômica de bilhetes e campanhas acumuladas multi-LIVE.',
      },
      {
        id: 'estados-assinatura',
        title: '2. Estados da Assinatura e Validação no Servidor',
        content:
          'Toda permissão é validada diretamente no backend conforme o estado da conta: FREE (gratuito), PENDING (aguardando confirmação), ACTIVE (PRO ativo), PAST_DUE (pagamento em atraso), CANCELED (cancelada) e EXPIRED (expirada). Mesmo nos estados CANCELED, EXPIRED ou FREE, o usuário mantém acesso de leitura e exportação aos seus dados históricos.',
      },
      {
        id: 'valores-condicoes',
        title: '3. Valores e Condições Comerciais Vigentes',
        content:
          'Os valores, periodicidade e meios de pagamento aplicáveis são exclusivamente aqueles configurados oficialmente pelo administrador no painel comercial e apresentados de forma transparente antes da confirmação da contratação.',
      },
    ],
  },
  {
    id: 'politica-de-cancelamento-e-reembolso',
    slug: 'politica-de-cancelamento-e-reembolso',
    title: 'Política de Cancelamento e Reembolso',
    subtitle: 'Diretrizes para cancelamento de assinatura, preservação de histórico e solicitações de reembolso',
    category: 'TRANSPARENCIA',
    version: '1.0.0',
    publishedAt: BASE_TIMESTAMP,
    updatedAt: BASE_TIMESTAMP,
    effectiveAt: BASE_TIMESTAMP,
    isMandatoryAcceptance: false,
    status: 'PUBLISHED',
    summary:
      'Esclarece como solicitar o cancelamento da assinatura PRO, os efeitos sobre as funcionalidades ao vivo e a manutenção integral dos dados históricos.',
    relatedSlugs: ['politica-de-assinaturas-e-pagamentos', 'contato-e-suporte'],
    sections: [
      {
        id: 'cancelamento',
        title: '1. Cancelamento de Assinatura',
        content:
          'O assinante pode solicitar o cancelamento de sua assinatura a qualquer momento pelo painel de planos ou via Central de Suporte. O cancelamento impede novas cobranças recorrentes nos ciclos subsequentes.',
      },
      {
        id: 'preservacao-historico',
        title: '2. Preservação de Dados Após o Cancelamento',
        content:
          'O encerramento ou expiração do plano PRO bloqueia apenas novas conexões e automações em tempo real da TikTok LIVE. Todos os participantes registrados, bilhetes emitidos e certificados de sorteios passados permanecem preservados para consulta e exportação.',
      },
      {
        id: 'reembolso',
        title: '3. Direito de Arrependimento e Reembolsos',
        content:
          'Os pedidos de reembolso são analisados em conformidade com o Código de Defesa do Consumidor (incluindo o prazo legal de 7 dias quando aplicável) e com os parâmetros comerciais vigentes registrados na plataforma.',
      },
    ],
  },
  {
    id: 'regulamento-de-sorteios-e-campanhas',
    slug: 'regulamento-de-sorteios-e-campanhas',
    title: 'Regulamento Geral de Sorteios e Campanhas',
    subtitle: 'Padrões técnicos de emissão de bilhetes, congelamento SHA-256, apuração CSPRNG e governança de campanhas',
    category: 'TRANSPARENCIA',
    version: '1.0.0',
    publishedAt: BASE_TIMESTAMP,
    updatedAt: BASE_TIMESTAMP,
    effectiveAt: BASE_TIMESTAMP,
    isMandatoryAcceptance: false,
    status: 'PUBLISHED',
    summary:
      'Define a metodologia técnica de conversão de moedas em bilhetes, tratamento de combos, congelamento de snapshot imutável e estrutura obrigatória dos regulamentos individuais de cada campanha.',
    relatedSlugs: ['politica-antifraude', 'aviso-legal-e-isencao-de-responsabilidade'],
    sections: [
      {
        id: 'conversao-moedas-bilhetes',
        title: '1. Contabilização de Moedas e Emissão de Bilhetes',
        content:
          'Nos sorteios da TikTok LIVE, são contabilizadas exclusivamente as moedas nominais enviadas pelo participante no evento do presente (multiplicadas pelo delta real de repetições/combos). A cada múltiplo atingido conforme a taxa configurada na sessão ou campanha, o sistema emite bilhetes sequenciais exclusivos de forma atômica e idempotente, mantendo o saldo residual (carryover) para envios futuros na mesma sessão.',
      },
      {
        id: 'congelamento-sorteio',
        title: '2. Snapshot Imutável SHA-256 e Apuração CSPRNG',
        content:
          'Antes da realização de qualquer sorteio (Motor 1 por LIVE ou Motor 2 em Campanhas Acumuladas), a lista de bilhetes elegíveis é congelada em um snapshot com hash criptográfico SHA-256. O bilhete vencedor é selecionado por gerador de números pseudoaleatórios criptograficamente seguro (CSPRNG), gerando certificado auditável.',
      },
      {
        id: 'regulamento-individual',
        title: '3. Regulamento Individual e Status Legal por Campanha',
        content:
          'Cada campanha possui ficha regulamentar própria contendo identificação do organizador, período de participação, critérios de elegibilidade, prêmios, forma de divulgação, procedimento de contestação e status documental ("Pendente de análise", "Documentação pendente", "Aguardando autorização", "Autorizada, após validação documental", "Não autorizada" ou "Encerrada"). O sistema jamais exibe selo de autorização legal sem validação documental efetiva.',
      },
    ],
  },
  {
    id: 'politica-antifraude',
    slug: 'politica-antifraude',
    title: 'Política Antifraude e Integridade de Eventos',
    subtitle: 'Mecanismos de deduplicação técnica, prevenção a manipulação e auditoria de eventos',
    category: 'TRANSPARENCIA',
    version: '1.0.0',
    publishedAt: BASE_TIMESTAMP,
    updatedAt: BASE_TIMESTAMP,
    effectiveAt: BASE_TIMESTAMP,
    isMandatoryAcceptance: false,
    status: 'PUBLISHED',
    summary:
      'Apresenta os controles técnicos contra duplicação de transações, adulteração de listas de concorrentes, falsificação de cursores SSE e manipulação de sorteios.',
    relatedSlugs: ['regulamento-de-sorteios-e-campanhas', 'politica-de-seguranca'],
    sections: [
      {
        id: 'idempotencia-eventos',
        title: '1. Deduplicação Técnica e Idempotência no Firestore',
        content:
          'Todo evento de presente recebido passa por validação de chave canônica (priorizando msgId/transactionId/eventId original do TikTok ou assinatura técnica determinística). Retransmissões de rede são bloqueadas automaticamente antes de gerar moedas ou bilhetes duplicados, enquanto múltiplos presentes legítimos do mesmo usuário são integralmente contabilizados.',
      },
      {
        id: 'protecao-sorteio',
        title: '2. Inviolabilidade da Lista Congelada',
        content:
          'Uma vez congelado o snapshot para sorteio, nenhum bilhete pode ser inserido, alterado ou removido daquela fotografia sem invalidar o hash SHA-256 público registrado no log de auditoria.',
      },
    ],
  },
  {
    id: 'politica-de-exclusao-de-conta-e-dados',
    slug: 'politica-de-exclusao-de-conta-e-dados',
    title: 'Política de Exclusão de Conta e Dados',
    subtitle: 'Procedimentos para encerramento de conta, revogação OAuth e regras de retenção legal',
    category: 'LEGAL',
    version: '1.0.0',
    publishedAt: BASE_TIMESTAMP,
    updatedAt: BASE_TIMESTAMP,
    effectiveAt: BASE_TIMESTAMP,
    isMandatoryAcceptance: false,
    status: 'PUBLISHED',
    summary:
      'Orienta como solicitar a exclusão de dados pessoais e desconexão de contas, esclarecendo quais registros técnicos precisam ser retidos para integridade de sorteios já auditados.',
    relatedSlugs: ['politica-de-privacidade', 'contato-e-suporte'],
    sections: [
      {
        id: 'como-solicitar',
        title: '1. Solicitação de Exclusão e Revogação imediata de OAuth',
        content:
          'O usuário pode revogar sua sessão TikTok OAuth 2.0 instantaneamente pelo botão "Desconectar / Revogar OAuth" no painel (o que exclui imediatamente o token criptografado do Firestore) e pode protocolar pedido de exclusão de dados na aba "Minha Privacidade".',
      },
      {
        id: 'retencao-legal-auditoria',
        title: '2. Preservação de Registros Obrigatórios e Auditoria',
        content:
          'Em conformidade com o art. 16 da LGPD, solicitações de exclusão passam por fluxo administrativo para assegurar que registros estritamente necessários ao cumprimento de obrigação legal, defesa em processos ou comprovação de integridade de sorteios públicos já realizados não sejam apagados indevidamente.',
      },
    ],
  },
  {
    id: 'aviso-de-independencia-do-tiktok',
    slug: 'aviso-de-independencia-do-tiktok',
    title: 'Aviso de Independência do TikTok',
    subtitle: 'Declaração oficial de não afiliação societária e transparência técnica sobre integrações',
    category: 'TRANSPARENCIA',
    version: '1.0.0',
    publishedAt: BASE_TIMESTAMP,
    updatedAt: BASE_TIMESTAMP,
    effectiveAt: BASE_TIMESTAMP,
    isMandatoryAcceptance: false,
    status: 'PUBLISHED',
    summary:
      'Esclarece que o GIO DA SORTE é uma plataforma independente, não afiliada nem endossada pelo TikTok / ByteDance, e detalha a separação técnica entre Login Kit OAuth 2.0 e captura Webcast.',
    relatedSlugs: ['sobre-nos', 'termos-de-uso', 'aviso-legal-e-isencao-de-responsabilidade'],
    sections: [
      {
        id: 'independencia-institucional',
        title: '1. Plataforma Independente',
        content:
          'O GIO DA SORTE é um software independente e não é afiliado, patrocinado, administrado ou endossado pelo TikTok Inc., ByteDance Ltd. ou qualquer uma de suas subsidiárias. A marca TikTok é propriedade exclusiva de seus respectivos titulares.',
      },
      {
        id: 'separacao-oauth-webcast',
        title: '2. Separação Técnica entre Login Kit (OAuth 2.0) e Captura LIVE (Webcast)',
        content:
          'A autenticação via TikTok Login Kit (OAuth 2.0 com escopo user.info.basic) destina-se exclusivamente a identificar a conta do organizador no painel. O escopo user.info.basic não fornece acesso oficial a eventos de presentes da LIVE. A leitura de presentes em tempo real no módulo TIKTOK LIVE PRO ocorre de forma independente por meio de conexão à sala pública Webcast da transmissão informada pelo organizador.',
      },
    ],
  },
  {
    id: 'aviso-legal-e-isencao-de-responsabilidade',
    slug: 'aviso-legal-e-isencao-de-responsabilidade',
    title: 'Aviso Legal e Isenção de Responsabilidade',
    subtitle: 'Limites de responsabilidade da plataforma tecnológica perante sorteios e terceiros',
    category: 'LEGAL',
    version: '1.0.0',
    publishedAt: BASE_TIMESTAMP,
    updatedAt: BASE_TIMESTAMP,
    effectiveAt: BASE_TIMESTAMP,
    isMandatoryAcceptance: false,
    status: 'PUBLISHED',
    summary:
      'Delimita a atuação do GIO DA SORTE como provedor de tecnologia e reforça as obrigações legais e promocionais cabíveis a cada organizador.',
    relatedSlugs: ['termos-de-uso', 'regulamento-de-sorteios-e-campanhas'],
    sections: [
      {
        id: 'natureza-tecnologica',
        title: '1. Natureza Estritamente Tecnológica do Serviço',
        content:
          'O GIO DA SORTE atua exclusivamente como ferramenta de software para contabilização e sorteio. A plataforma não promove, patrocina, arrecada valores de participantes nem realiza a entrega de prêmios em nome dos organizadores.',
      },
      {
        id: 'conformidade-regulatoria',
        title: '2. Conformidade Regulatória de Campanhas Promocionais',
        content:
          'Cabe integralmente ao organizador verificar a necessidade de autorização prévia junto aos órgãos competentes (como SPA/MF ou equivalentes locais) antes de divulgar ou executar campanhas promocionais.',
      },
    ],
  },
  {
    id: 'politica-de-uso-aceitavel',
    slug: 'politica-de-uso-aceitavel',
    title: 'Política de Uso Aceitável',
    subtitle: 'Condutas permitidas e práticas vedadas na utilização da plataforma',
    category: 'LEGAL',
    version: '1.0.0',
    publishedAt: BASE_TIMESTAMP,
    updatedAt: BASE_TIMESTAMP,
    effectiveAt: BASE_TIMESTAMP,
    isMandatoryAcceptance: false,
    status: 'PUBLISHED',
    summary:
      'Estabelece as regras de conduta ética e técnica para utilização dos motores de sorteio, APIs e integrações do GIO DA SORTE.',
    relatedSlugs: ['termos-de-uso', 'politica-antifraude'],
    sections: [
      {
        id: 'condutas-vedadas',
        title: '1. Práticas Expressamente Proibidas',
        content:
          'É estritamente proibido: (a) utilizar a plataforma para fins ilícitos, fraudulentos ou enganosos; (b) tentar manipular payloads de eventos, cursores SSE ou snapshots de sorteio; (c) realizar ataques de negação de serviço ou automações abusivas contra as rotas da API; (d) induzir participantes em erro quanto às regras de conversão de moedas em bilhetes.',
      },
      {
        id: 'medidas-administrativas',
        title: '2. Suspensão e Bloqueio Preventivo',
        content:
          'Contas que violem esta Política de Uso Aceitável estão sujeitas à suspensão imediata das funcionalidades ao vivo, preservação de logs para auditoria e comunicação às autoridades competentes quando cabível.',
      },
    ],
  },
  {
    id: 'politica-de-seguranca',
    slug: 'politica-de-seguranca',
    title: 'Política de Segurança da Informação',
    subtitle: 'Controles criptográficos, proteção de sessões, regras Firestore e resposta a incidentes',
    category: 'TRANSPARENCIA',
    version: '1.0.0',
    publishedAt: BASE_TIMESTAMP,
    updatedAt: BASE_TIMESTAMP,
    effectiveAt: BASE_TIMESTAMP,
    isMandatoryAcceptance: false,
    status: 'PUBLISHED',
    summary:
      'Descreve a arquitetura de segurança aplicada no GIO DA SORTE, incluindo AES-256-GCM para tokens OAuth, validação de origem CSRF, isolamento de coleções no Firestore e fila durável WAL.',
    relatedSlugs: ['politica-de-privacidade', 'politica-antifraude'],
    sections: [
      {
        id: 'criptografia-oauth',
        title: '1. Criptografia Autenticada AES-256-GCM e Proteção de Credenciais',
        content:
          'As chaves secretas (TIKTOK_CLIENT_SECRET e OAUTH_ENCRYPTION_KEY) residem exclusivamente no ambiente de servidor. Todos os tokens OAuth são cifrados com AES-256-GCM (IV aleatório de 96 bits e AuthTag de 128 bits) antes da gravação na coleção privada do Firestore, inacessível pelo cliente.',
      },
      {
        id: 'protecao-transporte-sessao',
        title: '2. Cookies Seguros, PKCE e Validação de Origem',
        content:
          'O fluxo de autorização utiliza parâmetro state criptográfico de uso único com TTL de 10 minutos, PKCE S256 e cookies HttpOnly, Secure e SameSite=None para compatibilidade segura em contexto iframe HTTPS.',
      },
      {
        id: 'resiliencia-sse-wal',
        title: '3. Recuperação Durável SSE e Write-Ahead Log (WAL)',
        content:
          'Para evitar perda de eventos em transmissões de alta volumetria, o sistema opera com Write-Ahead Log (WAL), fila durável no Firestore e retomada automática de eventos SSE via cursor autenticado por sessão.',
      },
    ],
  },
  {
    id: 'central-de-ajuda',
    slug: 'central-de-ajuda',
    title: 'Central de Ajuda e Tutoriais',
    subtitle: 'Guias passo a passo e respostas rápidas para operar o GIO DA SORTE sem dificuldades',
    category: 'SUPORTE',
    version: '1.0.0',
    publishedAt: BASE_TIMESTAMP,
    updatedAt: BASE_TIMESTAMP,
    effectiveAt: BASE_TIMESTAMP,
    isMandatoryAcceptance: false,
    status: 'PUBLISHED',
    summary:
      'Reúne tutoriais práticos sobre conexão com TikTok LIVE, configuração de conversão de moedas em bilhetes, campanhas acumuladas multi-LIVE, congelamento SHA-256 e gestão de planos.',
    relatedSlugs: ['contato-e-suporte', 'regulamento-de-sorteios-e-campanhas'],
    sections: [
      {
        id: 'guia-tiktok-live',
        title: '1. Guia de Integração com TikTok (LIVE Webcast vs. Login Kit)',
        content:
          'Para capturar presentes ao vivo: acesse a aba "TikTok LIVE Pro", digite o @username do criador que está em transmissão ao vivo e clique em "Conectar TikTok LIVE". Não é necessário informar senha da conta. Caso deseje vincular sua identidade oficial de organizador, utilize o botão opcional "Conectar com TikTok (OAuth 2.0)".',
      },
      {
        id: 'guia-criacao-sorteio',
        title: '2. Como Configurar o Sorteio e a Conversão de Moedas em Bilhetes',
        content:
          'No card "Configuração do Sorteio da LIVE", defina quantas moedas enviadas equivalem a 1 bilhete (ex: 100 moedas = 1 bilhete), o mínimo por presente e eventuais limites por participante. Sempre que um participante enviar presentes na LIVE, o sistema somará as moedas enviadas, emitirá os bilhetes automaticamente e guardará o saldo residual (carryover) para o próximo presente.',
      },
      {
        id: 'guia-campanha-acumulada',
        title: '3. Como Funciona a Campanha Acumulada Multi-LIVE (Motor 2)',
        content:
          'Se você realiza várias transmissões durante a semana ou mês e deseja fazer um grande sorteio final somando todas as participações, acesse a aba "3. Campanhas Acumuladas Multi-LIVE", crie a campanha informando o regulamento individual e clique em "+ Acumular LIVE" para importar os bilhetes das sessões sem duplicação.',
      },
      {
        id: 'guia-assinatura',
        title: '4. Guia de Planos FREE e PRO',
        content:
          'Na aba "Planos & Assinatura", você visualiza o estado atual da sua conta (FREE, PENDING, ACTIVE, PAST_DUE, CANCELED ou EXPIRED). Seus dados históricos permanecem sempre disponíveis na aba de Auditoria e Participantes.',
      },
    ],
  },
  {
    id: 'contato-e-suporte',
    slug: 'contato-e-suporte',
    title: 'Contato, Suporte Técnico e Canal de Privacidade',
    subtitle: 'Abra chamados com protocolo rastreável, relate erros ou contate o encarregado de dados',
    category: 'SUPORTE',
    version: '1.0.0',
    publishedAt: BASE_TIMESTAMP,
    updatedAt: BASE_TIMESTAMP,
    effectiveAt: BASE_TIMESTAMP,
    isMandatoryAcceptance: false,
    status: 'PUBLISHED',
    summary:
      'Canal oficial para abertura de chamados técnicos, dúvidas operacionais, relato de bugs e atendimento de solicitações jurídicas ou de privacidade com geração de protocolo único.',
    relatedSlugs: ['central-de-ajuda', 'politica-de-privacidade'],
    sections: [
      {
        id: 'atendimento-protocolo',
        title: '1. Atendimento com Geração de Protocolo',
        content:
          'Todas as solicitações enviadas pelo formulário de Suporte ou pela área "Minha Privacidade" recebem um número de protocolo único imediato e ficam salvas no seu histórico para acompanhamento de status e resposta da administração.',
      },
      {
        id: 'relato-erros',
        title: '2. Relato de Problemas Técnicos (Bug Report)',
        content:
          'Ao relatar um problema técnico durante uma transmissão ou sorteio, informe o ID da sessão LIVE (ex: live_principal) e o horário aproximado do evento para que nossa equipe possa auditar os logs de diagnóstico.',
      },
    ],
  },
];

export interface HelpFaqItem {
  id: string;
  category: string;
  question: string;
  answer: string;
}

export const HELP_FAQ_ITEMS: HelpFaqItem[] = [
  {
    id: 'faq-1',
    category: 'TikTok LIVE & Presentes',
    question: 'Por que o mesmo participante pode enviar vários presentes seguidos e todos são contabilizados?',
    answer:
      'Porque o GIO DA SORTE utiliza identificação individual por evento (eventId/msgId original ou assinatura técnica de alta precisão com delta de combo). A deduplicação bloqueia apenas retransmissões técnicas idênticas da rede, garantindo que cada Rosa, Leão ou combo legítimo enviado pelo mesmo usuário seja exibido no feed e gere moedas/bilhetes normalmente.',
  },
  {
    id: 'faq-2',
    category: 'TikTok LIVE & Presentes',
    question: 'Qual a diferença entre Moedas enviadas pelo participante e Diamantes do criador?',
    answer:
      'O sistema contabiliza estritamente o valor nominal em Moedas TikTok enviadas pelo participante no presente (multiplicado pela quantidade enviada no combo). Nunca confundimos moedas enviadas pelo público com diamantes internos ou ganhos financeiros líquidos do criador.',
  },
  {
    id: 'faq-3',
    category: 'TikTok LIVE & Presentes',
    question: 'O que acontece quando o TikTok não informa o @username do remetente no evento?',
    answer:
      'Quando o payload público não traz o @arroba válido, o sistema exibe claramente "Usuário não identificado (Arroba indisponível)", preserva o ID técnico estável do remetente quando existente e registra a limitação sem jamais inventar nomes ou identidades fictícias.',
  },
  {
    id: 'faq-4',
    category: 'Bilhetes & Sorteios',
    question: 'Como funciona o saldo residual (carryover) de moedas?',
    answer:
      'Se a taxa da LIVE é de 100 moedas por bilhete e o participante envia 150 moedas, ele recebe imediatamente 1 bilhete numerado e fica com 50 moedas de saldo residual acumulado na sessão. Quando enviar mais 50 moedas, receberá automaticamente o próximo bilhete.',
  },
  {
    id: 'faq-5',
    category: 'Planos & Histórico',
    question: 'Se minha assinatura PRO expirar ou for cancelada, perco a lista de participantes e sorteios passados?',
    answer:
      'Não. O plano FREE ou expirado bloqueia apenas novas conexões e automações em tempo real da TikTok LIVE. Todo o seu histórico de participantes, bilhetes emitidos e certificados de sorteios realizados permanece liberado para consulta e exportação CSV/JSON/PDF.',
  },
  {
    id: 'faq-6',
    category: 'Privacidade & LGPD',
    question: 'Como posso exercer meus direitos da LGPD ou revogar o acesso do TikTok Login Kit?',
    answer:
      'Você pode revogar o TikTok Login Kit a qualquer instante clicando em "Desconectar / Revogar OAuth" na aba TikTok LIVE Pro, ou abrir uma solicitação formal com número de protocolo na aba "Minha Privacidade (LGPD)" dentro da Central Legal e de Confiança.',
  },
];

const serverMemoryStore = new Map<string, string>();
const isBrowserRuntime = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

function safeReadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = isBrowserRuntime ? localStorage.getItem(key) : serverMemoryStore.get(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWriteLocal<T>(key: string, value: T): void {
  try {
    const serialized = JSON.stringify(value);
    if (isBrowserRuntime) {
      localStorage.setItem(key, serialized);
    } else {
      serverMemoryStore.set(key, serialized);
    }
  } catch {}
}

export function generateProtocolNumber(prefix: 'LGPD' | 'SUP'): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${y}${m}${d}-${rand}`;
}

// ==========================================
// 1. LEGAL DOCUMENTS & VERSION MANAGEMENT
// ==========================================

export async function fetchAllLegalDocuments(): Promise<LegalDocument[]> {
  const localDocs = safeReadLocal<LegalDocument[]>(STORAGE_KEYS.LEGAL_DOCS, []);
  const mergedMap = new Map<LegalDocumentSlug, LegalDocument>();

  for (const docItem of INITIAL_LEGAL_DOCUMENTS) {
    mergedMap.set(docItem.slug, docItem);
  }
  for (const localItem of localDocs) {
    if (localItem && localItem.slug) {
      mergedMap.set(localItem.slug, localItem);
    }
  }

  if (isBrowserRuntime) {
    try {
      const res = await fetch('/api/legal/documents');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.documents)) {
          for (const srvDoc of data.documents as LegalDocument[]) {
            if (srvDoc && srvDoc.slug) {
              mergedMap.set(srvDoc.slug, srvDoc);
            }
          }
        }
      }
    } catch {}
  }

  try {
    const snap = await getDocs(collection(db, 'legal_documents'));
    snap.forEach((docSnap) => {
      const data = docSnap.data() as LegalDocument;
      if (data && data.slug) {
        mergedMap.set(data.slug, data);
      }
    });
  } catch {}

  const result = Array.from(mergedMap.values());
  safeWriteLocal(STORAGE_KEYS.LEGAL_DOCS, result);
  return result;
}

export async function saveLegalDocumentDraft(
  slug: LegalDocumentSlug,
  draftVersion: string,
  draftSummary: string,
  draftSections: { id: string; title: string; content: string }[]
): Promise<LegalDocument> {
  const docs = await fetchAllLegalDocuments();
  const existing = docs.find((d) => d.slug === slug) || INITIAL_LEGAL_DOCUMENTS.find((d) => d.slug === slug)!;

  const updated: LegalDocument = {
    ...existing,
    updatedAt: Date.now(),
    draftContent: {
      version: draftVersion.trim() || existing.version,
      summary: draftSummary.trim() || existing.summary,
      sections: draftSections,
      savedAt: Date.now(),
    },
  };

  const nextDocs = docs.map((d) => (d.slug === slug ? updated : d));
  safeWriteLocal(STORAGE_KEYS.LEGAL_DOCS, nextDocs);

  try {
    await setDoc(doc(db, 'legal_documents', slug), updated, { merge: true });
  } catch {}

  if (isBrowserRuntime && updated.draftContent) {
    try {
      await fetch('/api/legal/documents/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-gio-admin-access': 'authorized' },
        body: JSON.stringify({
          slug,
          draftVersion: updated.draftContent.version,
          draftSummary: updated.draftContent.summary,
          draftSections: updated.draftContent.sections,
        }),
      });
    } catch {}
  }

  return updated;
}

export async function publishLegalDocumentVersion(
  slug: LegalDocumentSlug,
  newVersion: string,
  newSummary: string,
  newSections: { id: string; title: string; content: string }[],
  effectiveAt: number,
  isMandatoryAcceptance: boolean,
  publishedBy: string
): Promise<{ document: LegalDocument; versionRecord: LegalDocumentVersion }> {
  const docs = await fetchAllLegalDocuments();
  const existing = docs.find((d) => d.slug === slug) || INITIAL_LEGAL_DOCUMENTS.find((d) => d.slug === slug)!;
  const now = Date.now();

  // Archive previous version record first so published versions are immutable
  const prevVersionRecord: LegalDocumentVersion = {
    versionId: `${slug}_v_${existing.version.replace(/[^a-zA-Z0-9._-]/g, '_')}_${existing.updatedAt}`,
    documentId: slug,
    version: existing.version,
    title: existing.title,
    summary: existing.summary,
    sections: existing.sections,
    publishedAt: existing.publishedAt,
    effectiveAt: existing.effectiveAt,
    publishedBy: 'historico',
    archived: true,
  };

  const updatedDoc: LegalDocument = {
    ...existing,
    version: newVersion.trim(),
    summary: newSummary.trim(),
    sections: newSections,
    publishedAt: now,
    updatedAt: now,
    effectiveAt: effectiveAt || now,
    isMandatoryAcceptance,
    status: 'PUBLISHED',
    draftContent: null,
  };

  const newVersionRecord: LegalDocumentVersion = {
    versionId: `${slug}_v_${newVersion.trim().replace(/[^a-zA-Z0-9._-]/g, '_')}_${now}`,
    documentId: slug,
    version: newVersion.trim(),
    title: updatedDoc.title,
    summary: updatedDoc.summary,
    sections: updatedDoc.sections,
    publishedAt: now,
    effectiveAt: effectiveAt || now,
    publishedBy: publishedBy || 'admin',
    archived: false,
  };

  const nextDocs = docs.map((d) => (d.slug === slug ? updatedDoc : d));
  safeWriteLocal(STORAGE_KEYS.LEGAL_DOCS, nextDocs);

  const localVersions = safeReadLocal<LegalDocumentVersion[]>(STORAGE_KEYS.LEGAL_VERSIONS, []);
  const updatedVersions = [
    newVersionRecord,
    prevVersionRecord,
    ...localVersions.filter((v) => v.versionId !== prevVersionRecord.versionId),
  ];
  safeWriteLocal(STORAGE_KEYS.LEGAL_VERSIONS, updatedVersions);

  try {
    await setDoc(doc(db, 'legal_documents', slug), updatedDoc, { merge: true });
    await setDoc(doc(db, 'legal_document_versions', prevVersionRecord.versionId), prevVersionRecord, { merge: true });
    await setDoc(doc(db, 'legal_document_versions', newVersionRecord.versionId), newVersionRecord, { merge: true });
  } catch {}

  if (isBrowserRuntime) {
    try {
      await fetch('/api/legal/documents/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-gio-admin-access': 'authorized' },
        body: JSON.stringify({
          slug,
          newVersion: updatedDoc.version,
          newSummary: updatedDoc.summary,
          newSections: updatedDoc.sections,
          effectiveAt: updatedDoc.effectiveAt,
          isMandatoryAcceptance: updatedDoc.isMandatoryAcceptance,
          publishedBy,
        }),
      });
    } catch {}
  }

  return { document: updatedDoc, versionRecord: newVersionRecord };
}

export async function fetchDocumentVersionHistory(slug?: LegalDocumentSlug): Promise<LegalDocumentVersion[]> {
  const localVersions = safeReadLocal<LegalDocumentVersion[]>(STORAGE_KEYS.LEGAL_VERSIONS, []);
  const map = new Map<string, LegalDocumentVersion>();

  for (const v of localVersions) {
    if (!slug || v.documentId === slug) {
      map.set(v.versionId, v);
    }
  }

  try {
    const snap = await getDocs(collection(db, 'legal_document_versions'));
    snap.forEach((d) => {
      const data = d.data() as LegalDocumentVersion;
      if (data && data.versionId && (!slug || data.documentId === slug)) {
        map.set(data.versionId, data);
      }
    });
  } catch {}

  return Array.from(map.values()).sort((a, b) => b.publishedAt - a.publishedAt);
}

// ==========================================
// 2. DOCUMENT ACCEPTANCE TRACKING (FASE 11)
// ==========================================

export async function recordDocumentAcceptance(params: {
  userId: string;
  userEmail?: string;
  documentId: LegalDocumentSlug;
  version: string;
  context: DocumentAcceptanceRecord['context'];
}): Promise<DocumentAcceptanceRecord> {
  const now = Date.now();
  const acceptanceId = `acc_${params.userId}_${params.documentId}_${params.version.replace(/[^a-zA-Z0-9]/g, '_')}_${now}`;

  const record: DocumentAcceptanceRecord = {
    acceptanceId,
    userId: params.userId || 'visitante',
    userEmail: params.userEmail || '',
    documentId: params.documentId,
    version: params.version,
    acceptedAt: now,
    context: params.context,
    technicalEvidence: {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'browser',
      origin: typeof window !== 'undefined' ? window.location.origin : '',
      timestampIso: new Date(now).toISOString(),
    },
  };

  const localList = safeReadLocal<DocumentAcceptanceRecord[]>(STORAGE_KEYS.ACCEPTANCES, []);
  safeWriteLocal(STORAGE_KEYS.ACCEPTANCES, [record, ...localList]);

  try {
    await setDoc(doc(db, 'document_acceptances', acceptanceId), record);
  } catch {}

  if (isBrowserRuntime) {
    try {
      await fetch('/api/legal/acceptances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
    } catch {}
  }

  return record;
}

export async function fetchAllDocumentAcceptances(userId?: string): Promise<DocumentAcceptanceRecord[]> {
  const localList = safeReadLocal<DocumentAcceptanceRecord[]>(STORAGE_KEYS.ACCEPTANCES, []);
  const map = new Map<string, DocumentAcceptanceRecord>();

  for (const item of localList) {
    if (!userId || item.userId === userId) {
      map.set(item.acceptanceId, item);
    }
  }

  if (isBrowserRuntime) {
    try {
      const res = await fetch(`/api/legal/acceptances${userId ? `?userId=${encodeURIComponent(userId)}` : ''}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.acceptances)) {
          for (const acc of data.acceptances as DocumentAcceptanceRecord[]) {
            if (!userId || acc.userId === userId) {
              map.set(acc.acceptanceId, acc);
            }
          }
        }
      }
    } catch {}
  }

  try {
    const snap = await getDocs(collection(db, 'document_acceptances'));
    snap.forEach((d) => {
      const data = d.data() as DocumentAcceptanceRecord;
      if (data && data.acceptanceId && (!userId || data.userId === userId)) {
        map.set(data.acceptanceId, data);
      }
    });
  } catch {}

  return Array.from(map.values()).sort((a, b) => b.acceptedAt - a.acceptedAt);
}

// ==========================================
// 3. COOKIE CONSENT MANAGEMENT (FASE 7)
// ==========================================

export function getSavedCookieConsent(): CookieConsentRecord | null {
  const saved = safeReadLocal<CookieConsentRecord | null>(STORAGE_KEYS.COOKIE_CONSENT, null);
  if (!saved) return null;
  if (saved.noticeVersion !== CURRENT_COOKIE_NOTICE_VERSION) {
    return null;
  }
  return saved;
}

export async function saveCookieConsentChoice(
  userId: string,
  choiceType: CookieConsentRecord['choiceType'],
  categories: CookieConsentCategories
): Promise<CookieConsentRecord> {
  const now = Date.now();
  const consentId = `cookie_${userId || 'anon'}_${now}`;
  const normalizedCategories: CookieConsentCategories = {
    essential: true, // Essential cookies are always active
    preferences: choiceType === 'ACCEPT_ALL' ? true : choiceType === 'REJECT_NON_ESSENTIAL' ? false : Boolean(categories.preferences),
    statistics: choiceType === 'ACCEPT_ALL' ? true : choiceType === 'REJECT_NON_ESSENTIAL' ? false : Boolean(categories.statistics),
    marketing: choiceType === 'ACCEPT_ALL' ? true : choiceType === 'REJECT_NON_ESSENTIAL' ? false : Boolean(categories.marketing),
  };

  const record: CookieConsentRecord = {
    consentId,
    userId: userId || 'anon',
    noticeVersion: CURRENT_COOKIE_NOTICE_VERSION,
    choiceType,
    categories: normalizedCategories,
    decidedAt: now,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'browser',
  };

  safeWriteLocal(STORAGE_KEYS.COOKIE_CONSENT, record);
  const logs = safeReadLocal<CookieConsentRecord[]>(STORAGE_KEYS.COOKIE_CONSENT_LOGS, []);
  safeWriteLocal(STORAGE_KEYS.COOKIE_CONSENT_LOGS, [record, ...logs.slice(0, 199)]);

  try {
    await setDoc(doc(db, 'cookie_consents', consentId), record);
  } catch {}

  if (isBrowserRuntime) {
    try {
      await fetch('/api/cookies/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
    } catch {}
  }

  return record;
}

export async function fetchAllCookieConsentLogs(): Promise<CookieConsentRecord[]> {
  const localLogs = safeReadLocal<CookieConsentRecord[]>(STORAGE_KEYS.COOKIE_CONSENT_LOGS, []);
  const map = new Map<string, CookieConsentRecord>();
  for (const l of localLogs) {
    map.set(l.consentId, l);
  }

  try {
    const snap = await getDocs(collection(db, 'cookie_consents'));
    snap.forEach((d) => {
      const data = d.data() as CookieConsentRecord;
      if (data && data.consentId) {
        map.set(data.consentId, data);
      }
    });
  } catch {}

  return Array.from(map.values()).sort((a, b) => b.decidedAt - a.decidedAt);
}

// ==========================================
// 4. LGPD REQUESTS PORTAL & ADMIN (FASE 6)
// ==========================================

export async function createLgpdRequest(params: {
  userId: string;
  requesterName: string;
  requesterEmail: string;
  requestType: LgpdRequestType;
  description: string;
}): Promise<LgpdRequestRecord> {
  const now = Date.now();
  const protocol = generateProtocolNumber('LGPD');
  const requestId = `lgpd_${now}_${Math.random().toString(36).slice(2, 7)}`;

  const record: LgpdRequestRecord = {
    requestId,
    protocol,
    userId: params.userId || 'titular',
    requesterName: params.requesterName.trim(),
    requesterEmail: params.requesterEmail.trim(),
    requestType: params.requestType,
    description: params.description.trim(),
    status: 'RECEBIDA',
    createdAt: now,
    updatedAt: now,
  };

  const localList = safeReadLocal<LgpdRequestRecord[]>(STORAGE_KEYS.LGPD_REQUESTS, []);
  safeWriteLocal(STORAGE_KEYS.LGPD_REQUESTS, [record, ...localList]);

  try {
    await setDoc(doc(db, 'lgpd_requests', requestId), record);
  } catch {}

  if (isBrowserRuntime) {
    try {
      await fetch('/api/lgpd/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
    } catch {}
  }

  return record;
}

export async function fetchLgpdRequests(userId?: string): Promise<LgpdRequestRecord[]> {
  const localList = safeReadLocal<LgpdRequestRecord[]>(STORAGE_KEYS.LGPD_REQUESTS, []);
  const map = new Map<string, LgpdRequestRecord>();

  for (const item of localList) {
    if (!userId || item.userId === userId) {
      map.set(item.requestId, item);
    }
  }

  if (isBrowserRuntime) {
    try {
      const res = await fetch(`/api/lgpd/requests${userId ? `?userId=${encodeURIComponent(userId)}` : ''}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.requests)) {
          for (const r of data.requests as LgpdRequestRecord[]) {
            if (!userId || r.userId === userId) {
              map.set(r.requestId, r);
            }
          }
        }
      }
    } catch {}
  }

  try {
    const snap = await getDocs(collection(db, 'lgpd_requests'));
    snap.forEach((d) => {
      const data = d.data() as LgpdRequestRecord;
      if (data && data.requestId && (!userId || data.userId === userId)) {
        map.set(data.requestId, data);
      }
    });
  } catch {}

  return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export async function updateLgpdRequestStatusAdmin(
  requestId: string,
  status: LgpdRequestStatus,
  adminResponse: string,
  handledBy: string
): Promise<LgpdRequestRecord | null> {
  const all = await fetchLgpdRequests();
  const target = all.find((r) => r.requestId === requestId);
  if (!target) return null;

  const updated: LgpdRequestRecord = {
    ...target,
    status,
    adminResponse: adminResponse.trim(),
    handledBy: handledBy || 'admin',
    updatedAt: Date.now(),
  };

  const nextList = all.map((r) => (r.requestId === requestId ? updated : r));
  safeWriteLocal(STORAGE_KEYS.LGPD_REQUESTS, nextList);

  try {
    await setDoc(doc(db, 'lgpd_requests', requestId), updated, { merge: true });
  } catch {}

  if (isBrowserRuntime) {
    try {
      await fetch(`/api/lgpd/requests/${encodeURIComponent(requestId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-gio-admin-access': 'authorized' },
        body: JSON.stringify({ status, adminResponse, handledBy }),
      });
    } catch {}
  }

  return updated;
}

// ==========================================
// 5. SUPPORT TICKETS & BUG REPORTS (FASE 14)
// ==========================================

export async function createSupportTicket(params: {
  userId: string;
  name: string;
  email: string;
  category: SupportTicketCategory;
  subject: string;
  message: string;
}): Promise<SupportTicketRecord> {
  const now = Date.now();
  const protocol = generateProtocolNumber('SUP');
  const ticketId = `sup_${now}_${Math.random().toString(36).slice(2, 7)}`;

  const record: SupportTicketRecord = {
    ticketId,
    protocol,
    userId: params.userId || 'usuario',
    name: params.name.trim(),
    email: params.email.trim(),
    category: params.category,
    subject: params.subject.trim(),
    message: params.message.trim(),
    status: 'ABERTO',
    createdAt: now,
    updatedAt: now,
  };

  const localList = safeReadLocal<SupportTicketRecord[]>(STORAGE_KEYS.SUPPORT_TICKETS, []);
  safeWriteLocal(STORAGE_KEYS.SUPPORT_TICKETS, [record, ...localList]);

  try {
    await setDoc(doc(db, 'support_tickets', ticketId), record);
  } catch {}

  if (isBrowserRuntime) {
    try {
      await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
    } catch {}
  }

  return record;
}

export async function fetchSupportTickets(userId?: string): Promise<SupportTicketRecord[]> {
  const localList = safeReadLocal<SupportTicketRecord[]>(STORAGE_KEYS.SUPPORT_TICKETS, []);
  const map = new Map<string, SupportTicketRecord>();

  for (const item of localList) {
    if (!userId || item.userId === userId) {
      map.set(item.ticketId, item);
    }
  }

  if (isBrowserRuntime) {
    try {
      const res = await fetch(`/api/support/tickets${userId ? `?userId=${encodeURIComponent(userId)}` : ''}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.tickets)) {
          for (const t of data.tickets as SupportTicketRecord[]) {
            if (!userId || t.userId === userId) {
              map.set(t.ticketId, t);
            }
          }
        }
      }
    } catch {}
  }

  try {
    const snap = await getDocs(collection(db, 'support_tickets'));
    snap.forEach((d) => {
      const data = d.data() as SupportTicketRecord;
      if (data && data.ticketId && (!userId || data.userId === userId)) {
        map.set(data.ticketId, data);
      }
    });
  } catch {}

  return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export async function updateSupportTicketAdmin(
  ticketId: string,
  status: SupportTicketStatus,
  adminReply: string
): Promise<SupportTicketRecord | null> {
  const all = await fetchSupportTickets();
  const target = all.find((t) => t.ticketId === ticketId);
  if (!target) return null;

  const updated: SupportTicketRecord = {
    ...target,
    status,
    adminReply: adminReply.trim(),
    updatedAt: Date.now(),
  };

  const nextList = all.map((t) => (t.ticketId === ticketId ? updated : t));
  safeWriteLocal(STORAGE_KEYS.SUPPORT_TICKETS, nextList);

  try {
    await setDoc(doc(db, 'support_tickets', ticketId), updated, { merge: true });
  } catch {}

  if (isBrowserRuntime) {
    try {
      await fetch(`/api/support/tickets/${encodeURIComponent(ticketId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-gio-admin-access': 'authorized' },
        body: JSON.stringify({ status, adminReply }),
      });
    } catch {}
  }

  return updated;
}

// ==========================================
// 6. CONFIGURABLE COMPANY DATA (FASE 12)
// ==========================================

export async function fetchCompanyLegalSettings(): Promise<CompanyLegalSettings> {
  let settings = safeReadLocal<CompanyLegalSettings>(
    STORAGE_KEYS.COMPANY_SETTINGS,
    DEFAULT_COMPANY_SETTINGS
  );

  if (isBrowserRuntime) {
    try {
      const res = await fetch('/api/admin/company-settings');
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          settings = { ...DEFAULT_COMPANY_SETTINGS, ...data.settings };
        }
      }
    } catch {}
  }

  try {
    const snap = await getDoc(doc(db, 'company_settings', 'official'));
    if (snap.exists()) {
      settings = { ...DEFAULT_COMPANY_SETTINGS, ...(snap.data() as CompanyLegalSettings) };
    }
  } catch {}

  safeWriteLocal(STORAGE_KEYS.COMPANY_SETTINGS, settings);
  return settings;
}

export async function saveCompanyLegalSettings(
  newSettings: Partial<CompanyLegalSettings>,
  updatedBy: string
): Promise<CompanyLegalSettings> {
  const current = await fetchCompanyLegalSettings();
  const updated: CompanyLegalSettings = {
    ...current,
    ...newSettings,
    updatedAt: Date.now(),
    updatedBy: updatedBy || 'admin',
  };

  safeWriteLocal(STORAGE_KEYS.COMPANY_SETTINGS, updated);

  try {
    await setDoc(doc(db, 'company_settings', 'official'), updated, { merge: true });
  } catch {}

  if (isBrowserRuntime) {
    try {
      await fetch('/api/admin/company-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-gio-admin-access': 'authorized' },
        body: JSON.stringify(updated),
      });
    } catch {}
  }

  return updated;
}

export function getPendingCompanyFields(settings: CompanyLegalSettings): string[] {
  const missing: string[] = [];
  if (!settings.razaoSocial?.trim()) missing.push('Razão Social');
  if (!settings.cnpj?.trim() && !settings.vatOrTaxId?.trim()) missing.push('CNPJ / Número Fiscal (VAT)');
  if (!settings.enderecoEmpresarial?.trim()) missing.push('Endereço Empresarial');
  if (!settings.emailAtendimento?.trim()) missing.push('E-mail Oficial de Atendimento');
  if (!settings.canalPrivacidade?.trim()) missing.push('Canal de Privacidade (LGPD)');
  if (!settings.representanteLegal?.trim()) missing.push('Representante Legal');
  if (!settings.dpoEncarregado?.trim()) missing.push('Encarregado pelo Tratamento de Dados (DPO)');
  if (!settings.identificacaoOrganizador?.trim()) missing.push('Identificação do Organizador');
  return missing;
}

// ==========================================
// 7. COMMERCIAL SUBSCRIPTION SETTINGS & STATES (FASE 8 & 15)
// ==========================================

export async function fetchCommercialSubscriptionConfig(): Promise<CommercialSubscriptionConfig> {
  let config = safeReadLocal<CommercialSubscriptionConfig>(
    STORAGE_KEYS.COMMERCIAL_SETTINGS,
    DEFAULT_COMMERCIAL_CONFIG
  );

  if (isBrowserRuntime) {
    try {
      const res = await fetch('/api/admin/subscription-settings');
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          config = { ...DEFAULT_COMMERCIAL_CONFIG, ...data.config };
        }
      }
    } catch {}
  }

  try {
    const snap = await getDoc(doc(db, 'subscription_settings', 'commercial'));
    if (snap.exists()) {
      config = { ...DEFAULT_COMMERCIAL_CONFIG, ...(snap.data() as CommercialSubscriptionConfig) };
    }
  } catch {}

  safeWriteLocal(STORAGE_KEYS.COMMERCIAL_SETTINGS, config);
  return config;
}

export async function saveCommercialSubscriptionConfig(
  partial: Partial<CommercialSubscriptionConfig>
): Promise<CommercialSubscriptionConfig> {
  const current = await fetchCommercialSubscriptionConfig();
  const updated: CommercialSubscriptionConfig = {
    ...current,
    ...partial,
    configuredByAdmin: Boolean(
      (partial.priceDisplay ?? current.priceDisplay)?.trim() &&
        (partial.billingCycle ?? current.billingCycle)?.trim()
    ),
    updatedAt: Date.now(),
  };

  safeWriteLocal(STORAGE_KEYS.COMMERCIAL_SETTINGS, updated);

  try {
    await setDoc(doc(db, 'subscription_settings', 'commercial'), updated, { merge: true });
  } catch {}

  if (isBrowserRuntime) {
    try {
      await fetch('/api/admin/subscription-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-gio-admin-access': 'authorized' },
        body: JSON.stringify(updated),
      });
    } catch {}
  }

  return updated;
}

export function getLocalSubscriptionState(): SubscriptionStatusState {
  return safeReadLocal<SubscriptionStatusState>(STORAGE_KEYS.SUBSCRIPTION_STATE, 'ACTIVE');
}

export function setLocalSubscriptionState(state: SubscriptionStatusState): void {
  safeWriteLocal(STORAGE_KEYS.SUBSCRIPTION_STATE, state);
}
