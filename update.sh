#!/bin/bash

# Script para atualizar a aplicação na VPS

echo "--------------------------------------------------"
echo "🚀 Iniciando atualização do Agente IA - PROMP..."
echo "--------------------------------------------------"

# 1. Atualizar o código (Git Pull)
echo "📥 1. Baixando atualizações do Git..."
git pull origin main

# 2. Instalar dependências (Raiz)
echo "📦 2. Instalando dependências (Raiz)..."
npm install

# 3. Instalar dependências (Server)
echo "📦 3. Instalando dependências (Server)..."
cd server
npm install
cd ..

# 4. Build de Produção (Frontend)
echo "🏗️  4. Gerando build de produção (Vite)..."
npm run build

# 5. Reiniciar o Servidor (PM2)
echo "🔄 5. Reiniciando processo PM2 (promp-ia)..."
# Tenta recarregar (reload = zero downtime), se falhar, restart/start
pm2 reload promp-ia || pm2 restart promp-ia || pm2 start server/index.js --name promp-ia

echo "--------------------------------------------------"
echo "✅ Atualização Concluída com Sucesso!"
echo "--------------------------------------------------"
