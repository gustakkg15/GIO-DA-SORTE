---
name: vercel-react-best-practices
description: Padrões de arquitetura React moderna, ciclo de vida de hooks, prevenção de re-renderizações desnecessárias, co-localização de estado e higiene de código no GIO DA SORTE PRO.
license: Apache-2.0
origin: vercel-labs/agent-skills
adapted_for: GIO DA SORTE PRO (React SPA com Vite & TypeScript)
---

# Vercel React Best Practices — GIO DA SORTE PRO

> **Origem:** Baseado no repositório open-source `vercel-labs/agent-skills` (Licença Apache-2.0 / MIT), adaptado para o ecossistema React 18/19 com Vite e TypeScript no GIO DA SORTE PRO.

---

## 1. Princípios de Arquitetura React no GIO DA SORTE

O GIO DA SORTE PRO processa eventos em tempo real provenientes de transmissões do TikTok (comentários, presentes, curtidas e moedas) que disparam atualizações contínuas de estado. Se a arquitetura de componentes for descuidada, a interface sofrerá de congelamentos e perda de frames.

Diretrizes obrigatórias:
1. **Co-localização de Estado (State Colocation):** Mantenha o estado o mais próximo possível dos componentes que o utilizam. Nunca eleve um estado de digitação ou filtro para o componente raiz (`App.tsx` ou `MainDashboard.tsx`) se apenas um subcomponente precisa dele.
2. **Evite Efeitos em Cascata (Cascading useEffects):** Não use `useEffect` para calcular dados derivados de `props` ou de outro `state`. Calcule diretamente durante a renderização com expressões puras ou `useMemo`.
3. **Imutabilidade Rigorosa:** Nunca modifique arrays ou objetos de estado diretamente (`state.push()`). Sempre utilize novas instâncias (`[...prev, novoItem]`).

---

## 2. Tratamento de Hooks e Otimização de Performance

### 2.1. Quando Usar `useMemo` e `useCallback`
- **Use `useMemo`:** Para operações de filtragem pesada (ex: filtrar 10.000 comentários de uma live com regex e deduplicação de participantes).
- **Use `useCallback`:** Quando a função de callback for passada como prop para um componente filho envelopado em `React.memo`, ou for dependência de outro hook.
- **Não abuse:** Não envolva funções triviais de clique em `useCallback` se o componente filho re-renderiza de qualquer forma.

### 2.2. Isolamento de Áreas de Alta Frequência
- Durante uma LIVE do TikTok com centenas de comentários por minuto:
  - Crie um componente isolado para o feed ao vivo (`LiveCommentStream.tsx`).
  - O feed ao vivo atualiza apenas o seu próprio DOM interno sem forçar a re-renderização do painel de configuração do sorteio.

---

## 3. Gestão de Limpeza e Prevenção de Vazamento de Memória

### 3.1. Cleanup Obrigatório em `useEffect`
Todo listener, timer ou conexão de WebSocket/Server-Sent Events DEVE ter função de limpeza (cleanup):
```tsx
useEffect(() => {
  const timer = setInterval(() => {
    // sincronização periódica
  }, 5000);

  return () => {
    clearInterval(timer);
  };
}, []);
```

### 3.2. Prevenção de Atualização de Estado em Componente Desmontado
Sempre certifique-se de que promessas assíncronas verifiquem se o componente ainda está montado ou use `AbortController` para requisições de rede.

---

## 4. Tipagem TypeScript Estrita

1. **Evite `any`:** Todos os tipos de dados do TikTok LIVE, participantes, moedas, planos e eventos devem ter interfaces ou types explícitos (ex: `TikTokLiveEvent`, `DrawParticipant`, `DrawWinner`).
2. **Discriminated Unions para Estados Assíncronos:**
   ```tsx
   type AsyncState<T> =
     | { status: 'idle' }
     | { status: 'loading' }
     | { status: 'success'; data: T }
     | { status: 'error'; error: string };
   ```
   Evita booleanos múltiplos conflitantes como `isLoading = true` e `isError = true`.

---

## 5. Checklist React Best Practices

- [ ] Estados derivados são computados diretamente e não via `useEffect` redundante?
- [ ] Todo `useEffect` possui array de dependências completo e função de retorno quando cria recursos externos?
- [ ] Listas utilizam `key` estável e única (ex: `participant.id` ou `comment.id`), nunca `index` do array quando a lista pode ser reordenada?
- [ ] Componentes pesados de modal ou páginas secundárias utilizam carregamento sob demanda (`React.lazy` / `Suspense`) quando oportuno?
