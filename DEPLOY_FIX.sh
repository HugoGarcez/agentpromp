#!/bin/bash
set -e # Encerrar script se houver erro

echo "========================================"
echo "   DEPLOYMENT FIX SCRIPT v1.0   "
echo "========================================"

# 1. Update Code from Root
echo ">>> [1/5] Atualizando código do repositório..."
git pull origin main

# 2. Server Dependencies
echo ">>> [2/5] Instalando dependências do servidor (pasta server)..."
cd server
npm install --no-audit

# 3. Database Update
echo ">>> [3/5] Atualizando Banco de Dados (Prisma)..."
# Using npx inside server folder uses the project's prisma version (v5)
npx prisma db push
npx prisma generate

# 4. Restart Application
echo ">>> [4/5] Reiniciando Servidor no PM2..."
cd ..
pm2 restart all

# 5. Verify Health
echo ">>> [5/5] Verificando Saúde do Servidor..."
echo "Aguardando 5 segundos para inicialização..."
sleep 5

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/health)
RESPONSE=$(curl -s http://localhost:3001/api/health)

echo "Código HTTP: $HTTP_CODE"
echo "Resposta: $RESPONSE"

if [[ "$HTTP_CODE" == "200" ]]; then
    echo "✅ SUCESSO! O servidor está ONLINE e respondendo."
else
    echo "❌ FALHA! O servidor não respondeu com sucesso."
    echo "Verifique os logs com: pm2 logs promp-ia --lines 50"
    exit 1
fi
