# Relatório de Correção - Bug de Configuração

## O Problema (Por que ficava Inativo?)
Descobri um **bug crítico** no código de atualização de configurações.
Sempre que você salvava uma aba no painel (ex: Persona ou Produtos) que **não enviava a chave da OpenAI**, o servidor **sobrescrevia** as integrações com um objeto vazio, apagando a chave existente.
Resultado: O Agente ficava "Inativo" logo após você mexer em qualquer configuração.

## A Solução (Código)
Modifiquei a rota `/api/config` para:
1.  **Mesclar (Merge):** Agora ela lê o que já existe no banco e JUNTA com o que veio do painel, garantindo que a chave da OpenAI nunca seja apagada acidentalmente.
2.  **Forçar Ativo:** Adicionei lógica para garantir que o status `active` seja sempre `true` ao salvar.

## Ação Necessária (VPS)
Execute:
```bash
git pull origin main
pm2 restart all
```

**Importante:** Talvez você precise cadastrar a chave da OpenAI **uma última vez** (ou rodar `node restore_agent.js` de novo), pois a anterior pode ter sido apagada pelo bug. Depois disso, ela não sumirá mais.
