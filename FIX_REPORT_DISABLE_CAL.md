# Relatório de Correção - Desativação Temporária do Calendar

## O Problema
O servidor está travando e retornando erro HTML no chat de teste porque o código tenta acessar tabelas do Google Calendar que **não existem** no seu banco de dados atual (devido à falha na atualização).

## A Solução (Código de Emergência 2)
Modifiquei o arquivo `server/index.js` para **IGNORAR** completamente as configurações do Google Calendar por enquanto.
Isso restaura o funcionamento do sistema para o estado "como era antes", permitindo que a IA responda sem tentar acessar dados inexistentes.

## Ação Necessária (VPS)
Apenas atualize o código e reinicie:

```bash
git pull origin main
pm2 restart all
```

Após isso, a IA deve voltar ao normal.
