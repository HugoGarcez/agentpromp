import fs from 'fs';
import path from 'path';
import os from 'os';
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
let pm2LogsExist = false;
let allLogs = '';

try {
    if (fs.existsSync(pm2LogDir)) {
        pm2LogsExist = true;
        console.log(`📂 Pasta de logs PM2 detectada em: ${pm2LogDir}`);

        // Pega os arquivos de output mais recentes do PM2 (promp-ia-out.log)
        const files = fs.readdirSync(pm2LogDir)
            .filter(f => f.includes('out.log') || f.includes('error.log'));

        for (const file of files) {
            const filePath = path.join(pm2LogDir, file);
            console.log(`   Lendo arquivo: ${file}...`);
            const content = fs.readFileSync(filePath, 'utf8');
            allLogs += content + '\n';
        }
    }
} catch (e) {
    console.warn(`⚠️ Aviso: Falha ao ler logs diretamente do disco ~/.pm2/logs. (${e.message})`);
}

// Se não conseguiu ler o disco, tenta pescar usando o comando tail do PM2
if (!pm2LogsExist) {
    console.log(`🔄 Tentando capturar logs via comando [pm2 logs] - últimos 2000...`);
    try {
        allLogs = execSync('pm2 logs --lines 2000 --raw --nostream', { encoding: 'utf8' });
    } catch (e) {
        console.error('❌ Não foi possível extrair logs via PM2.');
    }
}

if (!allLogs) {
    console.error('❌ ERRO CRÍTICO: Nenhum log pôde ser encontrado no sistema.');
    process.exit(1);
}

// Separar em linhas
const lines = allLogs.split('\n');

console.log(`\n=============================================================`);
console.log(`📊 RESULTADO DA AUDITORIA (Exibindo menções do cliente)`);
console.log(`=============================================================\n`);

let matchesCount = 0;
const results = [];

// Pesquisa
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Filtro Flexível (Procura pelo numero exato, pelo numero sem +55 ou apenas os ultimos digitos com espacos)
    if (
        line.includes(cleanNumber) ||
        line.includes(shortNumber) ||
        (line.includes(last8) && line.includes('Webhook'))
    ) {
        matchesCount++;

        // Captura a linha e talvez 1 ou 2 blocos seguintes se estiverem relacionados ao array
        results.push(`[LINHA ${i + 1}] -> ${line.trim()}`);

        // Se a linha tiver "Ignoring", destacar
        if (line.toLowerCase().includes('ignoring') || line.toLowerCase().includes('failed') || line.toLowerCase().includes('error')) {
            results.push(`      🔴 [ALERTA DE BLOQUEIO ENCONTRADO NESSA ETAPA] 🔴`);
        }
    }
}

if (matchesCount === 0) {
    console.log(`⚠️ Nenhuma menção ao número ${cleanNumber} foi encontrada nos logs mais recentes.`);
    console.log(`   Isso significa que a sua aplicação VPS PROVAVELMENTE NEM RECEBEU o Webhook do mensageiro (Promp/Wuzapi).`);
    console.log(`   Verifique:`);
    console.log(`   1) O celular do admin/bot não está desconectado.`);
    console.log(`   2) O Webhook lá na Promp/Wuzapi/Evolution está configurado corretamente.`);
} else {
    results.forEach(r => console.log(r));
    console.log(`\n✅ O número foi mencionado ${matchesCount} vezes nos logs. Analise as etapas '🔴 ALERTA' acima para ver se o código internamente dropou forçadamente a mensagem.`);
}
console.log('\n');
