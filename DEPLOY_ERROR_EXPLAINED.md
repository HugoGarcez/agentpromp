# Por que o script 'scripts/deploy.sh' falhou?

Você executou o comando `scripts/deploy.sh` estando **DENTRO DA VPS**.
Esse script foi feito para ser rodado do seu computador pessoal (para enviar comandos via SSH).
Quando rodado na VPS, ele tenta conectar nela mesma via SSH (loop), e é rejeitado por segurança (Permission denied publickey).

## A Solução Correta
Use o script que eu criei especificamente para rodar **DENTRO** da VPS (`DEPLOY_FIX.sh`), que não precisa de senha SSH pois já está logado.

Comando:
```bash
bash DEPLOY_FIX.sh
```

Isso fará a atualização localmente sem pedir senha.
