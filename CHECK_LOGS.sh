#!/bin/bash
# Script para monitorar logs da IA em tempo real

echo "==================================================="
echo "📊 MONITOR DE LOGS DA IA (Promp Agent)"
echo "==================================================="
echo "Este script vai mostrar as últimas 100 linhas de log e"
echo "continuar mostrando novos logs em tempo real."
echo ""
echo "Pressione Ctrl+C para sair."
echo "==================================================="
echo ""

# Check if PM2 is in path
if ! command -v pm2 &> /dev/null
then
    echo "❌ PM2 não encontrado. Tentando localizar..."
    export PATH=$PATH:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
fi

# Show logs
pm2 logs promp-ia --lines 100 --raw
