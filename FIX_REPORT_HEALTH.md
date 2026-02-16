# Relatório de Diagnóstico - Startup e Health Check

## O Problema
Não estamos tendo feedback claro se o servidor está rodando ou se travou (crash) por causa do banco de dados desatualizado. A mensagem `<` no chat de teste indica que o servidor pode estar reiniciando em loop ou falhando silenciosamente no início da requisição.

## A Solução (Monitoramento)
Modifiquei o arquivo `server/index.js` para:
1.  **Adicionar logs de Startup:** Agora o servidor verifica explícitamente se consegue conectar ao banco antes de iniciar.
2.  **Rota `/api/health`:** Criei uma rota pública para verificar se o servidor está vivo, sem precisar logar.

## Ação Necessária (VPS)
Execute e observe os logs:

```bash
git pull origin main
pm2 restart all
pm2 logs promp-ia --lines 50
```

Se aparecer `[Startup] FATAL ERROR`, o problema é conexão/schema do banco.
Se aparecer `[Startup] Server running on port 3001`, o servidor está online.

Para testar se está respondendo:
```bash
curl http://localhost:3001/api/health
```
Deve retornar `{"status":"ok",...}`.
