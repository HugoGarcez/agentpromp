import React, { useState } from 'react';
import { Save, Bot, Cpu, Mic, Volume2, Globe } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const Settings = () => {
    const [activeSection, setActiveSection] = useState('integrations');

    // State for different settings
    const [persona, setPersona] = useState({
        name: 'Assistente Promp',
        role: 'support', // support, sales, technical
        tone: 'friendly', // friendly, formal, enthusiastic
        language: 'pt-BR'
    });

    const [integrations, setIntegrations] = useState({
        openaiKey: '',
        geminiKey: ''
    });

    const [webhookUrl, setWebhookUrl] = useState('');

    const [voice, setVoice] = useState({
        enabled: false,
        elevenLabsKey: '',
        voiceId: '',
        responseType: 'audio_only', // audio_only, percentage
        responsePercentage: 50
    });

    const [showToast, setShowToast] = useState(false);
    const [serverProducts, setServerProducts] = useState([]); // Store products from DB to prevent overwrite
    const [isPrompConnected, setIsPrompConnected] = useState(false);
    const { user } = useAuth();

    // Load settings from Backend on mount (Source of Truth)
    React.useEffect(() => {
        if (!user || !user.companyId) return;

        const baseUrl = window.location.origin;
        // Dev logic for webhook URL display
        const isDev = window.location.hostname === 'localhost';
        const apiBase = isDev ? 'http://localhost:3001' : window.location.origin;
        setWebhookUrl(`${apiBase}/webhook/${user.companyId}`);

        // Fetch current config from API
        const fetchConfig = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await fetch('/api/config', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();

                    // Populate UI state from DB data
                    if (data.persona) setPersona(data.persona);

                    // Handle Integrations + Voice merge
                    if (data.integrations) {
                        setIntegrations({
                            openaiKey: data.integrations.openaiKey || '',
                            geminiKey: data.integrations.geminiKey || ''
                        });
                        // Voice settings might be merged in integrations or separate
                        const voiceData = {
                            enabled: data.integrations.enabled || false,
                            elevenLabsKey: data.integrations.elevenLabsKey || '',
                            voiceId: data.integrations.voiceId || '',
                            responseType: data.integrations.responseType || 'audio_only',
                            responsePercentage: data.integrations.responsePercentage || 50
                        };
                        setVoice(voiceData);
                    }

                    // CRITICAL: Preserve products from DB
                    if (data.products && Array.isArray(data.products)) {
                        setServerProducts(data.products);
                        console.log('Loaded products from server to preserve:', data.products.length);
                        console.log('Loaded products from server to preserve:', data.products.length);
                    }

                    // Check Promp Connection
                    if (data.prompUuid) {
                        setIsPrompConnected(true);
                    }
                }
            } catch (e) {
                console.error("Failed to fetch config:", e);
            }
        };

        fetchConfig();

        // Fallback: Load from localStorage if needed (visual only, mostly legacy)
        const savedPersona = localStorage.getItem('promp_ai_persona');
        if (savedPersona && !user) setPersona(JSON.parse(savedPersona));

    }, [user]);

    const handlePersonaChange = (e) => {
        setPersona({ ...persona, [e.target.name]: e.target.value });
    };

    const handleIntegrationChange = (e) => {
        setIntegrations({ ...integrations, [e.target.name]: e.target.value });
    };

    const handleVoiceChange = (e) => {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setVoice({ ...voice, [e.target.name]: value });
    };

    const handleSave = async () => {
        // Save raw settings (local backup)
        localStorage.setItem('promp_ai_persona', JSON.stringify(persona));
        localStorage.setItem('promp_ai_integrations', JSON.stringify(integrations));
        localStorage.setItem('promp_ai_voice', JSON.stringify(voice));

        // Generate Expert System Prompt
        let basePrompt = "";
        let toneInstruction = "";

        // Role-based Prompts
        switch (persona.role) {
            case 'sales':
                basePrompt = `Você é ${persona.name}, um Closer de Vendas de Elite.
Sua missão é fechar a venda do produto que o cliente demonstrou interesse AGORA.

MANDAMENTOS DE OURO:
1. FOCO ABSOLUTO: Fale APENAS do produto que o cliente mencionou. NÃO sugira outros produtos a menos que ele pergunte especificamente.
2. PERGUNTA DE AVANÇO: Toda resposta sua DEVE terminar com uma pergunta que leve para o fechamento ou próxima etapa (Ex: "Prefere no cartão ou Pix?", "Podemos agendar a entrega?", "Ficou alguma dúvida sobre o tamanho?").
3. PROIBIDO: JAMAIS termine com "Posso ajudar em algo mais?", "Estou à disposição" ou "Qualquer coisa me chame". Isso mata a venda. Assuma o controle.
4. VALOR ANTES DO PREÇO: Se perguntarem preço, cite um benefício transformador antes de dar o valor.
5. OBJEÇÕES: Se o cliente hesitar, isole a objeção (Ex: "Fora o preço, tem algo mais que te impede de fechar?").

Seu objetivo é CONVERTER. Leve o cliente pela mão até o pagamento.`;
                break;
            case 'support':
                basePrompt = `Você é ${persona.name}, um Especialista em Customer Success e Suporte Técnico.
Sua prioridade absoluta é a SATISFAÇÃO, RESOLUÇÃO do problema e a RETENÇÃO do cliente.

DIRETRIZES DE SUPORTE:
1. EMPATIA EXTREMA: Comece validando o sentimento do usuário ('Sinto muito que você esteja passando por isso', 'Entendo sua frustração').
2. CLAREZA E DIDÁTICA: Use linguagem simples. Evite jargões técnicos a menos que o usuário demonstre conhecimento.
3. SOLUÇÃO EFETIVA: Guie passo-a-passo. Confirme se cada passo funcionou antes de passar para o próximo.
4. PACIÊNCIA INFINITA: Nunca culpe o usuário. O erro é sempre uma oportunidade de melhoria no nosso processo.
5. PROATIVIDADE: Antecipe dúvidas futuras. Se o cliente perguntar X, já explique Y também.`;
                break;
            default: // assistant
                basePrompt = `Você é ${persona.name}, um Assistente Virtual Pessoal altamente eficiente e organizado.
Sua missão é facilitar a vida do usuário, fornecendo informações precisas, ajuda rápida e organização.

DIRETRIZES:
1. SEJA DIRETO: Responda exatamente o que foi perguntado, sem rodeios desnecessários, mas com polidez.
2. PRECISÃO: Verifique os dados antes de afirmar. Se não souber, diga que vai verificar (ou que não sabe) em vez de inventar.
3. UTILIDADE: Sempre ofereça algo a mais que possa ajudar na tarefa do usuário.`;
                break;
        }

        // Tone-based Instructions
        switch (persona.tone) {
            case 'friendly':
                toneInstruction = "Seu tom de voz é AMIGÁVEL, CASUAL e PRÓXIMO. Use emojis moderadamente 😄. Trate o usuário como um amigo colaborativo. Pode usar 'você', 'a gente'.";
                break;
            case 'formal':
                toneInstruction = "Seu tom de voz é PROFISSIONAL, POLIDO e FORMAL. Evite gírias e emojis. Use tratamento respeitoso (Sr./Sra. se aplicável). Foco em credibilidade e seriedade.";
                break;
            case 'enthusiastic':
                toneInstruction = "Seu tom de voz é ENTUSIASMADO, ENERGÉTICO e MOTIVADOR! Use pontos de exclamação para mostrar energia! 🚀 Use emojis positivos. Transmita paixão pelo que faz!";
                break;
            case 'empathetic':
                toneInstruction = "Seu tom de voz é CALMO, ACOLHEDOR e EMPÁTICO. Mostre que você se importa profundamente. Use palavras suaves e tranquilizadoras. 🌿";
                break;
            default:
                toneInstruction = "Mantenha um tom profissional e equilibrado.";
        }

        const finalSystemPrompt = `${basePrompt}\n\n${toneInstruction}\n\nLembre-se: Você está conversando com um cliente real. Mantenha o personagem o tempo todo.`;

        localStorage.setItem('promp_ai_system_prompt', finalSystemPrompt);

        // Save to Backend
        try {
            const token = localStorage.getItem('token');

            // Determine products list to save
            // Priority: Server Products (from DB) > Local Storage > Empty Array
            let productsToSave = serverProducts;
            if (!productsToSave || productsToSave.length === 0) {
                const localProds = JSON.parse(localStorage.getItem('promp_ai_products') || '[]');
                if (localProds.length > 0) productsToSave = localProds;
            }

            const res = await fetch('/api/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    persona,
                    // FORCE MERGE: Send voice settings INSIDE integrations to ensure backend saves them
                    integrations: { ...integrations, ...voice },
                    voice, // Keep for backward compat if needed
                    systemPrompt: finalSystemPrompt
                    // products field removed to prevent overwriting managed data from ProductConfig
                }),
            });

            if (res.ok) {
                const data = await res.json();
                console.log('Backend sync:', data);
                setShowToast(true);
                setTimeout(() => setShowToast(false), 3000);
            } else {
                console.error('Backend sync failed:', res.statusText);
                alert('Erro ao salvar configurações no servidor.');
            }
        } catch (err) {
            console.error('Backend sync failed:', err);
            alert('Erro de conexão ao salvar configurações.');
        }
    };

    return (
        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
            {/* Settings Navigation */}
            <div style={{
                width: '240px',
                background: 'var(--bg-white)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-sm)',
                padding: '16px'
            }}>

                <button
                    onClick={() => setActiveSection('integrations')}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px',
                        borderRadius: 'var(--radius-md)', marginBottom: '4px',
                        background: activeSection === 'integrations' ? 'var(--primary-light)' : 'transparent',
                        color: activeSection === 'integrations' ? 'var(--primary-blue)' : 'var(--text-medium)',
                        fontWeight: 500
                    }}
                >
                    <Cpu size={20} />
                    Inteligência Artificial
                </button>
                <button
                    onClick={() => setActiveSection('voice')}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px',
                        borderRadius: 'var(--radius-md)', marginBottom: '4px',
                        background: activeSection === 'voice' ? 'var(--primary-light)' : 'transparent',
                        color: activeSection === 'voice' ? 'var(--primary-blue)' : 'var(--text-medium)',
                        fontWeight: 500
                    }}
                >
                    <Mic size={20} />
                    Voz e Áudio
                </button>
                <button
                    onClick={() => setActiveSection('webhook')}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px',
                        borderRadius: 'var(--radius-md)',
                        background: activeSection === 'webhook' ? 'var(--primary-light)' : 'transparent',
                        color: activeSection === 'webhook' ? 'var(--primary-blue)' : 'var(--text-medium)',
                        fontWeight: 500
                    }}
                >
                    <Globe size={20} />
                    Webhook
                </button>
            </div>

            {/* Main Content */}
            <div style={{
                flex: 1,
                background: 'var(--bg-white)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-sm)',
                padding: '32px'
            }}>

                {/* Persona Section MOVED to AI Config */}

                {/* Integrations Section (Now AI Status) */}
                {activeSection === 'integrations' && (
                    <div>
                        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <Cpu size={24} color="var(--primary-blue)" />
                            Inteligência Artificial (Promp IA)
                        </h2>
                        <p style={{ color: 'var(--text-medium)', marginBottom: '24px' }}>
                            Gerencie o motor de inteligência artificial do seu agente.
                        </p>

                        <div style={{ display: 'grid', gap: '24px' }}>
                            <div style={{ padding: '24px', border: '1px solid #E5E7EB', borderRadius: 'var(--radius-md)', background: 'white' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <Bot size={24} color="var(--primary-blue)" />
                                        <div>
                                            <h3 style={{ fontWeight: 600, fontSize: '16px' }}>Promp IA (Standard)</h3>
                                            <p style={{ fontSize: '13px', color: '#6B7280' }}>Modelo de Linguagem Otimizado para Vendas</p>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#DCFCE7', color: '#166534', padding: '6px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 600 }}>
                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#166534' }}></div>
                                        ONLINE
                                    </div>
                                </div>
                                <p style={{ fontSize: '14px', color: '#374151', lineHeight: '1.5' }}>
                                    Sua instância está conectada à infraestrutura global da Promp IA. Não é necessário configuração adicional.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Voice Section */}
                {activeSection === 'voice' && (
                    <div>
                        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <Mic size={24} color="var(--primary-blue)" />
                            Configuração de Voz e Áudio
                        </h2>

                        <div style={{ marginBottom: '32px', padding: '24px', background: 'var(--bg-main)', borderRadius: 'var(--radius-md)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                                <input
                                    type="checkbox"
                                    id="voiceEnabled"
                                    name="enabled"
                                    checked={voice.enabled}
                                    onChange={handleVoiceChange}
                                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                                />
                                <label htmlFor="voiceEnabled" style={{ fontWeight: 600, cursor: 'pointer' }}>Habilitar Respostas em Áudio</label>
                            </div>
                            <p style={{ color: 'var(--text-medium)', fontSize: '14px', marginLeft: '32px' }}>
                                Permite que a IA envie áudios humanizados utilizando a tecnologia Promp Voice.
                            </p>
                        </div>

                        {voice.enabled && (
                            <div style={{ display: 'grid', gap: '24px' }}>
                                <div style={{ padding: '24px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                                    <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Regras de Envio</h3>

                                    <div style={{ marginBottom: '16px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', cursor: 'pointer' }}>
                                            <input
                                                type="radio"
                                                name="responseType"
                                                value="audio_only"
                                                checked={voice.responseType === 'audio_only'}
                                                onChange={handleVoiceChange}
                                            />
                                            <span>Responder em áudio apenas quando o cliente enviar áudio</span>
                                        </label>

                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                            <input
                                                type="radio"
                                                name="responseType"
                                                value="percentage"
                                                checked={voice.responseType === 'percentage'}
                                                onChange={handleVoiceChange}
                                            />
                                            <span>Responder em áudio aleatoriamente (% das mensagens)</span>
                                        </label>
                                    </div>

                                    {voice.responseType === 'percentage' && (
                                        <div style={{ paddingLeft: '28px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                <span style={{ fontSize: '14px', fontWeight: 500 }}>Probabilidade</span>
                                                <span style={{ fontSize: '14px', fontWeight: 600 }}>{voice.responsePercentage}%</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0"
                                                max="100"
                                                step="10"
                                                name="responsePercentage"
                                                value={voice.responsePercentage}
                                                onChange={handleVoiceChange}
                                                style={{ width: '100%', cursor: 'pointer' }}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Webhook Section */}
                {activeSection === 'webhook' && (
                    <div>
                        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <Globe size={24} color="var(--primary-blue)" />
                            Integração Webhook
                        </h2>

                        {/* PROMP API INTEGRATION CARD */}
                        <div style={{ padding: '24px', border: '1px solid #10B981', borderRadius: 'var(--radius-md)', background: '#F0FDF4', marginBottom: '32px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#059669', marginBottom: '8px' }}>Integração Automática Promp</h3>
                            <p style={{ color: '#047857', fontSize: '14px', marginBottom: '16px' }}>
                                Conecte-se automaticamente à infraestrutura da Promp para enviar respostas pelos canais de WhatsApp do sistema Promp.
                            </p>

                            {isPrompConnected ? (
                                <div style={{ borderTop: '1px solid #10B981', paddingTop: '16px', marginTop: '16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                        <div style={{ width: '10px', height: '10px', background: '#059669', borderRadius: '50%' }}></div>
                                        <strong style={{ color: '#059669' }}>Você está integrado ao sistema Promp.</strong>
                                    </div>
                                    <button
                                        onClick={() => setIsPrompConnected(false)}
                                        style={{
                                            border: '1px solid #059669',
                                            background: 'transparent',
                                            color: '#059669',
                                            padding: '8px 16px',
                                            borderRadius: 'var(--radius-md)',
                                            fontSize: '13px',
                                            fontWeight: 600,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Reconfigurar
                                    </button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: '#047857' }}>Identidade do Tenant (CPF/CNPJ)</label>
                                        <input
                                            type="text"
                                            placeholder="000.000.000-00"
                                            id="prompIdentityInput"
                                            style={{
                                                width: '100%', padding: '10px',
                                                borderRadius: 'var(--radius-md)',
                                                border: '1px solid #10B981',
                                                background: 'white'
                                            }}
                                        />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: '#047857' }}>ID da Conexão (Opcional)</label>
                                        <input
                                            type="text"
                                            placeholder="ID ou Nome da Sessão"
                                            id="prompSessionInput"
                                            style={{
                                                width: '100%', padding: '10px',
                                                borderRadius: 'var(--radius-md)',
                                                border: '1px solid #10B981',
                                                background: 'white'
                                            }}
                                        />
                                    </div>
                                    <button
                                        onClick={async () => {
                                            const identity = document.getElementById('prompIdentityInput').value;
                                            const sessionId = document.getElementById('prompSessionInput').value;
                                            if (!identity) return alert('Digite a identidade');

                                            try {
                                                const token = localStorage.getItem('token');
                                                const res = await fetch('/api/promp/connect', {
                                                    method: 'POST',
                                                    headers: {
                                                        'Content-Type': 'application/json',
                                                        'Authorization': `Bearer ${token}`
                                                    },
                                                    body: JSON.stringify({ identity, sessionId })
                                                });
                                                const data = await res.json();
                                                if (res.ok) {
                                                    alert('Sucesso: ' + data.message);
                                                    setIsPrompConnected(true);
                                                } else {
                                                    alert('Erro: ' + data.message);
                                                }
                                            } catch (e) {
                                                alert('Erro de conexão');
                                            }
                                        }}
                                        style={{
                                            padding: '10px 20px',
                                            height: '42px',
                                            background: '#10B981',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: 'var(--radius-md)',
                                            fontWeight: 600,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Conectar Automaticamente
                                    </button>
                                </div>
                            )}
                        </div>

                        <p style={{ color: 'var(--text-medium)', marginBottom: '24px' }}>
                            Ou utilize este URL para integrar manualmente (Webhook Genérico):
                        </p>

                        <div style={{ padding: '24px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: 'var(--bg-main)' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Webhook URL</label>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <input
                                    type="text"
                                    readOnly
                                    value={webhookUrl}
                                    style={{
                                        flex: 1,
                                        padding: '12px',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--bg-white)',
                                        color: 'var(--text-medium)'
                                    }}
                                />
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(webhookUrl);
                                        setShowToast(true);
                                        setTimeout(() => setShowToast(false), 2000);
                                    }}
                                    style={{
                                        padding: '0 20px',
                                        background: 'var(--bg-white)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: 'var(--radius-md)',
                                        fontWeight: 500,
                                        cursor: 'pointer',
                                        color: 'var(--text-dark)'
                                    }}
                                >
                                    Copiar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        onClick={handleSave}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            background: 'var(--primary-blue)', color: 'white',
                            padding: '12px 24px', borderRadius: 'var(--radius-md)',
                            fontWeight: 500,
                            cursor: 'pointer',
                            opacity: showToast ? 0.7 : 1,
                            transition: 'all 0.2s'
                        }}
                    >
                        <Save size={18} />
                        {showToast ? 'Salvo!' : 'Salvar Alterações'}
                    </button>
                </div>

                {/* Toast Notification */}
                {showToast && (
                    <div style={{
                        position: 'fixed',
                        bottom: '24px',
                        right: '24px',
                        background: '#10B981',
                        color: 'white',
                        padding: '12px 24px',
                        borderRadius: 'var(--radius-md)',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        animation: 'slideIn 0.3s ease-out'
                    }}>
                        <span>Configurações salvas com sucesso!</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Settings;
