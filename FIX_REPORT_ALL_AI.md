# Relatório de Correção - IA Parada (Chave OpenAI)

## O Problema
A IA parou de responder para TODOS os usuários.
A causa provável foi uma mudança recente que exigia que a Chave da OpenAI (`sk-...`) estivesse salva na **Configuração Global (Banco de Dados)**.
Como muitos usuários (ou o ambiente legado) ainda usam a chave no arquivo `.env`, a IA falhava ao não encontrar a chave no banco.

## A Solução (Backend)
Modifiquei o arquivo `server/index.js` para usar uma estratégia de fallback:
1. Tenta pegar a chave do Banco de Dados (Configuração Global).
2. Se não encontrar, tenta pegar do arquivo `.env` (`OPENAI_API_KEY`).
3. Somente se ambos falharem, gera erro.

Isso garante compatibilidade e restaura o funcionamento imediato.

## Ação Necessária (VPS)
Execute para aplicar a correção:

```bash
git pull origin main && pm2 restart all
```
