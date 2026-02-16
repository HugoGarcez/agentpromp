# Relatório de Diagnóstico - Chat API

## O Problema
O "Chat de Teste" retorna HTML (erro 500/502/404 disfarçado), o que sugere um crash ou erro de rota.

## A Solução (Logs)
Adicionei logs em:
1. `authenticateToken`: Verifica se o token chega e é válido.
2. `/api/chat`: Verifica cada passo (recebimento, config, chamada da IA).

## Ação Necessária (VPS)
Execute:
```bash
git pull origin main
pm2 restart all
```

Tente usar o chat e depois verifique:
```bash
pm2 logs promp-ia --lines 50
```
Isso nos dirá:
- Se a requisição chega no servidor (`[API Chat] Request received...`).
- Se trava no banco de dados (`Fetching config...`).
- Se trava na IA (`Calling processChatResponse...`).
