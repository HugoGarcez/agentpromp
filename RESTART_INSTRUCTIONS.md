# Relatório de Erro Crítico - Reinício do Servidor

## O Erro
O log da VPS mostra:
```
Unknown argument `googleClientId`. Available options are marked with ?.
at wn .../prisma/client/runtime/library.js
```
Isso significa que o código do servidor está tentando salvar um campo (`googleClientId`) que o **Prisma Client carregado na memória** desconhece.

## Por que isso acontece?
Você executou `npx prisma db push` e `npx prisma generate`, o que atualizou o banco e os arquivos do cliente.
**PORÉM**, o processo Node.js (gerenciado pelo PM2 ou rodando no terminal) carrega o Prisma Client **apenas na inicialização**.
Se você não reiniciou o processo `node` ou `pm2` **DEPOIS** do `generate`, ele continua usando a versão antiga (sem os campos novos) e falha ao salvar.

## Solução Definitiva
No terminal da VPS, execute EXATAMENTE:

```bash
cd /var/www/promp-ia/server
npx prisma generate
pm2 restart all || pm2 restart promp-ia
```

Se você não usa PM2 e roda com `node server/index.js`, você precisa parar o processo (Ctrl+C) e iniciar novamente.
**NÃO BASTA SALVAR O ARQUIVO code.js. O PROCESSO TEM QUE REINICIAR.**
