import React, { useState } from 'react';
import { History, RotateCcw } from 'lucide-react';
import Modal from '../Modal';

const PromptTab = ({ systemPrompt, onPromptChange, persona, onPersonaChange }) => {
    // Local state only for History UI
    const [history, setHistory] = useState([]);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);

    const generatePromptText = (personaData) => {
        if (!personaData) return "";
        try {
            const p = typeof personaData === 'string' ? JSON.parse(personaData) : personaData;
            const { name, role, tone } = p;

            let basePrompt = "";
            let toneInstruction = "";

            switch (role) {
                case 'sales':
                    basePrompt = `Você é ${name || 'Sales Agent'}, um Top Performer em Vendas especialista em conversão.\n` +
                        `Sua missão é entender as necessidades do cliente e fechar vendas de alto valor.\n` +
                        `Você domina técnicas como SPIN Selling, PNL e Gatilhos Mentais.\n\n` +
                        `MANDAMENTOS DO VENDEDOR:\n` +
                        `1. OBJEÇÕES: Contorne com a técnica 'Entendo, Sinto, Descobri'.\n` +
                        `2. CONTROLE: Termine suas respostas com perguntas.\n` +
                        `3. VALOR: Ancore o valor antes de falar preço.\n` +
                        `4. FECHAMENTO: Use fechamentos experimentais.\n` +
                        `5. GATILHOS: Use escassez ética e urgência.`;
                    break;
                case 'support':
                    basePrompt = `Você é ${name || 'Support Agent'}, um Especialista em Customer Success.\n` +
                        `Sua prioridade é a SATISFAÇÃO, RESOLUÇÃO e RETENÇÃO.\n\n` +
                        `DIRETRIZES:\n` +
                        `1. EMPATIA EXTREMA: Valide o sentimento do usuário.\n` +
                        `2. CLAREZA: Use linguagem simples.\n` +
                        `3. SOLUÇÃO: Guie passo-a-passo.\n` +
                        `4. PACIÊNCIA: Nunca culpe o usuário.`;
                    break;
                case 'consultative_closer':
                    basePrompt = `Você é ${name || 'Consultor'}, um Closer Consultivo focado em VALOR antes de PREÇO.\n` +
                        `Sua missão é conduzir uma apresentação consultiva e só revelar o investimento quando o cliente estiver engajado (Nota alta).\n\n` +
                        `VOCÊ DEVE SEGUIR ESTRITAMENTE ESTE FLUXO DE 4 ETAPAS (Não pule etapas):\n\n` +
                        `ETAPA 1: CONTEXTO & DESCOBERTA 🕵️‍♂️\n` +
                        `- Apresente-se e a empresa.\n` +
                        `- FAÇA PERGUNTAS para entender o cenário do cliente (B2B/B2C, dores, objetivos).\n` +
                        `- Não apresente a solução ainda. Apenas entenda o cliente.\n\n` +
                        `ETAPA 2: APRESENTAÇÃO DA SOLUÇÃO 💎\n` +
                        `- Com base no que ele falou, apresente como sua solução resolve a dor dele.\n` +
                        `- Foque nos Pilares (ex: Suporte, Automação, Resultado) focando na dor do cliente.\n` +
                        `- AO FINAL DESTA ETAPA, PERGUNTE: "De 0 a 10, o quanto isso faz sentido para o seu momento?" (TERMÔMETRO 1)\n\n` +
                        `ETAPA 3: APROFUNDAMENTO & OBJEÇÕES 🔧\n` +
                        `- Se a nota for BAIXA (0-6): Pergunte "O que faltou para ser 10?". Aprofunde a dúvida. Não fale de preço.\n` +
                        `- Se a nota for MÉDIA (7-8): Reforce os benefícios exclusivos e tire dúvidas restantes.\n` +
                        `- Se a nota for ALTA (9-10): Avance para o fechamento.\n` +
                        `- PERGUNTE NOVAMENTE antes de fechar: "Você sente que essa é a solução ideal? De 0 a 10, qual sua confiança?"\n\n` +
                        `ETAPA 4: FECHAMENTO (INVESTIMENTO) 💰\n` +
                        `- SÓ REVELE O PREÇO SE A NOTA FOR 9 ou 10.\n` +
                        `- Se a nota for baixa, volte para a etapa 3 ou sugira agendar com um especialista humano.\n` +
                        `- AO FALAR DE PREÇO: Use a palavra "INVESTIMENTO" ou "VALOR". Nunca diga "Custo" ou "Preço".\n` +
                        `- Exemplo: "Como você me disse que faz total sentido (Nota 10), o investimento para ter tudo isso é..."\n` +
                        `- Envie o link de pagamento ou agende a reunião final.\n\n` +
                        `REGRA DE OURO:\n` +
                        `- 🚫 PROIBIDO FALAR PREÇO SE A NOTA FOR MENOR QUE 9. Diga: "Antes de falar de valores, preciso ter certeza que isso resolve seu problema. O que ainda te deixa com dúvida?"`;
                    break;
                default:
                    basePrompt = `Você é ${name || 'Assistente'}, um Assistente Virtual eficiente.\n` +
                        `Sua missão é facilitar a vida do usuário com informações precisas.\n\n` +
                        `DIRETRIZES:\n` +
                        `1. SEJA DIRETO: Responda sem rodeios.\n` +
                        `2. PRECISÃO: Verifique dados antes de afirmar.\n` +
                        `3. UTILIDADE: Sempre ofereça algo a mais.`;
                    break;
            }

            if (tone === 'friendly') toneInstruction = "Tom: AMIGÁVEL, CASUAL. Use emojis 😄.";
            else if (tone === 'formal') toneInstruction = "Tom: PROFISSIONAL, POLIDO. Sem gírias.";
            else if (tone === 'enthusiastic') toneInstruction = "Tom: ENTUSIASMADO! Use exclamações! 🚀";
            else if (tone === 'empathetic') toneInstruction = "Tom: ACOLHEDOR, EMPÁTICO. Suave. 🌿";
            else toneInstruction = "Tom: Profissional e equilibrado.";

            return `${basePrompt}\n\n${toneInstruction}\n\nLembre-se: Mantenha o personagem o tempo todo.`;
        } catch (e) {
            console.error("Error generating prompt", e);
            return "";
        }
    };

    const handleRegenerate = () => {
        if (!persona) {
            alert("Nenhuma configuração de persona encontrada. Verifique as configurações gerais (em outra aba).");
            return;
        }
        if (window.confirm("Isso substituirá o prompt atual pelo padrão da persona selecionada. Continuar?")) {
            const newPrompt = generatePromptText(persona);
            onPromptChange(newPrompt);
        }
    };

    const fetchHistory = async () => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch('/api/config/history', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setHistory(await res.json());
                setIsHistoryOpen(true);
            }
        } catch (error) {
            console.error('Error fetching history:', error);
        }
    };

    const handleRestore = (historyId, historyPrompt) => {
        if (window.confirm('Tem certeza? Isso substituirá o prompt atual (mas você precisa Salvar depois).')) {
            onPromptChange(historyPrompt);
            setIsHistoryOpen(false);
        }
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Prompt do Sistema</h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={handleRegenerate}
                        style={{
                            display: 'flex', gap: '8px', alignItems: 'center',
                            color: 'var(--primary-blue)', fontSize: '14px', fontWeight: 500,
                            padding: '6px 12px', border: '1px solid var(--primary-blue)', borderRadius: '6px',
                            backgroundColor: 'white',
                            cursor: 'pointer'
                        }}
                        title="Gerar prompt padrão baseado na Persona atual"
                    >
                        <RotateCcw size={16} /> Restaurar Padrão
                    </button>
                    <button
                        onClick={fetchHistory}
                        style={{
                            display: 'flex', gap: '8px', alignItems: 'center',
                            color: 'var(--text-medium)', fontSize: '14px',
                            padding: '6px 12px', border: '1px solid var(--border-color)', borderRadius: '6px',
                            cursor: 'pointer'
                        }}
                    >
                        <History size={16} /> Histórico de Versões
                    </button>
                </div>
            </div>

            {/* Persona Settings UI */}
            <div style={{
                background: '#F9FAFB',
                padding: '20px',
                borderRadius: '8px',
                border: '1px solid #E5E7EB',
                marginBottom: '24px'
            }}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    ⚡ Configuração Rápida (Persona)
                </h4>

                <div style={{ display: 'grid', gap: '16px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: '#4B5563' }}>Nome do Agente</label>
                        <input
                            type="text"
                            value={persona?.name || ''}
                            onChange={(e) => onPersonaChange({ ...persona, name: e.target.value })}
                            placeholder="Ex: Ana da Promp"
                            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: '#4B5563' }}>Função Principal</label>
                            <select
                                value={persona?.role || 'assistant'}
                                onChange={(e) => {
                                    const newRole = e.target.value;
                                    const updatedPersona = { ...persona, role: newRole };
                                    onPersonaChange(updatedPersona);

                                    // Auto-update Prompt
                                    const newPrompt = generatePromptText(updatedPersona);
                                    onPromptChange(newPrompt);
                                }}
                                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #D1D5DB', background: 'white' }}
                            >
                                <option value="support">Suporte Técnico</option>
                                <option value="sales">Vendas & Conversão</option>
                                <option value="consultative_closer">Closer Consultivo (Nota 0-10)</option>
                                <option value="assistant">Assistente Geral</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: '#4B5563' }}>Tom de Voz</label>
                            <select
                                value={persona?.tone || 'formal'}
                                onChange={(e) => onPersonaChange({ ...persona, tone: e.target.value })}
                                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #D1D5DB', background: 'white' }}
                            >
                                <option value="friendly">Amigável 😄</option>
                                <option value="formal">Formal 👔</option>
                                <option value="enthusiastic">Entusiasmado 🚀</option>
                                <option value="empathetic">Empático 🌿</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            <textarea
                value={systemPrompt || ''}
                onChange={(e) => onPromptChange(e.target.value)}
                placeholder="Defina como o agente deve se comportar..."
                rows={15}
                style={{
                    width: '100%',
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    fontSize: '14px',
                    fontFamily: 'monospace',
                    resize: 'vertical',
                    marginBottom: '16px'
                }}
            />

            <div style={{ color: 'var(--text-light)', fontSize: '13px', fontStyle: 'italic', marginBottom: '12px' }}>
                * Clique em "Salvar Alterações" no topo da página para aplicar o novo prompt.
            </div>

            <Modal isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} title="Histórico de Versões">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {history.length === 0 ? (
                        <p style={{ color: 'var(--text-medium)', fontSize: '14px', textAlign: 'center' }}>Nenhuma versão anterior encontrada.</p>
                    ) : (
                        history.map((item) => (
                            <div key={item.id} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '12px', color: 'var(--text-light)' }}>
                                        {new Date(item.createdAt).toLocaleString()}
                                    </span>
                                    <button
                                        onClick={() => handleRestore(item.id, item.systemPrompt)}
                                        style={{ color: 'var(--primary-blue)', fontSize: '12px', fontWeight: '500', display: 'flex', gap: '4px', alignItems: 'center' }}
                                    >
                                        <RotateCcw size={14} /> Restaurar
                                    </button>
                                </div>
                                <div style={{
                                    backgroundColor: '#F9FAFB', padding: '12px', borderRadius: '6px',
                                    fontSize: '12px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxHeight: '100px', overflowY: 'auto'
                                }}>
                                    {item.systemPrompt || '(Vazio)'}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </Modal>
        </div>
    );
};

export default PromptTab;
