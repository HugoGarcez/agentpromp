
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Simplified mock of the handleWebhookRequest logic to verify extraction
async function testExtraction(payload, dbConnectionId) {
    console.log("\n--- Testing Payload ---");

    // Payload Normalization
    let normalizedPayload = payload;
    if (Array.isArray(normalizedPayload)) {
        normalizedPayload = normalizedPayload[0];
    }

    const incomingConnectionIdArr = [
        normalizedPayload.sessionId,
        normalizedPayload.instanceId,
        normalizedPayload.channelId,
        normalizedPayload.body?.channel?.id, // Our NEW path
        normalizedPayload.ticket?.id,
        normalizedPayload.wuzapi?.id,
        normalizedPayload.sessionName,
        normalizedPayload.session
    ].filter(Boolean);

    const incomingConnectionId = incomingConnectionIdArr.length > 0 ? String(incomingConnectionIdArr[0]).trim() : null;

    const userMessage = normalizedPayload.content?.text ||
        normalizedPayload.body?.content?.text || // Our NEW path
        normalizedPayload.msg?.text ||
        normalizedPayload.msg?.body;

    console.log("Extracted Connection ID:", incomingConnectionId);
    console.log("Extracted Message:", userMessage);

    if (dbConnectionId) {
        if (!incomingConnectionId) {
            console.log("RESULT: IGNORED (Missing Connection ID)");
            return;
        }
        if (incomingConnectionId !== String(dbConnectionId)) {
            console.log(`RESULT: IGNORED (Mismatch: ${incomingConnectionId} !== ${dbConnectionId})`);
            return;
        }
        console.log("RESULT: PROCEED (Match!)");
    }
}

const userExample = [
    {
        "body": {
            "content": {
                "text": "Vc vê foto"
            },
            "channel": {
                "id": 48
            }
        }
    }
];

async function run() {
    console.log("Starting Webhook Logic Verification...");

    // Case 1: Match
    await testExtraction(userExample, "48");

    // Case 2: Mismatch
    await testExtraction(userExample, "99");

    // Case 3: Empty/Other structure
    await testExtraction({}, "48");
}

run();
