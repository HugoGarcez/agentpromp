import React, { useState, useEffect } from 'react';
import FilesTab from '../components/AIConfig/FilesTab';
import LinksTab from '../components/AIConfig/LinksTab';
import QATab from '../components/AIConfig/QATab';
import PromptTab from '../components/AIConfig/PromptTab';
import { Save } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const AIConfig = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState('prompt');

    // Knowledge Base State
    const [files, setFiles] = useState([]);
    const [links, setLinks] = useState([]);
    const [qa, setQa] = useState([]);

    // Prompt & Persona State
    const [systemPrompt, setSystemPrompt] = useState('');
    const [persona, setPersona] = useState(null);

    const [showToast, setShowToast] = useState(false);

    // Fetch Config on Mount
    useEffect(() => {
        if (!user || !user.companyId) return;
        const fetchConfig = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await fetch('/api/config', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setSystemPrompt(data.systemPrompt || '');
                    setPersona(data.persona || null);  // Ensure we consistently use 'persona' field

                    if (data.knowledgeBase) {
                        setFiles(data.knowledgeBase.files || []);
                        setLinks((data.knowledgeBase.links || []).map(l => typeof l === 'object' ? l.url : l));
                        setQa(data.knowledgeBase.qa || []);
                    }
                }
            } catch (e) {
                console.error("Failed to load AI Config:", e);
            }
        };
        fetchConfig();
    }, [user]);

    const handleSave = async () => {
        try {
            const token = localStorage.getItem('token');
            // We need to fetch current config first to avoid overwriting other fields (persona, products, etc)
            // Ideally backend handles PATCH, but our endpoint is UPSERT with replacement of fields provided.
            // Wait, previous `Settings.jsx` logic merges some things but replaces root fields.
            // Let's rely on standard practice: Get Current -> Merge New -> Save.
            // BUT simpler: We modify the backend to accept `knowledgeBase` as a top field and merge it?
            // Actually `Settings.jsx` logic:
            // update: data (where data = { companyId, systemPrompt, ... products })
            // If we send ONLY `knowledgeBase`, other fields might be set to undefined?
            // Checking `server/index.js` UPSERT:
            // const data = { systemPrompt: new.sys, persona: new.pers, ... }
            // If new.persona is undefined, it sets persona: undefined.
            // PRISMA upsert: undefined fields are IGNORED in update? No, usually not in `data` object construction.
            // In `server/index.js`:
            // `persona: newConfig.persona ? JSON.stringify(...) : undefined`
            // If undefined, Prisma update might skip it IF we construct object smartly.
            // BUT `data` object construction in `server/index.js`:
            // const data = { ..., persona: ..., ... }
            // If I send { knowledgeBase: ... } and no persona, `newConfig.persona` is undefined. `data.persona` becomes undefined.
            // Does Prisma ignore `undefined` in `update`? Yes, often.
            // BUT let's be safe: Fetch first, then Save.

            const currentRes = await fetch('/api/config', { headers: { 'Authorization': `Bearer ${token}` } });
            const currentConfig = await currentRes.json();

            const payload = {
                ...currentConfig,
                systemPrompt, // Added to payload
                persona,      // Added to payload
                knowledgeBase: {
                    files,
                    links,
                    qa
                }
            };

            // Clean up payload (remove DB specific fields like id, createdAt if they exist in response)
            // Usually the POST expects clean config object.

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
            } else {
                alert('Erro ao salvar configuração.');
            }
        } catch (e) {
            console.error('Save failed:', e);
            alert('Erro ao conectar com servidor.');
        }
    };

    return (
        <div style={{ background: 'white', padding: '24px', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ borderBottom: '1px solid #E5E7EB', marginBottom: '24px', display: 'flex', gap: '24px', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '24px' }}>
                    <button
                        onClick={() => setActiveTab('prompt')}
                        style={{
                            paddingBottom: '12px',
                            borderBottom: activeTab === 'prompt' ? '2px solid var(--primary-blue)' : 'none',
                            color: activeTab === 'prompt' ? 'var(--primary-blue)' : 'var(--text-medium)',
                            fontWeight: 500
                        }}
                    >
                        Prompt
                    </button>
                    <button
                        onClick={() => setActiveTab('files')}
                        style={{
                            paddingBottom: '12px',
                            borderBottom: activeTab === 'files' ? '2px solid var(--primary-blue)' : 'none',
                            color: activeTab === 'files' ? 'var(--primary-blue)' : 'var(--text-medium)',
                            fontWeight: 500
                        }}
                    >
                        Arquivos
                    </button>
                    <button
                        onClick={() => setActiveTab('links')}
                        style={{
                            paddingBottom: '12px',
                            borderBottom: activeTab === 'links' ? '2px solid var(--primary-blue)' : 'none',
                            color: activeTab === 'links' ? 'var(--primary-blue)' : 'var(--text-medium)',
                            fontWeight: 500
                        }}
                    >
                        Links
                    </button>
                    <button
                        onClick={() => setActiveTab('qa')}
                        style={{
                            paddingBottom: '12px',
                            borderBottom: activeTab === 'qa' ? '2px solid var(--primary-blue)' : 'none',
                            color: activeTab === 'qa' ? 'var(--primary-blue)' : 'var(--text-medium)',
                            fontWeight: 500
                        }}
                    >
                        Perguntas e Respostas
                    </button>
                </div>

                <button
                    onClick={handleSave}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        background: 'var(--primary-blue)', color: 'white',
                        padding: '8px 16px', borderRadius: 'var(--radius-md)',
                        fontWeight: 500, cursor: 'pointer', marginBottom: '8px',
                        outline: 'none', border: 'none'
                    }}
                >
                    <Save size={16} />
                    {showToast ? 'Salvo!' : 'Salvar Alterações'}
                </button>
            </div>

            <div className="content">
                {activeTab === 'prompt' && <PromptTab systemPrompt={systemPrompt} onPromptChange={setSystemPrompt} persona={persona} onPersonaChange={setPersona} />}
                {activeTab === 'files' && <FilesTab files={files} onUpdate={setFiles} />}
                {activeTab === 'links' && <LinksTab links={links} onUpdate={setLinks} />}
                {activeTab === 'qa' && <QATab qaList={qa} onUpdate={setQa} />}
            </div>

            {showToast && (
                <div style={{
                    position: 'fixed', bottom: '24px', right: '24px',
                    background: '#10B981', color: 'white',
                    padding: '12px 24px', borderRadius: 'var(--radius-md)',
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                    animation: 'slideIn 0.3s ease-out'
                }}>
                    <span>Conteúdo atualizado!</span>
                </div>
            )}
        </div>
    );
};

export default AIConfig;
