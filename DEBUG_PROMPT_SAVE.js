// Add this code at line 2011 (before "while (turns < maxTurns)")

// 🔍 DEBUG: Save full system prompt to file for inspection
const fs = require('fs');
const debugPromptPath = '/tmp/last_ai_prompt.txt';
try {
    fs.writeFileSync(debugPromptPath, `=== SYSTEM PROMPT ===\n${messages[0].content}\n\n=== USER MESSAGE ===\n${message}\n`);
    console.log(`[DEBUG] Full prompt saved to ${debugPromptPath}`);

    if (messages[0].content.includes('VERIFICAÇÃO DE ESTOQUE ATUAL')) {
        console.log('[DEBUG] ✅ Verification header FOUND in prompt');
    } else {
        console.log('[DEBUG] ❌ WARNING: Verification header NOT FOUND in prompt!');
    }
} catch (e) {
    console.error('[DEBUG] Failed to save prompt:', e);
}
