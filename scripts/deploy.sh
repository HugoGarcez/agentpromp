#!/bin/bash

# Configurações
VPS_USER="root"
VPS_IP="162.243.230.13"
PROJECT_DIR="~/agente-promp" # <--- VERIFIQUE SE O NOME DA PASTA ESTÁ CORRETO

echo "🚀 Iniciando Deploy na VPS ($VPS_IP)..."

ssh $VPS_USER@$VPS_IP <<EOF
    echo "📂 Entrando na pasta do projeto..."
    cd $PROJECT_DIR || { echo "❌ Pasta não encontrada!"; exit 1; }

    echo "⬇️  Baixando atualizações do GitHub..."
    git pull origin main

    echo "📦 Instalando dependências (caso haja novas)..."
    npm install
    cd server && npm install && cd ..

    echo "🏗️  Reconstruindo Frontend..."
    npm run build

    echo "🔄 Reiniciando Servidor Backend..."
    pm2 restart all

    echo "✅ Deploy concluído com sucesso!"
EOF
