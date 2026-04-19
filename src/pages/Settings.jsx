import React, { useState, useEffect } from 'react';
import { Save, Bot, Cpu, Mic, Volume2, Globe, Clock, MessageCircle, Package, Play, Pause, User, Loader } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const Settings = () => {
    const [activeSection, setActiveSection] = useState('integrations');
    const [agents, setAgents] = useState([]);
    const [selectedAgentId, setSelectedAgentId] = useState('');

    // Voice models state
    const [availableVoices, setAvailableVoices] = useState([]);
    const [playingVoiceId, setPlayingVoiceId] = useState(null);
    const [loadingPreview, setLoadingPreview] = useState(null);
    const [audioRef] = useState({ current: null });


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

                    if (data.prompUuid) {
                        // isPrompConnected is no longer used here
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

    // Fetch available voice models
    useEffect(() => {
        const fetchVoices = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await fetch('/api/voices', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setAvailableVoices(data);
                }
            } catch (e) {
                console.error('Error fetching voices:', e);
            }
        };
        fetchVoices();
    }, []);

    const togglePlayPreview = async (voiceDbId, elevenLabsVoiceId) => {
        // If already playing this voice, stop it
        if (playingVoiceId === voiceDbId) {
            if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
            setPlayingVoiceId(null);
            return;
        }
        // Stop any currently playing audio
        if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }

        setLoadingPreview(voiceDbId);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/voices/${elevenLabsVoiceId}/preview`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to generate preview');
            const data = await res.json();

            const audio = new Audio(`data:audio/mpeg;base64,${data.audio}`);
            audio.onended = () => { setPlayingVoiceId(null); audioRef.current = null; };
            audio.play();
            audioRef.current = audio;
            setPlayingVoiceId(voiceDbId);
        } catch (e) {
            console.error('Error playing preview:', e);
        } finally {
            setLoadingPreview(null);
        }
    };

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
        <div style={{ display: 'flex', gap: '32px', minHeight: 'calc(100vh - 140px)', alignItems: 'stretch' }}>
            {/* COLUMN 1: AGENT SIDEBAR */}
            <div style={{
                width: '300px',
                background: 'var(--bg-white)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-sm)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)', background: '#F8FAFC' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-dark)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Bot size={20} color="var(--primary-blue)" />
                        Seus Agentes
                    </h3>
                    <p style={{ fontSize: '12px', color: 'var(--text-medium)', marginTop: '4px' }}>Selecione um agente para configurar</p>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {agents.map(a => (
                            <button
                                key={a.id}
                                onClick={() => setSelectedAgentId(a.id)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    padding: '12px 16px',
                                    borderRadius: '12px',
                                    width: '100%',
                                    textAlign: 'left',
                                    transition: 'all 0.2s ease',
                                    backgroundColor: selectedAgentId === a.id ? 'var(--primary-light)' : 'transparent',
                                    border: selectedAgentId === a.id ? '1px solid var(--primary-blue)' : '1px solid transparent',
                                    color: selectedAgentId === a.id ? 'var(--primary-blue)' : 'var(--text-medium)',
                                }}
                                onMouseEnter={e => {
                                    if (selectedAgentId !== a.id) {
                                        e.currentTarget.style.backgroundColor = '#F1F5F9';
                                    }
                                }}
                                onMouseLeave={e => {
                                    if (selectedAgentId !== a.id) {
                                        e.currentTarget.style.backgroundColor = 'transparent';
                                    }
                                }}
                            >
                                <div style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '10px',
                                    backgroundColor: selectedAgentId === a.id ? 'var(--primary-blue)' : '#F1F5F9',
                                    color: selectedAgentId === a.id ? 'white' : 'var(--text-medium)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s'
                                }}>
                                    <Bot size={20} />
                                </div>
                                <span style={{ fontWeight: 600, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {a.name}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                <div style={{ padding: '16px', borderTop: '1px solid var(--border-color)', background: '#F8FAFC' }}>
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
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            width: '100%',
                            padding: '12px',
                            borderRadius: '10px',
                            border: '2px dashed #CBD5E1',
                            color: '#64748B',
                            fontWeight: '600',
                            fontSize: '14px',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.borderColor = 'var(--primary-blue)';
                            e.currentTarget.style.color = 'var(--primary-blue)';
                            e.currentTarget.style.backgroundColor = 'var(--primary-light)';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.borderColor = '#CBD5E1';
                            e.currentTarget.style.color = '#64748B';
                            e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                    >
                        <span>+ Novo Agente</span>
                    </button>
                </div>
            </div>

            {/* COLUMN 2: SETTINGS CONTENT */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* Horizontal Tabs Navigation */}
                <div style={{
                    background: 'var(--bg-white)',
                    padding: '8px',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-sm)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    gap: '8px',
                    overflowX: 'auto'
                }}>
                    {[
                        { id: 'integrations', label: 'Inteligência Artificial', icon: Cpu },
                        { id: 'voice', label: 'Voz e Áudio', icon: Mic },
                        { id: 'followup', label: 'Follow-up (IA)', icon: Clock },
                        { id: 'catalog', label: 'Catálogo de Produtos', icon: Package }
                    ].map(section => (
                        <button
                            key={section.id}
                            onClick={() => setActiveSection(section.id)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '10px 20px',
                                borderRadius: '10px',
                                fontWeight: 600,
                                fontSize: '14px',
                                whiteSpace: 'nowrap',
                                transition: 'all 0.2s',
                                cursor: 'pointer',
                                background: activeSection === section.id ? 'var(--primary-blue)' : 'transparent',
                                color: activeSection === section.id ? 'white' : 'var(--text-medium)',
                                border: 'none'
                            }}
                        >
                            <section.icon size={18} />
                            {section.label}
                        </button>
                    ))}
                </div>

                {/* Main Configuration Form Area */}
                <div style={{
                    flex: 1,
                    background: 'var(--bg-white)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-sm)',
                    border: '1px solid var(--border-color)',
                    padding: '32px',
                    position: 'relative',
                    overflowY: 'auto'
                }}>
                    {/* Integrations Section */}
                    {activeSection === 'integrations' && (
                        <div className="animate-fade-in">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                                <div style={{ background: 'var(--primary-light)', padding: '10px', borderRadius: '12px' }}>
                                    <Cpu size={28} color="var(--primary-blue)" />
                                </div>
                                <div>
                                    <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-dark)' }}>Inteligência Artificial</h2>
                                    <p style={{ color: 'var(--text-medium)', fontSize: '14px' }}>Gerencie o motor cognitivo do seu agente.</p>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gap: '24px' }}>
                                <div style={{ padding: '24px', border: '1px solid #E5E7EB', borderRadius: 'var(--radius-lg)', background: '#F8FAFC' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <Bot size={24} color="var(--primary-blue)" />
                                            <div>
                                                <h3 style={{ fontWeight: 700, fontSize: '16px' }}>Promp IA (Standard)</h3>
                                                <p style={{ fontSize: '13px', color: '#6B7280' }}>Modelo Otimizado para Vendas</p>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#DCFCE7', color: '#166534', padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: 700 }}>
                                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#166534' }}></div>
                                            ONLINE
                                        </div>
                                    </div>
                                    <p style={{ fontSize: '14px', color: '#374151', lineHeight: '1.6' }}>
                                        Sua instância está conectada à infraestrutura global da Promp IA. O desempenho é ajustado automaticamente para este agente.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Voice Section */}
                    {activeSection === 'voice' && (
                        <div className="animate-fade-in">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
                                <div style={{ background: 'var(--primary-light)', padding: '10px', borderRadius: '12px' }}>
                                    <Mic size={28} color="var(--primary-blue)" />
                                </div>
                                <div>
                                    <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-dark)' }}>Voz e Áudio</h2>
                                    <p style={{ color: 'var(--text-medium)', fontSize: '14px' }}>Configure como seu agente fala com os clientes.</p>
                                </div>
                            </div>

                            <div style={{ marginBottom: '32px', padding: '24px', background: '#F8FAFC', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                                    <input
                                        type="checkbox"
                                        id="voiceEnabled"
                                        name="enabled"
                                        checked={voice.enabled}
                                        onChange={handleVoiceChange}
                                        style={{ width: '22px', height: '22px', cursor: 'pointer', accentColor: 'var(--primary-blue)' }}
                                    />
                                    <label htmlFor="voiceEnabled" style={{ fontWeight: 700, fontSize: '16px', cursor: 'pointer' }}>Habilitar Respostas em Áudio</label>
                                </div>
                                <p style={{ color: 'var(--text-medium)', fontSize: '14px', marginLeft: '34px', lineHeight: '1.5' }}>
                                    Permite que a IA envie mensagens de voz humanizadas utilizando a tecnologia de última geração Promp Voice.
                                </p>
                            </div>

                            {voice.enabled && (
                                <div style={{ display: 'grid', gap: '24px' }}>
                                    {/* Voice Selector */}
                                    {availableVoices.length > 0 && (
                                        <div style={{ padding: '28px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', background: 'white' }}>
                                            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '20px', color: 'var(--text-dark)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Volume2 size={18} color="var(--primary-blue)" />
                                                Escolha a Voz do Agente
                                            </h3>

                                            {/* Female Voices */}
                                            {availableVoices.filter(v => v.gender === 'female').length > 0 && (
                                                <div style={{ marginBottom: '20px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #F1F5F9' }}>
                                                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#DB2777' }}>👩 Vozes Femininas</span>
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                        {availableVoices.filter(v => v.gender === 'female').map(v => (
                                                            <label key={v.id} style={{
                                                                display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px',
                                                                borderRadius: '12px', border: '1px solid',
                                                                borderColor: voice.voiceId === v.voiceId ? '#DB2777' : '#F1F5F9',
                                                                background: voice.voiceId === v.voiceId ? '#FDF2F8' : '#FAFAFA',
                                                                cursor: 'pointer', transition: 'all 0.2s'
                                                            }}>
                                                                <input
                                                                    type="radio"
                                                                    name="voiceId"
                                                                    value={v.voiceId}
                                                                    checked={voice.voiceId === v.voiceId}
                                                                    onChange={handleVoiceChange}
                                                                    style={{ width: '18px', height: '18px', accentColor: '#DB2777', flexShrink: 0 }}
                                                                />
                                                                <div style={{
                                                                    width: '34px', height: '34px', borderRadius: '10px',
                                                                    background: voice.voiceId === v.voiceId ? '#DB2777' : '#FCE7F3',
                                                                    color: voice.voiceId === v.voiceId ? 'white' : '#DB2777',
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                                                }}>
                                                                    <User size={16} />
                                                                </div>
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <div style={{ fontWeight: 700, fontSize: '14px', color: '#1E293B' }}>{v.name}</div>
                                                                    <div style={{ fontSize: '11px', color: '#94A3B8', fontFamily: 'monospace' }}>{v.voiceId}</div>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => { e.preventDefault(); togglePlayPreview(v.id, v.voiceId); }}
                                                                    disabled={loadingPreview === v.id}
                                                                    style={{
                                                                        background: loadingPreview === v.id ? '#94A3B8' : (playingVoiceId === v.id ? '#EF4444' : '#DB2777'),
                                                                        color: 'white', border: 'none', width: '32px', height: '32px',
                                                                        borderRadius: '50%', cursor: loadingPreview === v.id ? 'wait' : 'pointer', display: 'flex',
                                                                        alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s',
                                                                        flexShrink: 0
                                                                    }}
                                                                    title={loadingPreview === v.id ? 'Gerando preview...' : (playingVoiceId === v.id ? 'Pausar' : 'Ouvir Preview')}
                                                                >
                                                                    {loadingPreview === v.id ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : (playingVoiceId === v.id ? <Pause size={13} /> : <Play size={13} />)}
                                                                </button>
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Male Voices */}
                                            {availableVoices.filter(v => v.gender === 'male').length > 0 && (
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #F1F5F9' }}>
                                                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#2563EB' }}>👨 Vozes Masculinas</span>
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                        {availableVoices.filter(v => v.gender === 'male').map(v => (
                                                            <label key={v.id} style={{
                                                                display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px',
                                                                borderRadius: '12px', border: '1px solid',
                                                                borderColor: voice.voiceId === v.voiceId ? '#2563EB' : '#F1F5F9',
                                                                background: voice.voiceId === v.voiceId ? '#EFF6FF' : '#FAFAFA',
                                                                cursor: 'pointer', transition: 'all 0.2s'
                                                            }}>
                                                                <input
                                                                    type="radio"
                                                                    name="voiceId"
                                                                    value={v.voiceId}
                                                                    checked={voice.voiceId === v.voiceId}
                                                                    onChange={handleVoiceChange}
                                                                    style={{ width: '18px', height: '18px', accentColor: '#2563EB', flexShrink: 0 }}
                                                                />
                                                                <div style={{
                                                                    width: '34px', height: '34px', borderRadius: '10px',
                                                                    background: voice.voiceId === v.voiceId ? '#2563EB' : '#DBEAFE',
                                                                    color: voice.voiceId === v.voiceId ? 'white' : '#2563EB',
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                                                }}>
                                                                    <User size={16} />
                                                                </div>
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <div style={{ fontWeight: 700, fontSize: '14px', color: '#1E293B' }}>{v.name}</div>
                                                                    <div style={{ fontSize: '11px', color: '#94A3B8', fontFamily: 'monospace' }}>{v.voiceId}</div>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => { e.preventDefault(); togglePlayPreview(v.id, v.voiceId); }}
                                                                    disabled={loadingPreview === v.id}
                                                                    style={{
                                                                        background: loadingPreview === v.id ? '#94A3B8' : (playingVoiceId === v.id ? '#EF4444' : '#2563EB'),
                                                                        color: 'white', border: 'none', width: '32px', height: '32px',
                                                                        borderRadius: '50%', cursor: loadingPreview === v.id ? 'wait' : 'pointer', display: 'flex',
                                                                        alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s',
                                                                        flexShrink: 0
                                                                    }}
                                                                    title={loadingPreview === v.id ? 'Gerando preview...' : (playingVoiceId === v.id ? 'Pausar' : 'Ouvir Preview')}
                                                                >
                                                                    {loadingPreview === v.id ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : (playingVoiceId === v.id ? <Pause size={13} /> : <Play size={13} />)}
                                                                </button>
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {availableVoices.length === 0 && (
                                                <p style={{ textAlign: 'center', color: '#94A3B8', fontSize: '14px', padding: '16px 0' }}>
                                                    Nenhuma voz cadastrada. Peça ao administrador para adicionar vozes.
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* Trigger Rules */}
                                    <div style={{ padding: '28px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', background: 'white' }}>
                                        <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '20px', color: 'var(--text-dark)' }}>Regras de Gatilho</h3>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                                            <label style={{
                                                display: 'flex', alignItems: 'center', gap: '12px', padding: '16px',
                                                borderRadius: '12px', border: '1px solid',
                                                borderColor: voice.responseType === 'audio_only' ? 'var(--primary-blue)' : '#E2E8F0',
                                                background: voice.responseType === 'audio_only' ? 'var(--primary-light)' : 'transparent',
                                                cursor: 'pointer', transition: 'all 0.2s'
                                            }}>
                                                <input
                                                    type="radio"
                                                    name="responseType"
                                                    value="audio_only"
                                                    checked={voice.responseType === 'audio_only'}
                                                    onChange={handleVoiceChange}
                                                    style={{ width: '18px', height: '18px', accentColor: 'var(--primary-blue)' }}
                                                />
                                                <div>
                                                    <div style={{ fontWeight: 700, fontSize: '14px' }}>Reativo</div>
                                                    <div style={{ fontSize: '12px', color: 'var(--text-medium)' }}>Responder em áudio apenas quando o cliente enviar um áudio primeiro.</div>
                                                </div>
                                            </label>

                                            <label style={{
                                                display: 'flex', alignItems: 'center', gap: '12px', padding: '16px',
                                                borderRadius: '12px', border: '1px solid',
                                                borderColor: voice.responseType === 'percentage' ? 'var(--primary-blue)' : '#E2E8F0',
                                                background: voice.responseType === 'percentage' ? 'var(--primary-light)' : 'transparent',
                                                cursor: 'pointer', transition: 'all 0.2s'
                                            }}>
                                                <input
                                                    type="radio"
                                                    name="responseType"
                                                    value="percentage"
                                                    checked={voice.responseType === 'percentage'}
                                                    onChange={handleVoiceChange}
                                                    style={{ width: '18px', height: '18px', accentColor: 'var(--primary-blue)' }}
                                                />
                                                <div>
                                                    <div style={{ fontWeight: 700, fontSize: '14px' }}>Proativo (Aleatório)</div>
                                                    <div style={{ fontSize: '12px', color: 'var(--text-medium)' }}>Responder em áudio em uma porcentagem definida de mensagens.</div>
                                                </div>
                                            </label>
                                        </div>

                                        {voice.responseType === 'percentage' && (
                                            <div style={{ padding: '20px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                                    <span style={{ fontSize: '14px', fontWeight: 600 }}>Probabilidade de Áudio</span>
                                                    <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-blue)' }}>{voice.responsePercentage}%</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="100"
                                                    step="10"
                                                    name="responsePercentage"
                                                    value={voice.responsePercentage}
                                                    onChange={handleVoiceChange}
                                                    style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary-blue)' }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Follow-up Section */}
                    {activeSection === 'followup' && (
                        <div className="animate-fade-in">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ background: 'var(--primary-light)', padding: '10px', borderRadius: '12px' }}>
                                        <Clock size={28} color="var(--primary-blue)" />
                                    </div>
                                    <div>
                                        <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-dark)' }}>Follow-up IA</h2>
                                        <p style={{ color: 'var(--text-medium)', fontSize: '14px' }}>Recupere conversas automaticamente.</p>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#F8FAFC', padding: '8px 16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: followUp.enabled ? '#10B981' : '#64748B' }}>
                                        {followUp.enabled ? 'ATIVADO' : 'DESATIVADO'}
                                    </span>
                                    <input
                                        type="checkbox"
                                        checked={followUp.enabled}
                                        onChange={(e) => handleFollowUpChange('enabled', e.target.checked)}
                                        style={{ height: '20px', width: '20px', cursor: 'pointer', accentColor: '#10B981' }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gap: '24px' }}>
                                <div style={{ background: '#F8FAFC', padding: 24, borderRadius: 16, border: '1px solid #E2E8F0' }}>
                                    <label style={{ display: 'block', marginBottom: '12px', fontSize: '14px', fontWeight: 700, color: 'var(--text-dark)' }}>Números Ignorados (Filtro)</label>
                                    <input
                                        type="text"
                                        placeholder="Ex: 5521999999999, 5511988888888"
                                        value={followUp.ignoreNumbers || ''}
                                        onChange={(e) => handleFollowUpChange('ignoreNumbers', e.target.value)}
                                        style={{ width: '100%', padding: '12px 16px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '14px', marginBottom: '8px' }}
                                    />
                                    <p style={{ fontSize: 12, color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <MessageCircle size={14} /> Evita que a IA envie mensagens para administradores ou para si mesma.
                                    </p>
                                </div>

                                <div style={{ background: 'white', padding: 24, borderRadius: 16, border: '1px solid #E2E8F0 shadow-sm' }}>
                                    <label style={{ display: 'block', marginBottom: '12px', fontSize: '14px', fontWeight: 700 }}>Personalidade de Recuperação</label>
                                    <select
                                        value={followUp.tone}
                                        onChange={(e) => handleFollowUpChange('tone', e.target.value)}
                                        style={{ width: '100%', padding: '12px 16px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '14px', background: 'white', fontWeight: 600 }}
                                    >
                                        <option value="animated">🚀 Animado (Curto, enérgico, direto)</option>
                                        <option value="serious">👔 Profissional (Polido, consultivo)</option>
                                        <option value="ice_breaker">😄 Simpático (Leve, amigável)</option>
                                    </select>
                                </div>

                                <div>
                                    <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px', color: 'var(--text-dark)' }}>Sequência de Disparo</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {followUp.attempts.map((attempt, index) => (
                                            <div key={attempt.id} style={{
                                                display: 'flex', alignItems: 'center', gap: 16,
                                                background: attempt.active ? 'white' : '#F8FAFC',
                                                padding: '16px 20px', borderRadius: '12px',
                                                border: attempt.active ? '1px solid #E2E8F0' : '1px solid transparent',
                                                opacity: attempt.active ? 1 : 0.6,
                                                boxShadow: attempt.active ? 'var(--shadow-sm)' : 'none'
                                            }}>
                                                <div style={{
                                                    width: '28px', height: '28px', borderRadius: '50%',
                                                    background: attempt.active ? 'var(--primary-blue)' : '#CBD5E1',
                                                    color: 'white', display: 'flex', alignItems: 'center',
                                                    justifyContent: 'center', fontSize: '12px', fontWeight: 800
                                                }}>
                                                    {index + 1}
                                                </div>
                                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <span style={{ fontSize: '14px', fontWeight: 500 }}>Enviar após</span>
                                                    <input
                                                        type="number"
                                                        value={attempt.delayValue}
                                                        onChange={(e) => updateFollowUpAttempt(index, 'delayValue', parseInt(e.target.value))}
                                                        style={{ width: '60px', padding: '8px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px', textAlign: 'center', fontWeight: 700 }}
                                                    />
                                                    <select
                                                        value={attempt.delayUnit}
                                                        onChange={(e) => updateFollowUpAttempt(index, 'delayUnit', e.target.value)}
                                                        style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', fontWeight: 600, background: 'white' }}
                                                    >
                                                        <option value="minutes">Minutos</option>
                                                        <option value="hours">Horas</option>
                                                        <option value="days">Dias</option>
                                                    </select>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '12px', fontWeight: 700, color: attempt.active ? '#10B981' : '#94A3B8' }}>{attempt.active ? 'ATIVO' : 'PAUSADO'}</span>
                                                    <input
                                                        type="checkbox"
                                                        checked={attempt.active}
                                                        onChange={(e) => updateFollowUpAttempt(index, 'active', e.target.checked)}
                                                        style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#10B981' }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Catalog Section */}
                    {activeSection === 'catalog' && (
                        <div className="animate-fade-in">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
                                <div style={{ background: 'var(--primary-light)', padding: '10px', borderRadius: '12px' }}>
                                    <Package size={28} color="var(--primary-blue)" />
                                </div>
                                <div>
                                    <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-dark)' }}>Configurações do Catálogo</h2>
                                    <p style={{ color: 'var(--text-medium)', fontSize: '14px' }}>Regras globais de apresentação de produtos.</p>
                                </div>
                            </div>

                            <div style={{ background: '#F8FAFC', padding: 28, borderRadius: 20, border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                                    <input
                                        type="checkbox"
                                        id="hidePrices"
                                        name="hidePrices"
                                        checked={catalogConfig.hidePrices}
                                        onChange={handleCatalogChange}
                                        style={{ width: '22px', height: '22px', cursor: 'pointer', accentColor: 'var(--primary-blue)' }}
                                    />
                                    <label htmlFor="hidePrices" style={{ fontWeight: 800, cursor: 'pointer', fontSize: '16px' }}>
                                        Modo "Sob Consulta" (Ocultar Preços)
                                    </label>
                                </div>
                                <p style={{ fontSize: 13, color: '#64748B', marginBottom: '24px', paddingLeft: '36px', lineHeight: '1.6' }}>
                                    Quando ativado, a IA omitirá o preço de todos os itens e utilizará uma justificativa personalizada para incentivar o contato humano.
                                </p>

                                {catalogConfig.hidePrices && (
                                    <div style={{ paddingLeft: '36px' }}>
                                        <div style={{ padding: '24px', background: '#FFFBEB', borderRadius: '16px', border: '1px solid #FEF3C7' }}>
                                            <label style={{ display: 'block', fontSize: '14px', fontWeight: 700, marginBottom: '12px', color: '#92400E' }}>
                                                Justificativa da IA
                                            </label>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                <select
                                                    name="hidePricesReason"
                                                    value={catalogConfig.hidePricesReason}
                                                    onChange={handleCatalogChange}
                                                    style={{ width: '100%', padding: '12px 16px', borderRadius: '10px', border: '1px solid #FCD34D', fontSize: '14px', background: 'white', fontWeight: 600, color: '#92400E' }}
                                                >
                                                    <option value="Sob consulta">💎 Valor sob consulta</option>
                                                    <option value="Preço com vendedor">👨‍💼 Falar com especialista</option>
                                                    <option value="A partir de (Variável)">📈 Preço variável (Sob projeto)</option>
                                                    <option value="Outro">✏️ Personalizar mensagem...</option>
                                                </select>

                                                {catalogConfig.hidePricesReason === 'Outro' && (
                                                    <input
                                                        type="text"
                                                        name="customPriceHiddenReason"
                                                        value={catalogConfig.customPriceHiddenReason || ''}
                                                        onChange={handleCatalogChange}
                                                        placeholder='Ex: "O valor depende da sua região..."'
                                                        style={{ width: '100%', padding: '12px 16px', borderRadius: '10px', border: '1px solid #FCD34D', fontSize: '14px' }}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Bottom Save Bar (Within Content Area but Sticky) */}
                    <div style={{
                        marginTop: '40px',
                        paddingTop: '24px',
                        borderTop: '1px solid #E5E7EB',
                        display: 'flex',
                        justifyContent: 'flex-end',
                        position: 'sticky',
                        bottom: 0,
                        background: 'white',
                        zIndex: 10
                    }}>
                        <button
                            onClick={handleSave}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                background: 'var(--primary-blue)',
                                color: 'white',
                                padding: '14px 32px',
                                borderRadius: '12px',
                                fontWeight: 700,
                                fontSize: '15px',
                                cursor: 'pointer',
                                border: 'none',
                                boxShadow: '0 4px 14px 0 rgba(0, 102, 255, 0.39)',
                                transition: 'all 0.2s ease',
                                transform: showToast ? 'scale(0.98)' : 'scale(1)',
                                opacity: showToast ? 0.8 : 1
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 102, 255, 0.45)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 4px 14px 0 rgba(0, 102, 255, 0.39)';
                            }}
                        >
                            <Save size={20} />
                            {showToast ? 'Salvo com Sucesso!' : 'Salvar Alterações'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Float Toast Notification */}
            {showToast && (
                <div style={{
                    position: 'fixed',
                    bottom: '32px',
                    right: '32px',
                    background: '#059669',
                    color: 'white',
                    padding: '16px 28px',
                    borderRadius: '16px',
                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    zIndex: 9999,
                    animation: 'slideUp 0.4s ease-out'
                }}>
                    <div style={{ background: 'rgba(255,255,255,0.2)', padding: '4px', borderRadius: '50%' }}>
                        <Save size={16} />
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '14px' }}>Configurações atualizadas!</span>
                </div>
            )}

            <style>{`
                @keyframes slideUp {
                    from { transform: translateY(100%); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .animate-fade-in {
                    animation: fadeIn 0.3s ease-in-out;
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(5px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
};

export default Settings;
