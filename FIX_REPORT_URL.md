# Relatório de Correção - URL de Redirect Vazia

## O Problema
O log mostrou `googleRedirectUri: ''`.
Isso aconteceu porque no painel Admin, o campo "Redirect URI" exibia um texto cinza (placeholder) com a URL correta, mas o valor real enviado para o servidor estava vazio se você não digitasse nada.

## A Solução (Frontend)
Modifiquei o arquivo `src/pages/AdminConfig.jsx`.
Agora, ao clicar em **Salvar**, se o campo estiver vazio, o sistema preencherá automaticamente com a URL padrão:
`https://seu-dominio.com/api/auth/google/callback`

## Como Aplicar na VPS
Como a mudança foi no **Frontend (React/Vite)**, você precisa recompilar o projeto (`npm run build`).

Execute:
```bash
git pull origin main && npm install && npm run build && pm2 restart all
```

Depois disso:
1. Recarregue a página do Admin (F5).
2. Vá em Configuração Global.
3. Clique em **Salvar Configuração Global** (mesmo sem digitar a URL).
4. Tente conectar o Google Calendar novamente.
