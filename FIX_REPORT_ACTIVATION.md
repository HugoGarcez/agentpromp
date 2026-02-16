# Protocolo de Ativação do Agente

Se o painel mostra "Inativo" e a IA não responde, é porque a configuração no banco de dados está desligada ou faltando a chave da API.

## Solução Imediata

Execute este comando na VPS para rodar o script de restauração que acabei de criar:

```bash
cd /var/www/promp-ia/server
node restore_agent.js
cd ..
pm2 restart all
```

**Resultado Esperado:**
1.  O script vai dizer `Agente reativado com sucesso!`.
2.  No painel, o status mudará para **Ativo**.
3.  O "Testar IA" voltará a funcionar.
4.  O WhatsApp voltará a responder (pois o webhook checa se o agente está ativo).
