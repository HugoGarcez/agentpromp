import React, { useState, useEffect } from 'react';
import FilesTab from '../components/AIConfig/FilesTab';
import LinksTab from '../components/AIConfig/LinksTab';
import QATab from '../components/AIConfig/QATab';
import PromptTab from '../components/AIConfig/PromptTab';
import { Save, Plus, ArrowLeft, Bot, MessageSquare, Globe, FileText, HelpCircle, ChevronRight, Hash } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const AgentCard = ({ agent, onClick }) => {
    const persona = agent.persona ? (typeof agent.persona === 'string' ? JSON.parse(agent.persona) : agent.persona) : {};
    const kb = agent.knowledgeBase ? (typeof agent.knowledgeBase === 'string' ? JSON.parse(agent.knowledgeBase) : agent.knowledgeBase) : {};
    
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
                backgroundColor: '#B3E5FC', // Softer blue
                borderRadius: '24px',
                padding: '32px',
                color: '#1A1A1A',
                cursor: 'pointer',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
                minHeight: '320px',
                position: 'relative',
                overflow: 'hidden',
                border: '2px solid #000',
                boxShadow: '8px 8px 0px #000' // Neobrutalism touch
            }}
            onMouseEnter={e => {
                e.currentTarget.style.transform = 'translate(-2px, -2px)';
                e.currentTarget.style.boxShadow = '12px 12px 0px #000';
            }}
            onMouseLeave={e => {
                e.currentTarget.style.transform = 'translate(0, 0)';
                e.currentTarget.style.boxShadow = '8px 8px 0px #000';
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ padding: '12px', borderRadius: '16px', backgroundColor: 'rgba(255,255,255,0.5)', border: '1px solid #000' }}>
                    <Bot size={28} />
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                    {[1, 2, 3].map(i => <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#000' }}></div>)}
                </div>
            </div>

            <div>
                <h3 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px', letterSpacing: '-0.5px' }}>{agent.name}</h3>
                <div style={{ fontSize: '15px', fontWeight: '500', opacity: 0.8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#000' }}></div>
                        Função: {roleLabels[persona.role] || 'Assistente'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#000' }}></div>
                        Tom: {toneLabels[persona.tone] || 'Natural'}
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                {kb.files?.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '600' }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#8E44AD', border: '1px solid #000' }}></div>
                        <span> {kb.files.length} Docs</span>
                    </div>
                )}
                {kb.links?.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '600' }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#2ECC71', border: '1px solid #000' }}></div>
                        <span> {kb.links.length} Links</span>
                    </div>
                )}
                {kb.qa?.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '600' }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#F1C40F', border: '1px solid #000' }}></div>
                        <span>Q&A Ativo</span>
                    </div>
                )}
            </div>

            <div style={{ marginTop: 'auto' }}>
                <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Canais Habilitados</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {agent.prompChannels?.map(ch => (
                        <span key={ch.id} style={{ 
                            backgroundColor: '#C8E6C9', 
                            padding: '6px 14px', 
                            borderRadius: '12px', 
                            fontSize: '11px',
                            fontWeight: '700',
                            border: '1.5px solid #000',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}>
                            <MessageSquare size={10} /> {ch.name}
                        </span>
                    ))}
                    {(!agent.prompChannels || agent.prompChannels.length === 0) && (
                        <span style={{ fontSize: '12px', fontStyle: 'italic', opacity: 0.6 }}>Aguardando conexão...</span>
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
            backgroundColor: '#FFF',
            borderRadius: '24px',
            border: '2px dashed #000',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            minHeight: '320px',
            transition: 'all 0.3s',
            gap: '16px'
        }}
        onMouseEnter={e => {
            e.currentTarget.style.backgroundColor = '#F0EBFF';
            e.currentTarget.style.borderColor = '#7D5FFF';
        }}
        onMouseLeave={e => {
            e.currentTarget.style.backgroundColor = '#FFF';
            e.currentTarget.style.borderColor = '#000';
        }}
    >
        <div style={{ 
            width: '72px', 
            height: '72px', 
            borderRadius: '50%', 
            backgroundColor: '#000', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            color: 'white'
        }}>
            <Plus size={36} strokeWidth={3} />
        </div>
        <span style={{ fontWeight: '700', fontSize: '18px', color: '#000' }}>Novo Agente</span>
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

    const [showToast, setShowToast] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!user || !user.companyId) return;
        fetchAgents();
    }, [user]);

    useEffect(() => {
        if (selectedAgentId) {
            fetchConfig();
        }
    }, [selectedAgentId]);

    const fetchAgents = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/agents', { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) {
                const data = await res.json();
                setAgents(data);
            }
        } catch (e) {
            console.error("Failed to fetch agents:", e);
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
                knowledgeBase: { files, links, qa }
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
            <div style={{ padding: '20px' }}>
                <h2 style={{ fontSize: '42px', fontWeight: 'normal', marginBottom: '48px', color: '#000', textTransform: 'uppercase' }}>
                    SELECIONE UM AGENTE IA
                </h2>
                
                <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
                    gap: '32px' 
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
        <div style={{ background: 'white', padding: '24px', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button 
                        onClick={() => setView('selection')}
                        style={{ 
                            display: 'flex', alignItems: 'center', gap: '8px', 
                            background: '#F3F4F6', border: 'none', padding: '10px 16px', 
                            borderRadius: '8px', cursor: 'pointer', color: '#374151', fontWeight: '500'
                        }}
                    >
                        <ArrowLeft size={18} /> Voltar
                    </button>
                    <div>
                        <h2 style={{ fontSize: '24px', fontWeight: '600' }}>Configurando: {agents.find(a => a.id === selectedAgentId)?.name}</h2>
                        <span style={{ fontSize: '14px', color: '#6B7280' }}>ID do Agente: {selectedAgentId}</span>
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
                        boxShadow: '0 4px 12px rgba(0,102,255,0.2)'
                    }}
                >
                    <Save size={18} />
                    {showToast ? 'Salvo com Sucesso!' : 'Salvar Todas Alterações'}
                </button>
            </div>

            <div style={{ borderBottom: '1px solid #E5E7EB', marginBottom: '24px', display: 'flex', gap: '32px', overflowX: 'auto' }}>
                {[
                    { id: 'prompt', label: 'Editar Persona', icon: Bot },
                    { id: 'files', label: 'Arquivos', icon: FileText },
                    { id: 'links', label: 'Páginas Web / Links', icon: Globe },
                    { id: 'qa', label: 'Perguntas e Respostas', icon: HelpCircle }
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
                            color: activeTab === tab.id ? 'var(--primary-blue)' : '#6B7280',
                            fontWeight: 600,
                            background: 'none',
                            borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            transition: 'color 0.2s, border-color 0.2s'
                        }}
                    >
                        <tab.icon size={18} />
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="content" style={{ minHeight: '400px' }}>
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
                        Carregando configurações...
                    </div>
                ) : (
                    <>
                        {activeTab === 'prompt' && <PromptTab systemPrompt={systemPrompt} onPromptChange={setSystemPrompt} persona={persona} onPersonaChange={setPersona} />}
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
                    display: 'flex', alignItems: 'center', gap: '12px'
                }}>
                    <Save size={20} />
                    <span style={{ fontWeight: '500' }}>Configurações do agente salvas com sucesso!</span>
                </div>
            )}
        </div>
    );
};

export default AIConfig;
