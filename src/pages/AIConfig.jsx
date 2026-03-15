import React, { useState, useEffect } from 'react';
import FilesTab from '../components/AIConfig/FilesTab';
import LinksTab from '../components/AIConfig/LinksTab';
import QATab from '../components/AIConfig/QATab';
import PromptTab from '../components/AIConfig/PromptTab';
import { Save, Plus, ArrowLeft, ArrowRight, Bot, MessageSquare, Globe, FileText, HelpCircle, ChevronRight, Hash, Loader2, Package } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const AgentCard = ({ agent, onClick }) => {
    let persona = {};
    try {
        persona = agent.persona ? (typeof agent.persona === 'string' ? JSON.parse(agent.persona) : agent.persona) : {};
    } catch (e) {
        console.error("Error parsing persona in AgentCard:", e);
    }

    let kb = {};
    try {
        kb = agent.knowledgeBase ? (typeof agent.knowledgeBase === 'string' ? JSON.parse(agent.knowledgeBase) : agent.knowledgeBase) : {};
    } catch (e) {
        console.error("Error parsing knowledgeBase in AgentCard:", e);
    }

    let catalog = { showProducts: true, showServices: true };
    try {
        if (agent.catalogConfig) {
            catalog = typeof agent.catalogConfig === 'string' ? JSON.parse(agent.catalogConfig) : agent.catalogConfig;
        }
    } catch (e) {
        console.error("Error parsing catalogConfig in AgentCard:", e);
    }
    
    const roleLabels = {
        sales: 'Vendas',
        support: 'Suporte',
        consultative_closer: 'Closer Consultivo',
        assistant: 'Assistente'
    };

    const toneLabels = {
        friendly: 'Simpático',
        formal: 'Formal',
        enthusiastic: 'Entusiasmado',
        empathetic: 'Empático'
    };

    return (
        <div 
            onClick={() => onClick(agent.id)}
            style={{
                backgroundColor: 'var(--bg-white)',
                borderRadius: 'var(--radius-md)',
                padding: '24px',
                color: 'var(--text-dark)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                minHeight: '280px',
                border: '1px solid var(--border-color)',
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
            </div>

            <div>
                <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px', color: 'var(--text-dark)' }}>{agent.name}</h3>
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
                            backgroundColor: '#F0FDF4', 
                            padding: '2px 6px', 
                            borderRadius: '4px', 
                            fontSize: '10px',
                            fontWeight: '600',
                            color: '#166534',
                            border: '1px solid #DCFCE7'
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
            backgroundColor: 'var(--bg-white)',
            borderRadius: 'var(--radius-md)',
            border: '2px dashed var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            minHeight: '280px',
            transition: 'all 0.2s',
            gap: '12px',
            color: 'var(--text-medium)'
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
    const [view, setView] = useState('selection'); // 'selection' or 'edit'
    const [activeTab, setActiveTab] = useState('prompt');
    const [agents, setAgents] = useState([]);
    const [selectedAgentId, setSelectedAgentId] = useState('');

    // Knowledge Base State
    const [files, setFiles] = useState([]);
    const [links, setLinks] = useState([]);
    const [qa, setQa] = useState([]);

    // Prompt & Persona State
    const [systemPrompt, setSystemPrompt] = useState('');
    const [persona, setPersona] = useState(null);

    // Channels State
    const [prompChannels, setPrompChannels] = useState([]);
    const [loadingChannels, setLoadingChannels] = useState(false);
    const [isPrompConnected, setIsPrompConnected] = useState(false);

    // Catalog State
    const [catalogConfig, setCatalogConfig] = useState({ showProducts: true, showServices: true });
    const [configuringChannelId, setConfiguringChannelId] = useState(null);
    const [channelCreds, setChannelCreds] = useState({ url: '', token: '' });

    // Transfer Config State
    const [transferConfig, setTransferConfig] = useState({ triggerText: '', targetType: 'user', targetId: '' });
    const [prompUsers, setPrompUsers] = useState([]);
    const [prompQueues, setPrompQueues] = useState([]);
    const [loadingListings, setLoadingListings] = useState(false);

    const [showToast, setShowToast] = useState(false);
    const [loading, setLoading] = useState(false);

    const token = localStorage.getItem('token');

    useEffect(() => {
        if (!user || !user.companyId) return;
        fetchAgents();
        fetchPrompStatus();
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
                const resUsers = await fetch('/api/promp/users', { headers: { 'Authorization': `Bearer ${token}` } });
                if (resUsers.ok) setPrompUsers(await resUsers.json());

                const resQueues = await fetch('/api/promp/queues', { headers: { 'Authorization': `Bearer ${token}` } });
                if (resQueues.ok) setPrompQueues(await resQueues.json());
            } catch (e) {
                console.error("Failed to fetch listings:", e);
            } finally {
                setLoadingListings(false);
            }
        };

        if (activeTab === 'transfer' && selectedAgentId) {
            fetchListings();
        }
    }, [activeTab, selectedAgentId]);

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
            if (res.ok) {
                const data = await res.json();
                setAgents(data);
            }
        } catch (e) {
            console.error("Failed to fetch agents:", e);
        }
    };

    const fetchChannels = async () => {
        try {
            setLoadingChannels(true);
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
        try {
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
                fetchChannels();
                fetchAgents(); // Refresh summary cards
            }
        } catch (e) {
            console.error("Link error:", e);
        }
    };

    const fetchConfig = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/config?agentId=${selectedAgentId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setSystemPrompt(data.systemPrompt || '');
                
                // Properly parse persona if it's a string
                let parsedPersona = data.persona;
                if (typeof parsedPersona === 'string') {
                    try {
                        parsedPersona = JSON.parse(parsedPersona);
                    } catch (e) {
                        console.error("error parsing persona", e);
                    }
                }
                setPersona(parsedPersona || null);

                if (data.knowledgeBase) {
                    let kb = data.knowledgeBase;
                    if (typeof kb === 'string') {
                        try {
                            kb = JSON.parse(kb);
                        } catch (e) {
                            console.error("error parsing kb", e);
                            kb = {};
                        }
                    }
                    setFiles(kb.files || []);
                    setLinks((kb.links || []).map(l => typeof l === 'string' ? { url: l, content: '' } : l));
                    setQa(kb.qa || []);
                }

                if (data.catalogConfig) {
                    let cat = data.catalogConfig;
                    if (typeof cat === 'string') {
                        try {
                            cat = JSON.parse(cat);
                        } catch (e) {
                            console.error("error parsing catalogConfig", e);
                            cat = { showProducts: true, showServices: true };
                        }
                    }
                    setCatalogConfig(cat);
                } else {
                    setCatalogConfig({ showProducts: true, showServices: true });
                }

                if (data.transferConfig) {
                    setTransferConfig(data.transferConfig);
                } else {
                    setTransferConfig({ triggerText: '', targetType: 'user', targetId: '' });
                }
            }
        } catch (e) {
            console.error("Failed to load AI Config:", e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            const token = localStorage.getItem('token');
            const payload = {
                agentId: selectedAgentId,
                systemPrompt,
                persona,
                knowledgeBase: { files, links, qa },
                catalogConfig,
                transferConfig
            };

            const res = await fetch('/api/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                setShowToast(true);
                setTimeout(() => setShowToast(false), 3000);
                fetchAgents(); // Refresh selection view data
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
                setView('edit');
                setActiveTab('prompt');
            }
        } catch (e) {
            console.error("error creating agent", e);
        }
    };

    const handleSelectAgent = (id) => {
        setSelectedAgentId(id);
        setView('edit');
        setActiveTab('prompt');
    };

    if (view === 'selection') {
        return (
            <div style={{ padding: '24px' }}>
                <div style={{ marginBottom: '40px' }}>
                    <h2 style={{ fontSize: '32px', fontWeight: '700', color: 'var(--text-dark)', marginBottom: '8px' }}>Seus Agentes IA</h2>
                    <p style={{ color: 'var(--text-medium)' }}>Gerencie e configure cada um de seus agentes de forma independente.</p>
                </div>
                
                <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
                    gap: '24px' 
                }}>
                    {agents.map(agent => (
                        <AgentCard key={agent.id} agent={agent} onClick={handleSelectAgent} />
                    ))}
                    <NewAgentCard onClick={handleCreateAgent} />
                </div>
            </div>
        );
    }

    return (
        <div style={{ background: 'var(--bg-white)', padding: '32px', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-color)' }}>
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
                        <h2 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-dark)' }}>{agents.find(a => a.id === selectedAgentId)?.name}</h2>
                        <span style={{ fontSize: '13px', color: 'var(--text-medium)' }}>Configuração de Agente</span>
                    </div>
                </div>

                <button
                    onClick={handleSave}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        background: 'var(--primary-blue)', color: 'white',
                        padding: '12px 24px', borderRadius: '8px',
                        fontWeight: '600', cursor: 'pointer',
                        outline: 'none', border: 'none',
                        boxShadow: '0 4px 6px -1px rgba(0, 102, 255, 0.2)'
                    }}
                >
                    <Save size={20} />
                    {showToast ? 'Salvo!' : 'Salvar Alterações'}
                </button>
            </div>

            <div style={{ borderBottom: '1px solid #E5E7EB', marginBottom: '32px', display: 'flex', gap: '32px', overflowX: 'auto' }}>
                {[
                    { id: 'prompt', label: 'Persona', icon: Bot },
                    { id: 'channels', label: 'Canais de Atendimento', icon: MessageSquare },
                    { id: 'catalog', label: 'Catálogo', icon: Package },
                    { id: 'transfer', label: 'Transferência', icon: ArrowRight },
                    { id: 'files', label: 'Arquivos', icon: FileText },
                    { id: 'links', label: 'Links', icon: Globe },
                    { id: 'qa', label: 'Q&A', icon: HelpCircle }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '12px 4px',
                            borderBottom: activeTab === tab.id ? '3px solid var(--primary-blue)' : '3px solid transparent',
                            color: activeTab === tab.id ? 'var(--primary-blue)' : 'var(--text-medium)',
                            fontWeight: 600,
                            background: 'none',
                            borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            transition: 'all 0.2s'
                        }}
                    >
                        <tab.icon size={18} />
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="content">
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px', color: 'var(--text-medium)' }}>
                        <Loader2 className="animate-spin" style={{ marginRight: '8px' }} /> Carregando...
                    </div>
                ) : (
                    <>
                        {activeTab === 'prompt' && <PromptTab systemPrompt={systemPrompt} onPromptChange={setSystemPrompt} persona={persona} onPersonaChange={setPersona} />}
                        
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
                                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "16px" }}>
                                                {prompChannels.map(ch => {
                                                    const isLinked = ch.linkedAgents?.some(a => a.id === selectedAgentId);
                                                    const needsConfig = !ch.hasSpecificCreds;
                                                    const isConfiguring = configuringChannelId === ch.id;

                                                    return (
                                                        <div key={ch.id} style={{ marginBottom: '12px' }}>
                                                            <div style={{
                                                                background: "white", padding: "16px", borderRadius: "12px",
                                                                border: isLinked ? "2px solid #10B981" : "1px solid var(--border-color)",
                                                                display: "flex", justifyContent: "space-between", alignItems: "center",
                                                                boxShadow: isLinked ? '0 4px 6px -1px rgba(16, 185, 129, 0.1)' : 'none',
                                                                transition: 'all 0.2s',
                                                                position: 'relative'
                                                            }}>
                                                                <div style={{ overflow: "hidden" }}>
                                                                    <div style={{ fontWeight: 600, fontSize: "14px", color: 'var(--text-dark)' }}>{ch.name}</div>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                        <span style={{ fontSize: "11px", color: "var(--text-medium)", textTransform: 'uppercase' }}>{ch.type || 'Padrão'}</span>
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
                                                                            style={{ padding: "6px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: 700, cursor: "pointer", border: "1px solid #10B981", background: isConfiguring ? "#10B981" : "transparent", color: isConfiguring ? "white" : "#065F46" }}
                                                                        >
                                                                            {isConfiguring ? "Cancelar" : "Configurar"}
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
                                                                                style={{ padding: "6px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: 700, cursor: "pointer", border: "1px solid #D1D5DB", background: isConfiguring ? "#9CA3AF" : "transparent", color: "#374151" }}
                                                                            >
                                                                                {isConfiguring ? "Cancelar" : "Editar"}
                                                                            </button>
                                                                            <button
                                                                                onClick={() => toggleChannelLink(ch, isLinked)}
                                                                                style={{ 
                                                                                    padding: "6px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: 700, 
                                                                                    cursor: "pointer", border: "none", 
                                                                                    background: isLinked ? "#FEE2E2" : "#D1FAE5", 
                                                                                    color: isLinked ? "#B91C1C" : "#065F46",
                                                                                    transition: 'opacity 0.2s'
                                                                                }}
                                                                                onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                                                                                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                                                                            >
                                                                                {isLinked ? "Remover" : "Vincular"}
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Inline Config Form for Agent View */}
                                                            {isConfiguring && (
                                                                <div style={{ background: '#F9FAFB', padding: '16px', border: '1px solid #E5E7EB', borderTop: 'none', borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px', display: 'grid', gap: '10px' }}>
                                                                    <input 
                                                                        type="text" 
                                                                        placeholder="Cole a URL da API deste canal" 
                                                                        value={channelCreds.url}
                                                                        onChange={e => setChannelCreds(prev => ({ ...prev, url: e.target.value }))}
                                                                        style={{ width: '100%', padding: '8px', fontSize: '12px', border: '1px solid #D1D5DB', borderRadius: '6px' }}
                                                                    />
                                                                    <input 
                                                                        type="password" 
                                                                        placeholder="Token do canal" 
                                                                        value={channelCreds.token}
                                                                        onChange={e => setChannelCreds(prev => ({ ...prev, token: e.target.value }))}
                                                                        style={{ width: '100%', padding: '8px', fontSize: '12px', border: '1px solid #D1D5DB', borderRadius: '6px' }}
                                                                    />
                                                                    <button 
                                                                        onClick={async () => {
                                                                            if (!channelCreds.url || !channelCreds.token) return alert("URL e Token são obrigatórios.");
                                                                            const uuidMatch = channelCreds.url.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
                                                                            if (!uuidMatch) return alert("Não foi possível encontrar um ID de sessão (UUID) válido na URL informada.");
                                                                            const pUuid = uuidMatch[0];

                                                                            try {
                                                                                const res = await fetch('/api/promp/channels/link', {
                                                                                    method: 'POST',
                                                                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                                                                    body: JSON.stringify({
                                                                                        agentId: selectedAgentId,
                                                                                        channelObj: { ...ch, uuid: pUuid },
                                                                                        prompToken: channelCreds.token,
                                                                                        prompUuid: pUuid,
                                                                                        link: false
                                                                                    })
                                                                                });
                                                                                if (res.ok) {
                                                                                    setConfiguringChannelId(null);
                                                                                    fetchChannels();
                                                                                } else {
                                                                                    const d = await res.json();
                                                                                    alert(d.message || "Erro ao salvar credenciais.");
                                                                                }
                                                                            } catch (e) { alert("Erro de conexão."); }
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

                        {activeTab === 'catalog' && (
                            <div style={{ padding: '8px' }}>
                                <div style={{ marginBottom: '24px' }}>
                                    <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Configuração do Catálogo</h3>
                                    <p style={{ color: 'var(--text-medium)', fontSize: '14px' }}>Defina quais itens do seu catálogo este agente deve oferecer aos clientes.</p>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '400px' }}>
                                    <label style={{ 
                                        display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', 
                                        borderRadius: '12px', border: '1px solid var(--border-color)', 
                                        cursor: 'pointer', transition: 'all 0.2s',
                                        background: catalogConfig.showProducts ? '#F0FDF4' : 'transparent',
                                        borderColor: catalogConfig.showProducts ? '#10B981' : 'var(--border-color)'
                                    }}>
                                        <input 
                                            type="checkbox" 
                                            checked={catalogConfig.showProducts}
                                            onChange={(e) => setCatalogConfig(prev => ({ ...prev, showProducts: e.target.checked }))}
                                            style={{ width: '20px', height: '20px' }}
                                        />
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '15px' }}>Oferecer Produtos</div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-medium)' }}>Itens físicos e catálogo da Wbuy</div>
                                        </div>
                                    </label>

                                    <label style={{ 
                                        display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', 
                                        borderRadius: '12px', border: '1px solid var(--border-color)', 
                                        cursor: 'pointer', transition: 'all 0.2s',
                                        background: catalogConfig.showServices ? '#F0FDF4' : 'transparent',
                                        borderColor: catalogConfig.showServices ? '#10B981' : 'var(--border-color)'
                                    }}>
                                        <input 
                                            type="checkbox" 
                                            checked={catalogConfig.showServices}
                                            onChange={(e) => setCatalogConfig(prev => ({ ...prev, showServices: e.target.checked }))}
                                            style={{ width: '20px', height: '20px' }}
                                        />
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '15px' }}>Oferecer Serviços / Agendamentos</div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-medium)' }}>Serviços cadastrados e integração com Agenda</div>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        )}

                        {activeTab === 'transfer' && (
                            <div style={{ padding: '8px' }}>
                                <div style={{ marginBottom: '24px' }}>
                                    <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Configuração de Transferência</h3>
                                    <p style={{ color: 'var(--text-medium)', fontSize: '14px' }}>Configure quando e para quem a IA deve transferir o atendimento.</p>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '500px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-dark)', marginBottom: '8px' }}>
                                            Gatilho de Texto (Cliente diz...)
                                        </label>
                                        <input 
                                            type="text" 
                                            placeholder="Ex: falar com humano, atendente, suporte" 
                                            value={transferConfig.triggerText || ''}
                                            onChange={(e) => setTransferConfig(prev => ({ ...prev, triggerText: e.target.value }))}
                                            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '14px' }}
                                        />
                                        <span style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '4px', display: 'block' }}>
                                            Se a mensagem do cliente contiver este texto, a transferência será acionada.
                                        </span>
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-dark)', marginBottom: '8px' }}>
                                            Destino da Transferência
                                        </label>
                                        <div style={{ display: 'flex', gap: '12px' }}>
                                            <button 
                                                onClick={() => setTransferConfig(prev => ({ ...prev, targetType: 'user', targetId: '' }))}
                                                style={{
                                                    flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid',
                                                    borderColor: transferConfig.targetType === 'user' ? 'var(--primary-blue)' : 'var(--border-color)',
                                                    background: transferConfig.targetType === 'user' ? '#EFF6FF' : 'white',
                                                    color: transferConfig.targetType === 'user' ? 'var(--primary-blue)' : 'var(--text-dark)',
                                                    fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s'
                                                }}
                                            >
                                                Usuário
                                            </button>
                                            <button 
                                                onClick={() => setTransferConfig(prev => ({ ...prev, targetType: 'queue', targetId: '' }))}
                                                style={{
                                                    flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid',
                                                    borderColor: transferConfig.targetType === 'queue' ? 'var(--primary-blue)' : 'var(--border-color)',
                                                    background: transferConfig.targetType === 'queue' ? '#EFF6FF' : 'white',
                                                    color: transferConfig.targetType === 'queue' ? 'var(--primary-blue)' : 'var(--text-dark)',
                                                    fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s'
                                                }}
                                            >
                                                Fila / Setor
                                            </button>
                                        </div>
                                    </div>

                                    {loadingListings ? (
                                        <div style={{ textAlign: 'center', padding: '20px' }}><Loader2 className="animate-spin" /></div>
                                    ) : (
                                        <div>
                                            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-dark)', marginBottom: '8px' }}>
                                                {transferConfig.targetType === 'user' ? 'Selecionar Usuário' : 'Selecionar Fila'}
                                            </label>
                                            <select 
                                                value={transferConfig.targetId || ''}
                                                onChange={(e) => setTransferConfig(prev => ({ ...prev, targetId: e.target.value }))}
                                                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '14px', background: 'white' }}
                                            >
                                                <option value="">Selecione...</option>
                                                {transferConfig.targetType === 'user' ? (
                                                    prompUsers.map(u => (
                                                        <option key={u.id} value={u.id}>{u.name || u.email}</option>
                                                    ))
                                                ) : (
                                                    prompQueues.map(q => (
                                                        <option key={q.id} value={q.id}>{q.queue || q.name}</option>
                                                    ))
                                                )}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'files' && <FilesTab files={files} onUpdate={setFiles} />}
                        {activeTab === 'links' && <LinksTab links={links} onUpdate={setLinks} />}
                        {activeTab === 'qa' && <QATab qaList={qa} onUpdate={setQa} />}
                    </>
                )}
            </div>

            {showToast && (
                <div style={{
                    position: 'fixed', bottom: '32px', right: '32px',
                    background: '#10B981', color: 'white',
                    padding: '16px 32px', borderRadius: '12px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                    zIndex: 1000,
                    display: 'flex', alignItems: 'center', gap: '12px',
                    animation: 'slideIn 0.3s ease-out'
                }}>
                    <Save size={20} />
                    <span style={{ fontWeight: '600' }}>Alterações salvas com sucesso!</span>
                </div>
            )}
        </div>
    );
};

export default AIConfig;
