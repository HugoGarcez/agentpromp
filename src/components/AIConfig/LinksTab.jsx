import React, { useState } from 'react';
import { Link, Trash2, Plus } from 'lucide-react';

const LinksTab = () => {
    const [links, setLinks] = useState([]);
    const [newLink, setNewLink] = useState('');

    const addLink = () => {
        if (newLink) {
            setLinks([...links, newLink]);
            setNewLink('');
        }
    };

    const removeLink = (index) => {
        setLinks(links.filter((_, i) => i !== index));
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
                        gap: '8px'
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
                    {links.map((link, index) => (
                        <div key={index} style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '16px',
                            border: '1px solid #E5E7EB',
                            borderRadius: 'var(--radius-md)',
                            background: 'white'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <Link size={20} color="var(--primary-blue)" />
                                <a href={link} target="_blank" rel="noreferrer" style={{ color: 'var(--primary-blue)', fontSize: '14px' }}>{link}</a>
                            </div>
                            <button
                                onClick={() => removeLink(index)}
                                style={{ color: 'var(--text-light)' }}
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default LinksTab;
