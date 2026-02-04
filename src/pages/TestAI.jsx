import React, { useState } from 'react';
import { Send, User, Bot, Sparkles, Save } from 'lucide-react';
import PromptTab from '../components/AIConfig/PromptTab';

const TestAI = () => {
    const [messages, setMessages] = useState([
        { id: 1, sender: 'ai', text: 'Olá! Como posso ajudar você hoje?' }
    ]);
    const [inputText, setInputText] = useState('');
    const [advancedMode, setAdvancedMode] = useState(false);
    const [systemPrompt, setSystemPrompt] = useState('');
    const [persona, setPersona] = useState(null);
    const [fullConfig, setFullConfig] = useState(null); // To preserve other fields when saving

    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const [products, setProducts] = useState([]);

    // Load config and history
    React.useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) return;

        const fetchData = async () => {
            try {
                // Config
                const resConfig = await fetch('/api/config', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (resConfig.ok) {
                    const data = await resConfig.json();
                    setFullConfig(data);
                    setSystemPrompt(data.systemPrompt || '');
                    setPersona(data.persona || null);

                    if (data.products && Array.isArray(data.products)) {
                        setProducts(data.products);
                    }
                }

                // History
                const resHistory = await fetch('/api/chat/history', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (resHistory.ok) {
                    const historyData = await resHistory.json();
                    if (historyData.length > 0) {
                        setMessages(historyData.map(h => ({
                            id: h.id,
                            sender: h.sender,
                            text: h.text
                        })));
                    } else {
                        // Default welcome if no history
                        setMessages([{ id: 1, sender: 'ai', text: 'Olá! Como posso ajudar você hoje?' }]);
                    }
                }

            } catch (error) {
                console.error("Error loading chat data:", error);
            }
        };

        fetchData();
    }, []);

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!inputText.trim() || isLoading) return;

        const userText = inputText;
        const newUserMsg = { id: Date.now(), sender: 'user', text: userText };

        // Optimistic update
        const updatedMessages = [...messages, newUserMsg];
        setMessages(updatedMessages);
        setInputText('');
        setIsLoading(true);

        try {
            const token = localStorage.getItem('token');
            if (!token) {
                throw new Error('Usuário não autenticado');
            }

            // Prepare history for API (Role mapping)
            const history = updatedMessages.map(msg => ({
                role: msg.sender === 'user' ? 'user' : 'assistant',
                content: msg.text
            })).filter(msg => msg.content !== '...'); // simple filter

            // Call backend API
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    message: userText, // Still send current message for convenience/logging
                    history: history,  // Send full history for memory
                    systemPrompt: systemPrompt || undefined,
                    useConfigPrompt: !advancedMode
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Falha na requisição');
            }

            const data = await response.json();
            const aiText = data.response;

            // Handle Audio
            // We now store the audio in the message state to render a player
            // The <audio autoPlay> element will handle playback

            const newAiMsg = {
                id: Date.now() + 1,
                sender: 'ai',
                text: aiText,
                audio: data.audio
            };
            setMessages(prev => [...prev, newAiMsg]);

        } catch (error) {
            console.error('Erro na API:', error);
            const errorMsg = { id: Date.now() + 1, sender: 'ai', text: `Erro: ${error.message}` };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveConfig = async () => {
        try {
            setIsSaving(true);
            const token = localStorage.getItem('token');
            // We use fullConfig to preserve knowledgeBase etc.
            const payload = {
                ...fullConfig,
                systemPrompt,
                persona
            };

            const res = await fetch('/api/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                alert('Configuração salva com sucesso!');
                // Update fullConfig so subsequent saves have latest data
                setFullConfig(payload);
            } else {
                throw new Error('Falha ao salvar');
            }
        } catch (e) {
            console.error(e);
            alert('Erro ao salvar configuração.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div style={{ display: 'grid', gridTemplateColumns: advancedMode ? '2fr 1fr' : '1fr', gap: '24px', height: 'calc(100vh - 140px)' }}>
            {/* Chat Area */}
            <div style={{
                background: 'var(--bg-white)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-sm)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                <div style={{
                    padding: '16px',
                    borderBottom: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Chat de Teste</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px', color: 'var(--text-medium)' }}>Modo Avançado</span>
                        <button
                            onClick={() => setAdvancedMode(!advancedMode)}
                            style={{
                                width: '40px',
                                height: '24px',
                                background: advancedMode ? 'var(--primary-blue)' : 'var(--text-light)',
                                borderRadius: '12px',
                                position: 'relative',
                                transition: 'background 0.2s'
                            }}
                        >
                            <div style={{
                                width: '20px',
                                height: '20px',
                                background: 'white',
                                borderRadius: '50%',
                                position: 'absolute',
                                top: '2px',
                                left: advancedMode ? '18px' : '2px',
                                transition: 'left 0.2s'
                            }} />
                        </button>
                    </div>
                </div>

                <div style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--bg-main)' }}>
                    {messages.map((msg) => (
                        <div key={msg.id} style={{
                            alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                            maxWidth: '70%',
                            display: 'flex',
                            gap: '12px'
                        }}>
                            {msg.sender === 'ai' && (
                                <div style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%',
                                    background: 'var(--primary-blue)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                }}>
                                    <Bot size={18} color="white" />
                                </div>
                            )}
                            <div style={{
                                background: msg.sender === 'user' ? 'var(--primary-blue)' : 'var(--bg-white)',
                                color: msg.sender === 'user' ? 'white' : 'var(--text-dark)',
                                padding: '12px 16px',
                                borderRadius: 'var(--radius-md)',
                                boxShadow: msg.sender === 'ai' ? 'var(--shadow-sm)' : 'none',
                                border: msg.sender === 'ai' ? '1px solid var(--border-color)' : 'none'
                            }}>
                                <p style={{ fontSize: '14px', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                                    {msg.text.split(/(\[SHOW_IMAGE:\s*\d+\])/g).map((part, index) => {
                                        const match = part.match(/\[SHOW_IMAGE:\s*(\d+)\]/);
                                        if (match) {
                                            const productId = parseInt(match[1]);
                                            const product = products.find(p => p.id === productId);
                                            if (product && product.image) {
                                                return (
                                                    <div key={index} style={{ marginTop: '8px', marginBottom: '8px' }}>
                                                        <img
                                                            src={product.image}
                                                            alt={product.name}
                                                            style={{
                                                                maxWidth: '100%',
                                                                maxHeight: '200px',
                                                                borderRadius: '8px',
                                                                border: '1px solid #E5E7EB'
                                                            }}
                                                        />
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }
                                        return part;
                                    })}
                                </p>
                                {msg.audio && (
                                    <div style={{ marginTop: '8px' }}>
                                        <audio
                                            controls
                                            autoPlay
                                            src={`data:audio/mpeg;base64,${msg.audio}`}
                                            style={{ width: '100%', height: '32px' }}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <form onSubmit={handleSendMessage} style={{ padding: '16px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-white)', display: 'flex', gap: '12px' }}>
                    <input
                        type="text"
                        placeholder="Digite sua mensagem..."
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        style={{
                            flex: 1,
                            padding: '12px',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border-color)',
                            outline: 'none',
                            background: 'var(--bg-main)',
                            color: 'var(--text-dark)'
                        }}
                    />
                    <button
                        type="submit"
                        disabled={!inputText.trim() || isLoading}
                        style={{
                            background: isLoading ? '#9CA3AF' : 'var(--primary-blue)',
                            color: 'white',
                            width: '48px',
                            borderRadius: 'var(--radius-md)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: (!inputText.trim() || isLoading) ? 0.5 : 1,
                            cursor: (!inputText.trim() || isLoading) ? 'not-allowed' : 'pointer'
                        }}
                    >
                        <Send size={20} />
                    </button>
                </form>
            </div>

            {/* Advanced Panel */}
            {advancedMode && (
                <div style={{
                    background: 'var(--bg-white)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-sm)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden' // Ensure modal doesn't get clipped weirdly if possible, but standard flow
                }}>
                    <div style={{ padding: '16px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Sparkles size={20} color="var(--primary-blue)" />
                            <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Configuração do Prompt</h2>
                        </div>
                        <button
                            onClick={handleSaveConfig}
                            disabled={isSaving}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                background: 'var(--primary-blue)', color: 'white',
                                padding: '6px 12px', borderRadius: '6px',
                                fontSize: '12px', fontWeight: 500,
                                cursor: isSaving ? 'wait' : 'pointer',
                                border: 'none'
                            }}
                        >
                            <Save size={14} />
                            {isSaving ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                    <div style={{ padding: '16px', flex: 1, overflowY: 'auto' }}>
                        <PromptTab
                            systemPrompt={systemPrompt}
                            onPromptChange={setSystemPrompt}
                            persona={persona}
                            onPersonaChange={setPersona}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default TestAI;
