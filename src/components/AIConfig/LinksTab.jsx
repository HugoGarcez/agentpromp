import React, { useState } from 'react';
import { Link, Trash2, Plus } from 'lucide-react';

const LinksTab = ({ links = [], onUpdate }) => {
    const [newLink, setNewLink] = useState('');

    const addLink = () => {
        if (newLink) {
            onUpdate([...links, { url: newLink, content: '' }]);
            setNewLink('');
        }
    };

    const removeLink = (index) => {
        onUpdate(links.filter((_, i) => i !== index));
    };

    return (
        <div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                <input
                    type="text"
                    placeholder="https://exemplo.com.br"
                    value={newLink}
                    onChange={(e) => setNewLink(e.target.value)}
                    style={{
                        flex: 1,
                        padding: '10px 16px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid #D1D5DB',
                        outline: 'none'
                    }}
                />
                <button
                    onClick={addLink}
                    style={{
                        backgroundColor: 'var(--primary-blue)',
                        color: 'white',
                        padding: '10px 24px',
                        borderRadius: 'var(--radius-md)',
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer'
                    }}
                >
                    <Plus size={18} />
                    Adicionar
                </button>
            </div>

            <div>
                <h4 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Links Adicionados ({links.length})</h4>
                {links.length === 0 && <p style={{ color: 'var(--text-light)', fontSize: '14px' }}>Nenhum link adicionado.</p>}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {links.map((linkObj, index) => {
                        const url = typeof linkObj === 'string' ? linkObj : linkObj.url;
                        const content = typeof linkObj === 'string' ? '' : linkObj.content;

                        return (
                            <div key={index} style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                                padding: '16px',
                                border: '1px solid #E5E7EB',
                                borderRadius: 'var(--radius-md)',
                                background: 'white'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <Link size={20} color="var(--primary-blue)" />
                                        <a href={url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary-blue)', fontSize: '14px', fontWeight: 500 }}>{url}</a>
                                    </div>
                                    <button
                                        onClick={() => removeLink(index)}
                                        style={{ color: 'var(--text-light)', cursor: 'pointer', background: 'none', border: 'none' }}
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>

                                {content && (
                                    <div style={{ background: '#F3F4F6', padding: '10px', borderRadius: '4px', marginTop: '8px' }}>
                                        <p style={{ fontSize: '12px', color: '#6B7280', fontWeight: 600, marginBottom: '4px' }}>Conteúdo Extraído pela IA:</p>
                                        <p style={{ fontSize: '12px', color: '#374151', maxHeight: '100px', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>{content.substring(0, 300)}...</p>
                                    </div>
                                )}
                                {!content && (
                                    <p style={{ fontSize: '11px', color: '#9CA3AF', fontStyle: 'italic' }}>Aguardando extração (Salvar para processar)...</p>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    );
};

export default LinksTab;
