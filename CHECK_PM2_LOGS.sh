#!/bin/bash

echo "🔍 VERIFICANDO LOGS DO PM2 - ÚLTIMAS RESPOSTAS DA IA"
echo "=============================================="
echo ""

cd /var/www/promp-ia

echo "📋 Últimas 100 linhas dos logs:"
pm2 logs --lines 100 --nostream | grep -E "\[AIResponse\]|\[ImageResolution\]|SHOW_IMAGE" -A 2 -B 2

echo ""
echo "=============================================="
echo "✅ Análise completa"
