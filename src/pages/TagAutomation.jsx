import React, { useState, useEffect } from 'react';
import { Tag, Plus, Trash2, Webhook, Info } from 'lucide-react';
import Modal from '../components/Modal';

const TagAutomation = () => {
    const [prompTags, setPrompTags] = useState([]);
    const [triggers, setTriggers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({ tagId: '', tagName: '', triggerCondition: '' });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        const token = localStorage.getItem('token');
        try {
            // Buscando as tags vindas da integração da Promp
            const tagsRes = await fetch('/api/tags/promp', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            // Buscando os gatilhos já salvos no banco local
            const triggersRes = await fetch('/api/tags/triggers', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (tagsRes.ok) {
                const fetchedTags = await tagsRes.json();
                setPrompTags(Array.isArray(fetchedTags) ? fetchedTags : []);
            }
            if (triggersRes.ok) {
                setTriggers(await triggersRes.json());
            }
        } catch (error) {
            console.error('Erro ao buscar dados das etiquetas:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleTagSelect = (e) => {
        const selectedId = e.target.value;
        const selectedTag = prompTags.find(t => String(t.id) === String(selectedId));
        setFormData({
            ...formData,
            tagId: selectedId,
            tagName: selectedTag ? selectedTag.tag : ''
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const token = localStorage.getItem('token');
        try {
            const res = await fetch('/api/tags/triggers', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                setIsModalOpen(false);
                setFormData({ tagId: '', tagName: '', triggerCondition: '' });
                fetchData();
            } else {
                alert('Erro ao salvar gatilho');
            }
        } catch (error) {
            console.error('Erro ao submeter gatilho:', error);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Tem certeza que deseja remover este gatilho? A IA não aplicará mais essa etiqueta.')) return;

        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`/api/tags/triggers/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                fetchData();
            } else {
                alert('Erro ao excluir gatilho');
            }
        } catch (error) {
            console.error('Erro ao deletar gatilho:', error);
        }
    };

    return (
        <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--text-dark)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Tag style={{ color: 'var(--primary-blue)' }} />
                        Etiquetagem Automática (IA)
                    </h2>
                    <p style={{ color: 'var(--text-medium)', marginTop: '4px' }}>Configure a IA para aplicar etiquetas do Promp automaticamente nos tickets durante conversas.</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    style={{
                        padding: '10px 16px',
                        backgroundColor: 'var(--primary-blue)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontWeight: '500',
                        boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)'
                    }}
                >
                    <Plus size={18} /> Novo Gatilho
                </button>
            </div>

            {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-medium)' }}>Carregando gatilhos...</div>
            ) : (
                <div style={{ background: 'var(--bg-white)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                    {triggers.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#6B7280' }}>
                            <Webhook size={48} style={{ margin: '0 auto 16px', opacity: 0.2 }} />
                            <p>Nenhum gatilho configurado.</p>
                            <p style={{ fontSize: '13px', marginTop: '8px' }}>Clique em "Novo Gatilho" para começar a automatizar suas etiquetas.</p>
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#F9FAFB', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                                    <th style={{ padding: '16px', fontSize: '13px', fontWeight: '600', color: 'var(--text-medium)' }}>Etiqueta (Tag Promp)</th>
                                    <th style={{ padding: '16px', fontSize: '13px', fontWeight: '600', color: 'var(--text-medium)' }}>Condição (Gatilho da IA)</th>
                                    <th style={{ padding: '16px', fontSize: '13px', fontWeight: '600', color: 'var(--text-medium)', textAlign: 'right' }}>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {triggers.map((trigger) => {
                                    // Tentar encontrar a tag correspondente para pegar a cor, se disponível
                                    const sourceTag = prompTags.find(t => String(t.id) === String(trigger.tagId));
                                    const tagColor = sourceTag ? sourceTag.color : '#2563EB';

                                    return (
                                        <tr key={trigger.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                            <td style={{ padding: '16px' }}>
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    backgroundColor: `${tagColor}15`,
                                                    color: tagColor,
                                                    padding: '4px 12px',
                                                    borderRadius: '16px',
                                                    fontSize: '13px',
                                                    fontWeight: '600'
                                                }}>
                                                    <Tag size={12} /> {trigger.tagName}
                                                </span>
                                            </td>
                                            <td style={{ padding: '16px', color: 'var(--text-dark)', fontSize: '14px' }}>
                                                {trigger.triggerCondition}
                                            </td>
                                            <td style={{ padding: '16px', textAlign: 'right' }}>
                                                <button
                                                    onClick={() => handleDelete(trigger.id)}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: '4px' }}
                                                    title="Remover Gatilho"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Configurar Novo Gatilho">
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                    <div style={{ backgroundColor: '#EFF6FF', padding: '12px', borderRadius: '8px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <Info size={20} color="#2563EB" style={{ flexShrink: 0, marginTop: '2px' }} />
                        <p style={{ fontSize: '13px', color: '#1E3A8A', margin: 0, lineHeight: '1.5' }}>
                            A etiqueta será aplicada automaticamente pela IA quando a condição descrita acontecer durante a conversa com o cliente.
                        </p>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px', color: 'var(--text-dark)' }}>
                            Etiqueta do Promp
                        </label>
                        {prompTags.length === 0 ? (
                            <div style={{ fontSize: '13px', color: '#EF4444', padding: '10px', backgroundColor: '#FEF2F2', borderRadius: '6px' }}>
                                Nenhuma etiqueta encontrada na integração. Verifique se as credenciais do Promp estão configuradas corretamente.
                            </div>
                        ) : (
                            <select
                                value={formData.tagId}
                                onChange={handleTagSelect}
                                required
                                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '14px' }}
                            >
                                <option value="">Selecione uma etiqueta para aplicar...</option>
                                {prompTags.map(tag => (
                                    <option key={tag.id} value={tag.id}>{tag.tag}</option>
                                ))}
                            </select>
                        )}
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px', color: 'var(--text-dark)' }}>
                            Condição / Gatilho (O que o cliente precisa falar?)
                        </label>
                        <textarea
                            value={formData.triggerCondition}
                            onChange={(e) => setFormData({ ...formData, triggerCondition: e.target.value })}
                            required
                            placeholder="Ex: Adicionar a etiqueta quando o cliente pedir informações sobre camisas ou calçados."
                            style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', minHeight: '100px', fontSize: '14px', resize: 'vertical' }}
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
                        <button
                            type="button"
                            onClick={() => setIsModalOpen(false)}
                            style={{ padding: '10px 16px', backgroundColor: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-medium)' }}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            style={{ padding: '10px 24px', backgroundColor: 'var(--primary-blue)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}
                            disabled={!formData.tagId || !formData.triggerCondition}
                        >
                            Salvar Gatilho
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default TagAutomation;
