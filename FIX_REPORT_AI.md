# Relatório de Correção - IA Muda (Sem Resposta)

## O Problema
O usuário relatou que a IA parou de responder.
Descobri que, na chamada para a OpenAI (`chat.completions.create`), o parâmetro `tool_choice: "auto"` estava sendo enviado **sempre**, mesmo quando não havia ferramentas (`tools`) ativas.
A API da OpenAI rejeita requisições que têm `tool_choice` mas não têm `tools`, causando erro silencioso ou resposta vazia.

## A Solução (Backend)
No arquivo `server/index.js`, ajustei a lógica para enviar `tool_choice: undefined` caso não haja ferramentas disponíveis (ou seja, se o Google Calendar não estiver conectado).

## Ação Necessária (VPS)
Execute para aplicar a correção:

```bash
git pull origin main && pm2 restart all
```

Após isso, a IA deve voltar a responder normalmente.
