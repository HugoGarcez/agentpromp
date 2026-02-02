import React, { useState, useEffect } from 'react';
import { Save, History, RotateCcw } from 'lucide-react';
import Modal from '../Modal';

const PromptTab = () => {
    const [systemPrompt, setSystemPrompt] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    // History State
    const [history, setHistory] = useState([]);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);

    useEffect(() => {
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch('/api/config', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setSystemPrompt(data.systemPrompt || '');
            }
        } catch (error) {
            console.error('Error fetching config:', error);
        }
    };

    const fetchHistory = async () => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch('/api/config/history', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setHistory(await res.json());
                setIsHistoryOpen(true);
            }
        } catch (error) {
            console.error('Error fetching history:', error);
        }
    };

    const handleRestore = async (historyId) => {
        const token = localStorage.getItem('token');
        if (!window.confirm('Tem certeza? Isso substituirá o prompt atual.')) return;

        try {
            const res = await fetch('/api/config/restore', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ historyId })
            });

            if (res.ok) {
                alert('Prompt restaurado com sucesso!');
                setIsHistoryOpen(false);
                fetchConfig(); // Reload current prompt
            } else {
                alert('Erro ao restaurar');
            }
        } catch (error) {
            console.error('Error restoring:', error);
        }
    };

    const handleSave = async () => {
        setLoading(true);
        setMessage({ type: '', text: '' });
        const token = localStorage.getItem('token');

        try {
            const res = await fetch('/api/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ systemPrompt })
            });

            if (res.ok) {
                setMessage({ type: 'success', text: 'Prompt salvo com sucesso!' });
            } else {
                setMessage({ type: 'error', text: 'Erro ao salvar prompt' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Erro de conexão' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Prompt do Sistema</h3>
                <button
                    onClick={fetchHistory}
                    style={{
                        display: 'flex', gap: '8px', alignItems: 'center',
                        color: 'var(--text-medium)', fontSize: '14px',
                        padding: '6px 12px', border: '1px solid var(--border-color)', borderRadius: '6px'
                    }}
                >
                    <History size={16} /> Histórico de Versões
                </button>
            </div>

            <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Exinir como o agente deve se comportar..."
                rows={15}
                style={{
                    width: '100%',
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    fontSize: '14px',
                    fontFamily: 'monospace',
                    resize: 'vertical',
                    marginBottom: '16px'
                }}
            />

            {message.text && (
                <div style={{
                    marginBottom: '16px', padding: '10px', borderRadius: '6px', fontSize: '14px',
                    backgroundColor: message.type === 'success' ? '#F0FDF4' : '#FEF2F2',
                    color: message.type === 'success' ? '#16A34A' : '#EF4444'
                }}>
                    {message.text}
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                    onClick={handleSave}
                    disabled={loading}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        backgroundColor: 'var(--primary-blue)', color: 'white',
                        padding: '10px 20px', borderRadius: '8px', fontWeight: '500',
                        opacity: loading ? 0.7 : 1
                    }}
                >
                    <Save size={18} /> {loading ? 'Salvando...' : 'Salvar Prompt'}
                </button>
            </div>

            <Modal isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} title="Histórico de Versões">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {history.length === 0 ? (
                        <p style={{ color: 'var(--text-medium)', fontSize: '14px', textAlign: 'center' }}>Nenhuma versão anterior encontrada.</p>
                    ) : (
                        history.map((item) => (
                            <div key={item.id} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '12px', color: 'var(--text-light)' }}>
                                        {new Date(item.createdAt).toLocaleString()}
                                    </span>
                                    <button
                                        onClick={() => handleRestore(item.id)}
                                        style={{ color: 'var(--primary-blue)', fontSize: '12px', fontWeight: '500', display: 'flex', gap: '4px', alignItems: 'center' }}
                                    >
                                        <RotateCcw size={14} /> Restaurar
                                    </button>
                                </div>
                                <div style={{
                                    backgroundColor: '#F9FAFB', padding: '12px', borderRadius: '6px',
                                    fontSize: '12px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxHeight: '100px', overflowY: 'auto'
                                }}>
                                    {item.systemPrompt || '(Vazio)'}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </Modal>
        </div>
    );
};

export default PromptTab;
