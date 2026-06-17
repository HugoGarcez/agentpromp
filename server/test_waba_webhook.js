import assert from 'assert';

// Simulação da lógica exata de processamento no webhook do server/index.js
function runWebhookSimulation(reqBody) {
    const outputs = {};

    // --- PAYLOAD NORMALIZATION ---
    let payload = reqBody;
    if (Array.isArray(payload)) {
        payload = payload[0];
    }

    // Unpack body wrapping if present and doesn't conflict with direct payloads (common in WABA / proxy setups)
    if (payload && payload.body && typeof payload.body === 'object' && !payload.msg) {
        payload = { ...payload, ...payload.body };
    }

    // 2. Identify Sender and Owner Early
    let rawSender = payload.key?.remoteJid || payload.contact?.number || payload.body?.contact?.number || 
                      payload.number || payload.data?.key?.remoteJid || payload.msg?.from || payload.msg?.sender ||
                      payload.ticket?.contact?.number || payload.sender?.number;
    let cleanSender = rawSender ? String(rawSender).replace(/\D/g, '') : '';
    
    let rawOwner = payload.msg?.owner || payload.owner || payload.to || payload.msg?.to || 
                      payload.ticket?.owner || payload.ticket?.destination || payload.ticket?.whatsappId ||
                      payload.data?.to || payload.data?.owner || payload.destination;
    let cleanOwner = rawOwner ? String(rawOwner).replace(/\D/g, '') : null;

    outputs.rawSender = rawSender;
    outputs.cleanSender = cleanSender;
    outputs.rawOwner = rawOwner;
    outputs.cleanOwner = cleanOwner;

    // --- REAL-TIME DIAGNOSTIC RECURSIVE ID FINDER ---
    const foundIds = new Set();
    const findIdsRecursively = (obj, currentPath = 'payload') => {
        if (!obj || typeof obj !== 'object') return;
        for (const key of Object.keys(obj)) {
            const val = obj[key];
            const newPath = `${currentPath}.${key}`;
            const lowerKey = key.toLowerCase();
            const idKeys = ['whatsappid', 'instanceid', 'connectionid', 'wabaid', 'sessionid', 'sessionname', 'session', 'channelid', 'channel_id', 'cid', 'wid', 'tokenapi', 'uuid'];
            
            if (idKeys.includes(lowerKey) || (lowerKey === 'id' && currentPath.endsWith('.whatsapp'))) {
                if (val !== null && val !== undefined && (typeof val === 'string' || typeof val === 'number')) {
                    const strVal = String(val).trim();
                    if (strVal) {
                        foundIds.add(strVal);
                    }
                }
            }
            if (val && typeof val === 'object') {
                findIdsRecursively(val, newPath);
            }
        }
    };
    findIdsRecursively(payload);
    
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const incomingConnectionIdArr = Array.from(foundIds).sort((a, b) => {
        const aIsUuid = uuidRegex.test(a);
        const bIsUuid = uuidRegex.test(b);
        if (aIsUuid && !bIsUuid) return -1;
        if (!aIsUuid && bIsUuid) return 1;
        return 0;
    });

    outputs.incomingConnectionIdArr = incomingConnectionIdArr;

    // Safety Check for Content
    let userMessage = payload.content?.text ||
        payload.text ||
        (typeof payload.body === 'string' ? payload.body : null) ||
        payload.body?.text ||
        payload.body?.content?.text ||
        payload.data?.message?.conversation ||
        payload.data?.message?.extendedTextMessage?.text ||
        payload.data?.text ||
        payload.message?.conversation ||
        payload.message?.extendedTextMessage?.text ||
        payload.message?.text ||
        payload.msg?.text?.body ||
        payload.msg?.text ||
        payload.msg?.body ||
        payload.msg?.message ||
        payload.msg?.content;

    // 🔥 CRITICAL FIX: Ensure userMessage is always a STRING (never object)
    if (typeof userMessage !== 'string') {
        userMessage = typeof userMessage === 'object' && userMessage !== null
            ? (userMessage.text || userMessage.body || userMessage.conversation || '')
            : '';
    }

    outputs.userMessage = userMessage;

    // Check WhatsApp details
    outputs.whatsappType = payload.ticket?.whatsapp?.type;
    outputs.tokenAPI = payload.ticket?.whatsapp?.tokenAPI;

    return outputs;
}

// O payload de exemplo fornecido pelo usuário
const wabaExamplePayload = [
  {
    "headers": {
      "host": "agente.promp.com.br",
      "content-length": "3799",
      "accept": "application/json",
      "content-type": "application/json"
    },
    "params": {},
    "query": {},
    "body": {
      "method": "message",
      "msg": {
        "from": "5521990408505",
        "from_user_id": "BR.1306909301512063",
        "id": "wamid.HBgNNTUyMTk5MDQwODUwNRUCABIYFDNBMDcxNTQxRDY1RTBGM0FCNjc3AA==",
        "timestamp": "1781654888",
        "text": {
          "body": "Teste"
        },
        "type": "text"
      },
      "ticket": {
        "protocol": "2026160621043130730",
        "id": 30730,
        "status": "pending",
        "unreadMessages": 3,
        "lastMessage": "Só me confirma se você é servidor efetivo....? ",
        "channel": "waba",
        "answered": true,
        "isGroup": false,
        "contactId": 68707,
        "whatsappId": 133,
        "tenantId": 52,
        "contact": {
          "id": 68707,
          "name": "Hugo",
          "number": "5521990408505"
        },
        "whatsapp": {
          "id": 133,
          "name": "WABA 1284528513237477 - 1105737482629775",
          "tokenAPI": "1105737482629775",
          "type": "waba"
        }
      }
    }
  }
];

function test() {
    console.log("Running WABA Webhook parser tests...");
    const result = runWebhookSimulation(wabaExamplePayload);

    console.log("Result outputs:", JSON.stringify(result, null, 2));

    // Validações
    assert.strictEqual(result.cleanSender, "5521990408505");
    assert.strictEqual(result.cleanOwner, "133"); // extraído de ticket.whatsappId
    assert.strictEqual(result.userMessage, "Teste");
    assert.strictEqual(result.whatsappType, "waba");
    assert.strictEqual(result.tokenAPI, "1105737482629775");
    
    // Verifica se os IDs foram encontrados recursivamente (incluindo whatsappId e tokenAPI)
    assert(result.incomingConnectionIdArr.includes("133"));
    assert(result.incomingConnectionIdArr.includes("1105737482629775"));

    console.log("ALL TESTS PASSED SUCCESSFULLY! WABA channel payloads are normalized and parsed correctly.");
}

test();
