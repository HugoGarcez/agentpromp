import React, { useState, useEffect } from 'react';
import { Save, Lock } from 'lucide-react';

const AdminConfig = () => {
    const [config, setConfig] = useState({
        openaiKey: '',
        geminiKey: '',
        elevenLabsKey: '',
        elevenLabsVoiceId: ''
    });
    const [loading, setLoading] = useState(true);
    const [showToast, setShowToast] = useState(false);

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
                        elevenLabsVoiceId: data.elevenLabsVoiceId || ''
                    });
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchConfig();
    }, []);

    const handleChange = (e) => {
        setConfig({ ...config, [e.target.name]: e.target.value });
    };

    const handleSave = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/admin/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(config)
            });

            if (res.ok) {
                setShowToast(true);
                setTimeout(() => setShowToast(false), 3000);
            } else {
                alert('Erro ao salvar as configurações globais.');
            }
        } catch (e) {
            alert('Erro de conexão.');
        }
    };

    if (loading) return <div>Carregando...</div>;

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
                    <label style={{ display: 'block', fontWeight: 500, marginBottom: '8px' }}>OpenAI API Key (GPT)</label>
                    <input
                        type="password"
                        name="openaiKey"
                        value={config.openaiKey}
                        onChange={handleChange}
                        placeholder="sk-..."
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                    />
                </div>

                {/* Gemini */}
                <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', fontWeight: 500, marginBottom: '8px' }}>Gemini API Key</label>
                    <input
                        type="password"
                        name="geminiKey"
                        value={config.geminiKey}
                        onChange={handleChange}
                        placeholder="AIza..."
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                    />
                </div>

                {/* ElevenLabs */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
                    <div>
                        <label style={{ display: 'block', fontWeight: 500, marginBottom: '8px' }}>ElevenLabs API Key</label>
                        <input
                            type="password"
                            name="elevenLabsKey"
                            value={config.elevenLabsKey}
                            onChange={handleChange}
                            placeholder="..."
                            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontWeight: 500, marginBottom: '8px' }}>ElevenLabs Voice ID</label>
                        <input
                            type="text"
                            name="elevenLabsVoiceId"
                            value={config.elevenLabsVoiceId}
                            onChange={handleChange}
                            placeholder="Ex: 21m00Tcm4TlvDq8ikWAM"
                            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                        />
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
