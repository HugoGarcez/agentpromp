# Relatório de Correção - Fallback de Integração

## O Problema
Devido à falha na atualização do Banco de Dados (`prisma push`), as novas colunas de configuração (`prompUuid`, `prompToken`) não existem, o que impede a IA de enviar mensagens.

## A Solução (Código de Emergência)
Modifiquei o arquivo `server/index.js` para adicionar uma lógica de **fallback**:
- Se o sistema não encontrar as credenciais nas novas colunas, ele vai procurar nas configurações antigas (`integrations: { wuzapi: ... }`) dentro do campo JSON existente.
- Isso permite que o sistema funcione com a estrutura de banco de dados antiga.

## Ação Necessária (VPS)
Apenas atualize o código e reinicie:

```bash
git pull origin main
pm2 restart all
```

(Não precisa rodar comandos do prisma agora se eles estiverem falhando).
