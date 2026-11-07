---
name: security-review
description: Use for authentication, authorization, personal data, user roles, APIs, webhooks, secrets, uploads, payments, and production releases.
---

# Security Review

## Modelo de ameaça
Identifique ativos, atores, fronteiras de confiança, endpoints expostos, dados sensíveis e consequências de abuso.

## Controles mínimos
- Autenticação e autorização validadas no servidor.
- Menor privilégio e negação por padrão.
- Verificação de propriedade do recurso para prevenir IDOR.
- Validação de schema, tamanho, formato e limites de frequência.
- Proteção contra XSS, CSRF, injection e mass assignment conforme stack.
- Segredos fora do código e do bundle do cliente.
- Webhooks autenticados, com timestamp/assinatura e proteção contra replay quando suportado.
- Logs sem tokens, cookies ou dados pessoais desnecessários.
- Erros externos sem stack trace ou detalhes internos.
- Uploads com validação de tipo, tamanho e armazenamento seguro.

## Papéis
Faça uma matriz explícita de papel × ação × recurso. Ocultar controles na UI não é autorização.

## Resultado
Liste achados com severidade, cenário de abuso, evidência, correção e teste de verificação. Não declare a aplicação “segura”; delimite o escopo auditado.
