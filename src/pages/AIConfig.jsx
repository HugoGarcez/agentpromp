import React, { useState } from 'react';
import FilesTab from '../components/AIConfig/FilesTab';
import LinksTab from '../components/AIConfig/LinksTab';
import QATab from '../components/AIConfig/QATab';

const AIConfig = () => {
    const [activeTab, setActiveTab] = useState('files');

    return (
        <div style={{ background: 'white', padding: '24px', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ borderBottom: '1px solid #E5E7EB', marginBottom: '24px', display: 'flex', gap: '24px' }}>
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

            <div className="content">
                {activeTab === 'files' && <FilesTab />}
                {activeTab === 'links' && <LinksTab />}
                {activeTab === 'qa' && <QATab />}
            </div>
        </div>
    );
};

export default AIConfig;
