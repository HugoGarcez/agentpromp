#!/bin/bash

# Defina a URL. Tente a porta do Frontend (5174) que redireciona para o plugin
# ou direto no backend (3001). Vamos usar o frontend para simular o fluxo real.
URL="http://localhost:5174/webhook"

echo "🔵 Enviando teste para: $URL"
echo "📦 Payload simulando n8n..."

curl -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d '[
  {
    "body": {
      "type": "message_n8n",
      "tenantId": 1,
      "content": {
        "text": "Olá, quais produtos você tem disponível?",
        "type": "text"
      },
      "contact": {
        "name": "Cliente Local",
        "number": "5511999999999"
      }
    }
  }
]'

echo ""
echo "✅ Teste finalizado!"
