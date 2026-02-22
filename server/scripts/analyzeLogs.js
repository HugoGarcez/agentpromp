import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import { execSync } from 'child_process';

const TARGET_NUMBER = process.argv[2];

if (!TARGET_NUMBER) {
    console.error('❌ ERRO: Por favor, forneça o número de telefone.');
    console.log('💡 USO CORRETO: node server/scripts/analyzeLogs.js +5514996930317');
    process.exit(1);
}

// Limpa caracteres não numéricos para a pesquisa principal (Ex: 5514996930317)
const cleanNumber = TARGET_NUMBER.replace(/\D/g, '');
const shortNumber = cleanNumber.substring(2); // Sem código do país (Ex: 14996930317)
const last8 = cleanNumber.slice(-8); // Pesquisa frouxa

console.log(`\n🔍 INICIANDO BUSCA DE LOGS PARA O NÚMERO: ${cleanNumber}\n`);

// Determina o diretório padrão de logs do PM2
const pm2LogDir = path.join(os.homedir(), '.pm2', 'logs');

async function processLogs() {
    let matchesCount = 0;
    const results = [];

    let pm2LogsExist = false;
    let foundFiles = [];

    try {
        if (fs.existsSync(pm2LogDir)) {
            pm2LogsExist = true;
            console.log(`📂 Pasta de logs PM2 detectada em: ${pm2LogDir}`);
            foundFiles = fs.readdirSync(pm2LogDir).filter(f => f.includes('out.log') || f.includes('error.log'));
        }
    } catch (e) {
        console.warn(`⚠️ Aviso: Falha ao ler diretorio ~/.pm2/logs. (${e.message})`);
    }

    if (pm2LogsExist && foundFiles.length > 0) {
        for (const file of foundFiles) {
            const filePath = path.join(pm2LogDir, file);
            console.log(`   Lendo arquivo em stream: ${file}...`);

            // LER USANDO STREAM PARA NÃO ESTOURAR A MEMÓRIA DA VPS
            const fileStream = fs.createReadStream(filePath);
            const rl = readline.createInterface({
                input: fileStream,
                crlfDelay: Infinity
            });

            let lineNum = 0;
            for await (const line of rl) {
                lineNum++;
                if (
                    line.includes(cleanNumber) ||
                    line.includes(shortNumber) ||
                    (line.includes(last8) && line.includes('Webhook'))
                ) {
                    matchesCount++;
                    results.push(`[ARQUIVO: ${file} | LINHA: ${lineNum}] -> ${line.trim()}`);

                    if (line.toLowerCase().includes('ignoring') || line.toLowerCase().includes('failed') || line.toLowerCase().includes('error')) {
                        results.push(`      🔴 [ALERTA DE BLOQUEIO ENCONTRADO NESSA ETAPA] 🔴`);
                    }
                }
            }
        }
    } else {
        console.log(`🔄 Tentando capturar via pm2 logs (Isso pode custar memoria)...`);
        try {
            const output = execSync('pm2 logs --lines 5000 --raw --nostream', { encoding: 'utf8', maxBuffer: 1024 * 1024 * 50 });
            const lines = output.split('\n');
            let lineNum = 0;
            for (const line of lines) {
                lineNum++;
                if (
                    line.includes(cleanNumber) ||
                    line.includes(shortNumber) ||
                    (line.includes(last8) && line.includes('Webhook'))
                ) {
                    matchesCount++;
                    results.push(`[PM2 CONSOLE | LINHA: ${lineNum}] -> ${line.trim()}`);

                    if (line.toLowerCase().includes('ignoring') || line.toLowerCase().includes('failed') || line.toLowerCase().includes('error')) {
                        results.push(`      🔴 [ALERTA DE BLOQUEIO ENCONTRADO NESSA ETAPA] 🔴`);
                    }
                }
            }
        } catch (e) {
            console.error('❌ Não foi possível extrair logs.');
        }
    }

    console.log(`\n=============================================================`);
    console.log(`📊 RESULTADO DA AUDITORIA (Exibindo menções do cliente)`);
    console.log(`=============================================================\n`);

    if (matchesCount === 0) {
        console.log(`⚠️ Nenhuma menção ao número ${cleanNumber} foi encontrada nos logs.`);
        console.log(`   Isso significa que a sua aplicação VPS PROVAVELMENTE NEM RECEBEU o Webhook do mensageiro.`);
        console.log(`   Verifique:`);
        console.log(`   1) O celular do admin/bot não está desconectado.`);
        console.log(`   2) O Webhook lá na Promp está configurado corretamente.`);
    } else {
        results.forEach(r => console.log(r));
        console.log(`\n✅ O número foi mencionado ${matchesCount} vezes nos logs. Analise as etapas '🔴 ALERTA' acima.`);
    }
    console.log('\n');
}

processLogs();
