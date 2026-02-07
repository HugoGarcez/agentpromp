#!/bin/bash

# Script de Instalação para VPS (Ubuntu 22.04/20.04)

echo "🚀 Iniciando configuração do Servidor..."

# 1. Atualizar Sistema
sudo apt update && sudo apt upgrade -y

# 2. Instalar Node.js (v20)
echo "📦 Instalando Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Instalar PM2 (Gerenciador de Processos)
echo "📦 Instalando PM2..."
sudo npm install -g pm2

# 4. Instalar Nginx (Servidor Web / Proxy)
echo "📦 Instalando Nginx..."
sudo apt install -y nginx certbot python3-certbot-nginx

# 4.1 Aumentar limite de upload do Nginx (Evita erro ao salvar Config e arquivos)
echo "🔧 Ajustando limite de upload do Nginx para 100MB..."
sudo sed -i 's/client_max_body_size .*/client_max_body_size 100M;/g' /etc/nginx/nginx.conf
if ! grep -q "client_max_body_size" /etc/nginx/nginx.conf; then
    sudo sed -i '/http {/a \    client_max_body_size 100M;' /etc/nginx/nginx.conf
fi
sudo systemctl restart nginx

# 5. Configurar Firewall (UFW)
echo "🛡️ Configurando Firewall..."
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable

echo "✅ Ambiente Base Configurado!"
echo "➡️  Próximos passos:"
echo "1. Clone seu repositório ou copie os arquivos para a VPS."
echo "2. Rode 'npm install' na raiz e em 'server/'."
echo "3. Rode 'npm run build' na raiz."
echo "4. Inicie o servidor com 'pm2 start server/index.js --name promp-ia'."
echo "5. Configure o Nginx (consulte o guia deployment_guide.md)."
