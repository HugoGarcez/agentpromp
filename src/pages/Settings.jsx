import React, { useState } from 'react';
import { Save, Bot, Cpu, Mic, Volume2, Globe } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const Settings = () => {
    const [activeSection, setActiveSection] = useState('persona');

    // State for different settings
    const [persona, setPersona] = useState({
        name: 'Assistente Promp',
        role: 'support', // support, sales, technical
        tone: 'friendly', // friendly, formal, enthusiastic
        language: 'pt-BR'
    });

    const [integrations, setIntegrations] = useState({
        openaiKey: '',
        geminiKey: ''
    });

    const [webhookUrl, setWebhookUrl] = useState('');

    const [voice, setVoice] = useState({
        enabled: false,
        elevenLabsKey: '',
        voiceId: '',
        responseType: 'audio_only', // audio_only, percentage
        responsePercentage: 50
    });

    const [showToast, setShowToast] = useState(false);
    const { user } = useAuth();

    // Load settings from localStorage on mount
    React.useEffect(() => {
        const savedPersona = localStorage.getItem('promp_ai_persona');
        const savedIntegrations = localStorage.getItem('promp_ai_integrations');
        const savedVoice = localStorage.getItem('promp_ai_voice');
        // Webhook shouldn't be local storage now, it's dynamic based on company

        if (savedPersona) setPersona(JSON.parse(savedPersona));
        if (savedIntegrations) setIntegrations(JSON.parse(savedIntegrations));
        if (savedVoice) setVoice(JSON.parse(savedVoice));

        if (user && user.companyId) {
            const baseUrl = window.location.origin;
            // Production: Use domain without port 5173 if backend is proxying, 
            // OR assume backend is on same domain/port in prod.
            // For Dev (Vite), backend is 3001. So we might need to be smart here.
            // Ideally the Dashboard URL and Webhook URL are on the same domain in Prod.
            // In Dev: Frontend 5173, Backend 3001. 
            // Let's assume the user will configure the "Base URL" or we just show the relative path or try to guess.
            // Simplest: Show the path relative to the API server.

            // If we are in dev (localhost:5173), the webhook is http://localhost:3001/webhook/:id
            const isDev = window.location.hostname === 'localhost';
            const apiBase = isDev ? 'http://localhost:3001' : window.location.origin;

            setWebhookUrl(`${apiBase}/webhook/${user.companyId}`);
        }
    }, [user]);

    const handlePersonaChange = (e) => {
        setPersona({ ...persona, [e.target.name]: e.target.value });
    };

    const handleIntegrationChange = (e) => {
        setIntegrations({ ...integrations, [e.target.name]: e.target.value });
    };

    const handleVoiceChange = (e) => {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setVoice({ ...voice, [e.target.name]: value });
    };

    const handleSave = async () => {
        // Save raw settings (local backup)
        localStorage.setItem('promp_ai_persona', JSON.stringify(persona));
        localStorage.setItem('promp_ai_integrations', JSON.stringify(integrations));
        localStorage.setItem('promp_ai_voice', JSON.stringify(voice));

        // Generate Expert System Prompt
        let basePrompt = "";
        let toneInstruction = "";

        // Role-based Prompts
        switch (persona.role) {
            case 'sales':
                basePrompt = `Você é ${persona.name}, um Top Performer em Vendas especialista em conversão.
Sua missão é entender as necessidades do cliente e fechar vendas de alto valor.
Você domina técnicas como SPIN Selling, PNL e Gatilhos Mentais (Escassez, Urgência, Reciprocidade, Prova Social).

MANDAMENTOS DO VENDEDOR:
1. OBJEÇÕES: Toda objeção é um pedido de mais informação ou confiança. Contorne com a técnica 'Entendo, Sinto, Descobri'. Nunca aceite um 'não' logo de cara.
2. CONTROLE: Quem faz as perguntas controla a conversa. Termine suas respostas com uma pergunta para manter o fluxo.
3. VALOR: Nunca fale o preço 'seco'. Ancore o valor antes apresentando benefícios e transformações. O preço é irrelevante se o valor for alto.
4. FECHAMENTO: Use fechamentos experimentais (ex: 'Prefere pagar no cartão ou pix?', 'Podemos agendar a entrega para amanhã?').
5. GATILHOS: Use escassez ética ('Temos poucas unidades nessa cor') e urgência quando apropriado.

Seu objetivo é CONVERTER, não apenas informar. Seja persuasivo, mas honesto.`;
                break;
            case 'support':
                basePrompt = `Você é ${persona.name}, um Especialista em Customer Success e Suporte Técnico.
Sua prioridade absoluta é a SATISFAÇÃO, RESOLUÇÃO do problema e a RETENÇÃO do cliente.

DIRETRIZES DE SUPORTE:
1. EMPATIA EXTREMA: Comece validando o sentimento do usuário ('Sinto muito que você esteja passando por isso', 'Entendo sua frustração').
2. CLAREZA E DIDÁTICA: Use linguagem simples. Evite jargões técnicos a menos que o usuário demonstre conhecimento.
3. SOLUÇÃO EFETIVA: Guie passo-a-passo. Confirme se cada passo funcionou antes de passar para o próximo.
4. PACIÊNCIA INFINITA: Nunca culpe o usuário. O erro é sempre uma oportunidade de melhoria no nosso processo.
5. PROATIVIDADE: Antecipe dúvidas futuras. Se o cliente perguntar X, já explique Y também.`;
                break;
            default: // assistant
                basePrompt = `Você é ${persona.name}, um Assistente Virtual Pessoal altamente eficiente e organizado.
Sua missão é facilitar a vida do usuário, fornecendo informações precisas, ajuda rápida e organização.

DIRETRIZES:
1. SEJA DIRETO: Responda exatamente o que foi perguntado, sem rodeios desnecessários, mas com polidez.
2. PRECISÃO: Verifique os dados antes de afirmar. Se não souber, diga que vai verificar (ou que não sabe) em vez de inventar.
3. UTILIDADE: Sempre ofereça algo a mais que possa ajudar na tarefa do usuário.`;
                break;
        }

        // Tone-based Instructions
        switch (persona.tone) {
            case 'friendly':
                toneInstruction = "Seu tom de voz é AMIGÁVEL, CASUAL e PRÓXIMO. Use emojis moderadamente 😄. Trate o usuário como um amigo colaborativo. Pode usar 'você', 'a gente'.";
                break;
            case 'formal':
                toneInstruction = "Seu tom de voz é PROFISSIONAL, POLIDO e FORMAL. Evite gírias e emojis. Use tratamento respeitoso (Sr./Sra. se aplicável). Foco em credibilidade e seriedade.";
                break;
            case 'enthusiastic':
                toneInstruction = "Seu tom de voz é ENTUSIASMADO, ENERGÉTICO e MOTIVADOR! Use pontos de exclamação para mostrar energia! 🚀 Use emojis positivos. Transmita paixão pelo que faz!";
                break;
            case 'empathetic':
                toneInstruction = "Seu tom de voz é CALMO, ACOLHEDOR e EMPÁTICO. Mostre que você se importa profundamente. Use palavras suaves e tranquilizadoras. 🌿";
                break;
            default:
                toneInstruction = "Mantenha um tom profissional e equilibrado.";
        }

        const finalSystemPrompt = `${basePrompt}\n\n${toneInstruction}\n\nLembre-se: Você está conversando com um cliente real. Mantenha o personagem o tempo todo.`;

        localStorage.setItem('promp_ai_system_prompt', finalSystemPrompt);

        // Save to Backend
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    persona,
                    integrations,
                    voice,
                    systemPrompt: finalSystemPrompt,
                    products: JSON.parse(localStorage.getItem('promp_ai_products') || '[]')
                }),
            });

            if (res.ok) {
                const data = await res.json();
                console.log('Backend sync:', data);
                setShowToast(true);
                setTimeout(() => setShowToast(false), 3000);
            } else {
                console.error('Backend sync failed:', res.statusText);
                alert('Erro ao salvar configurações no servidor.');
            }
        } catch (err) {
            console.error('Backend sync failed:', err);
            alert('Erro de conexão ao salvar configurações.');
        }
    };

    return (
        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
            {/* Settings Navigation */}
            <div style={{
                width: '240px',
                background: 'var(--bg-white)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-sm)',
                padding: '16px'
            }}>
                <button
                    onClick={() => setActiveSection('persona')}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px',
                        borderRadius: 'var(--radius-md)', marginBottom: '4px',
                        background: activeSection === 'persona' ? 'var(--primary-light)' : 'transparent',
                        color: activeSection === 'persona' ? 'var(--primary-blue)' : 'var(--text-medium)',
                        fontWeight: 500
                    }}
                >
                    <Bot size={20} />
                    Persona & IA
                </button>
                <button
                    onClick={() => setActiveSection('integrations')}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px',
                        borderRadius: 'var(--radius-md)', marginBottom: '4px',
                        background: activeSection === 'integrations' ? 'var(--primary-light)' : 'transparent',
                        color: activeSection === 'integrations' ? 'var(--primary-blue)' : 'var(--text-medium)',
                        fontWeight: 500
                    }}
                >
                    <Cpu size={20} />
                    Integrações LLM
                </button>
                <button
                    onClick={() => setActiveSection('voice')}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px',
                        borderRadius: 'var(--radius-md)', marginBottom: '4px',
                        background: activeSection === 'voice' ? 'var(--primary-light)' : 'transparent',
                        color: activeSection === 'voice' ? 'var(--primary-blue)' : 'var(--text-medium)',
                        fontWeight: 500
                    }}
                >
                    <Mic size={20} />
                    Voz e Áudio
                </button>
                <button
                    onClick={() => setActiveSection('webhook')}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px',
                        borderRadius: 'var(--radius-md)',
                        background: activeSection === 'webhook' ? 'var(--primary-light)' : 'transparent',
                        color: activeSection === 'webhook' ? 'var(--primary-blue)' : 'var(--text-medium)',
                        fontWeight: 500
                    }}
                >
                    <Globe size={20} />
                    Webhook
                </button>
            </div>

            {/* Main Content */}
            <div style={{
                flex: 1,
                background: 'var(--bg-white)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-sm)',
                padding: '32px'
            }}>

                {/* Persona Section */}
                {activeSection === 'persona' && (
                    <div>
                        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <Bot size={24} color="var(--primary-blue)" />
                            Configuração da Persona
                        </h2>

                        <div style={{ display: 'grid', gap: '24px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Nome do Agente</label>
                                <input
                                    type="text"
                                    name="name"
                                    value={persona.name}
                                    onChange={handlePersonaChange}
                                    style={{ width: '100%', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-dark)' }}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Função Principal</label>
                                    <select
                                        name="role"
                                        value={persona.role}
                                        onChange={handlePersonaChange}
                                        style={{ width: '100%', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-dark)' }}
                                    >
                                        <option value="support">Suporte Técnico (Resolver problemas)</option>
                                        <option value="sales">Vendas (Focar em conversão)</option>
                                        <option value="assistant">Assistente Geral (Auxiliar)</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Tom de Voz</label>
                                    <select
                                        name="tone"
                                        value={persona.tone}
                                        onChange={handlePersonaChange}
                                        style={{ width: '100%', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-dark)' }}
                                    >
                                        <option value="friendly">Amigável e Casual</option>
                                        <option value="formal">Profissional e Formal</option>
                                        <option value="enthusiastic">Entusiasmado e Energético</option>
                                        <option value="empathetic">Empático e Calmo</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Integrations Section */}
                {activeSection === 'integrations' && (
                    <div>
                        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <Cpu size={24} color="var(--primary-blue)" />
                            Integrações de LLM
                        </h2>
                        <p style={{ color: 'var(--text-medium)', marginBottom: '24px' }}>
                            Configure as chaves de API para os modelos de linguagem que o agente utilizará.
                        </p>

                        <div style={{ display: 'grid', gap: '24px' }}>
                            <div style={{ padding: '24px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                                    <label style={{ fontWeight: 600 }}>OpenAI (GPT-4 / GPT-3.5)</label>
                                    <span style={{ fontSize: '12px', background: 'var(--bg-main)', padding: '2px 8px', borderRadius: '12px' }}>Recomendado</span>
                                </div>
                                <input
                                    type="password"
                                    name="openaiKey"
                                    placeholder="sk-..."
                                    value={integrations.openaiKey}
                                    onChange={handleIntegrationChange}
                                    style={{ width: '100%', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-dark)' }}
                                />
                            </div>

                            <div style={{ padding: '24px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                                    <label style={{ fontWeight: 600 }}>Google Gemini</label>
                                </div>
                                <input
                                    type="password"
                                    name="geminiKey"
                                    placeholder="AIza..."
                                    value={integrations.geminiKey}
                                    onChange={handleIntegrationChange}
                                    style={{ width: '100%', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-dark)' }}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Voice Section */}
                {activeSection === 'voice' && (
                    <div>
                        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <Mic size={24} color="var(--primary-blue)" />
                            Configuração de Voz e Áudio
                        </h2>

                        <div style={{ marginBottom: '32px', padding: '24px', background: 'var(--bg-main)', borderRadius: 'var(--radius-md)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                                <input
                                    type="checkbox"
                                    id="voiceEnabled"
                                    name="enabled"
                                    checked={voice.enabled}
                                    onChange={handleVoiceChange}
                                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                                />
                                <label htmlFor="voiceEnabled" style={{ fontWeight: 600, cursor: 'pointer' }}>Habilitar Respostas em Áudio</label>
                            </div>
                            <p style={{ color: 'var(--text-medium)', fontSize: '14px', marginLeft: '32px' }}>
                                Permite que a IA envie áudios utilizando a tecnologia da ElevenLabs.
                            </p>
                        </div>

                        {voice.enabled && (
                            <div style={{ display: 'grid', gap: '24px' }}>
                                <div style={{ padding: '24px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                                    <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>ElevenLabs Integration</h3>
                                    <div style={{ display: 'grid', gap: '16px' }}>
                                        <div>
                                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>API Key</label>
                                            <input
                                                type="password"
                                                name="elevenLabsKey"
                                                value={voice.elevenLabsKey}
                                                onChange={handleVoiceChange}
                                                style={{ width: '100%', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-dark)' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Voice ID</label>
                                            <input
                                                type="text"
                                                name="voiceId"
                                                placeholder="Ex: 21m00Tcm4TlvDq8ikWAM"
                                                value={voice.voiceId}
                                                onChange={handleVoiceChange}
                                                style={{ width: '100%', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-dark)' }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div style={{ padding: '24px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                                    <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Regras de Envio</h3>

                                    <div style={{ marginBottom: '16px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', cursor: 'pointer' }}>
                                            <input
                                                type="radio"
                                                name="responseType"
                                                value="audio_only"
                                                checked={voice.responseType === 'audio_only'}
                                                onChange={handleVoiceChange}
                                            />
                                            <span>Responder em áudio apenas quando o cliente enviar áudio</span>
                                        </label>

                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                            <input
                                                type="radio"
                                                name="responseType"
                                                value="percentage"
                                                checked={voice.responseType === 'percentage'}
                                                onChange={handleVoiceChange}
                                            />
                                            <span>Responder em áudio aleatoriamente (% das mensagens)</span>
                                        </label>
                                    </div>

                                    {voice.responseType === 'percentage' && (
                                        <div style={{ paddingLeft: '28px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                <span style={{ fontSize: '14px', fontWeight: 500 }}>Probabilidade</span>
                                                <span style={{ fontSize: '14px', fontWeight: 600 }}>{voice.responsePercentage}%</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0"
                                                max="100"
                                                step="10"
                                                name="responsePercentage"
                                                value={voice.responsePercentage}
                                                onChange={handleVoiceChange}
                                                style={{ width: '100%', cursor: 'pointer' }}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Webhook Section */}
                {activeSection === 'webhook' && (
                    <div>
                        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <Globe size={24} color="var(--primary-blue)" />
                            Integração Webhook
                        </h2>
                        <p style={{ color: 'var(--text-medium)', marginBottom: '24px' }}>
                            Utilize este URL para integrar o Agente Promp com sua plataforma. As mensagens enviadas para este endpoint serão processadas pela IA.
                        </p>

                        <div style={{ padding: '24px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: 'var(--bg-main)' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Webhook URL</label>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <input
                                    type="text"
                                    readOnly
                                    value={webhookUrl}
                                    style={{
                                        flex: 1,
                                        padding: '12px',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--bg-white)',
                                        color: 'var(--text-medium)'
                                    }}
                                />
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(webhookUrl);
                                        setShowToast(true);
                                        setTimeout(() => setShowToast(false), 2000);
                                    }}
                                    style={{
                                        padding: '0 20px',
                                        background: 'var(--bg-white)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: 'var(--radius-md)',
                                        fontWeight: 500,
                                        cursor: 'pointer',
                                        color: 'var(--text-dark)'
                                    }}
                                >
                                    Copiar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        onClick={handleSave}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            background: 'var(--primary-blue)', color: 'white',
                            padding: '12px 24px', borderRadius: 'var(--radius-md)',
                            fontWeight: 500,
                            cursor: 'pointer',
                            opacity: showToast ? 0.7 : 1,
                            transition: 'all 0.2s'
                        }}
                    >
                        <Save size={18} />
                        {showToast ? 'Salvo!' : 'Salvar Alterações'}
                    </button>
                </div>

                {/* Toast Notification */}
                {showToast && (
                    <div style={{
                        position: 'fixed',
                        bottom: '24px',
                        right: '24px',
                        background: '#10B981',
                        color: 'white',
                        padding: '12px 24px',
                        borderRadius: 'var(--radius-md)',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        animation: 'slideIn 0.3s ease-out'
                    }}>
                        <span>Configurações salvas com sucesso!</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Settings;
