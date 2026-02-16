# Relatório de Correção - Envio de Mensagem

## Investigação
A IA estava "pensando" (gerando logs de resposta), mas a mensagem não chegava no WhatsApp.
Possíveis causas:
1.  **Credenciais de Integração Faltando:** Se `prompUuid` (Nome da Instância) ou `prompToken` (Chave da API) não estiverem salvos no banco.
2.  **Lógica de Áudio:** O código estava configurado para **NÃO enviar texto** se um áudio fosse gerado. Se o envio do áudio falhasse, o usuário não recebia nada.

## A Solução (Backend)
1.  Alterei `server/index.js` para **SEMPRE enviar o texto**, mesmo que haja áudio. Isso garante que você receba a resposta escrita.
2.  Adicionei logs explícitos mostrando a URL da API que está sendo chamada (`.../v2/api/external/...`).

## Ação Necessária (VPS)
Execute para aplicar a correção:

```bash
git pull origin main && pm2 restart all
```

## Teste
Mande "Oi" para a IA.
Se ela responder, resolvido.
Se ainda não responder, verifique os logs com `pm2 logs promp-ia` e procure por:
`[Promp] Skipping external API execution` <- Significa que falta configurar a integração no painel.
ou
`[Promp] Text Chunk Send Failed` <- Significa erro na API da Evolution/Wuzapi.
