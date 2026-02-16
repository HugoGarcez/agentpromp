# Relatório de Correção - Webhook e Banco de Dados (ATUALIZADO)

## Diagnóstico
O comando anterior falhou porque o arquivo `schema.prisma` está na pasta `server/prisma/` e não na raiz. Você precisa especificar o caminho.

## A Solução (VPS)
Execute EXATAMENTE esta sequência:

```bash
# 1. Atualizar Banco de Dados (COM O CAMINHO CERTO)
npx prisma db push --schema=server/prisma/schema.prisma

# 2. Atualizar Cliente Prisma
npx prisma generate --schema=server/prisma/schema.prisma

# 3. Reiniciar servidor
pm2 restart all
```

Isso criará as colunas que estão faltando (como `prompUuid`) e fará a IA voltar a funcionar.
