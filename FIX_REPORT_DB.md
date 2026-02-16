# Relatório de Correção - Webhook e Banco de Dados

## Diagnóstico
Se a IA não responde de jeito nenhum, é muito provável que houve uma "desconexão" entre o Código Novo e o Banco de Dados Antigo, ou a URL no WhatsApp está incompleta.
1. **Banco de Dados Desatualizado:** O código novo busca campos (`prompUuid`, `prompToken`, etc.) que talvez não existam no seu banco de dados na VPS se você não rodou o comando de migração. Isso falha silenciosamente ou trava a requisição.
2. **URL Incorreta:** Se a integração estiver mandando para `/webhook` em vez de `/webhook/ID-DA-EMPRESA`, o sistema não sabe quem responder.

## A Solução (VPS)
Você **PRECISA** rodar os comandos de banco de dados para que as novas colunas sejam criadas.

Execute na ordem:

```bash
# 1. Baixar código novo
git pull origin main

# 2. Atualizar estrutura do Banco de Dados (ESSENCIAL)
npx prisma db push

# 3. Atualizar cliente do código
npx prisma generate

# 4. Reiniciar servidor
pm2 restart all
```

Isso deve resolver definitivamente o problema de "silêncio" causado por erro de sistema.
