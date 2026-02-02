import React, { useState } from 'react';
import { Send, User, Bot, Sparkles } from 'lucide-react';

const TestAI = () => {
    const [messages, setMessages] = useState([
        { id: 1, sender: 'ai', text: 'Olá! Como posso ajudar você hoje?' }
    ]);
    const [inputText, setInputText] = useState('');
    const [advancedMode, setAdvancedMode] = useState(false);
    const [systemPrompt, setSystemPrompt] = useState('Você é um assistente virtual útil e educado.');
    const [savedSystemPrompt, setSavedSystemPrompt] = useState('Você é um assistente virtual útil e educado.');
    const [promptHasChanges, setPromptHasChanges] = useState(false);

    const [isLoading, setIsLoading] = useState(false);

    const [products, setProducts] = useState([]);

    // Load config from localStorage
    React.useEffect(() => {
        const savedIntegrations = localStorage.getItem('promp_ai_integrations');
        // Load saved system prompt
        const storagePrompt = localStorage.getItem('promp_ai_system_prompt');
        if (storagePrompt) {
            setSystemPrompt(storagePrompt);
            setSavedSystemPrompt(storagePrompt);
        }
        // Load products for image rendering
        const savedProducts = localStorage.getItem('promp_ai_products');
        if (savedProducts) {
            setProducts(JSON.parse(savedProducts));
        }
    }, []);

    // Check for changes
    React.useEffect(() => {
        setPromptHasChanges(systemPrompt !== savedSystemPrompt);
    }, [systemPrompt, savedSystemPrompt]);

    const handleSavePrompt = () => {
        localStorage.setItem('promp_ai_system_prompt', systemPrompt);
        setSavedSystemPrompt(systemPrompt);
        setPromptHasChanges(false);
    };

    const handleRevertPrompt = () => {
        setSystemPrompt(savedSystemPrompt);
        setPromptHasChanges(false);
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!inputText.trim() || isLoading) return;

        const userText = inputText;
        const newUserMsg = { id: Date.now(), sender: 'user', text: userText };
        setMessages(prev => [...prev, newUserMsg]);
        setInputText('');
        setIsLoading(true);

        try {
            const savedIntegrations = localStorage.getItem('promp_ai_integrations');
            const integrations = savedIntegrations ? JSON.parse(savedIntegrations) : {};
            const apiKey = integrations.openaiKey;

            if (!apiKey) {
                const errorMsg = { id: Date.now() + 1, sender: 'ai', text: 'Erro: Chave de API da OpenAI não configurada. Por favor, vá em Configurações > Integrações LLM e adicione sua chave.' };
                setMessages(prev => [...prev, errorMsg]);
                setIsLoading(false);
                return;
            }

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: "gpt-3.5-turbo",
                    messages: [
                        {
                            role: "system",
                            content: `${systemPrompt}\n\nCONTEXTO DE PRODUTOS DISPONÍVEIS:\n${(() => {
                                try {
                                    const savedProducts = localStorage.getItem('promp_ai_products');
                                    if (!savedProducts) return "Nenhum produto cadastrado.";
                                    const products = JSON.parse(savedProducts);
                                    if (products.length === 0) return "Nenhum produto cadastrado.";
                                    return products.map(p =>
                                        `- ${p.name}: R$ ${p.price} (ID: ${p.id}) ${p.description || 'Sem descrição'}. Cores: ${p.colors || 'N/A'}. ${p.image ? '[TEM_IMAGEM]' : ''}`
                                    ).join('\n') + "\n\nINSTRUÇÃO IMPORTANTE: Se o usuário pedir para ver uma foto ou imagem de um produto e ele tiver a flag [TEM_IMAGEM], responda EXATAMENTE com a tag: [SHOW_IMAGE: ID_DO_PRODUTO]. Exemplo: [SHOW_IMAGE: 12345]. Não invente links.";
                                } catch (e) {
                                    return "Erro ao carregar produtos.";
                                }
                            })()}`
                        },
                        ...messages.filter(m => m.sender !== 'ai' || m.text !== 'Olá! Como posso ajudar você hoje?')
                            .map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text })),
                        { role: "user", content: userText }
                    ]
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Falha na requisição');
            }

            const data = await response.json();
            const aiText = data.choices[0].message.content;

            const newAiMsg = { id: Date.now() + 1, sender: 'ai', text: aiText };
            setMessages(prev => [...prev, newAiMsg]);

        } catch (error) {
            console.error('Erro na API:', error);
            const errorMsg = { id: Date.now() + 1, sender: 'ai', text: `Erro: ${error.message}` };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsLoading(false);
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
                    flexDirection: 'column'
                }}>
                    <div style={{ padding: '16px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Sparkles size={20} color="var(--primary-blue)" />
                        <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Configuração do Prompt</h2>
                    </div>
                    <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>System Prompt</label>
                        <p style={{ fontSize: '12px', color: 'var(--text-light)', marginBottom: '12px' }}>
                            Edite o comportamento inicial da IA. As alterações são aplicadas imediatamente na próxima mensagem.
                        </p>
                        <textarea
                            value={systemPrompt}
                            onChange={(e) => setSystemPrompt(e.target.value)}
                            style={{
                                flex: 1,
                                width: '100%',
                                padding: '12px',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border-color)',
                                resize: 'none',
                                fontFamily: 'monospace',
                                fontSize: '14px',
                                lineHeight: '1.5',
                                marginBottom: '16px',
                                background: 'var(--bg-main)',
                                color: 'var(--text-dark)'
                            }}
                        />
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={handleRevertPrompt}
                                disabled={!promptHasChanges}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: 'var(--radius-md)',
                                    background: 'transparent',
                                    border: '1px solid #D1D5DB',
                                    color: !promptHasChanges ? '#9CA3AF' : 'var(--text-dark)',
                                    cursor: !promptHasChanges ? 'not-allowed' : 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 500
                                }}
                            >
                                Reverter
                            </button>
                            <button
                                onClick={handleSavePrompt}
                                disabled={!promptHasChanges}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: 'var(--radius-md)',
                                    background: !promptHasChanges ? '#E5E7EB' : 'var(--primary-blue)',
                                    border: 'none',
                                    color: !promptHasChanges ? '#9CA3AF' : 'white',
                                    cursor: !promptHasChanges ? 'not-allowed' : 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 500
                                }}
                            >
                                Salvar Prompt
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TestAI;
