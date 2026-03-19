import React, { useState, useEffect } from 'react';
import { Bot, Save, Loader2, Link as LinkIcon, Puzzle, Globe, MessageCircle, FileCode2, Plus, Trash2, RefreshCw, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, X, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// ─── XML Field Mapping Modal ──────────────────────────────────────────────────
const XML_INTERNAL_FIELDS = [
    { key: 'title',       label: 'Título do Produto',             required: true },
    { key: 'description', label: 'Descrição',                     required: false },
    { key: 'imageUrl',    label: 'Imagem (URL)',                   required: false },
    { key: 'size',        label: 'Tamanho / Variação',             required: false },
    { key: 'price',       label: 'Preço',                         required: false },
    { key: 'stock',       label: 'Estoque',                       required: false },
    { key: 'productUrl',  label: 'Link do Produto',                required: false },
    { key: 'category',    label: 'Categoria',                     required: false },
    { key: 'material',    label: 'Material / PDF / Vídeo (URL)',   required: false },
    { key: 'extraRules',  label: 'Regras Adicionais do XML',       required: false },
];

const XmlMappingModal = ({ onClose, onSave, xmlUrl, sourceName, existingSource }) => {
    const [step, setStep] = useState('loading'); // 'loading' | 'mapping' | 'error'
    const [fields, setFields] = useState([]);
    const [sampleItems, setSampleItems] = useState([]);
    const [totalItems, setTotalItems] = useState(0);
    const [mapping, setMapping] = useState({});
    const [name, setName] = useState(existingSource?.name || sourceName || '');
    const [refreshMinutes, setRefreshMinutes] = useState(existingSource?.refreshMinutes || 60);
    const [errorMsg, setErrorMsg] = useState('');
    const [saving, setSaving] = useState(false);
    const token = localStorage.getItem('token');

    useEffect(() => {
        // Pre-fill mapping from existing source
        if (existingSource?.fieldMapping) {
            try {
                const fm = typeof existingSource.fieldMapping === 'string'
                    ? JSON.parse(existingSource.fieldMapping)
                    : existingSource.fieldMapping;
                setMapping(fm);
            } catch (e) {}
        }
        // Fetch preview
        fetch('/api/integrations/xml/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ xmlUrl })
        })
        .then(r => r.json())
        .then(data => {
            if (!data.success) { setErrorMsg(data.message); setStep('error'); return; }
            setFields(data.fields || []);
            setSampleItems(data.sampleItems || []);
            setTotalItems(data.totalItems || 0);
            // Auto-detect mapping by name similarity
            if (!existingSource) {
                const autoMap = {};
                data.fields.forEach(f => {
                    const fl = f.toLowerCase();
                    if (!autoMap.title && (fl.includes('title') || fl.includes('titulo') || fl.includes('nome') || fl.includes('name') || fl.includes('produto'))) autoMap.title = f;
                    if (!autoMap.description && (fl.includes('desc') || fl.includes('descri'))) autoMap.description = f;
                    if (!autoMap.imageUrl && (fl.includes('image') || fl.includes('imagem') || fl.includes('foto') || fl.includes('img'))) autoMap.imageUrl = f;
                    if (!autoMap.price && (fl.includes('price') || fl.includes('preco') || fl.includes('preço') || fl.includes('valor'))) autoMap.price = f;
                    if (!autoMap.stock && (fl.includes('stock') || fl.includes('estoque') || fl.includes('quantity') || fl.includes('quantidade'))) autoMap.stock = f;
                    if (!autoMap.productUrl && (fl.includes('link') || fl.includes('url') || fl.includes('href'))) autoMap.productUrl = f;
                    if (!autoMap.category && (fl.includes('categ') || fl.includes('categoria'))) autoMap.category = f;
                    if (!autoMap.size && (fl.includes('size') || fl.includes('tamanho') || fl.includes('variacao') || fl.includes('variação'))) autoMap.size = f;
                    if (!autoMap.material && (fl.includes('material') || fl.includes('video') || fl.includes('vídeo') || fl.includes('pdf'))) autoMap.material = f;
                    if (!autoMap.extraRules && (fl.includes('obs') || fl.includes('extra') || fl.includes('rule') || fl.includes('regra'))) autoMap.extraRules = f;
                });
                setMapping(autoMap);
            }
            setStep('mapping');
        })
        .catch(e => { setErrorMsg(e.message); setStep('error'); });
    }, [xmlUrl]);

    const handleSave = async () => {
        if (!name.trim()) return alert('Informe um nome para a fonte XML.');
        if (!mapping.title) return alert('O campo "Título do Produto" é obrigatório para o mapeamento.');
        setSaving(true);
        try {
            const res = await fetch('/api/integrations/xml/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    id: existingSource?.id,
                    name: name.trim(),
                    xmlUrl,
                    fieldMapping: mapping,
                    refreshMinutes: parseInt(refreshMinutes) || 60
                })
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message);
            onSave(data.source);
        } catch (e) {
            alert(`Erro ao salvar: ${e.message}`);
        } finally {
            setSaving(false);
        }
    };

    const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '13px', background: 'white', color: '#111' };
    const selectStyle = { ...inputStyle };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
            <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '680px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,0.25)' }}>
                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: 'white' }}>Mapeamento de Campos XML</h3>
                        <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'rgba(255,255,255,0.8)' }}>Associe os campos do seu XML com os campos da IA</p>
                    </div>
                    <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '8px', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center', color: 'white' }}>
                        <X size={18} />
                    </button>
                </div>

                <div style={{ overflowY: 'auto', flex: 1, padding: '24px' }}>
                    {step === 'loading' && (
                        <div style={{ textAlign: 'center', padding: '60px 0', color: '#6B7280' }}>
                            <Loader2 size={36} className="animate-spin" style={{ margin: '0 auto 12px', display: 'block', color: '#6366F1' }} />
                            <p style={{ fontWeight: 600 }}>Analisando o XML...</p>
                            <p style={{ fontSize: '13px' }}>Buscando e detectando campos automaticamente</p>
                        </div>
                    )}

                    {step === 'error' && (
                        <div style={{ textAlign: 'center', padding: '40px 0', color: '#B91C1C' }}>
                            <AlertCircle size={36} style={{ margin: '0 auto 12px', display: 'block' }} />
                            <p style={{ fontWeight: 600 }}>Erro ao acessar o XML</p>
                            <p style={{ fontSize: '13px', color: '#6B7280' }}>{errorMsg}</p>
                            <button onClick={onClose} style={{ marginTop: '16px', padding: '8px 20px', background: '#EF4444', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>Fechar</button>
                        </div>
                    )}

                    {step === 'mapping' && (
                        <>
                            {/* Info Bar */}
                            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '10px 14px', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <CheckCircle size={16} color="#2563EB" />
                                <span style={{ fontSize: '13px', color: '#1E40AF' }}>
                                    <strong>{totalItems} produtos</strong> encontrados no XML · <strong>{fields.length} campos</strong> detectados
                                </span>
                            </div>

                            {/* Name and Interval */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', marginBottom: '20px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Nome da Fonte *</label>
                                    <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Catálogo Principal" style={inputStyle} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Atualizar a cada (min)</label>
                                    <input type="number" value={refreshMinutes} min={15} max={10080} onChange={e => setRefreshMinutes(e.target.value)} style={{ ...inputStyle, width: '110px' }} />
                                </div>
                            </div>

                            {/* Field Mapping */}
                            <div style={{ marginBottom: '12px' }}>
                                <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #E5E7EB' }}>
                                    Mapeamento de Campos
                                </h4>
                                <div style={{ display: 'grid', gap: '10px' }}>
                                    {XML_INTERNAL_FIELDS.map(f => (
                                        <div key={f.key} style={{ display: 'grid', gridTemplateColumns: '200px 1fr', alignItems: 'center', gap: '12px' }}>
                                            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}>
                                                {f.label}
                                                {f.required && <span style={{ color: '#EF4444', marginLeft: '3px' }}>*</span>}
                                            </label>
                                            <select
                                                value={mapping[f.key] || ''}
                                                onChange={e => setMapping(prev => ({ ...prev, [f.key]: e.target.value || undefined }))}
                                                style={selectStyle}
                                            >
                                                <option value="">— Não mapear —</option>
                                                {fields.map(xmlField => (
                                                    <option key={xmlField} value={xmlField}>{xmlField}</option>
                                                ))}
                                            </select>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Sample Preview */}
                            {sampleItems.length > 0 && (
                                <details style={{ marginTop: '16px' }}>
                                    <summary style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280', cursor: 'pointer', userSelect: 'none' }}>
                                        Ver amostra dos dados ({sampleItems.length} itens)
                                    </summary>
                                    <div style={{ marginTop: '8px', background: '#F9FAFB', borderRadius: '8px', padding: '10px', fontSize: '11px', fontFamily: 'monospace', overflowX: 'auto', maxHeight: '180px', overflowY: 'auto' }}>
                                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#374151' }}>{JSON.stringify(sampleItems, null, 2)}</pre>
                                    </div>
                                </details>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                {step === 'mapping' && (
                    <div style={{ padding: '16px 24px', borderTop: '1px solid #E5E7EB', display: 'flex', gap: '12px', justifyContent: 'flex-end', background: '#F9FAFB' }}>
                        <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #D1D5DB', background: 'white', fontSize: '14px', fontWeight: 600, cursor: 'pointer', color: '#374151' }}>
                            Cancelar
                        </button>
                        <button onClick={handleSave} disabled={saving} style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)', color: 'white', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: saving ? 0.7 : 1 }}>
                            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            {saving ? 'Salvando...' : 'Confirmar Mapeamento e Salvar'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

const Integrations = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [config, setConfig] = useState(null);
    const [wbuyConfig, setWbuyConfig] = useState({
        enabled: false,
        apiUser: '',
        apiPassword: ''
    });

    const [lojaintegradaConfig, setLojaintegradaConfig] = useState({
        enabled: false,
        apiKey: '',
        appKey: ''
    });

    const [webhookUrl, setWebhookUrl] = useState('');
    const [isPrompConnected, setIsPrompConnected] = useState(false);
    const [prompChannels, setPrompChannels] = useState([]);
    const [loadingChannels, setLoadingChannels] = useState(false);
    const [agents, setAgents] = useState([]);
    const [selectedAgentId, setSelectedAgentId] = useState('');
    const [configuringChannelId, setConfiguringChannelId] = useState(null);
    const [channelCreds, setChannelCreds] = useState({ url: '', token: '' });
    const { user } = useAuth();
    const token = localStorage.getItem('token');

    // XML Catalog state
    const [xmlSources, setXmlSources] = useState([]);
    const [xmlNewUrl, setXmlNewUrl] = useState('');
    const [xmlModal, setXmlModal] = useState(null); // { xmlUrl, existingSource? }
    const [xmlSyncing, setXmlSyncing] = useState(null); // source id being synced

    const fetchAgents = async () => {
        try {
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
        if (!selectedAgentId) return alert("Selecione um agente primeiro.");
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
            }
        } catch (e) {
            console.error("Link error:", e);
        }
    };

    useEffect(() => {
        if (!token || !user?.companyId) return;

        const fetchConfig = async () => {
            try {
                const response = await fetch('/api/config', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    setConfig(data);

                    if (data.prompUuid) {
                        setIsPrompConnected(true);
                    }

                    if (data.integrations) {
                        try {
                            const parsedIntegrations = typeof data.integrations === 'string'
                                ? JSON.parse(data.integrations)
                                : data.integrations;

                            if (parsedIntegrations && parsedIntegrations.wbuy) {
                                setWbuyConfig(parsedIntegrations.wbuy);
                            }
                            if (parsedIntegrations && parsedIntegrations.lojaintegrada) {
                                setLojaintegradaConfig(parsedIntegrations.lojaintegrada);
                            }
                        } catch (e) {
                            console.error("Erro ao parsear integrações", e);
                        }
                    }
                }
            } catch (error) {
                console.error("Error loading config:", error);
            } finally {
                setLoading(false);
            }
        };

        const isDev = window.location.hostname === 'localhost';
        const apiBase = isDev ? 'http://localhost:3001' : window.location.origin;
        setWebhookUrl(`${apiBase}/webhook/${user.companyId}`);

        fetchConfig();
        fetchAgents();
        fetchXmlSources();
    }, [token, user]);

    useEffect(() => {
        if (isPrompConnected) {
            fetchChannels();
        }
    }, [isPrompConnected, selectedAgentId]);

    const fetchXmlSources = async () => {
        try {
            const res = await fetch('/api/integrations/xml', { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) { const data = await res.json(); setXmlSources(data.sources || []); }
        } catch (e) { console.error('Failed to fetch XML sources:', e); }
    };

    const handleXmlToggle = async (source) => {
        try {
            const res = await fetch(`/api/integrations/xml/${source.id}/toggle`, {
                method: 'PUT', headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) fetchXmlSources();
        } catch (e) { console.error('Toggle error:', e); }
    };

    const handleXmlDelete = async (sourceId) => {
        if (!confirm('Remover esta fonte XML? Os produtos importados por ela permanecerão no catálogo.')) return;
        try {
            const res = await fetch(`/api/integrations/xml/${sourceId}`, {
                method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) fetchXmlSources();
        } catch (e) { console.error('Delete error:', e); }
    };

    const handleXmlSync = async (source) => {
        setXmlSyncing(source.id);
        try {
            const res = await fetch(`/api/integrations/xml/${source.id}/sync`, {
                method: 'POST', headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) fetchXmlSources();
            else alert(`Erro na sincronização: ${data.error}`);
        } catch (e) { alert('Erro de conexão.'); } finally { setXmlSyncing(null); }
    };

    const formatDateTime = (dt) => {
        if (!dt) return 'Nunca';
        return new Date(dt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    };

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setWbuyConfig(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const currentIntegrations = config?.integrations
                ? (typeof config.integrations === 'string' ? JSON.parse(config.integrations) : config.integrations)
                : {};
            const payload = {
                ...config,
                integrations: JSON.stringify({
                    ...currentIntegrations,
                    wbuy: wbuyConfig,
                    lojaintegrada: lojaintegradaConfig
                })
            };

            const response = await fetch('/api/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('Falha ao salvar no servidor');

            setConfig(payload);
            alert("Configurações salvas com sucesso!");
        } catch (error) {
            console.error("Erro ao salvar integrações:", error);
            alert("Erro ao salvar no servidor. Verifique sua conexão.");
        } finally {
            setSaving(false);
        }
    };

    const handleSync = async () => {
        if (!wbuyConfig.enabled) {
            alert("Ative e salve a integração antes de sincronizar.");
            return;
        }
        if (!wbuyConfig.apiUser || !wbuyConfig.apiPassword) {
            alert("Preencha o Usuário API e Senha API.");
            return;
        }

        setSaving(true);
        try {
            const response = await fetch('/api/integrations/wbuy/sync', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();
            if (data.success) {
                alert(`Sincronização concluída! Foram importados/atualizados produtos.`);
            } else {
                alert(`Erro na sincronização: ${data.message}`);
            }

        } catch (error) {
            console.error("Erro ao sincronizar:", error);
            alert("Erro ao sincronizar produtos com a Wbuy.");
        } finally {
            setSaving(false);
        }
    };

    const handleSyncLojaIntegrada = async () => {
        if (!lojaintegradaConfig.enabled) {
            alert("Ative e salve a integração antes de sincronizar.");
            return;
        }
        if (!lojaintegradaConfig.apiKey || !lojaintegradaConfig.appKey) {
            alert("Preencha a Chave API e Chave Aplicação.");
            return;
        }

        setSaving(true);
        try {
            const response = await fetch('/api/integrations/lojaintegrada/sync', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();
            if (data.success) {
                alert(`Sincronização concluída! Foram importados/atualizados produtos da Loja Integrada.`);
            } else {
                alert(`Erro na sincronização: ${data.message}`);
            }

        } catch (error) {
            console.error("Erro ao sincronizar Loja Integrada:", error);
            alert("Erro ao sincronizar produtos com a Loja Integrada.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div style={{ padding: 24, textAlign: 'center' }}><Loader2 className="animate-spin" /> Carregando...</div>;

    return (
        <>
        <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Puzzle size={24} color="var(--primary-blue)" />
                <h2 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-dark)' }}>Integrações</h2>
            </div>
            <p style={{ color: 'var(--text-medium)', marginBottom: '32px' }}>
                Conecte o seu agente a outras plataformas para manter o catálogo de produtos e informações sempre atualizados.
            </p>

            {/* Integração Promp Card */}
            <div style={{ background: 'var(--bg-white)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden', border: '1px solid #10B981', marginBottom: '24px' }}>
                {/* Header */}
                <div style={{ padding: '20px', borderBottom: '1px solid #10B981', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F0FDF4' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: 40, height: 40, borderRadius: 8, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                            <Globe size={24} color="#059669" />
                        </div>
                        <div>
                            <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: '#059669' }}>Integração Promp</h3>
                            <p style={{ margin: 0, fontSize: '12px', color: '#047857' }}>Omnichannel / Multi-agentes</p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: isPrompConnected ? '#059669' : '#6B7280' }}>
                            {isPrompConnected ? 'Conectado' : 'Desconectado'}
                        </span>
                        <div style={{ width: '10px', height: '10px', background: isPrompConnected ? '#059669' : '#D1D5DB', borderRadius: '50%' }}></div>
                    </div>
                </div>

                {/* Body */}
                <div style={{ padding: '20px' }}>
                    <p style={{ fontSize: '14px', color: '#047857', marginBottom: '20px' }}>
                        Conecte sua conta Promp para vincular canais (WhatsApp, Webchat, E-mail) aos seus agentes de IA.
                    </p>

                    {!isPrompConnected ? (
                        <div style={{ display: "grid", gap: "16px" }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                    <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", fontWeight: 500, color: "#047857" }}>URL da API Promp</label>
                                    <input
                                        type="text"
                                        placeholder="https://api.promp.com.br/v2/api/external/..."
                                        id="prompApiUrlInput"
                                        style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #10B981", fontSize: "14px" }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", fontWeight: 500, color: "#047857" }}>Bearer Token</label>
                                    <input
                                        type="password"
                                        placeholder="Sua API Key"
                                        id="prompApiTokenInput"
                                        style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #10B981", fontSize: "14px" }}
                                    />
                                </div>
                            </div>
                            <button
                                onClick={async () => {
                                    const apiUrl = document.getElementById("prompApiUrlInput").value;
                                    const apiToken = document.getElementById("prompApiTokenInput").value;
                                    if (!apiUrl || !apiToken) return alert("URL e Token são obrigatórios.");
                                    try {
                                        const res = await fetch("/api/promp/connect", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                                            body: JSON.stringify({ apiUrl, apiToken })
                                        });
                                        if (res.ok) {
                                            alert("Promp conectada com sucesso!");
                                            setIsPrompConnected(true);
                                            fetchChannels();
                                        } else {
                                            const data = await res.json();
                                            alert(data.message || "Erro ao conectar.");
                                        }
                                    } catch (e) { alert("Erro de conexão."); }
                                }}
                                style={{ background: "#10B981", color: "white", padding: "10px 16px", borderRadius: "6px", fontWeight: 600, cursor: "pointer", border: "none" }}
                            >
                                Validar e Conectar Promp
                            </button>
                        </div>
                    ) : (
                        <div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", background: '#F9FAFB', padding: '12px', borderRadius: '8px' }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                    <span style={{ fontSize: '14px', fontWeight: 600 }}>Agente:</span>
                                    <select 
                                        value={selectedAgentId} 
                                        onChange={e => setSelectedAgentId(e.target.value)}
                                        style={{ padding: '6px', borderRadius: '4px', border: '1px solid #D1D5DB', fontSize: '13px' }}
                                    >
                                        {agents.map(a => (
                                            <option key={a.id} value={a.id}>{a.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <button
                                    onClick={() => setIsPrompConnected(false)}
                                    style={{ border: "1px solid #B91C1C", background: "transparent", color: "#B91C1C", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                                >
                                    Desconectar
                                </button>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <h4 style={{ fontSize: "14px", fontWeight: 600, color: "#059669", margin: 0 }}>Canais Disponíveis</h4>
                                <button 
                                    onClick={() => document.getElementById('manualChannelForm').style.display = 'block'}
                                    style={{ background: '#059669', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                                >
                                    + Adicionar Canal Manual
                                </button>
                            </div>

                            {/* Manual Channel Form (Hidden by default) */}
                            <div id="manualChannelForm" style={{ display: 'none', background: '#F0FDF4', padding: '16px', borderRadius: '8px', border: '1px dashed #10B981', marginBottom: '16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                    <h5 style={{ margin: 0, fontSize: '13px', color: '#047857' }}>Dados do Novo Canal</h5>
                                    <button onClick={() => document.getElementById('manualChannelForm').style.display = 'none'} style={{ border: 'none', background: 'transparent', color: '#059669', cursor: 'pointer', fontSize: '12px' }}>Fechar</button>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '11px', color: '#047857', marginBottom: '4px' }}>Nome (Ex: WhatsApp Vendas)</label>
                                        <input id="manName" type="text" style={{ width: '100%', padding: '6px', fontSize: '12px', border: '1px solid #10B981', borderRadius: '4px' }} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '11px', color: '#047857', marginBottom: '4px' }}>Identificador (Fone ou ID)</label>
                                        <input id="manIdent" type="text" placeholder="55119..." style={{ width: '100%', padding: '6px', fontSize: '12px', border: '1px solid #10B981', borderRadius: '4px' }} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '11px', color: '#047857', marginBottom: '4px' }}>URL da API (Nova conta)</label>
                                        <input id="manUrl" type="text" placeholder="https://..." style={{ width: '100%', padding: '6px', fontSize: '12px', border: '1px solid #10B981', borderRadius: '4px' }} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '11px', color: '#047857', marginBottom: '4px' }}>Token do Canal</label>
                                        <input id="manToken" type="password" style={{ width: '100%', padding: '6px', fontSize: '12px', border: '1px solid #10B981', borderRadius: '4px' }} />
                                    </div>
                                </div>
                                <button 
                                    onClick={async () => {
                                        const name = document.getElementById('manName').value;
                                        const ident = document.getElementById('manIdent').value;
                                        const url = document.getElementById('manUrl').value;
                                        const tokenVal = document.getElementById('manToken').value;

                                        if (!name || !ident || !url || !tokenVal) return alert("Todos os campos são obrigatórios.");
                                        
                                        // Simple UUID extractor from URL
                                        const uuidMatch = url.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
                                        const prompUuid = uuidMatch ? uuidMatch[0] : ident;

                                        try {
                                            const res = await fetch('/api/promp/channels/link', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                                body: JSON.stringify({
                                                    agentId: selectedAgentId,
                                                    channelObj: { name, id: ident, number: ident, uuid: prompUuid },
                                                    prompToken: tokenVal,
                                                    prompUuid: prompUuid,
                                                    link: true
                                                })
                                            });
                                            if (res.ok) {
                                                alert("Canal adicionado e vinculado!");
                                                document.getElementById('manualChannelForm').style.display = 'none';
                                                fetchChannels();
                                            } else {
                                                const d = await res.json();
                                                alert(d.message || "Erro ao adicionar.");
                                            }
                                        } catch (e) { alert("Erro de conexão."); }
                                    }}
                                    style={{ width: '100%', background: '#10B981', color: 'white', border: 'none', padding: '8px', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }}
                                >
                                    Salvar e Vincular Novo Canal
                                </button>
                            </div>

                            {loadingChannels ? (
                                <div style={{ textAlign: "center", padding: "20px", color: "#059669" }}><Loader2 size={20} className="animate-spin" /></div>
                            ) : (
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "12px", marginBottom: '24px' }}>
                                    {prompChannels.map(ch => {
                                        const isLinked = ch.linkedAgents?.some(a => a.id === selectedAgentId);
                                        const needsConfig = !ch.hasSpecificCreds;
                                        const isConfiguring = configuringChannelId === ch.id;

                                        return (
                                            <div key={ch.id} style={{ marginBottom: '12px' }}>
                                                <div style={{
                                                    background: "white", padding: "10px", borderRadius: "8px",
                                                    border: isLinked ? "2px solid #10B981" : "1px solid #E5E7EB",
                                                    display: "flex", justifyContent: "space-between", alignItems: "center",
                                                    position: 'relative'
                                                }}>
                                                    <div style={{ overflow: "hidden" }}>
                                                        <div style={{ fontWeight: 600, fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ch.name}</div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <span style={{ fontSize: "10px", color: "#6B7280" }}>{ch.type?.toUpperCase()}</span>
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
                                                                style={{ padding: "4px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: 700, cursor: "pointer", border: "1px solid #10B981", background: isConfiguring ? "#10B981" : "transparent", color: isConfiguring ? "white" : "#065F46" }}
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
                                                                    style={{ padding: "4px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: 700, cursor: "pointer", border: "1px solid #D1D5DB", background: isConfiguring ? "#9CA3AF" : "transparent", color: "#374151" }}
                                                                >
                                                                    {isConfiguring ? "Cancelar" : "Editar"}
                                                                </button>
                                                                <button
                                                                    onClick={() => toggleChannelLink(ch, isLinked)}
                                                                    style={{ padding: "4px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: 700, cursor: "pointer", border: "none", background: isLinked ? "#FEE2E2" : "#D1FAE5", color: isLinked ? "#B91C1C" : "#065F46" }}
                                                                >
                                                                    {isLinked ? "Remover" : "Vincular"}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Inline Config Form */}
                                                {isConfiguring && (
                                                    <div style={{ background: '#F9FAFB', padding: '12px', border: '1px solid #E5E7EB', borderTop: 'none', borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px', display: 'grid', gap: '8px' }}>
                                                        <input 
                                                            type="text" 
                                                            placeholder="Cole a URL da API deste canal" 
                                                            value={channelCreds.url}
                                                            onChange={e => setChannelCreds(prev => ({ ...prev, url: e.target.value }))}
                                                            style={{ width: '100%', padding: '6px', fontSize: '11px', border: '1px solid #D1D5DB', borderRadius: '4px' }}
                                                        />
                                                        <input 
                                                            type="password" 
                                                            placeholder="Token do canal" 
                                                            value={channelCreds.token}
                                                            onChange={e => setChannelCreds(prev => ({ ...prev, token: e.target.value }))}
                                                            style={{ width: '100%', padding: '6px', fontSize: '11px', border: '1px solid #D1D5DB', borderRadius: '4px' }}
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
                                                                            link: false // Just save credentials, don't link yet
                                                                        })
                                                                    });
                                                                    if (res.ok) {
                                                                        setConfiguringChannelId(null);
                                                                        fetchChannels();
                                                                    } else {
                                                                        alert("Erro ao salvar credenciais.");
                                                                    }
                                                                } catch (e) { alert("Erro de conexão."); }
                                                            }}
                                                            style={{ background: '#10B981', color: 'white', border: 'none', padding: '6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                                                        >
                                                            Ativar Canal
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: '16px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 600 }}>Webhook URL (Fallback)</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input type="text" readOnly value={webhookUrl} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '12px', background: '#F3F4F6' }} />
                                    <button onClick={() => navigator.clipboard.writeText(webhookUrl)} style={{ padding: '8px 12px', background: 'white', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>Copiar</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Wbuy Card */}
            <div style={{ background: 'var(--bg-white)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                {/* Header */}
                <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: 40, height: 40, borderRadius: 8, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                            <img src="https://www.wbuy.com.br/assets/images/wbuy-logo.svg" alt="Wbuy" style={{ width: '24px' }} onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }} />
                            <span style={{ display: 'none', fontWeight: 'bold', color: '#666' }}>W</span>
                        </div>
                        <div>
                            <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: '#333' }}>Wbuy</h3>
                            <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>E-commerce / Catálogo</p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '6px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 500, color: wbuyConfig.enabled ? '#10B981' : '#6B7280' }}>
                                {wbuyConfig.enabled ? 'Ativo' : 'Inativo'}
                            </span>
                            <div style={{
                                width: '40px', height: '20px', background: wbuyConfig.enabled ? '#10B981' : '#D1D5DB',
                                borderRadius: '10px', position: 'relative', transition: 'background 0.2s'
                            }}>
                                <div style={{
                                    width: '16px', height: '16px', background: 'white', borderRadius: '50%',
                                    position: 'absolute', top: '2px', left: wbuyConfig.enabled ? '22px' : '2px',
                                    transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                                }} />
                            </div>
                            <input
                                type="checkbox"
                                name="enabled"
                                checked={wbuyConfig.enabled}
                                onChange={handleInputChange}
                                style={{ display: 'none' }}
                            />
                        </label>
                    </div>
                </div>

                {/* Body */}
                <div style={{ padding: '20px' }}>
                    <p style={{ fontSize: '14px', color: '#4B5563', marginBottom: '20px' }}>
                        Importe automaticamente seus produtos, preços, variações e estoque da Wbuy.
                        As atualizações feitas na plataforma serão refletidas aqui.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px', opacity: wbuyConfig.enabled ? 1 : 0.5, pointerEvents: wbuyConfig.enabled ? 'auto' : 'none' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>Usuário API</label>
                            <input
                                type="text"
                                name="apiUser"
                                value={wbuyConfig.apiUser}
                                onChange={handleInputChange}
                                placeholder="Seu usuário da API Wbuy"
                                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '14px' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>Senha API</label>
                            <input
                                type="text" 
                                name="apiPassword"
                                value={wbuyConfig.apiPassword}
                                onChange={handleInputChange}
                                placeholder="Sua senha da API Wbuy"
                                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '14px' }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                        <button
                            onClick={handleSync}
                            disabled={!wbuyConfig.enabled || saving}
                            style={{
                                padding: '10px 16px', borderRadius: '6px', fontSize: '14px', fontWeight: 500,
                                background: 'white', color: 'var(--primary-blue)', border: '1px solid var(--primary-blue)',
                                display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
                                opacity: (!wbuyConfig.enabled || saving) ? 0.5 : 1
                            }}
                        >
                            {saving ? <Loader2 size={16} className="animate-spin" /> : <LinkIcon size={16} />}
                            Sincronizar Agora
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            style={{
                                padding: '10px 16px', borderRadius: '6px', fontSize: '14px', fontWeight: 500,
                                background: 'var(--primary-blue)', color: 'white', border: 'none',
                                display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
                                opacity: saving ? 0.5 : 1
                            }}
                        >
                            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            Salvar Configurações
                        </button>
                    </div>
                </div>
            </div>

            {/* Loja Integrada Card */}
            <div style={{ background: 'var(--bg-white)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden', border: '1px solid var(--border-color)', marginTop: '24px' }}>
                {/* Header */}
                <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: 40, height: 40, borderRadius: 8, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                            <img src="https://ajuda.lojaintegrada.com.br/pt-BR/assets/images/favicon.ico" alt="Loja Integrada" style={{ width: '24px' }} onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }} />
                            <span style={{ display: 'none', fontWeight: 'bold', color: '#666' }}>LI</span>
                        </div>
                        <div>
                            <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: '#333' }}>Loja Integrada</h3>
                            <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>E-commerce / Catálogo</p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '6px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 500, color: lojaintegradaConfig.enabled ? '#10B981' : '#6B7280' }}>
                                {lojaintegradaConfig.enabled ? 'Ativo' : 'Inativo'}
                            </span>
                            <div style={{
                                width: '40px', height: '20px', background: lojaintegradaConfig.enabled ? '#10B981' : '#D1D5DB',
                                borderRadius: '10px', position: 'relative', transition: 'background 0.2s'
                            }}>
                                <div style={{
                                    width: '16px', height: '16px', background: 'white', borderRadius: '50%',
                                    position: 'absolute', top: '2px', left: lojaintegradaConfig.enabled ? '22px' : '2px',
                                    transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                                }} />
                            </div>
                            <input
                                type="checkbox"
                                name="enabled"
                                checked={lojaintegradaConfig.enabled}
                                onChange={(e) => setLojaintegradaConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                                style={{ display: 'none' }}
                            />
                        </label>
                    </div>
                </div>

                {/* Body */}
                <div style={{ padding: '20px' }}>
                    <p style={{ fontSize: '14px', color: '#4B5563', marginBottom: '20px' }}>
                        Importe automaticamente seus produtos e categorias da Loja Integrada.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px', opacity: lojaintegradaConfig.enabled ? 1 : 0.5, pointerEvents: lojaintegradaConfig.enabled ? 'auto' : 'none' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>Chave API (Loja)</label>
                            <input
                                type="text"
                                name="apiKey"
                                value={lojaintegradaConfig.apiKey || ''}
                                onChange={(e) => setLojaintegradaConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                                placeholder="Sua Chave API da Loja"
                                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '14px' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>Chave Aplicação (Integrador)</label>
                            <input
                                type="text" 
                                name="appKey"
                                value={lojaintegradaConfig.appKey || ''}
                                onChange={(e) => setLojaintegradaConfig(prev => ({ ...prev, appKey: e.target.value }))}
                                placeholder="Sua Chave de Aplicação"
                                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '14px' }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                        <button
                            onClick={handleSyncLojaIntegrada}
                            disabled={!lojaintegradaConfig.enabled || saving}
                            style={{
                                padding: '10px 16px', borderRadius: '6px', fontSize: '14px', fontWeight: 500,
                                background: 'white', color: 'var(--primary-blue)', border: '1px solid var(--primary-blue)',
                                display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
                                opacity: (!lojaintegradaConfig.enabled || saving) ? 0.5 : 1
                            }}
                        >
                            {saving ? <Loader2 size={16} className="animate-spin" /> : <LinkIcon size={16} />}
                            Sincronizar Loja Integrada
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            style={{
                                padding: '10px 16px', borderRadius: '6px', fontSize: '14px', fontWeight: 500,
                                background: 'var(--primary-blue)', color: 'white', border: 'none',
                                display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
                                opacity: saving ? 0.5 : 1
                            }}
                        >
                            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            Salvar Configurações
                        </button>
                    </div>
                </div>
            </div>

            {/* XML Catalog Card */}
            <div style={{ background: 'var(--bg-white)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden', border: '1px solid #C4B5FD', marginTop: '24px' }}>
                {/* Header */}
                <div style={{ padding: '20px', borderBottom: '1px solid #C4B5FD', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: 40, height: 40, borderRadius: 8, background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}>
                            <FileCode2 size={20} color="white" />
                        </div>
                        <div>
                            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#4C1D95' }}>Link Catálogo XML</h3>
                            <p style={{ margin: 0, fontSize: '12px', color: '#7C3AED' }}>Feed XML / Catálogo Automático com Atualização Periódica</p>
                        </div>
                    </div>
                    <div style={{ background: '#6366F1', color: 'white', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700 }}>
                        {xmlSources.filter(s => s.enabled).length} ativo{xmlSources.filter(s => s.enabled).length !== 1 ? 's' : ''}
                    </div>
                </div>

                {/* Body */}
                <div style={{ padding: '20px' }}>
                    <p style={{ fontSize: '14px', color: '#4B5563', marginBottom: '20px' }}>
                        Conecte um feed XML de produtos. A IA importará os itens automaticamente e manterá o catálogo atualizado no intervalo configurado.
                        Habilite as fontes nos agentes desejados na aba <strong>Catálogo</strong> do agente.
                    </p>

                    {/* Add New URL */}
                    <div style={{ background: '#F5F3FF', border: '1px dashed #A78BFA', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#4C1D95', marginBottom: '8px' }}>
                            Adicionar nova fonte XML
                        </label>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <input
                                type="url"
                                value={xmlNewUrl}
                                onChange={e => setXmlNewUrl(e.target.value)}
                                placeholder="https://seusite.com.br/feed.xml"
                                style={{ flex: 1, padding: '10px 12px', borderRadius: '8px', border: '1px solid #C4B5FD', fontSize: '14px', background: 'white' }}
                            />
                            <button
                                onClick={() => {
                                    if (!xmlNewUrl.trim()) return alert('Cole a URL do XML primeiro.');
                                    try { new URL(xmlNewUrl.trim()); } catch { return alert('URL inválida.'); }
                                    setXmlModal({ xmlUrl: xmlNewUrl.trim() });
                                }}
                                style={{ padding: '10px 20px', borderRadius: '8px', background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)', color: 'white', border: 'none', fontWeight: 700, fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
                            >
                                <Plus size={16} /> Testar e Mapear
                            </button>
                        </div>
                    </div>

                    {/* Source List */}
                    {xmlSources.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '32px', color: '#9CA3AF', fontSize: '14px', background: '#F9FAFB', borderRadius: '10px', border: '1px solid #E5E7EB' }}>
                            <FileCode2 size={32} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.4 }} />
                            Nenhuma fonte XML cadastrada ainda.<br />Cole uma URL acima para começar.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {xmlSources.map(source => {
                                const isOn = source.enabled;
                                const isErr = source.lastSyncStatus === 'error';
                                const isSyncing = xmlSyncing === source.id;
                                return (
                                    <div key={source.id} style={{ background: isOn ? '#FAFAFF' : '#F9FAFB', border: `1px solid ${isErr ? '#FCA5A5' : isOn ? '#C4B5FD' : '#E5E7EB'}`, borderRadius: '10px', padding: '14px 16px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                    <span style={{ fontWeight: 700, fontSize: '14px', color: '#1F2937' }}>{source.name}</span>
                                                    {isErr && <span style={{ background: '#FEE2E2', color: '#B91C1C', padding: '2px 7px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>Erro</span>}
                                                    {!isErr && source.lastSyncStatus === 'ok' && <span style={{ background: '#D1FAE5', color: '#065F46', padding: '2px 7px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>{source.productCount} produtos</span>}
                                                </div>
                                                <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '4px', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <Clock size={10} /> Atualiza a cada {source.refreshMinutes}min
                                                    </span>
                                                    <span>Última sync: {formatDateTime(source.lastSyncAt)}</span>
                                                    {isErr && <span style={{ color: '#EF4444' }}>{source.lastSyncMessage}</span>}
                                                </div>
                                                <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '400px' }}>
                                                    {source.xmlUrl}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                                                {/* Edit */}
                                                <button onClick={() => setXmlModal({ xmlUrl: source.xmlUrl, existingSource: source })} title="Editar mapeamento" style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #C4B5FD', background: 'white', color: '#6366F1', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>
                                                    Editar
                                                </button>
                                                {/* Sync */}
                                                <button onClick={() => handleXmlSync(source)} title="Sincronizar agora" disabled={isSyncing} style={{ padding: '6px', borderRadius: '6px', border: '1px solid #D1D5DB', background: 'white', cursor: 'pointer', display: 'flex', color: '#374151', opacity: isSyncing ? 0.5 : 1 }}>
                                                    {isSyncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                                                </button>
                                                {/* Toggle */}
                                                <button onClick={() => handleXmlToggle(source)} title={isOn ? 'Desativar' : 'Ativar'} style={{ padding: '6px', borderRadius: '6px', border: `1px solid ${isOn ? '#A78BFA' : '#D1D5DB'}`, background: isOn ? '#EDE9FE' : 'white', cursor: 'pointer', display: 'flex', color: isOn ? '#6D28D9' : '#9CA3AF' }}>
                                                    {isOn ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                                                </button>
                                                {/* Delete */}
                                                <button onClick={() => handleXmlDelete(source.id)} title="Remover fonte" style={{ padding: '6px', borderRadius: '6px', border: '1px solid #FECACA', background: '#FFF5F5', cursor: 'pointer', display: 'flex', color: '#DC2626' }}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

        </div>

        {/* XML Mapping Modal */}
        {xmlModal && (
            <XmlMappingModal
                xmlUrl={xmlModal.xmlUrl}
                existingSource={xmlModal.existingSource}
                onClose={() => { setXmlModal(null); setXmlNewUrl(''); }}
                onSave={(source) => {
                    setXmlModal(null);
                    setXmlNewUrl('');
                    fetchXmlSources();
                }}
            />
        )}

        </>
    );
};

export default Integrations;
