/**
 * conditionalTransfer.js
 * 
 * Módulo de Encaminhamento Condicional (Transferência com Coleta Conversacional via WhatsApp)
 * 
 * Responsabilidades:
 * - Detectar gatilhos de transferência condicional (keyword, command, always)
 * - Validar campos coletados (CPF, CNPJ, email, phone, etc.)
 * - Gerenciar loop de coleta conversacional
 * - Mascarar dados sensíveis (CPF, CNPJ)
 * - Renderizar template de mensagem de resumo
 */

// ============================================================
// PARTE 1 — Detecção de Gatilho
// ============================================================

/**
 * Normaliza string removendo acentos e convertendo para lowercase
 */
function normalizeText(text) {
    if (!text) return '';
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

/**
 * Verifica se a mensagem do usuário ativa o fluxo de transferência condicional
 * 
 * @param {string} message - Mensagem do usuário
 * @param {object} rule - Configuração da regra condicional
 * @returns {boolean}
 */
export function shouldTriggerConditionalTransfer(message, rule) {
    if (!rule || rule.mode !== 'conditional') return false;
    if (!message) return false;

    const triggerMode = rule.triggerMode || 'keyword';
    const normalizedMsg = normalizeText(message);

    switch (triggerMode) {
        case 'always':
            return true;

        case 'command': {
            const command = normalizeText(rule.triggerCommand);
            if (!command) return false;
            // Compara exatamente ou se a mensagem começa com o comando
            const matched = normalizedMsg.startsWith(command);
            if (!matched && normalizedMsg.includes(command)) {
                // Log de aviso se o comando está no meio da mensagem
                console.log(`[ConditionalTransfer] Potential command match found but not at start: "${command}" in "${normalizedMsg}"`);
            }
            return matched;
        }

        case 'keyword': {
            const keywords = rule.triggerKeywords || [];
            if (keywords.length === 0) return false;
            return keywords.some(kw => normalizedMsg.includes(normalizeText(kw)));
        }

        default:
            return false;
    }
}

// ============================================================
// PARTE 2 — Validação de Campos
// ============================================================

/**
 * Valida CPF com algoritmo de módulo 11 (dígitos verificadores)
 */
export function validateCPF(cpf) {
    const cleaned = cpf.replace(/\D/g, '');
    if (cleaned.length !== 11) return false;

    // Rejeitar CPFs com todos os dígitos iguais
    if (/^(\d)\1{10}$/.test(cleaned)) return false;

    // Verificar primeiro dígito
    let sum = 0;
    for (let i = 0; i < 9; i++) {
        sum += parseInt(cleaned.charAt(i)) * (10 - i);
    }
    let remainder = (sum * 10) % 11;
    if (remainder === 10) remainder = 0;
    if (remainder !== parseInt(cleaned.charAt(9))) return false;

    // Verificar segundo dígito
    sum = 0;
    for (let i = 0; i < 10; i++) {
        sum += parseInt(cleaned.charAt(i)) * (11 - i);
    }
    remainder = (sum * 10) % 11;
    if (remainder === 10) remainder = 0;
    if (remainder !== parseInt(cleaned.charAt(10))) return false;

    return true;
}

/**
 * Valida CNPJ com algoritmo de módulo 11 (dígitos verificadores)
 */
export function validateCNPJ(cnpj) {
    const cleaned = cnpj.replace(/\D/g, '');
    if (cleaned.length !== 14) return false;

    // Rejeitar CNPJs com todos os dígitos iguais
    if (/^(\d)\1{13}$/.test(cleaned)) return false;

    // Pesos para primeiro dígito
    const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 12; i++) {
        sum += parseInt(cleaned.charAt(i)) * weights1[i];
    }
    let remainder = sum % 11;
    const digit1 = remainder < 2 ? 0 : 11 - remainder;
    if (digit1 !== parseInt(cleaned.charAt(12))) return false;

    // Pesos para segundo dígito
    const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    sum = 0;
    for (let i = 0; i < 13; i++) {
        sum += parseInt(cleaned.charAt(i)) * weights2[i];
    }
    remainder = sum % 11;
    const digit2 = remainder < 2 ? 0 : 11 - remainder;
    if (digit2 !== parseInt(cleaned.charAt(13))) return false;

    return true;
}

/**
 * Valida e-mail com regex RFC 5322 simplificado
 */
function validateEmail(email) {
    const regex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return regex.test(email);
}

/**
 * Valida telefone brasileiro (com ou sem +55, DDD obrigatório, 8 ou 9 dígitos)
 */
function validatePhone(phone) {
    const cleaned = phone.replace(/\D/g, '');
    // Com +55: 13 dígitos (55 + DDD + 9 dígitos) ou 12 (55 + DDD + 8 dígitos)
    // Sem +55: 11 dígitos (DDD + 9 dígitos) ou 10 (DDD + 8 dígitos)
    return [10, 11, 12, 13].includes(cleaned.length);
}

/**
 * Valida nome (letras, acentos, espaços, hífens, min 2 chars)
 */
function validateName(name) {
    if (!name || name.trim().length < 2) return false;
    const regex = /^[a-zA-ZÀ-ÿ\s\-']+$/;
    return regex.test(name.trim());
}

/**
 * Valida campo booleano (aceita sim/não variantes)
 */
function validateBoolean(value) {
    const normalized = normalizeText(value);
    const validValues = ['sim', 's', 'yes', '1', 'nao', 'não', 'n', 'no', '0'];
    return validValues.includes(normalized);
}

/**
 * Converte resposta booleana para valor padronizado
 */
export function parseBooleanValue(value) {
    const normalized = normalizeText(value);
    return ['sim', 's', 'yes', '1'].includes(normalized);
}

/**
 * Valida campo select (verifica se valor é uma das opções válidas)
 */
function validateSelect(value, options) {
    if (!options || !Array.isArray(options)) return false;
    const normalizedValue = normalizeText(value);
    return options.some(opt => normalizeText(opt) === normalizedValue);
}

/**
 * Validação principal de campo
 * 
 * @param {object} field - Definição do campo (FormField)
 * @param {string|object} value - Valor enviado pelo usuário (texto ou mídia)
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateField(field, value) {
    const defaultError = field.errorMessage || 'Resposta inválida. Por favor, tente novamente.';

    // Campos de arquivo/imagem têm validação especial
    if (field.type === 'file' || field.type === 'image') {
        if (!value || typeof value !== 'object') {
            return { valid: false, error: field.errorMessage || 'Por favor, envie um arquivo.' };
        }

        // Verificar tipo MIME
        if (field.validation?.allowedMimeTypes && field.validation.allowedMimeTypes.length > 0) {
            if (!field.validation.allowedMimeTypes.includes(value.mimeType)) {
                return {
                    valid: false,
                    error: field.errorMessage || `Tipo de arquivo não aceito. Envie um dos seguintes formatos: ${field.validation.allowedMimeTypes.join(', ')}`
                };
            }
        }

        // Para imagem ou arquivo, validar MIME padrão se não há allowedMimeTypes configurado
        if (!field.validation?.allowedMimeTypes || field.validation.allowedMimeTypes.length === 0) {
            const acceptedTypes = [
                'image/jpeg', 'image/png', 'image/webp', 'image/heic', 
                'application/pdf', 'application/msword', 
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            ];
            
            if (!acceptedTypes.includes(value.mimeType)) {
                const hint = field.type === 'image' ? 'uma imagem (JPEG, PNG ou WebP)' : 'um documento (PDF, DOCX, XLSX)';
                return {
                    valid: false,
                    error: field.errorMessage || `Por favor, envie ${hint}.`
                };
            }
        }

        // Verificar tamanho
        const maxSize = field.validation?.maxSizeBytes || (10 * 1024 * 1024); // 10MB padrão
        if (value.size && value.size > maxSize) {
            const maxMB = Math.round(maxSize / (1024 * 1024));
            return {
                valid: false,
                error: field.errorMessage || `Arquivo muito grande. O tamanho máximo é ${maxMB}MB.`
            };
        }

        return { valid: true };
    }

    // Para campos de texto, garantir que value é string
    const textValue = typeof value === 'string' ? value.trim() : '';

    if (!textValue && field.required) {
        return { valid: false, error: defaultError };
    }

    switch (field.type) {
        case 'name':
            if (!validateName(textValue)) {
                return { valid: false, error: field.errorMessage || 'Por favor, informe um nome válido (apenas letras e espaços).' };
            }
            return { valid: true };

        case 'cpf':
            if (!validateCPF(textValue)) {
                return { valid: false, error: field.errorMessage || 'CPF inválido. Verifique os números e tente novamente.' };
            }
            return { valid: true };

        case 'cnpj':
            if (!validateCNPJ(textValue)) {
                return { valid: false, error: field.errorMessage || 'CNPJ inválido. Verifique os números e tente novamente.' };
            }
            return { valid: true };

        case 'email':
            if (!validateEmail(textValue)) {
                return { valid: false, error: field.errorMessage || 'E-mail inválido. Verifique o formato e tente novamente.' };
            }
            return { valid: true };

        case 'phone':
            if (!validatePhone(textValue)) {
                return { valid: false, error: field.errorMessage || 'Telefone inválido. Informe com DDD (ex: 11999998888).' };
            }
            return { valid: true };

        case 'company':
            if (textValue.length < 2) {
                return { valid: false, error: field.errorMessage || 'Por favor, informe o nome da empresa.' };
            }
            return { valid: true };

        case 'select':
            if (!validateSelect(textValue, field.validation?.options)) {
                const optionsDisplay = field.validation?.optionsDisplay || field.validation?.options || [];
                return {
                    valid: false,
                    error: field.errorMessage || `Opção inválida. Escolha uma das opções: ${optionsDisplay.join(', ')}`
                };
            }
            return { valid: true };

        case 'boolean':
            if (!validateBoolean(textValue)) {
                return { valid: false, error: field.errorMessage || 'Responda com "sim" ou "não".' };
            }
            return { valid: true };

        case 'text':
        default:
            if (field.validation?.minLength && textValue.length < field.validation.minLength) {
                return { valid: false, error: field.errorMessage || `Resposta muito curta. Mínimo ${field.validation.minLength} caracteres.` };
            }
            if (field.validation?.maxLength && textValue.length > field.validation.maxLength) {
                return { valid: false, error: field.errorMessage || `Resposta muito longa. Máximo ${field.validation.maxLength} caracteres.` };
            }
            return { valid: true };
    }
}

// ============================================================
// PARTE 3 — Mascaramento de Dados Sensíveis
// ============================================================

/**
 * Mascara CPF: exibe apenas ***.***.***-XX (últimos 2 dígitos)
 */
export function maskCPF(cpf) {
    const cleaned = cpf.replace(/\D/g, '');
    if (cleaned.length !== 11) return cpf;
    return `***.***.*${cleaned.slice(8, 9)}*-${cleaned.slice(9)}`;
}

/**
 * Mascara CNPJ: exibe apenas **.***.*** / ****-XX
 */
export function maskCNPJ(cnpj) {
    const cleaned = cnpj.replace(/\D/g, '');
    if (cleaned.length !== 14) return cnpj;
    return `**.***.***/${cleaned.slice(8, 12)}-${cleaned.slice(12)}`;
}

/**
 * Mascara valor sensível de acordo com o tipo do campo
 */
export function maskSensitiveData(fieldType, value) {
    switch (fieldType) {
        case 'cpf':
            return maskCPF(value);
        case 'cnpj':
            return maskCNPJ(value);
        default:
            return value;
    }
}

// ============================================================
// PARTE 4 — Renderização de Template
// ============================================================

/**
 * Renderiza template de mensagem substituindo variáveis {{fieldId}} pelos valores coletados
 * Dados sensíveis são mascarados automaticamente
 * 
 * @param {string} template - Template com variáveis {{...}}
 * @param {object} collectedData - Dados coletados { fieldId: valor }
 * @param {Array} fields - Definições dos campos (para saber o tipo de cada um)
 * @param {boolean} sendRawSensitiveData - Se true, não mascara dados sensíveis
 * @returns {string}
 */
export function renderTemplate(template, collectedData, fields, sendRawSensitiveData = false) {
    if (!template) return '';

    const fieldTypeMap = {};
    if (fields && Array.isArray(fields)) {
        fields.forEach(f => { fieldTypeMap[f.id] = f.type; });
    }

    return template.replace(/\{\{(\w+)\}\}/g, (match, fieldId) => {
        const value = collectedData[fieldId];
        if (value === undefined || value === null) return match; // Manter placeholder se não existir

        // Mascarar dados sensíveis (CPF, CNPJ)
        if (!sendRawSensitiveData) {
            const fieldType = fieldTypeMap[fieldId];
            if (fieldType === 'cpf' || fieldType === 'cnpj') {
                return maskSensitiveData(fieldType, value);
            }
        }

        return value;
    });
}

// ============================================================
// PARTE 5 — Verificação de Cancelamento
// ============================================================

/**
 * Verifica se a mensagem do usuário é um pedido de cancelamento
 */
export function isCancelMessage(message, cancelKeywords) {
    if (!message || !cancelKeywords || cancelKeywords.length === 0) return false;
    const normalizedMsg = normalizeText(message);
    return cancelKeywords.some(kw => normalizedMsg === normalizeText(kw));
}

// ============================================================
// PARTE 6 — Lógica de Coleta (Step Handler)
// ============================================================

/**
 * Retorna o próximo campo a ser perguntado, respeitando visibleIf
 * 
 * @param {Array} fields - Lista de campos configurados
 * @param {number} startIndex - Índice a partir do qual procurar
 * @param {object} collectedData - Dados já coletados
 * @returns {{ field: object, index: number } | null}
 */
export function getNextField(fields, startIndex, collectedData) {
    for (let i = startIndex; i < fields.length; i++) {
        const field = fields[i];

        // Verificar visibleIf
        if (field.visibleIf) {
            const conditionField = field.visibleIf.fieldId;
            const conditionValue = field.visibleIf.equals;
            const currentValue = collectedData[conditionField];

            // Se condição não é satisfeita, pular campo
            if (currentValue === undefined || currentValue === null) continue;

            const normalizedCurrent = typeof currentValue === 'boolean' ? currentValue : normalizeText(String(currentValue));
            const normalizedExpected = typeof conditionValue === 'boolean' ? conditionValue : normalizeText(String(conditionValue));

            if (normalizedCurrent !== normalizedExpected) continue;
        }

        // Verificar skipIfProvided
        if (field.skipIfProvided && collectedData[field.id] !== undefined) {
            continue;
        }

        return { field, index: i };
    }

    return null; // Todos os campos foram coletados
}

/**
 * Formata pergunta de campo select com opções numeradas
 */
export function formatSelectQuestion(field) {
    let question = field.question;
    if (field.type === 'select' && field.validation?.options) {
        const display = field.validation.optionsDisplay || field.validation.options;
        question += '\n\n' + display.map((opt, i) => `${i + 1}. ${opt}`).join('\n');
    }
    return question;
}

/**
 * Processa resposta de campo select (converte número para valor)
 */
export function resolveSelectValue(field, value) {
    if (field.type !== 'select' || !field.validation?.options) return value;

    // Se o usuário enviou um número, converter para a opção correspondente
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 1 && num <= field.validation.options.length) {
        return field.validation.options[num - 1];
    }

    return value;
}

/**
 * Processa um passo do loop de coleta conversacional
 * 
 * @param {object} rule - Configuração da regra condicional
 * @param {object} session - Sessão de transferência ativa (do banco)
 * @param {string} userMessage - Mensagem/resposta do usuário
 * @param {object|null} mediaPayload - Dados de mídia (se arquivo/imagem)
 * @returns {object} Resultado do passo:
 *   - { action: 'ask', message: string } → enviar próxima pergunta
 *   - { action: 'retry', message: string } → repetir pergunta (inválido)
 *   - { action: 'complete', collectedData: object, attachments: Array } → coleta finalizada
 *   - { action: 'cancelled', message: string } → usuário cancelou
 *   - { action: 'failed', message: string, reason: string } → falha por retries
 */
export function handleCollectionStep(rule, session, userMessage, mediaPayload = null) {
    const fields = rule.fields || [];
    const cancelKeywords = rule.cancelKeywords || ['cancelar', 'sair', 'desistir'];
    const maxRetries = rule.maxRetries || 2;

    // Parse dados da sessão
    let collectedData = {};
    let attachments = [];
    try {
        collectedData = session.collectedData ? JSON.parse(session.collectedData) : {};
        attachments = session.attachments ? JSON.parse(session.attachments) : [];
    } catch (e) {
        console.error('[ConditionalTransfer] Error parsing session data:', e);
    }

    // 1. Verificar cancelamento
    if (isCancelMessage(userMessage, cancelKeywords)) {
        return {
            action: 'cancelled',
            message: 'Tudo bem! Cancelei o encaminhamento. Posso te ajudar com mais alguma coisa?'
        };
    }

    // 2. Obter campo atual
    const currentFieldIndex = session.currentFieldIndex || 0;
    const currentField = fields[currentFieldIndex];

    if (!currentField) {
        // Não deveria chegar aqui, mas por segurança
        return {
            action: 'complete',
            collectedData,
            attachments
        };
    }

    // 3. Validar resposta
    let valueToValidate = userMessage;
    let valueToStore = userMessage;

    // Para campo select, tentar resolver número → opção
    if (currentField.type === 'select') {
        valueToValidate = resolveSelectValue(currentField, userMessage);
        valueToStore = valueToValidate;
    }

    // Para campo de arquivo/imagem, usar mediaPayload
    if ((currentField.type === 'file' || currentField.type === 'image') && mediaPayload) {
        valueToValidate = mediaPayload;
    }

    // Para boolean, armazenar valor padronizado
    if (currentField.type === 'boolean') {
        valueToStore = parseBooleanValue(userMessage) ? 'Sim' : 'Não';
    }

    const validation = validateField(currentField, valueToValidate);

    if (!validation.valid) {
        // Resposta inválida — retry
        const retries = (session.retriesOnCurrentField || 0) + 1;

        if (retries > maxRetries) {
            // Excedeu tentativas
            const retryHint = rule.triggerMode === 'command' ? rule.triggerCommand : (rule.triggerKeywords?.[0] || 'transferir');
            return {
                action: 'failed',
                message: `Não consegui coletar as informações necessárias. Pode tentar novamente quando quiser digitando "${retryHint}".`,
                reason: `Campo "${currentField.id}" falhou após ${retries} tentativas`,
                retries
            };
        }

        return {
            action: 'retry',
            message: validation.error,
            retries
        };
    }

    // 4. Armazenar valor validado
    if (currentField.type === 'file' || currentField.type === 'image') {
        // Armazenar referência de mídia
        if (mediaPayload) {
            attachments.push({
                fieldId: currentField.id,
                mediaId: mediaPayload.mediaId || mediaPayload.id,
                mimeType: mediaPayload.mimeType,
                fileName: mediaPayload.fileName || 'arquivo',
                caption: currentField.question,
                url: mediaPayload.url || null
            });
            collectedData[currentField.id] = `[arquivo: ${mediaPayload.fileName || 'media'}]`;
        }
    } else {
        collectedData[currentField.id] = valueToStore;
    }

    // 5. Avançar para o próximo campo
    const nextFieldResult = getNextField(fields, currentFieldIndex + 1, collectedData);

    if (!nextFieldResult) {
        // Todos os campos coletados!
        return {
            action: 'complete',
            collectedData,
            attachments,
            nextFieldIndex: currentFieldIndex + 1
        };
    }

    // Retornar próxima pergunta
    return {
        action: 'ask',
        message: formatSelectQuestion(nextFieldResult.field),
        collectedData,
        attachments,
        nextFieldIndex: nextFieldResult.index
    };
}

/**
 * Gera a mensagem introdutória + primeira pergunta ao iniciar o fluxo
 */
export function getInitialMessages(rule) {
    const fields = rule.fields || [];
    const firstField = getNextField(fields, 0, {});

    if (!firstField) {
        return {
            intro: null,
            question: null,
            fieldIndex: 0
        };
    }

    return {
        intro: 'Antes de te encaminhar para um atendente, preciso de algumas informações rápidas. 📋',
        question: formatSelectQuestion(firstField.field),
        fieldIndex: firstField.index
    };
}

/**
 * Gera um ID de protocolo para a transferência
 */
export function generateTransferId() {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `TRF-${timestamp}-${random}`;
}
