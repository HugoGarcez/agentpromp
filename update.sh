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
npm install --include=dev
npm install fast-xml-parser 2>/dev/null || true   # garante dep crítica
cd ..

# 4. Atualizar Schema do Banco de Dados (Prisma)
echo "🗄️  4. Atualizando Schema do Banco de Dados..."
cd server
npx prisma generate

# Resolve qualquer migration com falha antes de aplicar novas
echo "🔧  4a. Verificando migrations com falha..."
FAILED=$(npx prisma migrate status --schema ./prisma/schema.prisma 2>&1 | grep -oP '(?<=migration `)[^`]+(?=` failed)')
if [ -n "$FAILED" ]; then
  echo "⚠️  Migration com falha detectada: $FAILED — marcando como rolled-back..."
  npx prisma migrate resolve --rolled-back "$FAILED" --schema ./prisma/schema.prisma
fi

npx prisma migrate deploy
cd ..

# 5. Build de Produção (Frontend)
echo "🏗️  5. Gerando build de produção (Vite)..."
npm run build

# 6. Reiniciar o Servidor (PM2)
echo "🔄 6. Reiniciando processo PM2 (promp-ia)..."
# Tenta recarregar (reload = zero downtime), se falhar, restart/start
pm2 reload promp-ia || pm2 restart promp-ia || pm2 start server/polyfill.js --name promp-ia

echo "--------------------------------------------------"
echo "✅ Atualização Concluída com Sucesso!"
echo "--------------------------------------------------"
