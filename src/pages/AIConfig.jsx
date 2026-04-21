import React, { useState, useEffect } from 'react';
import FilesTab from '../components/AIConfig/FilesTab';
import LinksTab from '../components/AIConfig/LinksTab';
import QATab from '../components/AIConfig/QATab';
import PromptTab from '../components/AIConfig/PromptTab';
import ConditionalTransferTab from '../components/AIConfig/ConditionalTransferTab';
import {
    Save, Plus, ArrowLeft, ArrowRight, Bot, MessageSquare, Globe, FileText,
    HelpCircle, Loader2, Package, Trash, FileCode2, ToggleLeft, ToggleRight,
    Cpu, Mic, Volume2, Clock, MessageCircle, Play, Pause, User, Loader, Smile
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const AgentCard = ({ agent, onClick, onDelete }) => {
    let persona = {};
    try {
        persona = agent.persona ? (typeof agent.persona === 'string' ? JSON.parse(agent.persona) : agent.persona) : {};
    } catch (e) {}

    let kb = {};
    try {
        kb = agent.knowledgeBase ? (typeof agent.knowledgeBase === 'string' ? JSON.parse(agent.knowledgeBase) : agent.knowledgeBase) : {};
    } catch (e) {}

    let catalog = { showProducts: true, showServices: true };
    try {
        if (agent.catalogConfig) {
            catalog = typeof agent.catalogConfig === 'string' ? JSON.parse(agent.catalogConfig) : agent.catalogConfig;
        }
    } catch (e) {}

    const roleLabels = { sales: 'Vendas', support: 'Suporte', consultive_closer: 'Closer Consultivo', assistant: 'Assistente' };
    const toneLabels = { friendly: 'Simpático', formal: 'Formal', enthusiastic: 'Entusiasmado', empathetic: 'Empático' };

    return (
        <div
            onClick={() => onClick(agent.id)}
            style={{
                backgroundColor: 'var(--bg-white)', borderRadius: 'var(--radius-md)',
                padding: '24px', color: 'var(--text-dark)', cursor: 'pointer',
                transition: 'all 0.2s ease', display: 'flex', flexDirection: 'column',
                gap: '16px', minHeight: '280px', border: '1px solid var(--border-color)',
                boxShadow: 'var(--shadow-sm)'
            }}
            onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                e.currentTarget.style.borderColor = 'var(--primary-blue)';
            }}
            onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                e.currentTarget.style.borderColor = 'var(--border-color)';
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ padding: '10px', borderRadius: '12px', backgroundColor: '#F3F4F6', color: 'var(--primary-blue)' }}>
                    <Bot size={24} />
                </div>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Tem certeza que deseja excluir o agente "${persona.name || agent.name}"?`)) {
                            onDelete(agent.id);
                        }
                    }}
                    style={{
                        padding: '8px', borderRadius: '8px', backgroundColor: 'transparent',
                        border: 'none', color: '#EF4444', cursor: 'pointer', transition: 'all 0.2s',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#FEE2E2'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    title="Excluir Agente"
                >
                    <Trash size={18} />
                </button>
            </div>

            <div>
                <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px', color: 'var(--text-dark)' }}>{persona.name || agent.name}</h3>
                <div style={{ fontSize: '14px', color: 'var(--text-medium)' }}>
                    <div style={{ marginBottom: '4px' }}>Função: <span style={{ fontWeight: 500, color: 'var(--text-dark)' }}>{roleLabels[persona.role] || 'Assistente'}</span></div>
                    <div>Tom: <span style={{ fontWeight: 500, color: 'var(--text-dark)' }}>{toneLabels[persona.tone] || 'Natural'}</span></div>
                </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {(kb.files?.length > 0 || kb.links?.length > 0 || kb.qa?.length > 0) ? (
                    <>
                        {kb.files?.length > 0 && <span style={{ fontSize: '11px', background: '#EEF2FF', color: '#4F46E5', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>{kb.files.length} Docs</span>}
                        {kb.links?.length > 0 && <span style={{ fontSize: '11px', background: '#ECFDF5', color: '#059669', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>{kb.links.length} Links</span>}
                        {kb.qa?.length > 0 && <span style={{ fontSize: '11px', background: '#FFF7ED', color: '#D97706', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>Q&A</span>}
                    </>
                ) : (
                    <span style={{ fontSize: '11px', color: 'var(--text-medium)', fontStyle: 'italic' }}>Sem base de conhecimento</span>
                )}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--text-medium)' }}>
                    <Package size={14} />
                    <span style={{ fontWeight: 500, color: 'var(--text-dark)' }}>
                        {catalog.showProducts && catalog.showServices ? 'Produtos e Serviços' :
                            catalog.showProducts ? 'Apenas Produtos' :
                                catalog.showServices ? 'Apenas Serviços' : 'Catálogo Desativado'}
                    </span>
                </div>
            </div>

            <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid #F3F4F6' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '8px', color: 'var(--text-medium)', textTransform: 'uppercase' }}>Canais</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {agent.prompChannels?.length > 0 ? agent.prompChannels.map(ch => (
                        <span key={ch.id} title={ch.name} style={{
                            backgroundColor: '#F0FDF4', padding: '2px 6px', borderRadius: '4px',
                            fontSize: '10px', fontWeight: '600', color: '#166534', border: '1px solid #DCFCE7'
                        }}>
                            {ch.type ? ch.type.toUpperCase() : 'CANAL'}
                        </span>
                    )) : (
                        <span style={{ fontSize: '11px', color: '#9CA3AF', fontStyle: 'italic' }}>Nenhum canal</span>
                    )}
                </div>
            </div>
        </div>
    );
};

const NewAgentCard = ({ onClick }) => (
    <div
        onClick={onClick}
        style={{
            backgroundColor: 'var(--bg-white)', borderRadius: 'var(--radius-md)',
            border: '2px dashed var(--border-color)', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            minHeight: '280px', transition: 'all 0.2s', gap: '12px', color: 'var(--text-medium)'
        }}
        onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--primary-blue)';
            e.currentTarget.style.color = 'var(--primary-blue)';
            e.currentTarget.style.backgroundColor = '#F8FAFC';
        }}
        onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--border-color)';
            e.currentTarget.style.color = 'var(--text-medium)';
            e.currentTarget.style.backgroundColor = 'var(--bg-white)';
        }}
    >
        <Plus size={40} />
        <span style={{ fontWeight: '600', fontSize: '16px' }}>Novo Agente</span>
    </div>
);

const AIConfig = () => {
    const { user } = useAuth();
    const [view, setView] = useState('selection');
    const [activeTab, setActiveTab] = useState('prompt');
    const [agents, setAgents] = useState([]);
    const [selectedAgentId, setSelectedAgentId] = useState('');

    // Knowledge Base
    const [files, setFiles] = useState([]);
    const [links, setLinks] = useState([]);
    const [qa, setQa] = useState([]);

    // Prompt & Persona
    const [systemPrompt, setSystemPrompt] = useState('');
    const [persona, setPersona] = useState(null);

    // Channels
    const [prompChannels, setPrompChannels] = useState([]);
    const [loadingChannels, setLoadingChannels] = useState(false);
    const [isPrompConnected, setIsPrompConnected] = useState(false);
    const [configuringChannelId, setConfiguringChannelId] = useState(null);
    const [channelCreds, setChannelCreds] = useState({ url: '', token: '' });

    // Catalog (merged: what to show + price rules)
    const [catalogConfig, setCatalogConfig] = useState({
        showProducts: true, showServices: true, xmlSources: [],
        hidePrices: false, hidePricesReason: 'Sob consulta', customPriceHiddenReason: ''
    });
    const [xmlSources, setXmlSources] = useState([]);
    const [loadingXmlSources, setLoadingXmlSources] = useState(false);

    // Transfer
    const [transferConfigs, setTransferConfigs] = useState([]);
    const [conditionalTransferConfigs, setConditionalTransferConfigs] = useState([]);
    const [prompUsers, setPrompUsers] = useState([]);
    const [prompQueues, setPrompQueues] = useState([]);
    const [loadingListings, setLoadingListings] = useState(false);

    // Voice
    const [availableVoices, setAvailableVoices] = useState([]);
    const [playingVoiceId, setPlayingVoiceId] = useState(null);
    const [loadingPreview, setLoadingPreview] = useState(null);
    const [audioRef] = useState({ current: null });
    const [voice, setVoice] = useState({
        enabled: false, elevenLabsKey: '', voiceId: '',
        responseType: 'audio_only', responsePercentage: 50
    });

    // Follow-up
    const [followUp, setFollowUp] = useState({
        enabled: false, tone: 'serious', ignoreNumbers: '',
        attempts: [
            { id: 1, delayValue: 30, delayUnit: 'minutes', active: true },
            { id: 2, delayValue: 2, delayUnit: 'hours', active: true },
            { id: 3, delayValue: 1, delayUnit: 'days', active: true },
            { id: 4, delayValue: 3, delayUnit: 'days', active: true },
            { id: 5, delayValue: 7, delayUnit: 'days', active: true }
        ]
    });

    // Reactions
    const [reactionConfig, setReactionConfig] = useState({
        enabled: true, afirmacao: '👍', interesse: '🔥', explicacao: '👀', elogio: '🥰'
    });

    const [showToast, setShowToast] = useState(false);
    const [loading, setLoading] = useState(false);
    const [serverProducts, setServerProducts] = useState([]);

    const token = localStorage.getItem('token');

    useEffect(() => {
        if (!user || !user.companyId) return;
        fetchAgents();
        fetchPrompStatus();
        fetchVoices();
    }, [user]);

    useEffect(() => {
        if (selectedAgentId) {
            fetchConfig();
            if (isPrompConnected) fetchChannels();
        }
    }, [selectedAgentId, isPrompConnected]);

    useEffect(() => {
        const fetchListings = async () => {
            setLoadingListings(true);
            try {
                const resUsers = await fetch(`/api/promp/users?agentId=${selectedAgentId}`, { headers: { 'Authorization': `Bearer ${token}` } });
                if (resUsers.ok) setPrompUsers(await resUsers.json());
                const resQueues = await fetch(`/api/promp/queues?agentId=${selectedAgentId}`, { headers: { 'Authorization': `Bearer ${token}` } });
                if (resQueues.ok) setPrompQueues(await resQueues.json());
            } catch (e) {
                console.error("Failed to fetch listings:", e);
            } finally {
                setLoadingListings(false);
            }
        };

        if (activeTab === 'transfer' && selectedAgentId) fetchListings();
        if (activeTab === 'catalog' && selectedAgentId) fetchXmlSourcesForAgent();
    }, [activeTab, selectedAgentId]);

    const fetchVoices = async () => {
        try {
            const res = await fetch('/api/voices', { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) setAvailableVoices(await res.json());
        } catch (e) { console.error('Error fetching voices:', e); }
    };

    const fetchXmlSourcesForAgent = async () => {
        setLoadingXmlSources(true);
        try {
            const res = await fetch('/api/integrations/xml', { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) { const data = await res.json(); setXmlSources(data.sources || []); }
        } catch (e) { console.error('Failed to fetch XML sources:', e); }
        finally { setLoadingXmlSources(false); }
    };

    const handleXmlSourceToggle = (sourceId) => {
        setCatalogConfig(prev => {
            const active = Array.isArray(prev.xmlSources) ? prev.xmlSources : [];
            return {
                ...prev,
                xmlSources: active.includes(sourceId)
                    ? active.filter(id => id !== sourceId)
                    : [...active, sourceId]
            };
        });
    };

    const fetchPrompStatus = async () => {
        try {
            const res = await fetch('/api/config', { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) {
                const data = await res.json();
                if (data.prompUuid) setIsPrompConnected(true);
            }
        } catch (e) {}
    };

    const fetchAgents = async () => {
        try {
            const res = await fetch('/api/agents', { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) setAgents(await res.json());
        } catch (e) { console.error("Failed to fetch agents:", e); }
    };

    const fetchChannels = async () => {
        setLoadingChannels(true);
        try {
            const res = await fetch('/api/promp/channels', { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) { const data = await res.json(); setPrompChannels(data.channels || []); }
        } catch (e) { console.error("Failed to fetch Promp channels:", e); }
        finally { setLoadingChannels(false); }
    };

    const toggleChannelLink = async (channelObj, isLinked) => {
        try {
            const res = await fetch('/api/promp/channels/link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ agentId: selectedAgentId, channelObj, link: !isLinked })
            });
            if (res.ok) { fetchChannels(); fetchAgents(); }
        } catch (e) { console.error("Link error:", e); }
    };

    const fetchConfig = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/config?agentId=${selectedAgentId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();

                setSystemPrompt(data.systemPrompt || '');

                let parsedPersona = data.persona;
                if (typeof parsedPersona === 'string') {
                    try { parsedPersona = JSON.parse(parsedPersona); } catch (e) {}
                }
                setPersona(parsedPersona || null);

                if (data.knowledgeBase) {
                    let kb = data.knowledgeBase;
                    if (typeof kb === 'string') { try { kb = JSON.parse(kb); } catch (e) { kb = {}; } }
                    setFiles(kb.files || []);
                    setLinks((kb.links || []).map(l => typeof l === 'string' ? { url: l, content: '' } : l));
                    setQa(kb.qa || []);
                }

                let cat = data.catalogConfig || {};
                if (typeof cat === 'string') { try { cat = JSON.parse(cat); } catch (e) { cat = {}; } }
                setCatalogConfig({
                    showProducts: cat.showProducts ?? true,
                    showServices: cat.showServices ?? true,
                    xmlSources: Array.isArray(cat.xmlSources) ? cat.xmlSources : [],
                    hidePrices: cat.hidePrices || false,
                    hidePricesReason: cat.hidePricesReason || 'Sob consulta',
                    customPriceHiddenReason: cat.customPriceHiddenReason || ''
                });

                if (data.transferConfig) {
                    const allConfigs = Array.isArray(data.transferConfig) ? data.transferConfig : [data.transferConfig];
                    setTransferConfigs(allConfigs.filter(c => c.mode !== 'conditional'));
                    setConditionalTransferConfigs(allConfigs.filter(c => c.mode === 'conditional'));
                } else {
                    setTransferConfigs([]);
                    setConditionalTransferConfigs([]);
                }

                if (data.integrations) {
                    setVoice({
                        enabled: data.integrations.enabled || false,
                        elevenLabsKey: data.integrations.elevenLabsKey || '',
                        voiceId: data.integrations.voiceId || '',
                        responseType: data.integrations.responseType || 'audio_only',
                        responsePercentage: data.integrations.responsePercentage || 50
                    });
                }

                if (data.followUpConfig) {
                    try {
                        const parsed = typeof data.followUpConfig === 'string' ? JSON.parse(data.followUpConfig) : data.followUpConfig;
                        setFollowUp(prev => ({
                            ...prev,
                            enabled: parsed.enabled || false,
                            tone: parsed.tone || 'serious',
                            ignoreNumbers: parsed.ignoreNumbers || '',
                            attempts: parsed.attempts || prev.attempts
                        }));
                    } catch (e) {}
                }

                if (data.reactionConfig) {
                    try {
                        const parsed = typeof data.reactionConfig === 'string' ? JSON.parse(data.reactionConfig) : data.reactionConfig;
                        setReactionConfig(prev => ({ ...prev, ...parsed }));
                    } catch (e) {}
                }

                if (data.products && Array.isArray(data.products)) setServerProducts(data.products);
            }
        } catch (e) {
            console.error("Failed to load config:", e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            const payload = {
                agentId: selectedAgentId,
                systemPrompt,
                persona,
                knowledgeBase: { files, links, qa },
                catalogConfig,
                transferConfig: [...transferConfigs, ...conditionalTransferConfigs],
                integrations: { ...voice },
                voice,
                followUpConfig: JSON.stringify(followUp),
                reactionConfig: JSON.stringify(reactionConfig)
            };

            const res = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                setShowToast(true);
                setTimeout(() => setShowToast(false), 3000);
                fetchAgents();
            } else {
                alert('Erro ao salvar configuração.');
            }
        } catch (e) {
            console.error('Save failed:', e);
            alert('Erro ao conectar com servidor.');
        }
    };

    const handleCreateAgent = async () => {
        const name = prompt('Nome do novo agente:');
        if (!name) return;
        try {
            const res = await fetch('/api/agents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ name })
            });
            if (res.ok) {
                const newAg = await res.json();
                setAgents(prev => [...prev, newAg]);
                setSelectedAgentId(newAg.id);
                setView('edit');
                setActiveTab('prompt');
            }
        } catch (e) { console.error("error creating agent", e); }
    };

    const handleDeleteAgent = async (agentId) => {
        try {
            const res = await fetch(`/api/agents/${agentId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setAgents(prev => prev.filter(a => a.id !== agentId));
            } else {
                alert('Erro ao excluir agente.');
            }
        } catch (e) {
            console.error("error deleting agent", e);
            alert('Erro de conexão.');
        }
    };

    const handleSelectAgent = (id) => {
        setSelectedAgentId(id);
        setView('edit');
        setActiveTab('prompt');
    };

    const togglePlayPreview = async (voiceDbId, elevenLabsVoiceId) => {
        if (playingVoiceId === voiceDbId) {
            if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
            setPlayingVoiceId(null);
            return;
        }
        if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
        setLoadingPreview(voiceDbId);
        try {
            const res = await fetch(`/api/voices/${elevenLabsVoiceId}/preview`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!res.ok) throw new Error('Failed to generate preview');
            const data = await res.json();
            const audio = new Audio(`data:audio/mpeg;base64,${data.audio}`);
            audio.onended = () => { setPlayingVoiceId(null); audioRef.current = null; };
            audio.play();
            audioRef.current = audio;
            setPlayingVoiceId(voiceDbId);
        } catch (e) { console.error('Error playing preview:', e); }
        finally { setLoadingPreview(null); }
    };

    const handleVoiceChange = (e) => {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setVoice(prev => ({ ...prev, [e.target.name]: value }));
    };

    const updateFollowUpAttempt = (index, field, value) => {
        setFollowUp(prev => {
            const newAttempts = [...prev.attempts];
            newAttempts[index] = { ...newAttempts[index], [field]: value };
            return { ...prev, attempts: newAttempts };
        });
    };

    // ─── Selection View ────────────────────────────────────────────────────────
    if (view === 'selection') {
        return (
            <div style={{ padding: '24px' }}>
                <div style={{ marginBottom: '40px' }}>
                    <h2 style={{ fontSize: '32px', fontWeight: '700', color: 'var(--text-dark)', marginBottom: '8px' }}>Seus Agentes IA</h2>
                    <p style={{ color: 'var(--text-medium)' }}>Gerencie e configure cada um de seus agentes de forma independente.</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px' }}>
                    {agents.map(agent => (
                        <AgentCard key={agent.id} agent={agent} onClick={handleSelectAgent} onDelete={handleDeleteAgent} />
                    ))}
                    <NewAgentCard onClick={handleCreateAgent} />
                </div>
            </div>
        );
    }

    // ─── Edit View ─────────────────────────────────────────────────────────────
    const tabs = [
        { id: 'prompt',    label: 'Persona',               icon: Bot },
        { id: 'channels',  label: 'Canais de Atendimento',  icon: MessageSquare },
        { id: 'catalog',   label: 'Catálogo',               icon: Package },
        { id: 'transfer',  label: 'Transferência',          icon: ArrowRight },
        { id: 'files',     label: 'Arquivos',               icon: FileText },
        { id: 'links',     label: 'Links',                  icon: Globe },
        { id: 'qa',        label: 'Q&A',                    icon: HelpCircle },
        { id: 'ai',        label: 'Inteligência Artificial', icon: Cpu },
        { id: 'voice',     label: 'Voz e Áudio',            icon: Mic },
        { id: 'followup',  label: 'Follow-up (IA)',          icon: Clock },
        { id: 'reactions', label: 'Reações com Emojis',     icon: Smile },
    ];

    return (
        <div style={{ background: 'var(--bg-white)', padding: '32px', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-color)' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <button
                        onClick={() => setView('selection')}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            background: '#F3F4F6', border: 'none', padding: '10px 16px',
                            borderRadius: '8px', cursor: 'pointer', color: '#4B5563', fontWeight: '600',
                            transition: 'background 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#E5E7EB'}
                        onMouseLeave={e => e.currentTarget.style.background = '#F3F4F6'}
                    >
                        <ArrowLeft size={18} /> Painel
                    </button>
                    <div>
                        <h2 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-dark)' }}>
                            {persona?.name || agents.find(a => a.id === selectedAgentId)?.name}
                        </h2>
                        <span style={{ fontSize: '13px', color: 'var(--text-medium)' }}>Configuração de Agente</span>
                    </div>
                </div>
                <button
                    onClick={handleSave}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        background: 'var(--primary-blue)', color: 'white',
                        padding: '12px 24px', borderRadius: '8px', fontWeight: '600',
                        cursor: 'pointer', outline: 'none', border: 'none',
                        boxShadow: '0 4px 6px -1px rgba(0, 102, 255, 0.2)'
                    }}
                >
                    <Save size={20} />
                    {showToast ? 'Salvo!' : 'Salvar Alterações'}
                </button>
            </div>

            {/* Tab Bar */}
            <div style={{ borderBottom: '1px solid #E5E7EB', marginBottom: '32px', display: 'flex', gap: '32px', overflowX: 'auto' }}>
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 4px',
                            borderBottom: activeTab === tab.id ? '3px solid var(--primary-blue)' : '3px solid transparent',
                            color: activeTab === tab.id ? 'var(--primary-blue)' : 'var(--text-medium)',
                            fontWeight: 600, background: 'none',
                            borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                            cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s'
                        }}
                    >
                        <tab.icon size={18} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div>
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px', color: 'var(--text-medium)' }}>
                        <Loader2 className="animate-spin" style={{ marginRight: '8px' }} /> Carregando...
                    </div>
                ) : (
                    <>
                        {/* ── Persona ── */}
                        {activeTab === 'prompt' && (
                            <PromptTab
                                agentId={selectedAgentId}
                                systemPrompt={systemPrompt}
                                onPromptChange={setSystemPrompt}
                                persona={persona}
                                onPersonaChange={setPersona}
                            />
                        )}

                        {/* ── Canais ── */}
                        {activeTab === 'channels' && (
                            <div style={{ padding: '8px' }}>
                                <div style={{ marginBottom: '24px' }}>
                                    <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Vincular Canais</h3>
                                    <p style={{ color: 'var(--text-medium)', fontSize: '14px' }}>Selecione quais canais de atendimento esta IA deve responder.</p>
                                </div>
                                {!isPrompConnected ? (
                                    <div style={{ padding: '32px', textAlign: 'center', background: '#FEF2F2', borderRadius: '12px', border: '1px solid #FEE2E2' }}>
                                        <p style={{ color: '#B91C1C', fontWeight: 600 }}>Integração Promp não configurada.</p>
                                        <p style={{ fontSize: '14px', color: '#991B1B' }}>Configure a conexão em "Integrações" para gerenciar os canais aqui.</p>
                                    </div>
                                ) : (
                                    <>
                                        {loadingChannels ? (
                                            <div style={{ textAlign: 'center', padding: '40px' }}><Loader2 className="animate-spin" /></div>
                                        ) : (
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
                                                {prompChannels.map(ch => {
                                                    const isLinked = ch.linkedAgents?.some(a => a.id === selectedAgentId);
                                                    const needsConfig = !ch.hasSpecificCreds;
                                                    const isConfiguring = configuringChannelId === ch.id;
                                                    return (
                                                        <div key={ch.id} style={{ marginBottom: '12px' }}>
                                                            <div style={{
                                                                background: 'white', padding: '16px', borderRadius: '12px',
                                                                border: isLinked ? '2px solid #10B981' : '1px solid var(--border-color)',
                                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                                boxShadow: isLinked ? '0 4px 6px -1px rgba(16, 185, 129, 0.1)' : 'none',
                                                                transition: 'all 0.2s', position: 'relative'
                                                            }}>
                                                                <div style={{ overflow: 'hidden' }}>
                                                                    <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-dark)' }}>{ch.name}</div>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                        <span style={{ fontSize: '11px', color: 'var(--text-medium)', textTransform: 'uppercase' }}>{ch.type || 'Padrão'}</span>
                                                                        {!needsConfig && <span title="Credenciais Ativas" style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981' }}></span>}
                                                                    </div>
                                                                </div>
                                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                                    {needsConfig ? (
                                                                        <button
                                                                            onClick={() => {
                                                                                setConfiguringChannelId(isConfiguring ? null : ch.id);
                                                                                setChannelCreds({
                                                                                    url: ch.prompUuid ? `https://api.promp.com.br/v2/api/external/${ch.prompUuid}` : '',
                                                                                    token: ch.prompToken || ''
                                                                                });
                                                                            }}
                                                                            style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', border: '1px solid #10B981', background: isConfiguring ? '#10B981' : 'transparent', color: isConfiguring ? 'white' : '#065F46' }}
                                                                        >
                                                                            {isConfiguring ? 'Cancelar' : 'Configurar'}
                                                                        </button>
                                                                    ) : (
                                                                        <div style={{ display: 'flex', gap: '4px' }}>
                                                                            <button
                                                                                onClick={() => {
                                                                                    setConfiguringChannelId(isConfiguring ? null : ch.id);
                                                                                    setChannelCreds({
                                                                                        url: ch.prompUuid ? `https://api.promp.com.br/v2/api/external/${ch.prompUuid}` : '',
                                                                                        token: ch.prompToken || ''
                                                                                    });
                                                                                }}
                                                                                style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', border: '1px solid #D1D5DB', background: isConfiguring ? '#9CA3AF' : 'transparent', color: '#374151' }}
                                                                            >
                                                                                {isConfiguring ? 'Cancelar' : 'Editar'}
                                                                            </button>
                                                                            <button
                                                                                onClick={() => toggleChannelLink(ch, isLinked)}
                                                                                style={{
                                                                                    padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                                                                                    cursor: 'pointer', border: 'none',
                                                                                    background: isLinked ? '#FEE2E2' : '#D1FAE5',
                                                                                    color: isLinked ? '#B91C1C' : '#065F46', transition: 'opacity 0.2s'
                                                                                }}
                                                                                onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                                                                                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                                                                            >
                                                                                {isLinked ? 'Remover' : 'Vincular'}
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            {isConfiguring && (
                                                                <div style={{ background: '#F9FAFB', padding: '16px', border: '1px solid #E5E7EB', borderTop: 'none', borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px', display: 'grid', gap: '10px' }}>
                                                                    <input type="text" placeholder="Cole a URL da API deste canal" value={channelCreds.url}
                                                                        onChange={e => setChannelCreds(prev => ({ ...prev, url: e.target.value }))}
                                                                        style={{ width: '100%', padding: '8px', fontSize: '12px', border: '1px solid #D1D5DB', borderRadius: '6px' }}
                                                                    />
                                                                    <input type="password" placeholder="Token do canal" value={channelCreds.token}
                                                                        onChange={e => setChannelCreds(prev => ({ ...prev, token: e.target.value }))}
                                                                        style={{ width: '100%', padding: '8px', fontSize: '12px', border: '1px solid #D1D5DB', borderRadius: '6px' }}
                                                                    />
                                                                    <button
                                                                        onClick={async () => {
                                                                            if (!channelCreds.url || !channelCreds.token) return alert('URL e Token são obrigatórios.');
                                                                            const uuidMatch = channelCreds.url.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
                                                                            if (!uuidMatch) return alert('Não foi possível encontrar um ID de sessão (UUID) válido na URL informada.');
                                                                            const pUuid = uuidMatch[0];
                                                                            try {
                                                                                const res = await fetch('/api/promp/channels/link', {
                                                                                    method: 'POST',
                                                                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                                                                    body: JSON.stringify({ agentId: selectedAgentId, channelObj: { ...ch, uuid: pUuid }, prompToken: channelCreds.token, prompUuid: pUuid, link: false })
                                                                                });
                                                                                if (res.ok) { setConfiguringChannelId(null); fetchChannels(); }
                                                                                else { const d = await res.json(); alert(d.message || 'Erro ao salvar credenciais.'); }
                                                                            } catch (e) { alert('Erro de conexão.'); }
                                                                        }}
                                                                        style={{ background: '#10B981', color: 'white', border: 'none', padding: '10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                                                                    >
                                                                        Ativar Canal
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                                {prompChannels.length === 0 && (
                                                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--text-medium)' }}>
                                                        Nenhum canal encontrado na sua conta Promp.
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}

                        {/* ── Catálogo (merged) ── */}
                        {activeTab === 'catalog' && (
                            <div style={{ padding: '8px' }}>
                                {/* O que oferecer */}
                                <div style={{ marginBottom: '32px' }}>
                                    <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>O que oferecer</h3>
                                    <p style={{ color: 'var(--text-medium)', fontSize: '14px', marginBottom: '20px' }}>Defina quais itens do seu catálogo este agente deve oferecer aos clientes.</p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '400px' }}>
                                        <label style={{
                                            display: 'flex', alignItems: 'center', gap: '12px', padding: '16px',
                                            borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s',
                                            background: catalogConfig.showProducts ? '#F0FDF4' : 'transparent',
                                            border: `1px solid ${catalogConfig.showProducts ? '#10B981' : 'var(--border-color)'}`
                                        }}>
                                            <input type="checkbox" checked={catalogConfig.showProducts}
                                                onChange={e => setCatalogConfig(prev => ({ ...prev, showProducts: e.target.checked }))}
                                                style={{ width: '20px', height: '20px' }}
                                            />
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '15px' }}>Oferecer Produtos</div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-medium)' }}>Itens físicos e catálogo da Wbuy</div>
                                            </div>
                                        </label>
                                        <label style={{
                                            display: 'flex', alignItems: 'center', gap: '12px', padding: '16px',
                                            borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s',
                                            background: catalogConfig.showServices ? '#F0FDF4' : 'transparent',
                                            border: `1px solid ${catalogConfig.showServices ? '#10B981' : 'var(--border-color)'}`
                                        }}>
                                            <input type="checkbox" checked={catalogConfig.showServices}
                                                onChange={e => setCatalogConfig(prev => ({ ...prev, showServices: e.target.checked }))}
                                                style={{ width: '20px', height: '20px' }}
                                            />
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '15px' }}>Oferecer Serviços / Agendamentos</div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-medium)' }}>Serviços cadastrados e integração com Agenda</div>
                                            </div>
                                        </label>
                                    </div>
                                </div>

                                {/* Fontes XML */}
                                <div style={{ marginBottom: '32px', paddingTop: '24px', borderTop: '1px solid #E5E7EB' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                                        <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <FileCode2 size={16} color="white" />
                                        </div>
                                        <div>
                                            <h4 style={{ fontWeight: 700, fontSize: '15px', margin: 0, color: '#1F2937' }}>Fontes XML de Catálogo</h4>
                                            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-medium)' }}>Habilite quais feeds XML este agente deve usar como catálogo de produtos</p>
                                        </div>
                                    </div>
                                    {loadingXmlSources ? (
                                        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-medium)' }}><Loader2 className="animate-spin" /></div>
                                    ) : xmlSources.length === 0 ? (
                                        <div style={{ padding: '16px', background: '#F9FAFB', borderRadius: '10px', border: '1px solid #E5E7EB', textAlign: 'center', fontSize: '13px', color: '#6B7280' }}>
                                            Nenhuma fonte XML cadastrada. Acesse <strong>Integrações → Link Catálogo XML</strong> para adicionar.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            {xmlSources.map(source => {
                                                const activeXml = Array.isArray(catalogConfig.xmlSources) ? catalogConfig.xmlSources : [];
                                                const isActive = activeXml.includes(source.id);
                                                return (
                                                    <div key={source.id}
                                                        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderRadius: '12px', border: `1px solid ${isActive ? '#A78BFA' : 'var(--border-color)'}`, background: isActive ? '#F5F3FF' : 'white', transition: 'all 0.2s', cursor: 'pointer' }}
                                                        onClick={() => handleXmlSourceToggle(source.id)}
                                                    >
                                                        <div style={{ width: 36, height: 36, borderRadius: '8px', background: isActive ? 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)' : '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                            <FileCode2 size={16} color={isActive ? 'white' : '#9CA3AF'} />
                                                        </div>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontWeight: 600, fontSize: '14px', color: '#1F2937' }}>{source.name}</div>
                                                            <div style={{ fontSize: '11px', color: '#6B7280' }}>
                                                                {source.productCount > 0 ? `${source.productCount} produtos` : 'Ainda não sincronizado'}
                                                                {!source.enabled ? ' · Fonte desativada globalmente' : ''}
                                                            </div>
                                                        </div>
                                                        <div style={{ color: isActive ? '#6D28D9' : '#9CA3AF', flexShrink: 0 }}>
                                                            {isActive ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Apresentação de preços */}
                                <div style={{ paddingTop: '24px', borderTop: '1px solid #E5E7EB' }}>
                                    <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Apresentação de Preços</h3>
                                    <p style={{ color: 'var(--text-medium)', fontSize: '14px', marginBottom: '20px' }}>Regras de como este agente apresenta valores aos clientes.</p>
                                    <div style={{ background: '#F8FAFC', padding: 28, borderRadius: 20, border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                                            <input type="checkbox" id="hidePrices" checked={catalogConfig.hidePrices}
                                                onChange={e => setCatalogConfig(prev => ({ ...prev, hidePrices: e.target.checked }))}
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
                                                    <label style={{ display: 'block', fontSize: '14px', fontWeight: 700, marginBottom: '12px', color: '#92400E' }}>Justificativa da IA</label>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                        <select
                                                            value={catalogConfig.hidePricesReason}
                                                            onChange={e => setCatalogConfig(prev => ({ ...prev, hidePricesReason: e.target.value }))}
                                                            style={{ width: '100%', padding: '12px 16px', borderRadius: '10px', border: '1px solid #FCD34D', fontSize: '14px', background: 'white', fontWeight: 600, color: '#92400E' }}
                                                        >
                                                            <option value="Sob consulta">💎 Valor sob consulta</option>
                                                            <option value="Preço com vendedor">👨‍💼 Falar com especialista</option>
                                                            <option value="A partir de (Variável)">📈 Preço variável (Sob projeto)</option>
                                                            <option value="Outro">✏️ Personalizar mensagem...</option>
                                                        </select>
                                                        {catalogConfig.hidePricesReason === 'Outro' && (
                                                            <input type="text"
                                                                value={catalogConfig.customPriceHiddenReason || ''}
                                                                onChange={e => setCatalogConfig(prev => ({ ...prev, customPriceHiddenReason: e.target.value }))}
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
                            </div>
                        )}

                        {/* ── Transferência ── */}
                        {activeTab === 'transfer' && (
                            <div style={{ padding: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                    <div>
                                        <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Configuração de Transferência</h3>
                                        <p style={{ color: 'var(--text-medium)', fontSize: '14px' }}>Configure quando e para quem a IA deve transferir o atendimento.</p>
                                    </div>
                                    <button
                                        onClick={() => setTransferConfigs(prev => [...prev, { triggerText: '', targetType: 'user', targetId: '' }])}
                                        style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--primary-blue)', color: 'white', padding: '10px 16px', borderRadius: '8px', border: 'none', fontWeight: '600', cursor: 'pointer' }}
                                    >
                                        <Plus size={16} /> Nova Regra
                                    </button>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                    {transferConfigs.map((config, index) => (
                                        <div key={index} style={{ background: '#F9FAFB', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', position: 'relative' }}>
                                            <button
                                                onClick={() => setTransferConfigs(prev => prev.filter((_, i) => i !== index))}
                                                style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '4px', fontSize: '13px', fontWeight: '600' }}
                                            >
                                                Remover
                                            </button>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '500px' }}>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-dark)', marginBottom: '8px' }}>Gatilho de Texto (Cliente diz...)</label>
                                                    <input type="text" placeholder="Ex: falar com humano, atendente, suporte"
                                                        value={config.triggerText || ''}
                                                        onChange={e => { const updated = [...transferConfigs]; updated[index].triggerText = e.target.value; setTransferConfigs(updated); }}
                                                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '14px' }}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-dark)', marginBottom: '8px' }}>Destino da Transferência</label>
                                                    <div style={{ display: 'flex', gap: '12px' }}>
                                                        {['user', 'queue'].map(type => (
                                                            <button key={type}
                                                                onClick={() => { const updated = [...transferConfigs]; updated[index].targetType = type; updated[index].targetId = ''; setTransferConfigs(updated); }}
                                                                style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid', borderColor: config.targetType === type ? 'var(--primary-blue)' : 'var(--border-color)', background: config.targetType === type ? '#EFF6FF' : 'white', color: config.targetType === type ? 'var(--primary-blue)' : 'var(--text-dark)', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s' }}
                                                            >
                                                                {type === 'user' ? 'Usuário' : 'Fila / Setor'}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                {loadingListings ? (
                                                    <div style={{ textAlign: 'center', padding: '10px' }}><Loader2 className="animate-spin" /></div>
                                                ) : (
                                                    <div>
                                                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-dark)', marginBottom: '8px' }}>
                                                            {config.targetType === 'user' ? 'Selecionar Usuário' : 'Selecionar Fila'}
                                                        </label>
                                                        <select value={config.targetId || ''}
                                                            onChange={e => { const updated = [...transferConfigs]; updated[index].targetId = e.target.value; setTransferConfigs(updated); }}
                                                            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '14px', background: 'white' }}
                                                        >
                                                            <option value="">Selecione...</option>
                                                            {config.targetType === 'user'
                                                                ? prompUsers.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)
                                                                : prompQueues.map(q => <option key={q.id} value={q.id}>{q.queue || q.name}</option>)
                                                            }
                                                        </select>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {transferConfigs.length === 0 && (
                                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-medium)', background: '#F9FAFB', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                                            Nenhuma regra de transferência simples configurada.
                                        </div>
                                    )}
                                </div>

                                <div style={{ marginTop: '40px', borderTop: '2px solid #E2E8F0', paddingTop: '32px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                        <div>
                                            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px', color: 'var(--text-dark)' }}>📋 Encaminhamento Condicional</h3>
                                            <p style={{ color: 'var(--text-medium)', fontSize: '14px' }}>Configure fluxos de coleta de dados via conversa antes da transferência.</p>
                                        </div>
                                        <button
                                            onClick={() => setConditionalTransferConfigs(prev => [...prev, {
                                                mode: 'conditional', name: `Fluxo ${prev.length + 1}`,
                                                triggerMode: 'keyword', triggerKeywords: [], triggerCommand: '',
                                                destination: { type: 'user', targetId: '' },
                                                notificationWhatsApp: { number: '', messageTemplate: '' },
                                                fields: [], maxRetries: 2, cancelKeywords: ['cancelar', 'sair', 'desistir']
                                            }])}
                                            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#6366F1', color: 'white', padding: '10px 18px', borderRadius: '10px', border: 'none', fontWeight: '600', cursor: 'pointer', boxShadow: '0 2px 8px rgba(99,102,241,0.3)' }}
                                        >
                                            <Plus size={16} /> Novo Fluxo
                                        </button>
                                    </div>
                                    {conditionalTransferConfigs.map((ctConfig, ctIndex) => (
                                        <div key={ctIndex} style={{ marginBottom: '24px', background: 'white', borderRadius: '16px', border: '1px solid #E2E8F0', position: 'relative' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)', color: 'white', borderTopLeftRadius: '16px', borderTopRightRadius: '16px' }}>
                                                <span style={{ fontWeight: 700, fontSize: '15px' }}>{ctConfig.name || `Fluxo ${ctIndex + 1}`}</span>
                                                <button
                                                    onClick={() => setConditionalTransferConfigs(prev => prev.filter((_, i) => i !== ctIndex))}
                                                    style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '6px 14px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}
                                                >
                                                    Remover
                                                </button>
                                            </div>
                                            <div style={{ padding: '24px' }}>
                                                <ConditionalTransferTab
                                                    config={ctConfig}
                                                    onChange={updated => {
                                                        const newConfigs = [...conditionalTransferConfigs];
                                                        newConfigs[ctIndex] = updated;
                                                        setConditionalTransferConfigs(newConfigs);
                                                    }}
                                                    prompUsers={prompUsers}
                                                    prompQueues={prompQueues}
                                                    loadingListings={loadingListings}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                    {conditionalTransferConfigs.length === 0 && (
                                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-medium)', background: '#F9FAFB', borderRadius: '12px', border: '2px dashed #E2E8F0' }}>
                                            Nenhum fluxo condicional configurado. Clique em "Novo Fluxo" para começar.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── Knowledge Base ── */}
                        {activeTab === 'files' && <FilesTab files={files} onUpdate={setFiles} />}
                        {activeTab === 'links' && <LinksTab links={links} onUpdate={setLinks} />}
                        {activeTab === 'qa' && <QATab qaList={qa} onUpdate={setQa} />}

                        {/* ── Inteligência Artificial ── */}
                        {activeTab === 'ai' && (
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                                    <div style={{ background: 'var(--primary-light)', padding: '10px', borderRadius: '12px' }}>
                                        <Cpu size={28} color="var(--primary-blue)" />
                                    </div>
                                    <div>
                                        <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-dark)' }}>Inteligência Artificial</h2>
                                        <p style={{ color: 'var(--text-medium)', fontSize: '14px' }}>Gerencie o motor cognitivo do seu agente.</p>
                                    </div>
                                </div>
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
                        )}

                        {/* ── Voz e Áudio ── */}
                        {activeTab === 'voice' && (
                            <div>
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
                                        <input type="checkbox" id="voiceEnabled" name="enabled" checked={voice.enabled}
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
                                        <div style={{ padding: '28px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', background: 'white' }}>
                                            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '20px', color: 'var(--text-dark)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Volume2 size={18} color="var(--primary-blue)" /> Escolha a Voz do Agente
                                            </h3>
                                            {[{ gender: 'female', label: '👩 Vozes Femininas', color: '#DB2777', bg: '#FDF2F8', lightBg: '#FCE7F3' },
                                              { gender: 'male',   label: '👨 Vozes Masculinas', color: '#2563EB', bg: '#EFF6FF', lightBg: '#DBEAFE' }].map(({ gender, label, color, bg, lightBg }) => {
                                                const filtered = availableVoices.filter(v => v.gender === gender);
                                                if (!filtered.length) return null;
                                                return (
                                                    <div key={gender} style={{ marginBottom: '20px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #F1F5F9' }}>
                                                            <span style={{ fontSize: '14px', fontWeight: 700, color }}>{label}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                            {filtered.map(v => (
                                                                <label key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', borderRadius: '12px', border: '1px solid', borderColor: voice.voiceId === v.voiceId ? color : '#F1F5F9', background: voice.voiceId === v.voiceId ? bg : '#FAFAFA', cursor: 'pointer', transition: 'all 0.2s' }}>
                                                                    <input type="radio" name="voiceId" value={v.voiceId} checked={voice.voiceId === v.voiceId} onChange={handleVoiceChange}
                                                                        style={{ width: '18px', height: '18px', accentColor: color, flexShrink: 0 }}
                                                                    />
                                                                    <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: voice.voiceId === v.voiceId ? color : lightBg, color: voice.voiceId === v.voiceId ? 'white' : color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                                        <User size={16} />
                                                                    </div>
                                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                                        <div style={{ fontWeight: 700, fontSize: '14px', color: '#1E293B' }}>{v.name}</div>
                                                                        <div style={{ fontSize: '11px', color: '#94A3B8', fontFamily: 'monospace' }}>{v.voiceId}</div>
                                                                    </div>
                                                                    <button type="button" onClick={e => { e.preventDefault(); togglePlayPreview(v.id, v.voiceId); }} disabled={loadingPreview === v.id}
                                                                        style={{ background: loadingPreview === v.id ? '#94A3B8' : (playingVoiceId === v.id ? '#EF4444' : color), color: 'white', border: 'none', width: '32px', height: '32px', borderRadius: '50%', cursor: loadingPreview === v.id ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', flexShrink: 0 }}
                                                                        title={loadingPreview === v.id ? 'Gerando preview...' : (playingVoiceId === v.id ? 'Pausar' : 'Ouvir Preview')}
                                                                    >
                                                                        {loadingPreview === v.id ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : (playingVoiceId === v.id ? <Pause size={13} /> : <Play size={13} />)}
                                                                    </button>
                                                                </label>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {availableVoices.length === 0 && (
                                                <p style={{ textAlign: 'center', color: '#94A3B8', fontSize: '14px', padding: '16px 0' }}>
                                                    Nenhuma voz cadastrada. Peça ao administrador para adicionar vozes.
                                                </p>
                                            )}
                                        </div>
                                        <div style={{ padding: '28px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', background: 'white' }}>
                                            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '20px', color: 'var(--text-dark)' }}>Regras de Gatilho</h3>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                                                {[
                                                    { value: 'audio_only', title: 'Reativo', desc: 'Responder em áudio apenas quando o cliente enviar um áudio primeiro.' },
                                                    { value: 'percentage', title: 'Proativo (Aleatório)', desc: 'Responder em áudio em uma porcentagem definida de mensagens.' }
                                                ].map(opt => (
                                                    <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', borderRadius: '12px', border: '1px solid', borderColor: voice.responseType === opt.value ? 'var(--primary-blue)' : '#E2E8F0', background: voice.responseType === opt.value ? 'var(--primary-light)' : 'transparent', cursor: 'pointer', transition: 'all 0.2s' }}>
                                                        <input type="radio" name="responseType" value={opt.value} checked={voice.responseType === opt.value} onChange={handleVoiceChange}
                                                            style={{ width: '18px', height: '18px', accentColor: 'var(--primary-blue)' }}
                                                        />
                                                        <div>
                                                            <div style={{ fontWeight: 700, fontSize: '14px' }}>{opt.title}</div>
                                                            <div style={{ fontSize: '12px', color: 'var(--text-medium)' }}>{opt.desc}</div>
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>
                                            {voice.responseType === 'percentage' && (
                                                <div style={{ padding: '20px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                                        <span style={{ fontSize: '14px', fontWeight: 600 }}>Probabilidade de Áudio</span>
                                                        <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-blue)' }}>{voice.responsePercentage}%</span>
                                                    </div>
                                                    <input type="range" min="0" max="100" step="10" name="responsePercentage" value={voice.responsePercentage} onChange={handleVoiceChange}
                                                        style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary-blue)' }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── Follow-up ── */}
                        {activeTab === 'followup' && (
                            <div>
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
                                        <input type="checkbox" checked={followUp.enabled}
                                            onChange={e => setFollowUp(prev => ({ ...prev, enabled: e.target.checked }))}
                                            style={{ height: '20px', width: '20px', cursor: 'pointer', accentColor: '#10B981' }}
                                        />
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gap: '24px' }}>
                                    <div style={{ background: '#F8FAFC', padding: 24, borderRadius: 16, border: '1px solid #E2E8F0' }}>
                                        <label style={{ display: 'block', marginBottom: '12px', fontSize: '14px', fontWeight: 700, color: 'var(--text-dark)' }}>Números Ignorados (Filtro)</label>
                                        <input type="text" placeholder="Ex: 5521999999999, 5511988888888"
                                            value={followUp.ignoreNumbers || ''}
                                            onChange={e => setFollowUp(prev => ({ ...prev, ignoreNumbers: e.target.value }))}
                                            style={{ width: '100%', padding: '12px 16px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '14px', marginBottom: '8px' }}
                                        />
                                        <p style={{ fontSize: 12, color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <MessageCircle size={14} /> Evita que a IA envie mensagens para administradores ou para si mesma.
                                        </p>
                                    </div>
                                    <div style={{ background: 'white', padding: 24, borderRadius: 16, border: '1px solid #E2E8F0' }}>
                                        <label style={{ display: 'block', marginBottom: '12px', fontSize: '14px', fontWeight: 700 }}>Personalidade de Recuperação</label>
                                        <select value={followUp.tone}
                                            onChange={e => setFollowUp(prev => ({ ...prev, tone: e.target.value }))}
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
                                                <div key={attempt.id} style={{ display: 'flex', alignItems: 'center', gap: 16, background: attempt.active ? 'white' : '#F8FAFC', padding: '16px 20px', borderRadius: '12px', border: attempt.active ? '1px solid #E2E8F0' : '1px solid transparent', opacity: attempt.active ? 1 : 0.6, boxShadow: attempt.active ? 'var(--shadow-sm)' : 'none' }}>
                                                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: attempt.active ? 'var(--primary-blue)' : '#CBD5E1', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800 }}>
                                                        {index + 1}
                                                    </div>
                                                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <span style={{ fontSize: '14px', fontWeight: 500 }}>Enviar após</span>
                                                        <input type="number" value={attempt.delayValue}
                                                            onChange={e => updateFollowUpAttempt(index, 'delayValue', parseInt(e.target.value))}
                                                            style={{ width: '60px', padding: '8px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px', textAlign: 'center', fontWeight: 700 }}
                                                        />
                                                        <select value={attempt.delayUnit}
                                                            onChange={e => updateFollowUpAttempt(index, 'delayUnit', e.target.value)}
                                                            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', fontWeight: 600, background: 'white' }}
                                                        >
                                                            <option value="minutes">Minutos</option>
                                                            <option value="hours">Horas</option>
                                                            <option value="days">Dias</option>
                                                        </select>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontSize: '12px', fontWeight: 700, color: attempt.active ? '#10B981' : '#94A3B8' }}>{attempt.active ? 'ATIVO' : 'PAUSADO'}</span>
                                                        <input type="checkbox" checked={attempt.active}
                                                            onChange={e => updateFollowUpAttempt(index, 'active', e.target.checked)}
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

                        {/* ── Reações com Emojis ── */}
                        {activeTab === 'reactions' && (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ background: 'var(--primary-light)', padding: '10px', borderRadius: '12px' }}>
                                            <Smile size={28} color="var(--primary-blue)" />
                                        </div>
                                        <div>
                                            <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-dark)' }}>Reações com Emojis</h2>
                                            <p style={{ color: 'var(--text-medium)', fontSize: '14px' }}>Configure as reações automáticas às mensagens dos clientes.</p>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#F8FAFC', padding: '8px 16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: reactionConfig.enabled ? '#10B981' : '#64748B' }}>
                                            {reactionConfig.enabled ? 'ATIVADO' : 'DESATIVADO'}
                                        </span>
                                        <input type="checkbox" checked={reactionConfig.enabled}
                                            onChange={e => setReactionConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                                            style={{ height: '20px', width: '20px', cursor: 'pointer', accentColor: '#10B981' }}
                                        />
                                    </div>
                                </div>
                                <p style={{ fontSize: 14, color: '#64748B', marginBottom: 24, padding: '12px 16px', background: '#F0F9FF', borderRadius: '10px', border: '1px solid #BAE6FD' }}>
                                    A IA detecta automaticamente o tipo de mensagem do cliente e reage com o emoji configurado. Você pode personalizar cada emoji abaixo.
                                </p>
                                <div style={{ display: 'grid', gap: '16px' }}>
                                    {[
                                        { key: 'afirmacao', label: 'Afirmação / Concordância', description: 'Cliente confirma, concorda ou responde positivamente (ex: "sim", "ok", "pode ser")' },
                                        { key: 'interesse', label: 'Interesse / Intenção de Compra', description: 'Cliente demonstra interesse em produto ou serviço (ex: "quero saber mais", "quanto custa")' },
                                        { key: 'elogio',    label: 'Elogio / Satisfação',         description: 'Cliente elogia a empresa, produto ou atendimento (ex: "parabéns", "gostei muito", "incrível")' },
                                        { key: 'explicacao', label: 'Explicação / Contexto',       description: 'Cliente explica uma situação ou problema em detalhes (mensagens mais longas com contexto)' },
                                    ].map(({ key, label, description }) => (
                                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '20px', background: '#F8FAFC', padding: '20px 24px', borderRadius: '14px', border: '1px solid #E2E8F0' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-dark)', marginBottom: '4px' }}>{label}</div>
                                                <div style={{ fontSize: '13px', color: '#64748B' }}>{description}</div>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                                                <input type="text" value={reactionConfig[key] || ''} maxLength={2}
                                                    onChange={e => setReactionConfig(prev => ({ ...prev, [key]: e.target.value }))}
                                                    style={{ width: '60px', height: '60px', fontSize: '28px', textAlign: 'center', borderRadius: '12px', border: '2px solid #E2E8F0', background: 'white', cursor: 'text', outline: 'none' }}
                                                    onFocus={e => e.target.style.borderColor = 'var(--primary-blue)'}
                                                    onBlur={e => e.target.style.borderColor = '#E2E8F0'}
                                                />
                                                <span style={{ fontSize: '11px', color: '#94A3B8' }}>Emoji</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {showToast && (
                <div style={{
                    position: 'fixed', bottom: '32px', right: '32px',
                    background: '#10B981', color: 'white', padding: '16px 32px',
                    borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                    zIndex: 1000, display: 'flex', alignItems: 'center', gap: '12px'
                }}>
                    <Save size={20} />
                    <span style={{ fontWeight: '600' }}>Alterações salvas com sucesso!</span>
                </div>
            )}
        </div>
    );
};

export default AIConfig;
