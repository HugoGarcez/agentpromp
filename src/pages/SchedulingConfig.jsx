import React, { useState, useEffect } from 'react';
import { Calendar, User, Clock, Settings, Check, AlertCircle, Plus, Trash, Edit } from 'lucide-react';

const SchedulingConfig = () => {
    const [activeTab, setActiveTab] = useState('connect');
    const [loading, setLoading] = useState(true);
    const [config, setConfig] = useState(null);
    const [specialists, setSpecialists] = useState([]);
    const [types, setTypes] = useState([]);

    // Status State
    const [status, setStatus] = useState({ connected: false, email: '' });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const headers = { 'Authorization': `Bearer ${token}` };

            const [configRes, specialistsRes, typesRes] = await Promise.all([
                fetch('/api/calendar/config', { headers }),
                fetch('/api/specialists', { headers }),
                fetch('/api/appointment-types', { headers })
            ]);

            if (configRes.ok) {
                const data = await configRes.json();
                setConfig(data);
                setStatus({ connected: !!data.accessToken, email: 'Conta Conectada' }); // Can't get email easily without identifying token, but access token presence is enough
            } else {
                setStatus({ connected: false });
            }

            if (specialistsRes.ok) setSpecialists(await specialistsRes.json());
            if (typesRes.ok) setTypes(await typesRes.json());

        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleConnect = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/auth/google/url', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            }
        } catch (e) {
            alert('Erro ao iniciar conexão');
        }
    };

    // --- Sub-Components (Simplified for MVP) ---

    const ConnectTab = () => (
        <div style={{ padding: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Conexão com Google Calendar</h2>

            <div style={{ padding: 24, border: '1px solid #E5E7EB', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ width: 48, height: 48, background: status.connected ? '#D1FAE5' : '#F3F4F6', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Calendar size={24} color={status.connected ? '#10B981' : '#6B7280'} />
                    </div>
                    <div>
                        <p style={{ fontWeight: 600, fontSize: 16 }}>{status.connected ? 'Google Calendar Conectado' : 'Não conectado'}</p>
                        <p style={{ color: '#6B7280', fontSize: 14 }}>{status.connected ? 'O agente pode consultar e agendar.' : 'Conecte para habilitar agendamentos.'}</p>
                    </div>
                </div>

                <button
                    onClick={handleConnect}
                    style={{
                        padding: '10px 20px',
                        background: status.connected ? 'white' : '#2563EB',
                        color: status.connected ? '#374151' : 'white',
                        border: status.connected ? '1px solid #D1D5DB' : 'none',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontWeight: 500
                    }}
                >
                    {status.connected ? 'Reconectar / Trocar Conta' : 'Conectar Google'}
                </button>
            </div>
        </div>
    );

    const SettingsTab = () => {
        const [formData, setFormData] = useState({
            timezone: config?.timezone || 'America/Sao_Paulo',
            primaryCalendarId: config?.primaryCalendarId || 'primary',
            reminderBefore: config?.reminderBefore || 24
        });

        const saveSettings = async () => {
            const token = localStorage.getItem('token');
            await fetch('/api/calendar/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(formData)
            });
            alert('Configurações salvas!');
            fetchData();
        };

        return (
            <div style={{ padding: 20 }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Configurações Gerais</h2>

                <div style={{ maxWidth: 500 }}>
                    <div style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Fuso Horário</label>
                        <select
                            value={formData.timezone}
                            onChange={e => setFormData({ ...formData, timezone: e.target.value })}
                            style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #D1D5DB' }}
                        >
                            <option value="America/Sao_Paulo">Brasília (GMT-3)</option>
                            <option value="America/Manaus">Manaus (GMT-4)</option>
                            <option value="UTC">UTC</option>
                        </select>
                    </div>

                    <div style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>ID do Calendário (Opcional)</label>
                        <input
                            type="text"
                            value={formData.primaryCalendarId}
                            onChange={e => setFormData({ ...formData, primaryCalendarId: e.target.value })}
                            placeholder="primary"
                            style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #D1D5DB' }}
                        />
                        <small style={{ color: '#6B7280' }}>Deixe "primary" para usar o calendário principal da conta.</small>
                    </div>

                    <button onClick={saveSettings} style={{ padding: '8px 16px', background: '#2563EB', color: 'white', borderRadius: 6, border: 'none', cursor: 'pointer' }}>Salvar</button>
                </div>
            </div>
        );
    };

    const ListingsTab = ({ title, items, apiPath, fields }) => {
        const [showModal, setShowModal] = useState(false);
        const [editingItem, setEditingItem] = useState(null);
        const [form, setForm] = useState({});

        const handleDelete = async (id) => {
            if (!confirm('Tem certeza?')) return;
            const token = localStorage.getItem('token');
            await fetch(`${apiPath}/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
            fetchData();
        };

        const handleSave = async () => {
            const token = localStorage.getItem('token');
            const method = editingItem ? 'PUT' : 'POST';
            const url = editingItem ? `${apiPath}/${editingItem.id}` : apiPath;

            await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(form)
            });
            setShowModal(false);
            setEditingItem(null);
            fetchData();
        };

        const openModal = (item = null) => {
            setEditingItem(item);
            setForm(item || {});
            setShowModal(true);
        };

        return (
            <div style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 600 }}>{title}</h2>
                    <button onClick={() => openModal()} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '6px 12px', background: '#2563EB', color: 'white', borderRadius: 6, border: 'none', cursor: 'pointer' }}>
                        <Plus size={16} /> Adicionar
                    </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 16 }}>
                    {items.map(item => (
                        <div key={item.id} style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: 16, background: 'white' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                <h3 style={{ fontWeight: 600 }}>{item.name}</h3>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button onClick={() => openModal(item)} style={{ cursor: 'pointer', background: 'none', border: 'none', color: '#6B7280' }}><Edit size={16} /></button>
                                    <button onClick={() => handleDelete(item.id)} style={{ cursor: 'pointer', background: 'none', border: 'none', color: '#EF4444' }}><Trash size={16} /></button>
                                </div>
                            </div>
                            {item.email && <p style={{ fontSize: 13, color: '#6B7280' }}>{item.email}</p>}
                            {item.duration && <p style={{ fontSize: 13, color: '#6B7280' }}>{item.duration} min</p>}
                        </div>
                    ))}
                </div>

                {showModal && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
                        <div style={{ background: 'white', padding: 24, borderRadius: 8, width: 400 }}>
                            <h3 style={{ marginBottom: 16 }}>{editingItem ? 'Editar' : 'Novo'}</h3>
                            {fields.map(f => (
                                <div key={f.key} style={{ marginBottom: 12 }}>
                                    <label style={{ display: 'block', fontSize: 13, color: '#4B5563', marginBottom: 4 }}>{f.label}</label>
                                    <input
                                        type={f.type || 'text'}
                                        value={form[f.key] || ''}
                                        onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                                        style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #D1D5DB' }}
                                    />
                                </div>
                            ))}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                                <button onClick={() => setShowModal(false)} style={{ padding: '8px 16px', background: '#E5E7EB', borderRadius: 4, border: 'none', cursor: 'pointer' }}>Cancelar</button>
                                <button onClick={handleSave} style={{ padding: '8px 16px', background: '#2563EB', color: 'white', borderRadius: 4, border: 'none', cursor: 'pointer' }}>Salvar</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    if (loading) return <div>Carregando...</div>;

    return (
        <div style={{ maxWidth: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ borderBottom: '1px solid #E5E7EB', padding: '0 20px', background: 'white' }}>
                <h1 style={{ padding: '20px 0', fontSize: 24, fontWeight: 'bold' }}>Agendamento e Calendário</h1>
                <div style={{ display: 'flex', gap: 24 }}>
                    {[
                        { id: 'connect', label: 'Conexão', icon: Calendar },
                        { id: 'settings', label: 'Configurações', icon: Settings },
                        { id: 'specialists', label: 'Especialistas', icon: User },
                        { id: 'types', label: 'Tipos de Agendamento', icon: Clock },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '12px 0',
                                borderBottom: activeTab === tab.id ? '2px solid #2563EB' : '2px solid transparent',
                                color: activeTab === tab.id ? '#2563EB' : '#6B7280',
                                fontWeight: 500,
                                background: 'none', border: 'none', cursor: 'pointer',
                                borderBottomWidth: activeTab === tab.id ? 2 : 0,
                                borderBottomStyle: 'solid',
                                borderBottomColor: '#2563EB'
                            }}
                        >
                            <tab.icon size={18} />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ flex: 1, overflow: 'auto', background: '#F9FAFB' }}>
                {activeTab === 'connect' && <ConnectTab />}
                {activeTab === 'settings' && <SettingsTab />}
                {activeTab === 'specialists' && (
                    <ListingsTab
                        title="Especialistas"
                        items={specialists}
                        apiPath="/api/specialists"
                        fields={[
                            { key: 'name', label: 'Nome' },
                            { key: 'email', label: 'E-mail' },
                            { key: 'phone', label: 'Telefone' },
                            { key: 'calendarId', label: 'ID Calendário (Opcional)' }
                        ]}
                    />
                )}
                {activeTab === 'types' && (
                    <ListingsTab
                        title="Tipos de Agendamento"
                        items={types}
                        apiPath="/api/appointment-types"
                        fields={[
                            { key: 'name', label: 'Nome (ex: Consulta)' },
                            { key: 'duration', label: 'Duração (minutos)', type: 'number' },
                            { key: 'description', label: 'Descrição' }
                        ]}
                    />
                )}
            </div>
        </div>
    );
};

export default SchedulingConfig;
