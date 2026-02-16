#!/bin/bash

echo "=================================================="
echo "🚀 DEPLOY + DEBUG - Promp IA"
echo "=================================================="
echo ""

# Step 1: Deploy the fix
echo "📥 PASSO 1: Fazendo git pull..."
cd /var/www/promp-ia || exit
git pull origin main

if [ $? -ne 0 ]; then
  echo "❌ Erro no git pull!"
  exit 1
fi

echo "✅ Código atualizado!"
echo ""

# Step 2: Restart PM2
echo "🔄 PASSO 2: Reiniciando PM2..."
pm2 restart all

echo "✅ PM2 reiniciado!"
echo ""

# Step 3: Run debug script
echo "🔍 PASSO 3: Listando produtos do banco de dados..."
echo ""
cd /var/www/promp-ia/server || exit
node debug_products.js

echo ""
echo "=================================================="
echo "✅ Deploy concluído!"
echo "=================================================="
echo ""
echo "📋 Próximos passos:"
echo "1. Veja o ID da 'Camisa Engenheiro' acima (marcado com 🎯)"
echo "2. Teste pedindo a foto novamente no WhatsApp"
echo "3. Verifique os logs com: bash CHECK_LOGS.sh"
