import React, { useState, useEffect } from 'react';
import { Bot, Save, Loader2, Link as LinkIcon, Puzzle } from 'lucide-react';

const Integrations = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [config, setConfig] = useState(null);
    const [wbuyConfig, setWbuyConfig] = useState({
        enabled: false,
        apiUser: '',
        apiPassword: ''
    });

    const token = localStorage.getItem('token');

    useEffect(() => {
        if (!token) return;

        const fetchConfig = async () => {
            try {
                const response = await fetch('/api/config', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    setConfig(data);

                    if (data.integrations) {
                        try {
                            const parsedIntegrations = typeof data.integrations === 'string'
                                ? JSON.parse(data.integrations)
                                : data.integrations;

                            if (parsedIntegrations && parsedIntegrations.wbuy) {
                                setWbuyConfig(parsedIntegrations.wbuy);
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

        fetchConfig();
    }, [token]);

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
                    wbuy: wbuyConfig
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

    if (loading) return <div style={{ padding: 24, textAlign: 'center' }}><Loader2 className="animate-spin" /> Carregando...</div>;

    return (
        <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Puzzle size={24} color="var(--primary-blue)" />
                <h2 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-dark)' }}>Integrações</h2>
            </div>
            <p style={{ color: 'var(--text-medium)', marginBottom: '32px' }}>
                Conecte o seu agente a outras plataformas para manter o catálogo de produtos e informações sempre atualizados.
            </p>

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
                                type="text" // Type text temporarily for UX as requested by some clients, can be password
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

        </div>
    );
};

export default Integrations;
