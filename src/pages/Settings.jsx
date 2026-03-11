import React, { useState, useEffect } from 'react';
import { Save, Bot, Cpu, Mic, Volume2, Globe, Clock, MessageCircle, Package } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const Settings = () => {
    const [activeSection, setActiveSection] = useState('integrations');
    const [agents, setAgents] = useState([]);
    const [selectedAgentId, setSelectedAgentId] = useState('');


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

    // NEW: Follow-up Config State
    const [followUp, setFollowUp] = useState({
        enabled: false,
        tone: 'serious', // 'animated', 'serious', 'ice_breaker'
        attempts: [
            { id: 1, delayValue: 30, delayUnit: 'minutes', active: true },
            { id: 2, delayValue: 2, delayUnit: 'hours', active: true },
            { id: 3, delayValue: 1, delayUnit: 'days', active: true },
            { id: 4, delayValue: 3, delayUnit: 'days', active: true },
            { id: 5, delayValue: 7, delayUnit: 'days', active: true }
        ]
    });

    const [catalogConfig, setCatalogConfig] = useState({
        hidePrices: false,
        hidePricesReason: 'Sob consulta',
        customPriceHiddenReason: ''
    });

    const [showToast, setShowToast] = useState(false);
    const [serverProducts, setServerProducts] = useState([]); // Store products from DB to prevent overwrite
    const [isPrompConnected, setIsPrompConnected] = useState(false);
    const [prompChannels, setPrompChannels] = useState([]);
    const [loadingChannels, setLoadingChannels] = useState(false);
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
        
        // Fetch current config from API
        const fetchAgents = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await fetch('/api/agents', { headers: { 'Authorization': `Bearer ${token}` } });
                if (res.ok) {
                    const data = await res.json();
                    setAgents(data);
                    if (data.length > 0 && !selectedAgentId) setSelectedAgentId(data[0].id);
                }
            } catch (e) {
                console.error("Failed to fetch agents:", e);
            }
        };
        fetchAgents();

    const fetchConfig = async () => {
            try {
                const token = localStorage.getItem('token');
                const url = selectedAgentId ? `/api/config?agentId=${selectedAgentId}` : '/api/config';
                const res = await fetch(url, {
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

                    // Populate Follow-up Config
                    if (data.followUpConfig) {
                        try {
                            const parsedFollowUp = typeof data.followUpConfig === 'string' ? JSON.parse(data.followUpConfig) : data.followUpConfig;
                            setFollowUp({
                                enabled: parsedFollowUp.enabled || false,
                                tone: parsedFollowUp.tone || 'serious',
                                attempts: parsedFollowUp.attempts || followUp.attempts,
                                ignoreNumbers: parsedFollowUp.ignoreNumbers || ''
                            });
                        } catch (e) { console.error("Error parsing followUpConfig", e); }
                    }

                    // Populate Catalog Config
                    if (data.catalogConfig) {
                        try {
                            const parsedCatalog = typeof data.catalogConfig === 'string' ? JSON.parse(data.catalogConfig) : data.catalogConfig;
                            setCatalogConfig({
                                hidePrices: parsedCatalog.hidePrices || false,
                                hidePricesReason: parsedCatalog.hidePricesReason || 'Sob consulta',
                                customPriceHiddenReason: parsedCatalog.customPriceHiddenReason || ''
                            });
                        } catch (e) { console.error("Error parsing catalogConfig", e); }
                    }

                    // CRITICAL: Preserve products from DB
                    if (data.products && Array.isArray(data.products)) {
                        setServerProducts(data.products);
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

    }, [user, selectedAgentId]);

    const fetchChannels = async () => {
        try {
            setLoadingChannels(true);
            const token = localStorage.getItem('token');
            const res = await fetch('/api/promp/channels', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setPrompChannels(data.channels || []);
            }
        } catch (e) {
            console.error("Failed to fetch Promp channels:", e);
        } finally {
            setLoadingChannels(false);
        }
    };

    const toggleChannelLink = async (channelObj, isLinked) => {
        if (!selectedAgentId) return alert("Selecione um agente primeiro.");
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/promp/channels/link', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    agentId: selectedAgentId,
                    channelObj,
                    link: !isLinked
                })
            });
            if (res.ok) {
                fetchChannels(); // Refresh list to show updated links
            }
        } catch (e) {
            console.error("Link error:", e);
        }
    };

    useEffect(() => {
        if (isPrompConnected) {
            fetchChannels();
        }
    }, [isPrompConnected, selectedAgentId]);

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

    // --- FOLLOW UP HANDLERS ---
    const updateFollowUpAttempt = (index, field, value) => {
        const newAttempts = [...followUp.attempts];
        newAttempts[index] = { ...newAttempts[index], [field]: value };
        setFollowUp({ ...followUp, attempts: newAttempts });
    };

    const handleFollowUpChange = (field, value) => {
        setFollowUp(prev => ({ ...prev, [field]: value }));
    };

    const handleCatalogChange = (e) => {
        const { name, type, checked, value } = e.target;
        setCatalogConfig(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
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

        const finalSystemPrompt = `${basePrompt}

${toneInstruction}

Lembre-se: Você está conversando com um cliente real. Mantenha o personagem o tempo todo.`;

        localStorage.setItem('promp_ai_system_prompt', finalSystemPrompt);

        // Save to Backend
        try {
            const token = localStorage.getItem('token');

            // Determine products list to save
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
                    agentId: selectedAgentId,
                    persona,
                    // FORCE MERGE: Send voice settings INSIDE integrations to ensure backend saves them
                    integrations: { ...integrations, ...voice },
                    voice, // Keep for backward compat if needed
                    systemPrompt: finalSystemPrompt,
                    // products field removed to prevent overwriting managed data from ProductConfig

                    // NEW: Save Follow-up Config
                    followUpConfig: JSON.stringify(followUp),

                    // NEW: Save Catalog Config
                    catalogConfig: JSON.stringify(catalogConfig)
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

                {/* FOLLOW UP TAB */}
                <button
                    onClick={() => setActiveSection('followup')}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px',
                        borderRadius: 'var(--radius-md)', marginBottom: '4px',
                        background: activeSection === 'followup' ? 'var(--primary-light)' : 'transparent',
                        color: activeSection === 'followup' ? 'var(--primary-blue)' : 'var(--text-medium)',
                        fontWeight: 500
                    }}
                >
                    <Clock size={20} />
                    Follow-up (IA)
                </button>

                {/* CATALOG TAB */}
                <button
                    onClick={() => setActiveSection('catalog')}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px',
                        borderRadius: 'var(--radius-md)',
                        background: activeSection === 'catalog' ? 'var(--primary-light)' : 'transparent',
                        color: activeSection === 'catalog' ? 'var(--primary-blue)' : 'var(--text-medium)',
                        fontWeight: 500
                    }}
                >
                    <Package size={20} />
                    Catálogo de Produtos
                </button>
            </div>

            
            {/* AGENT SELECTOR */}
            <div style={{ padding: '16px', background: 'var(--bg-white)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span style={{ fontWeight: 600 }}>Agente Selecionado:</span>
                <select 
                    value={selectedAgentId} 
                    onChange={e => setSelectedAgentId(e.target.value)}
                    style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '200px' }}
                >
                    {agents.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                </select>
                <button 
                    onClick={async () => {
                        const name = prompt('Nome do novo agente:');
                        if (!name) return;
                        const token = localStorage.getItem('token');
                        const res = await fetch('/api/agents', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                            body: JSON.stringify({ name })
                        });
                        if (res.ok) {
                            const newAg = await res.json();
                            setAgents(prev => [...prev, newAg]);
                            setSelectedAgentId(newAg.id);
                        }
                    }}
                    style={{ padding: '8px 16px', background: 'var(--primary-blue)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 500 }}
                >
                    + Novo
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
                        <div style={{ padding: "24px", border: "1px solid #10B981", borderRadius: "var(--radius-md)", background: "#F0FDF4", marginBottom: "32px" }}>
                            <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#059669", marginBottom: "8px" }}>Integração Automática Promp</h3>
                            <p style={{ color: "#047857", fontSize: "14px", marginBottom: "16px" }}>
                                Conecte-se globalmente ao seu Tenant da Promp e depois vincule este agente aos canais desejados.
                            </p>

                            {!isPrompConnected ? (
                                <div style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 500, color: "#047857" }}>Identidade do Tenant (CPF/CNPJ)</label>
                                        <input
                                            type="text"
                                            placeholder="000.000.000-00"
                                            id="prompIdentityInput"
                                            style={{
                                                width: "100%", padding: "10px",
                                                borderRadius: "var(--radius-md)",
                                                border: "1px solid #10B981",
                                                background: "white"
                                            }}
                                        />
                                    </div>
                                    <button
                                                onClick={async () => {
                                                    const identity = document.getElementById("prompIdentityInput").value;
                                                    if (!identity) return alert("Digite a identidade (CPF/CNPJ).");

                                                    try {
                                                        const token = localStorage.getItem("token");
                                                        const res = await fetch("/api/promp/connect", {
                                                            method: "POST",
                                                            headers: {
                                                                "Content-Type": "application/json",
                                                                "Authorization": `Bearer ${token}`
                                                            },
                                                            body: JSON.stringify({ identity })
                                                        });

                                                        const data = await res.json();
                                                        if (res.ok) {
                                                            alert("Tenant conectado com sucesso!");
                                                            setIsPrompConnected(true);
                                                            // Forçar busca de canais imediata
                                                            fetchChannels();
                                                        } else {
                                                            alert(data.message || "Erro ao conectar.");
                                                        }
                                                    } catch (e) {
                                                        alert("Erro de conexão.");
                                                    }
                                                }}
                                        style={{
                                            background: "#10B981",
                                            color: "white",
                                            padding: "10px 20px",
                                            borderRadius: "var(--radius-md)",
                                            fontWeight: 600,
                                            cursor: "pointer",
                                            border: "none",
                                            height: "42px"
                                        }}
                                    >
                                        Conectar Tenant
                                    </button>
                                </div>
                            ) : (
                                <div style={{ borderTop: "1px solid #10B981", paddingTop: "16px", marginTop: "16px" }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                            <div style={{ width: "10px", height: "10px", background: "#059669", borderRadius: "50%" }}></div>
                                            <strong style={{ color: "#059669" }}>Integração Global Ativa</strong>
                                        </div>
                                        <button
                                            onClick={() => setIsPrompConnected(false)}
                                            style={{
                                                border: "1px solid #059669",
                                                background: "transparent",
                                                color: "#059669",
                                                padding: "6px 12px",
                                                borderRadius: "var(--radius-md)",
                                                fontSize: "12px",
                                                fontWeight: 600,
                                                cursor: "pointer"
                                            }}
                                        >
                                            Trocar Tenant
                                        </button>
                                    </div>

                                    <h4 style={{ fontSize: "15px", fontWeight: 600, color: "#059669", marginBottom: "12px" }}>Canais do Agente</h4>
                                    <p style={{ fontSize: "13px", color: "#047857", marginBottom: "16px" }}>
                                        Selecione os canais que o agente <b>{agents.find(a => a.id === selectedAgentId)?.name || "Selecionado"}</b> deve responder:
                                    </p>

                                    {loadingChannels ? (
                                        <div style={{ textAlign: "center", padding: "20px", color: "#059669" }}>Carregando canais...</div>
                                    ) : (
                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "12px" }}>
                                            {prompChannels.map(ch => {
                                                const isLinked = ch.linkedAgents?.some(a => a.id === selectedAgentId);
                                                return (
                                                    <div key={ch.id} style={{
                                                        background: "white",
                                                        padding: "12px",
                                                        borderRadius: "8px",
                                                        border: isLinked ? "2px solid #10B981" : "1px solid #E5E7EB",
                                                        display: "flex",
                                                        justifyContent: "space-between",
                                                        alignItems: "center"
                                                    }}>
                                                        <div style={{ overflow: "hidden" }}>
                                                            <div style={{ fontWeight: 600, fontSize: "14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ch.name}</div>
                                                            <div style={{ fontSize: "11px", color: "#6B7280" }}>{ch.type.toUpperCase()} | {ch.status}</div>
                                                        </div>
                                                        <button
                                                            onClick={() => toggleChannelLink(ch, isLinked)}
                                                            style={{
                                                                padding: "4px 8px",
                                                                borderRadius: "4px",
                                                                fontSize: "11px",
                                                                fontWeight: 700,
                                                                cursor: "pointer",
                                                                border: "none",
                                                                background: isLinked ? "#FEE2E2" : "#D1FAE5",
                                                                color: isLinked ? "#B91C1C" : "#065F46"
                                                            }}
                                                        >
                                                            {isLinked ? "Desvincular" : "Vincular"}
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                            {prompChannels.length === 0 && <div style={{ color: "#047857", fontSize: "13px", fontStyle: "italic" }}>Nenhum canal encontrado. Verifique sua conta Promp.</div>}
                                        </div>
                                    )}
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

                {/* Follow-up Section */}
                {activeSection === 'followup' && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                            <div>
                                <h2 style={{ fontSize: '20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <Clock size={24} color="var(--primary-blue)" />
                                    Follow-up Inteligente com IA
                                </h2>
                                <p style={{ color: 'var(--text-medium)', marginTop: 8 }}>
                                    Recupere conversas "frias" automaticamente. A IA envia mensagens personalizadas quando o cliente para de responder.
                                </p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <span style={{ fontSize: 14, fontWeight: 600, color: followUp.enabled ? '#10B981' : '#6B7280' }}>
                                    {followUp.enabled ? 'ATIVADO' : 'DESATIVADO'}
                                </span>
                                <label className="switch">
                                    <input type="checkbox" checked={followUp.enabled} onChange={(e) => handleFollowUpChange('enabled', e.target.checked)} />
                                    <span className="slider round"></span>
                                </label>
                            </div>
                        </div>

                        <div style={{ background: '#F9FAFB', padding: 24, borderRadius: 8, border: '1px solid #E5E7EB', marginBottom: 24 }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Números Ignorados (Anti-Loop)</label>
                            <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
                                <input
                                    type="text"
                                    placeholder="Ex: 5521999999999 (Separe por vírgula)"
                                    value={followUp.ignoreNumbers || ''}
                                    onChange={(e) => handleFollowUpChange('ignoreNumbers', e.target.value)}
                                    style={{ padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid #D1D5DB' }}
                                />
                                <span style={{ fontSize: 12, color: '#6B7280' }}>
                                    Insira aqui o número dos atendentes ou do próprio robô para evitar que a IA responda a mensagens internas (Loop).
                                </span>
                            </div>
                        </div>

                        <div style={{ background: '#F9FAFB', padding: 24, borderRadius: 8, border: '1px solid #E5E7EB', marginBottom: 24 }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Tom de Voz do Follow-up</label>
                            <select
                                value={followUp.tone}
                                onChange={(e) => handleFollowUpChange('tone', e.target.value)}
                                style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid #D1D5DB' }}
                            >
                                <option value="animated">Animado (Energia, oportunidade 🚀)</option>
                                <option value="serious">Sério (Profissional, objetivo 👔)</option>
                                <option value="ice_breaker">Quebra-gelo (Leve, simpático 😄)</option>
                            </select>
                            <p style={{ fontSize: 12, color: '#6B7280', marginTop: 8 }}>O tom selecionado será usado pela IA para gerar todas as mensagens de recuperação.</p>
                        </div>

                        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Sequência de Tentativas</h3>
                        <div style={{ display: 'grid', gap: 12 }}>
                            {followUp.attempts.map((attempt, index) => (
                                <div key={attempt.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'white', padding: 12, borderRadius: 8, border: '1px solid #E5E7EB', opacity: attempt.active ? 1 : 0.6 }}>
                                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#EFF6FF', color: '#1E40AF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 'bold' }}>
                                        {index + 1}
                                    </div>
                                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 14 }}>Enviar após</span>
                                        <input
                                            type="number"
                                            value={attempt.delayValue}
                                            onChange={(e) => updateFollowUpAttempt(index, 'delayValue', parseInt(e.target.value))}
                                            style={{ width: 60, padding: 6, borderRadius: 4, border: '1px solid #D1D5DB' }}
                                        />
                                        <select
                                            value={attempt.delayUnit}
                                            onChange={(e) => updateFollowUpAttempt(index, 'delayUnit', e.target.value)}
                                            style={{ padding: 6, borderRadius: 4, border: '1px solid #D1D5DB' }}
                                        >
                                            <option value="minutes">Minutos</option>
                                            <option value="hours">Horas</option>
                                            <option value="days">Dias</option>
                                        </select>
                                        <span style={{ fontSize: 14 }}>sem resposta.</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 12, color: attempt.active ? '#10B981' : '#9CA3AF' }}>{attempt.active ? 'Ativa' : 'Pausada'}</span>
                                        <input type="checkbox" checked={attempt.active} onChange={(e) => updateFollowUpAttempt(index, 'active', e.target.checked)} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Catalog Section */}
                {activeSection === 'catalog' && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                            <div>
                                <h2 style={{ fontSize: '20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <Package size={24} color="var(--primary-blue)" />
                                    Configurações do Catálogo
                                </h2>
                                <p style={{ color: 'var(--text-medium)', marginTop: 8 }}>
                                    Defina regras gerais para a forma como a IA apresenta seus produtos e serviços.
                                </p>
                            </div>
                        </div>

                        <div style={{ background: '#F9FAFB', padding: 24, borderRadius: 8, border: '1px solid #E5E7EB', marginBottom: 24 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                                <input
                                    type="checkbox"
                                    id="hidePrices"
                                    name="hidePrices"
                                    checked={catalogConfig.hidePrices}
                                    onChange={handleCatalogChange}
                                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                                />
                                <label htmlFor="hidePrices" style={{ fontWeight: 600, cursor: 'pointer', fontSize: '15px' }}>
                                    Ocultar os preços de todos os produtos
                                </label>
                            </div>
                            <p style={{ fontSize: 13, color: '#6B7280', marginBottom: '20px', paddingLeft: '32px' }}>
                                Quando ativado, a IA nunca informará o valor real do produto/serviço para os clientes ou na legenda das fotos.
                            </p>

                            {catalogConfig.hidePrices && (
                                <div style={{ paddingLeft: '32px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    <div style={{ padding: '16px', background: '#FEF3C7', borderRadius: '8px', border: '1px solid #FCD34D' }}>
                                        <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: '#92400E' }}>
                                            Motivo / Mensagem Substituta (O que a IA vai dizer?)
                                        </label>
                                        <select
                                            name="hidePricesReason"
                                            value={catalogConfig.hidePricesReason}
                                            onChange={handleCatalogChange}
                                            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #F59E0B', fontSize: '14px', marginBottom: catalogConfig.hidePricesReason === 'Outro' ? '12px' : '0' }}
                                        >
                                            <option value="Sob consulta">Sob consulta (Ex: "O valor é sob consulta")</option>
                                            <option value="Preço com vendedor">Preço com vendedor (A IA dirá que um consultor informará)</option>
                                            <option value="A partir de (Variável)">A partir de (Variável de acordo com projeto)</option>
                                            <option value="Outro">Outro (Mensagem Personalizada)</option>
                                        </select>

                                        {catalogConfig.hidePricesReason === 'Outro' && (
                                            <div>
                                                <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: '#92400E' }}>Sua Mensagem Personalizada:</label>
                                                <input
                                                    type="text"
                                                    name="customPriceHiddenReason"
                                                    value={catalogConfig.customPriceHiddenReason}
                                                    onChange={handleCatalogChange}
                                                    placeholder='Ex: "Valor sob medida, vou chamar um técnico."'
                                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #F59E0B', fontSize: '14px' }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
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
