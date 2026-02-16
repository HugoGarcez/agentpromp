# Relatório de Correção - Duration e Global Config

## Correções Realizadas
1.  **Erro de Tipo `duration`**: O servidor estava tentando salvar a duração como String ("45"), mas o banco espera um Inteiro (Int). Corrigi o código (`server/index.js`) para converter `parseInt(duration)` antes de salvar.
2.  **Debug Global Config**: Adicionei logs detalhados em `server/googleCalendar.js` para mostrar EXATAMENTE o que está faltando quando o erro "not configured globally" ocorre.

## Próximos Passos (VPS)
1.  Faça o deploy das alterações:
    ```bash
    git pull origin main && npm install && pm2 restart all
    ```
2.  Tente criar o tipo de agendamento novamente. O erro de duração deve sumir.
3.  Tente conectar o Google Calendar. Se falhar, verifique os logs (`pm2 logs promp-ia`) e procure por `[GoogleAuth] Missing Global Config`. Isso nos dirá qual campo está vazio.
