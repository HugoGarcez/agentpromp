# Relatório de Correção - Callback URL (Tela Branca)

## O Problema
O Google redireciona para `/api/auth/google/callback` usando um método **GET**.
O servidor só tinha uma rota **POST** para esse endereço.
Resultado: A rota não era encontrada ou tratada, resultando numa tela branca ou erro, e o token não era salvo.

## A Solução (Backend)
Adicionei uma rota `GET /api/auth/google/callback` no arquivo `server/index.js`.
Esta rota:
1.  Recebe o `code` e `state` (com `companyId`) da URL.
2.  Troca o código por tokens de acesso.
3.  Salva os tokens no banco de dados (`GoogleCalendarConfig`).
4.  **Redireciona** o usuário de volta para a tela de agendamento (`/scheduling?success=true`).

## Ação Necessária (VPS)
Execute para aplicar a correção do backend:

```bash
git pull origin main && pm2 restart all
```

**Nota:** Como a rota de callback mudou, certifique-se de que a URL de redirecionamento no Console do Google Cloud e no Painel Admin esteja correta:
`https://agente.promp.com.br/api/auth/google/callback` (ou similar).
