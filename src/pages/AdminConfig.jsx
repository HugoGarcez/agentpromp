import React, { useState, useEffect } from 'react';
import { Save, Lock, MapPin, Loader, CheckCircle, XCircle, Plus, Trash2, Mic, User } from 'lucide-react';

const AdminConfig = () => {
    const [config, setConfig] = useState({
        openaiKey: '',
        geminiKey: '',
        elevenLabsKey: '',
        elevenLabsVoiceId: '',
        googleClientId: '',
        googleClientSecret: '',
        googleRedirectUri: '',
        googleMapsApiKey: '',
        googlePlacesSearchRadius: 5000,
        asaasKey: '',
        asaasWebhookToken: ''
    });
    const [testingConnection, setTestingConnection] = useState(false);
    const [connectionResult, setConnectionResult] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showToast, setShowToast] = useState(false);

    // Voice Model Management State
    const [voices, setVoices] = useState([]);
    const [newVoice, setNewVoice] = useState({ voiceId: '', name: '', gender: 'female' });
    const [addingVoice, setAddingVoice] = useState(false);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await fetch('/api/admin/config', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setConfig({
                        openaiKey: data.openaiKey || '',
                        geminiKey: data.geminiKey || '',
                        elevenLabsKey: data.elevenLabsKey || '',
                        elevenLabsVoiceId: data.elevenLabsVoiceId || '',
                        googleClientId: data.googleClientId || '',
                        googleClientSecret: data.googleClientSecret || '',
                        googleRedirectUri: data.googleRedirectUri || '',
                        googleMapsApiKey: data.googleMapsApiKey || '',
                        googlePlacesSearchRadius: data.googlePlacesSearchRadius || 5000,
                        asaasKey: data.asaasKey || '',
                        asaasWebhookToken: data.asaasWebhookToken || ''
                    });
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchConfig();
        fetchVoices();
    }, []);

    const fetchVoices = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/admin/voices', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setVoices(data);
            }
        } catch (e) {
            console.error('Error fetching voices:', e);
        }
    };

    const handleAddVoice = async () => {
        if (!newVoice.voiceId || !newVoice.name) return;
        setAddingVoice(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/admin/voices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(newVoice)
            });
            if (res.ok) {
                setNewVoice({ voiceId: '', name: '', gender: 'female' });
                await fetchVoices();
            }
        } catch (e) {
            console.error('Error adding voice:', e);
        } finally {
            setAddingVoice(false);
        }
    };

    const handleDeleteVoice = async (id) => {
        if (!confirm('Remover esta voz?')) return;
        try {
            const token = localStorage.getItem('token');
            await fetch(`/api/admin/voices/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            await fetchVoices();
        } catch (e) {
            console.error('Error deleting voice:', e);
        }
    };



    const handleChange = (e) => {
        setConfig({ ...config, [e.target.name]: e.target.value });
    };

    const handleSave = async () => {
        try {
            const token = localStorage.getItem('token');
            const payload = { ...config };
            if (!payload.googleRedirectUri) {
                payload.googleRedirectUri = `${window.location.origin}/api/auth/google/callback`;
            }

            const res = await fetch('/api/admin/config', {
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
            } else {
                console.error('Failed to save config');
                alert('Erro ao salvar. Tente reiniciar o servidor backend (node server/index.js) para aplicar as mudanças no banco.');
            }
        } catch (e) {
            alert('Erro de conexão.');
        }
    };

    if (loading) return <div>Carregando...</div>;

    const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '14px', transition: 'border-color 0.2s' };
    const labelStyle = { display: 'block', fontWeight: 600, marginBottom: '8px', fontSize: '14px', color: '#374151' };

    return (
        <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
                <div style={{ background: '#FEE2E2', padding: '10px', borderRadius: '50%' }}>
                    <Lock size={24} color="#EF4444" />
                </div>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>Configuração Global (Admin)</h1>
                    <p style={{ color: '#6B7280' }}>Defina as chaves de API que serão usadas por TODOS os agentes do sistema.</p>
                </div>
            </div>

            <div style={{ background: 'white', padding: '32px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>

                {/* OpenAI */}
                <div style={{ marginBottom: '24px' }}>
                    <label style={labelStyle}>OpenAI API Key (GPT)</label>
                    <input
                        type="password"
                        name="openaiKey"
                        value={config.openaiKey}
                        onChange={handleChange}
                        placeholder="sk-..."
                        style={inputStyle}
                    />
                </div>

                {/* Gemini */}
                <div style={{ marginBottom: '24px' }}>
                    <label style={labelStyle}>Gemini API Key</label>
                    <input
                        type="password"
                        name="geminiKey"
                        value={config.geminiKey}
                        onChange={handleChange}
                        placeholder="AIza..."
                        style={inputStyle}
                    />
                </div>

                {/* ElevenLabs API Key */}
                <div style={{ marginBottom: '24px' }}>
                    <label style={labelStyle}>ElevenLabs API Key</label>
                    <input
                        type="password"
                        name="elevenLabsKey"
                        value={config.elevenLabsKey}
                        onChange={handleChange}
                        placeholder="..."
                        style={inputStyle}
                    />
                </div>

                {/* ===== VOICE MODEL MANAGER ===== */}
                <div style={{ marginBottom: '24px', borderTop: '1px solid #E5E7EB', paddingTop: '24px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Mic size={20} color="#8B5CF6" />
                        Modelos de Voz (ElevenLabs)
                    </h3>
                    <p style={{ fontSize: '13px', color: '#6B7280', marginBottom: '20px' }}>
                        Cadastre os IDs de voz da ElevenLabs. Os usuários poderão escolher entre as vozes cadastradas aqui.
                    </p>

                    {/* Add Voice Form */}
                    <div style={{
                        background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0',
                        padding: '20px', marginBottom: '20px'
                    }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                            <div>
                                <label style={{ ...labelStyle, fontSize: '13px' }}>Nome da Voz</label>
                                <input
                                    type="text"
                                    value={newVoice.name}
                                    onChange={e => setNewVoice({ ...newVoice, name: e.target.value })}
                                    placeholder="Ex: Rachel (Amigável)"
                                    style={inputStyle}
                                />
                            </div>
                            <div>
                                <label style={{ ...labelStyle, fontSize: '13px' }}>Voice ID (ElevenLabs)</label>
                                <input
                                    type="text"
                                    value={newVoice.voiceId}
                                    onChange={e => setNewVoice({ ...newVoice, voiceId: e.target.value })}
                                    placeholder="Ex: 21m00Tcm4TlvDq8ikWAM"
                                    style={inputStyle}
                                />
                            </div>
                        </div>
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ ...labelStyle, fontSize: '13px' }}>Gênero</label>
                            <select
                                value={newVoice.gender}
                                onChange={e => setNewVoice({ ...newVoice, gender: e.target.value })}
                                style={{ ...inputStyle, maxWidth: '250px', background: 'white', cursor: 'pointer', fontWeight: 600 }}
                            >
                                <option value="female">👩 Feminino</option>
                                <option value="male">👨 Masculino</option>
                            </select>
                            <p style={{ fontSize: '12px', color: '#94A3B8', marginTop: '6px' }}>O preview de áudio será gerado automaticamente pela ElevenLabs.</p>
                        </div>
                        <button
                            onClick={handleAddVoice}
                            disabled={!newVoice.voiceId || !newVoice.name || addingVoice}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                background: (!newVoice.voiceId || !newVoice.name) ? '#CBD5E1' : '#8B5CF6',
                                color: 'white', border: 'none', padding: '10px 20px',
                                borderRadius: '8px', fontWeight: 600, fontSize: '14px',
                                cursor: (!newVoice.voiceId || !newVoice.name) ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            <Plus size={16} />
                            {addingVoice ? 'Adicionando...' : 'Adicionar Voz'}
                        </button>
                    </div>

                    {/* Voice List */}
                    {voices.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '32px', color: '#94A3B8', fontSize: '14px' }}>
                            <Mic size={32} style={{ marginBottom: '8px', opacity: 0.4 }} />
                            <p>Nenhuma voz cadastrada ainda.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {voices.map(v => (
                                <div key={v.id} style={{
                                    display: 'flex', alignItems: 'center', gap: '14px',
                                    padding: '14px 18px', background: 'white', borderRadius: '10px',
                                    border: '1px solid #E2E8F0', transition: 'all 0.2s'
                                }}>
                                    <div style={{
                                        width: '36px', height: '36px', borderRadius: '10px',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: v.gender === 'male' ? '#DBEAFE' : '#FCE7F3',
                                        color: v.gender === 'male' ? '#2563EB' : '#DB2777',
                                        flexShrink: 0
                                    }}>
                                        <User size={18} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, fontSize: '14px', color: '#1E293B' }}>{v.name}</div>
                                        <div style={{ fontSize: '12px', color: '#94A3B8', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                            <span>{v.gender === 'male' ? '👨 Masculino' : '👩 Feminino'}</span>
                                            <span style={{ fontFamily: 'monospace' }}>ID: {v.voiceId}</span>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => handleDeleteVoice(v.id)}
                                        style={{
                                            background: 'transparent', border: 'none', color: '#EF4444',
                                            cursor: 'pointer', padding: '6px', borderRadius: '6px',
                                            transition: 'all 0.2s', flexShrink: 0
                                        }}
                                        title="Remover voz"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Google Calendar */}
                <div style={{ marginBottom: '24px', borderTop: '1px solid #E5E7EB', paddingTop: '24px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        📆 Google Calendar (OAuth 2.0)
                    </h3>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontWeight: 500, marginBottom: '8px' }}>Google Client ID</label>
                        <input
                            type="text"
                            name="googleClientId"
                            value={config.googleClientId || ''}
                            onChange={handleChange}
                            placeholder="xyz.apps.googleusercontent.com"
                            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                        />
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontWeight: 500, marginBottom: '8px' }}>Google Client Secret</label>
                        <input
                            type="password"
                            name="googleClientSecret"
                            value={config.googleClientSecret || ''}
                            onChange={handleChange}
                            placeholder="GOCSPX-..."
                            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                        />
                    </div>


                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontWeight: 500, marginBottom: '8px' }}>Redirect URI (Callback)</label>
                        <input
                            type="text"
                            name="googleRedirectUri"
                            value={config.googleRedirectUri || ''}
                            onChange={handleChange}
                            placeholder={`${window.location.origin}/api/auth/google/callback`}
                            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #D1D5DB', backgroundColor: '#F3F4F6' }}
                        />
                        <small style={{ color: '#6B7280' }}>Adicione esta URL no Console do Google Cloud. (Deve corresponder EXATAMENTE)</small>
                    </div>
                </div>

                {/* Google Maps - Lead Finder */}
                <div style={{ marginBottom: '24px', borderTop: '1px solid #E5E7EB', paddingTop: '24px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <MapPin size={20} color="#6366F1" />
                        Google Maps (Lead Finder)
                    </h3>
                    <p style={{ fontSize: '13px', color: '#6B7280', marginBottom: '16px' }}>
                        Configure a chave da API do Google Maps para o módulo de prospecção de leads.
                        APIs necessárias: Places API, Geocoding API.
                    </p>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontWeight: 500, marginBottom: '8px' }}>Google Maps API Key</label>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <input
                                type="password"
                                name="googleMapsApiKey"
                                value={config.googleMapsApiKey || ''}
                                onChange={handleChange}
                                placeholder="AIzaSy..."
                                style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                            />
                            <button
                                onClick={async () => {
                                    setTestingConnection(true);
                                    setConnectionResult(null);
                                    try {
                                        // Save first so the backend has the key
                                        await handleSave();
                                        const token = localStorage.getItem('token');
                                        const res = await fetch('/api/leads/test-connection', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
                                        });
                                        const data = await res.json();
                                        setConnectionResult(data);
                                    } catch (e) {
                                        setConnectionResult({ success: false, error: e.message });
                                    } finally {
                                        setTestingConnection(false);
                                    }
                                }}
                                disabled={testingConnection}
                                style={{
                                    padding: '10px 18px', borderRadius: '6px', border: '1px solid #E5E7EB',
                                    background: testingConnection ? '#F3F4F6' : 'white', cursor: testingConnection ? 'not-allowed' : 'pointer',
                                    fontWeight: 500, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px',
                                    color: '#374151', whiteSpace: 'nowrap'
                                }}
                            >
                                {testingConnection ? (
                                    <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Testando...</>
                                ) : (
                                    'Testar Conexão'
                                )}
                            </button>
                        </div>
                        {connectionResult && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px',
                                padding: '8px 12px', borderRadius: '6px', fontSize: '13px',
                                background: connectionResult.success ? '#ECFDF5' : '#FEF2F2',
                                color: connectionResult.success ? '#065F46' : '#991B1B',
                                border: `1px solid ${connectionResult.success ? '#A7F3D0' : '#FECACA'}`
                            }}>
                                {connectionResult.success
                                    ? <><CheckCircle size={16} /> {connectionResult.message}</>
                                    : <><XCircle size={16} /> {connectionResult.error}</>
                                }
                            </div>
                        )}
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontWeight: 500, marginBottom: '8px' }}>Raio de Busca Padrão (metros)</label>
                        <input
                            type="number"
                            name="googlePlacesSearchRadius"
                            value={config.googlePlacesSearchRadius || 5000}
                            onChange={handleChange}
                            min="1000"
                            max="50000"
                            step="1000"
                            style={{ width: '200px', padding: '10px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                        />
                        <small style={{ display: 'block', color: '#6B7280', marginTop: '4px' }}>Padrão: 5000m (5 km). Máximo: 50000m (50 km).</small>
                    </div>
                </div>

                {/* Asaas Payments */}
                <div style={{ marginBottom: '24px', borderTop: '1px solid #E5E7EB', paddingTop: '24px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        💰 Asaas Payments (Lead Finder)
                    </h3>
                    <p style={{ fontSize: '13px', color: '#6B7280', marginBottom: '16px' }}>
                        Configure as chaves do Asaas para automatizar a liberação de créditos (+3 consultas).
                        Obtenha sua API Key em: Configurações &gt; Integrações.
                    </p>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontWeight: 500, marginBottom: '8px' }}>Asaas API Key</label>
                        <input
                            type="password"
                            name="asaasKey"
                            value={config.asaasKey || ''}
                            onChange={handleChange}
                            placeholder="Ex: $aak_ZW..."
                            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                        />
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontWeight: 500, marginBottom: '8px' }}>Webhook Token (Acesso)</label>
                        <input
                            type="password"
                            name="asaasWebhookToken"
                            value={config.asaasWebhookToken || ''}
                            onChange={handleChange}
                            placeholder="Defina um token para validar o webhook"
                            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                        />
                        <small style={{ color: '#6B7280' }}>
                            Este token deve ser o mesmo configurado no painel do Asaas (Fila de Webhooks &gt; Token de Autenticação).
                            URL do Webhook: <strong>{window.location.origin}/api/webhooks/asaas</strong>
                        </small>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontWeight: 500, marginBottom: '8px' }}>Link de Pagamento (Lead Finder)</label>
                        <input
                            type="text"
                            name="asaasPaymentLink"
                            value={config.asaasPaymentLink || ''}
                            onChange={handleChange}
                            placeholder="Cole o link de pagamento gerado no Asaas"
                            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                        />
                        <small style={{ color: '#6B7280' }}>
                            Ao atingir o limite, o usuário será direcionado para este link.
                        </small>
                    </div>
                </div>

                <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        onClick={handleSave}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            background: '#EF4444', color: 'white', // RED for Admin
                            padding: '10px 24px', borderRadius: '6px',
                            fontWeight: 600, cursor: 'pointer', border: 'none'
                        }}
                    >
                        <Save size={18} />
                        {showToast ? 'Salvo com Sucesso!' : 'Salvar Configuração Global'}
                    </button>
                </div>
            </div>
            {showToast && (
                <div style={{
                    position: 'fixed', bottom: '24px', right: '24px',
                    background: '#10B981', color: 'white',
                    padding: '12px 24px', borderRadius: '6px',
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                    animation: 'slideIn 0.3s ease-out'
                }}>
                    <span>Configuração Global Atualizada! Todos os agentes usarão estas chaves.</span>
                </div>
            )}
        </div>
    );
};

export default AdminConfig;
