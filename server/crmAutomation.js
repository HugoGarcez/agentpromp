import { OpenAI } from 'openai';

const PROMP_BASE_URL = process.env.PROMP_BASE_URL || 'https://api.promp.com.br';

// ─── HTTP helpers ────────────────────────────────────────────────────────────

function crmHeaders(token) {
    const clean = token?.trim().replace(/^Bearer\s+/i, '');
    return { 'Authorization': `Bearer ${clean}`, 'Content-Type': 'application/json' };
}

function crmBase(prompUuid) {
    return `${PROMP_BASE_URL}/v2/api/external/${prompUuid}`;
}

// ─── Promp CRM API ───────────────────────────────────────────────────────────

export async function listCrmPipelines(prompUuid, prompToken) {
    const res = await fetch(`${crmBase(prompUuid)}/pipeline/list`, {
        headers: crmHeaders(prompToken),
    });
    if (!res.ok) throw new Error(`Promp pipeline/list ${res.status}`);
    return res.json();
}

export async function listCrmOpportunities(prompUuid, prompToken, { page = 1, limit = 100, status = 'open', pipelineId } = {}) {
    const q = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) q.append('status', status);
    if (pipelineId) q.append('pipelineId', String(pipelineId));
    const res = await fetch(`${crmBase(prompUuid)}/listOpportunities?${q}`, {
        headers: crmHeaders(prompToken),
    });
    if (!res.ok) throw new Error(`Promp listOpportunities ${res.status}`);
    return res.json();
}

export async function createCrmOpportunity(prompUuid, prompToken, payload) {
    const res = await fetch(`${crmBase(prompUuid)}/createOpportunity`, {
        method: 'POST',
        headers: crmHeaders(prompToken),
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Promp createOpportunity ${res.status}`);
    return res.json();
}

export async function updateCrmOpportunity(prompUuid, prompToken, payload) {
    const res = await fetch(`${crmBase(prompUuid)}/updateOpportunity`, {
        method: 'POST',
        headers: crmHeaders(prompToken),
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Promp updateOpportunity ${res.status}`);
    return res.json();
}

export async function deleteCrmOpportunity(prompUuid, prompToken, opportunityId) {
    const res = await fetch(`${crmBase(prompUuid)}/deleteOpportunity`, {
        method: 'POST',
        headers: crmHeaders(prompToken),
        body: JSON.stringify({ opportunityId }),
    });
    if (!res.ok) throw new Error(`Promp deleteOpportunity ${res.status}`);
    return res.json();
}

// ─── Conversation history ────────────────────────────────────────────────────

export async function appendConversationHistory(prisma, companyId, contactNumber, role, content) {
    try {
        const opp = await prisma.activeOpportunity.findFirst({
            where: { companyId, contactNumber, isActive: true },
        });
        if (!opp) return;

        const history = opp.conversationHistory ? JSON.parse(opp.conversationHistory) : [];
        history.push({ role, content, timestamp: new Date().toISOString() });

        await prisma.activeOpportunity.update({
            where: { id: opp.id },
            data: { conversationHistory: JSON.stringify(history.slice(-50)) },
        });
    } catch (e) {
        console.error('[CRM] appendConversationHistory error:', e.message);
    }
}

// ─── AI: opportunity analyser (description + value) ─────────────────────────

/**
 * Analisa a conversa e retorna, em uma única chamada de IA:
 *  - description: bullet points com pontos-chave da negociação
 *  - value: soma dos produtos/serviços de interesse do lead (null se incerto)
 *  - valueItems: lista dos itens que compõem o valor (para rastreabilidade)
 *
 * Chamado ao rastrear nova oportunidade, ao avançar de etapa e ao fechar (win/lose).
 */
export async function analyzeOpportunityFromHistory(historyArray, existingDescription, existingValue, openai, model = 'gpt-4o-mini') {
    if (!historyArray || historyArray.length === 0) {
        return { description: existingDescription || null, value: null, valueItems: [] };
    }

    const historyText = historyArray
        .slice(-30)
        .map(m => `[${m.role === 'user' ? 'Cliente' : 'Agente'}]: ${m.content}`)
        .join('\n');

    const contextBlock = [
        existingDescription ? `Descrição atual: ${existingDescription}` : '',
        existingValue != null ? `Valor atual registrado: R$ ${existingValue}` : '',
    ].filter(Boolean).join('\n');

    const systemPrompt = `Você é um assistente especialista em CRM de vendas.
Analise o histórico de conversa e retorne APENAS JSON válido sem markdown com os campos:
{
  "description": "string com bullet points (•) em português — pontos cruciais da negociação (máx. 6 bullets)",
  "value": number | null,
  "valueItems": ["string"]
}

Regras para "description":
- Interesse e necessidade do cliente
- Dados importantes (empresa, CNPJ/CPF, produto/serviço desejado, prazo, restrições)
- Objeções ou dúvidas levantadas
- Status atual e próximo passo
- Mantenha informações ainda válidas da descrição atual; acrescente apenas o que é novo

Regras para "value":
- Some o valor TOTAL dos produtos e serviços pelos quais o cliente demonstrou interesse CLARO na conversa
- Se preços foram mencionados explicitamente (ex: "R$ 300", "custa 1500"), use-os
- Se quantidades foram combinadas (ex: "quero 3 unidades"), multiplique pela unidade
- Se o valor não puder ser determinado com segurança a partir da conversa, retorne null — nunca invente
- Não inclua valores hipotéticos ou que o cliente rejeitou
- Retorne number (sem R$ ou formatação) ou null

Regras para "valueItems":
- Lista dos itens/serviços que compõem o valor (ex: ["2x Produto X – R$200 cada", "Serviço Y – R$500"])
- Vazio [] se value for null`;

    const userPrompt = contextBlock
        ? `${contextBlock}\n\nHistórico recente da conversa:\n${historyText}`
        : `Histórico da conversa:\n${historyText}`;

    const resp = await openai.chat.completions.create({
        model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
        max_tokens: 500,
        temperature: 0.2,
    });

    try {
        const raw = resp.choices[0]?.message?.content?.trim() || '{}';
        const parsed = JSON.parse(raw);
        return {
            description: parsed.description || existingDescription || null,
            value: typeof parsed.value === 'number' ? Math.round(parsed.value * 100) / 100 : null,
            valueItems: Array.isArray(parsed.valueItems) ? parsed.valueItems : [],
        };
    } catch {
        return { description: existingDescription || null, value: null, valueItems: [] };
    }
}

// ─── AI: lead progression evaluator ─────────────────────────────────────────

export async function evaluateLeadProgression(lead, condition, nextStages, openai, model = 'gpt-4o-mini') {
    const systemPrompt = `Você é um avaliador especialista em funis de vendas CRM.
Analise o contexto do lead e determine se ele deve avançar de etapa.
Responda APENAS com JSON válido sem markdown: {"shouldAdvance":bool,"targetStageId":number|null,"targetStageName":string|null,"reasoning":string,"confidence":number,"action":"advance"|"mark_win"|"mark_lose"|"stay"}`;

    const userPrompt = `Condição definida: "${condition}"

Lead:
- Nome: ${lead.contactName}
- Telefone: ${lead.contactNumber}
- Oportunidade: ${lead.opportunityName}
- Valor: ${lead.opportunityValue != null ? `R$ ${lead.opportunityValue}` : 'Não definido'}
- Etapa atual: ${lead.currentStage}
- Dias na etapa: ${lead.daysInCurrentStage}
- Histórico de conversa:
${lead.conversationHistory || 'Sem histórico disponível'}

Próximas etapas disponíveis:
${nextStages.length ? nextStages.map(s => `- ID:${s.id} | ${s.name} | ordem:${s.order}`).join('\n') : 'Nenhuma (esta é a última etapa)'}

Avalie e responda em JSON.`;

    const resp = await openai.chat.completions.create({
        model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
        max_tokens: 350,
        temperature: 0.2,
    });

    const raw = resp.choices[0]?.message?.content?.trim() || '{}';
    return JSON.parse(raw);
}

// ─── Automation job ──────────────────────────────────────────────────────────

function formatHistoryForAI(historyArray) {
    if (!historyArray.length) return null;
    return historyArray.slice(-20).map(m => `[${m.role}]: ${m.content}`).join('\n');
}

function daysInStage(stageEnteredAt) {
    if (!stageEnteredAt) return 0;
    return Math.floor((Date.now() - new Date(stageEnteredAt).getTime()) / 86_400_000);
}

export async function runCRMAutomationJob(prisma) {
    console.log('[CRM Job] Starting pipeline automation evaluation...');

    const automations = await prisma.pipelineAutomation.findMany({
        where: { isActive: true },
        include: { company: { select: { prompUuid: true, prompToken: true } } },
    });

    if (!automations.length) {
        console.log('[CRM Job] No active automations found.');
        return;
    }

    const globalConfig = await prisma.globalConfig.findFirst();
    const openaiKey = globalConfig?.openaiKey || process.env.OPENAI_API_KEY;
    if (!openaiKey) {
        console.error('[CRM Job] No OpenAI key configured, skipping.');
        return;
    }
    const openai = new OpenAI({ apiKey: openaiKey });
    const model = 'gpt-4o-mini';

    for (const automation of automations) {
        const { prompUuid, prompToken } = automation.company;
        if (!prompUuid || !prompToken) {
            console.warn(`[CRM Job] Missing Promp credentials for automation ${automation.id}`);
            continue;
        }

        const stages = JSON.parse(automation.stages || '[]');

        let result;
        try {
            result = await listCrmOpportunities(prompUuid, prompToken, {
                page: 1, limit: 40, status: 'open', pipelineId: automation.pipelineId,
            });
        } catch (e) {
            console.error(`[CRM Job] Failed to fetch opportunities (pipeline ${automation.pipelineId}):`, e.message);
            continue;
        }

        const opportunities = result?.data?.data || [];
        console.log(`[CRM Job] ${opportunities.length} opportunities in "${automation.pipelineName}"`);

        for (const opp of opportunities) {
            const stageConfig = stages.find(s => s.stageId === opp.stageId);
            if (!stageConfig?.advanceCondition) continue;

            const nextStages = stages
                .filter(s => s.stageOrder > stageConfig.stageOrder)
                .sort((a, b) => a.stageOrder - b.stageOrder);

            const activeOpp = await prisma.activeOpportunity.findUnique({
                where: { companyId_opportunityId: { companyId: automation.companyId, opportunityId: opp.id } },
            });

            // Parse history once — reused for both evaluator and description generator
            const historyArray = activeOpp?.conversationHistory
                ? JSON.parse(activeOpp.conversationHistory)
                : [];

            const lead = {
                contactName: opp.contactName || opp.contact?.name || 'Lead',
                contactNumber: String(opp.number || opp.contact?.number || ''),
                opportunityName: opp.name,
                opportunityValue: opp.value,
                currentStage: stageConfig.stageName,
                daysInCurrentStage: daysInStage(activeOpp?.stageEnteredAt),
                conversationHistory: formatHistoryForAI(historyArray),
            };

            let evaluation;
            try {
                evaluation = await evaluateLeadProgression(
                    lead, stageConfig.advanceCondition,
                    nextStages.map(s => ({ id: s.stageId, name: s.stageName, order: s.stageOrder })),
                    openai, model
                );
            } catch (e) {
                console.error(`[CRM Job] AI evaluation failed for opportunity ${opp.id}:`, e.message);
                continue;
            }

            const isNewTracking = !activeOpp;

            // Persist tracking record
            const savedOpp = await prisma.activeOpportunity.upsert({
                where: { companyId_opportunityId: { companyId: automation.companyId, opportunityId: opp.id } },
                create: {
                    companyId: automation.companyId,
                    automationId: automation.id,
                    opportunityId: opp.id,
                    contactNumber: lead.contactNumber,
                    contactName: lead.contactName,
                    opportunityName: opp.name,
                    currentStageId: opp.stageId,
                    currentStageName: stageConfig.stageName,
                    lastEvaluatedAt: new Date(),
                },
                update: { lastEvaluatedAt: new Date() },
            });

            // ── New opportunity first seen with history → push initial description + value ──
            if (isNewTracking && historyArray.length > 0) {
                try {
                    const analysis = await analyzeOpportunityFromHistory(
                        historyArray, opp.description, opp.value, openai, model
                    );
                    const updatePayload = { opportunityId: opp.id };
                    if (analysis.description) updatePayload.description = analysis.description;
                    if (analysis.value !== null) updatePayload.value = analysis.value;

                    if (updatePayload.description || updatePayload.value != null) {
                        await updateCrmOpportunity(prompUuid, prompToken, updatePayload);
                        const logParts = [];
                        if (analysis.value !== null) logParts.push(`value=R$${analysis.value}`);
                        if (analysis.valueItems.length) logParts.push(analysis.valueItems.join(', '));
                        console.log(`[CRM Job] Initial analysis set for opportunity ${opp.id}${logParts.length ? ` (${logParts.join(' | ')})` : ''}`);
                    }
                } catch (e) {
                    console.error(`[CRM Job] Failed to set initial analysis for ${opp.id}:`, e.message);
                }
            }

            // ── Advance to next stage ─────────────────────────────────────────────
            if (evaluation.action === 'advance' && evaluation.shouldAdvance && evaluation.targetStageId) {
                try {
                    const analysis = await analyzeOpportunityFromHistory(
                        historyArray, opp.description, opp.value, openai, model
                    );

                    const updatePayload = {
                        opportunityId: opp.id,
                        stageId: evaluation.targetStageId,
                        description: analysis.description || `[IA] ${evaluation.reasoning}`,
                    };
                    if (analysis.value !== null) updatePayload.value = analysis.value;

                    await updateCrmOpportunity(prompUuid, prompToken, updatePayload);

                    const targetStage = stages.find(s => s.stageId === evaluation.targetStageId);
                    await prisma.activeOpportunity.update({
                        where: { id: savedOpp.id },
                        data: {
                            currentStageId: evaluation.targetStageId,
                            currentStageName: targetStage?.stageName || evaluation.targetStageName || '',
                            stageEnteredAt: new Date(),
                        },
                    });
                    await prisma.automationLog.create({
                        data: {
                            companyId: automation.companyId,
                            opportunityId: savedOpp.id,
                            action: 'advance',
                            fromStageId: opp.stageId,
                            toStageId: evaluation.targetStageId,
                            reasoning: evaluation.reasoning,
                            confidence: evaluation.confidence,
                        },
                    });
                    const valueLog = analysis.value !== null ? ` | value=R$${analysis.value}` : '';
                    console.log(`[CRM Job] Opportunity ${opp.id} advanced → stage ${evaluation.targetStageId}${valueLog}`);
                } catch (e) {
                    console.error(`[CRM Job] Failed to advance opportunity ${opp.id}:`, e.message);
                }

            // ── Mark as won or lost ───────────────────────────────────────────────
            } else if (evaluation.action === 'mark_win' || evaluation.action === 'mark_lose') {
                try {
                    const analysis = await analyzeOpportunityFromHistory(
                        historyArray, opp.description, opp.value, openai, model
                    );

                    const updatePayload = {
                        opportunityId: opp.id,
                        status: evaluation.action === 'mark_win' ? 'win' : 'lose',
                        description: analysis.description || `[IA] ${evaluation.reasoning}`,
                    };
                    if (analysis.value !== null) updatePayload.value = analysis.value;

                    await updateCrmOpportunity(prompUuid, prompToken, updatePayload);
                    await prisma.activeOpportunity.update({
                        where: { id: savedOpp.id },
                        data: { isActive: false },
                    });
                    await prisma.automationLog.create({
                        data: {
                            companyId: automation.companyId,
                            opportunityId: savedOpp.id,
                            action: evaluation.action,
                            fromStageId: opp.stageId,
                            reasoning: evaluation.reasoning,
                            confidence: evaluation.confidence,
                        },
                    });
                    const valueLog = analysis.value !== null ? ` | value=R$${analysis.value}` : '';
                    console.log(`[CRM Job] Opportunity ${opp.id} marked as ${evaluation.action}${valueLog}`);
                } catch (e) {
                    console.error(`[CRM Job] Failed to close opportunity ${opp.id}:`, e.message);
                }
            }

            // Throttle API calls
            await new Promise(r => setTimeout(r, 200));
        }
    }
    console.log('[CRM Job] Evaluation complete.');
}
