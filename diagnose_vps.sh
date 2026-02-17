#!/bin/bash
# Execute este script NA VPS para diagnosticar o problema da Camisa Herói

echo "🔍 DIAGNÓSTICO: Verificando dados da Camisa Herói"
echo "================================================================"

cd /var/www/promp-ia

# 1. Atualizar código primeiro
echo ""
echo "📥 1. Baixando código atualizado..."
git pull origin main

# 2. Rodar script de diagnóstico
echo ""
echo "📊 2. Verificando produtos no banco..."
node server/check_products_vps.js 2>&1 | grep -A 20 "Camisa"

echo ""
echo "================================================================"
echo "✅ Diagnóstico completo!"
echo ""
echo "👉 COPIE A SAÍDA ACIMA e envie para análise"
