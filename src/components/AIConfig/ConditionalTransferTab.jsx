import React, { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, GripVertical, ArrowUp, ArrowDown, FileText, Image, Hash, Mail, Phone, Building2, User, ToggleLeft, List, Type, AlertCircle, MessageSquare, Send } from 'lucide-react';

const FIELD_TYPES = [
    { value: 'text', label: 'Texto Livre', icon: Type, color: '#6366F1' },
    { value: 'name', label: 'Nome Completo', icon: User, color: '#8B5CF6' },
    { value: 'cpf', label: 'CPF', icon: Hash, color: '#EC4899' },
    { value: 'cnpj', label: 'CNPJ', icon: Hash, color: '#F43F5E' },
    { value: 'email', label: 'E-mail', icon: Mail, color: '#0EA5E9' },
    { value: 'phone', label: 'Telefone', icon: Phone, color: '#10B981' },
    { value: 'company', label: 'Empresa', icon: Building2, color: '#F59E0B' },
    { value: 'file', label: 'Arquivo', icon: FileText, color: '#64748B' },
    { value: 'image', label: 'Imagem', icon: Image, color: '#14B8A6' },
    { value: 'select', label: 'Seleção', icon: List, color: '#A855F7' },
    { value: 'boolean', label: 'Sim/Não', icon: ToggleLeft, color: '#EF4444' },
];

const TRIGGER_MODES = [
    { value: 'keyword', label: 'Palavra-chave', description: 'Ativa quando o cliente menciona certas palavras' },
    { value: 'command', label: 'Comando', description: 'Ativa com um comando específico (ex: /transferir)' },
    { value: 'always', label: 'Sempre', description: 'Ativa em qualquer mensagem que acione a transferência' },
];

const DEFAULT_FIELD = {
    type: 'text',
    question: '',
    required: true,
    skipIfProvided: false,
    validation: {},
    errorMessage: '',
    visibleIf: null,
};

const ConditionalTransferTab = ({ config, onChange, prompUsers, prompQueues, loadingListings }) => {
    const [expandedField, setExpandedField] = useState(null);
    const [showAddMenu, setShowAddMenu] = useState(false);

    // Garante que config tem estrutura válida
    const safeConfig = {
        mode: 'conditional',
        name: '',
        triggerMode: 'keyword',
        triggerKeywords: [],
        triggerCommand: '',
        destination: { type: 'user', targetId: '' },
        notificationWhatsApp: { number: '', messageTemplate: '' },
        fields: [],
        maxRetries: 2,
        cancelKeywords: ['cancelar', 'sair', 'desistir'],
        sendRawSensitiveData: false,
        ...config
    };

    const update = (patch) => {
        onChange({ ...safeConfig, ...patch });
    };

    const updateField = (index, patch) => {
        const newFields = [...safeConfig.fields];
        newFields[index] = { ...newFields[index], ...patch };
        update({ fields: newFields });
    };

    const addField = (type) => {
        const fieldType = FIELD_TYPES.find(t => t.value === type);
        const newField = {
            ...DEFAULT_FIELD,
            id: `field_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            type,
            question: getDefaultQuestion(type),
            validation: getDefaultValidation(type),
        };
        update({ fields: [...safeConfig.fields, newField] });
        setExpandedField(safeConfig.fields.length);
        setShowAddMenu(false);
    };

    const removeField = (index) => {
        const newFields = safeConfig.fields.filter((_, i) => i !== index);
        update({ fields: newFields });
        if (expandedField === index) setExpandedField(null);
    };

    const moveField = (index, direction) => {
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= safeConfig.fields.length) return;
        const newFields = [...safeConfig.fields];
        [newFields[index], newFields[newIndex]] = [newFields[newIndex], newFields[index]];
        update({ fields: newFields });
        setExpandedField(newIndex);
    };

    const getDefaultQuestion = (type) => {
        const defaults = {
            name: 'Qual é o seu nome completo?',
            cpf: 'Poderia me informar seu CPF?',
            cnpj: 'Qual é o CNPJ da empresa?',
            email: 'Qual é o seu e-mail para contato?',
            phone: 'Qual é o seu telefone com DDD?',
            company: 'Qual é o nome da sua empresa?',
            file: 'Por favor, envie o documento solicitado.',
            image: 'Por favor, envie a imagem solicitada.',
            select: 'Selecione uma das opções abaixo:',
            boolean: 'Pode confirmar? (sim/não)',
            text: '',
        };
        return defaults[type] || '';
    };

    const getDefaultValidation = (type) => {
        switch (type) {
            case 'image':
                return { allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'], maxSizeBytes: 10485760 };
            case 'file':
                return { allowedMimeTypes: [], maxSizeBytes: 10485760 };
            case 'select':
                return { options: [], optionsDisplay: [] };
            default:
                return {};
        }
    };

    // ---- Keyword Tag Manager ----
    const [keywordInput, setKeywordInput] = useState('');
    const addKeyword = () => {
        const kw = keywordInput.trim();
        if (kw && !safeConfig.triggerKeywords.includes(kw)) {
            update({ triggerKeywords: [...safeConfig.triggerKeywords, kw] });
        }
        setKeywordInput('');
    };

    const [cancelInput, setCancelInput] = useState('');
    const addCancelKeyword = () => {
        const kw = cancelInput.trim();
        if (kw && !safeConfig.cancelKeywords.includes(kw)) {
            update({ cancelKeywords: [...safeConfig.cancelKeywords, kw] });
        }
        setCancelInput('');
    };

    // ---- Select Options Manager ----
    const [optionInputs, setOptionInputs] = useState({});

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            {/* ============ NOME DO FLUXO ============ */}
            <div style={{ padding: '24px', background: '#F8FAFC', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
                <label style={labelStyle}>Nome do Fluxo</label>
                <input
                    type="text"
                    placeholder="Ex: Coleta para suporte técnico"
                    value={safeConfig.name || ''}
                    onChange={e => update({ name: e.target.value })}
                    style={inputStyle}
                />
                <p style={hintStyle}>Nome interno para identificar este fluxo de coleta</p>
            </div>

            {/* ============ GATILHO DE ATIVAÇÃO ============ */}
            <div style={{ padding: '24px', background: '#F8FAFC', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
                <label style={{ ...labelStyle, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertCircle size={18} color="#6366F1" /> Gatilho de Ativação
                </label>

                <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                    {TRIGGER_MODES.map(mode => (
                        <button
                            key={mode.value}
                            onClick={() => update({ triggerMode: mode.value })}
                            style={{
                                flex: 1, padding: '14px 16px', borderRadius: '12px', cursor: 'pointer',
                                border: safeConfig.triggerMode === mode.value ? '2px solid #6366F1' : '1px solid #E2E8F0',
                                background: safeConfig.triggerMode === mode.value ? '#EEF2FF' : 'white',
                                transition: 'all 0.2s'
                            }}
                        >
                            <div style={{ fontWeight: 700, fontSize: '14px', color: safeConfig.triggerMode === mode.value ? '#4338CA' : '#374151' }}>
                                {mode.label}
                            </div>
                            <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>{mode.description}</div>
                        </button>
                    ))}
                </div>

                {safeConfig.triggerMode === 'keyword' && (
                    <div>
                        <label style={labelStyle}>Palavras-chave</label>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                            <input
                                type="text"
                                placeholder="Digite uma palavra-chave e pressione Enter"
                                value={keywordInput}
                                onChange={e => setKeywordInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
                                style={{ ...inputStyle, flex: 1 }}
                            />
                            <button onClick={addKeyword} style={addBtnSmallStyle}>+</button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {safeConfig.triggerKeywords.map((kw, i) => (
                                <span key={i} style={tagStyle}>
                                    {kw}
                                    <button onClick={() => update({ triggerKeywords: safeConfig.triggerKeywords.filter((_, idx) => idx !== i) })} style={tagRemoveStyle}>×</button>
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {safeConfig.triggerMode === 'command' && (
                    <div>
                        <label style={labelStyle}>Comando</label>
                        <input
                            type="text"
                            placeholder="Ex: /transferir"
                            value={safeConfig.triggerCommand || ''}
                            onChange={e => update({ triggerCommand: e.target.value })}
                            style={inputStyle}
                        />
                    </div>
                )}
            </div>

            {/* ============ DESTINO ============ */}
            <div style={{ padding: '24px', background: '#F8FAFC', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
                <label style={{ ...labelStyle, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Send size={18} color="#10B981" /> Destino da Transferência
                </label>

                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                    <button
                        onClick={() => update({ destination: { type: 'user', targetId: '' } })}
                        style={{
                            flex: 1, padding: '12px', borderRadius: '10px', cursor: 'pointer',
                            border: safeConfig.destination?.type === 'user' ? '2px solid #10B981' : '1px solid #E2E8F0',
                            background: safeConfig.destination?.type === 'user' ? '#F0FDF4' : 'white',
                            fontWeight: 600, fontSize: '14px', transition: 'all 0.2s',
                            color: safeConfig.destination?.type === 'user' ? '#065F46' : '#374151'
                        }}
                    >
                        👤 Usuário
                    </button>
                    <button
                        onClick={() => update({ destination: { type: 'queue', targetId: '' } })}
                        style={{
                            flex: 1, padding: '12px', borderRadius: '10px', cursor: 'pointer',
                            border: safeConfig.destination?.type === 'queue' ? '2px solid #10B981' : '1px solid #E2E8F0',
                            background: safeConfig.destination?.type === 'queue' ? '#F0FDF4' : 'white',
                            fontWeight: 600, fontSize: '14px', transition: 'all 0.2s',
                            color: safeConfig.destination?.type === 'queue' ? '#065F46' : '#374151'
                        }}
                    >
                        📂 Fila / Setor
                    </button>
                </div>

                <select
                    value={safeConfig.destination?.targetId || ''}
                    onChange={e => update({ destination: { ...safeConfig.destination, targetId: e.target.value } })}
                    style={{ ...inputStyle, background: 'white' }}
                >
                    <option value="">Selecione...</option>
                    {safeConfig.destination?.type === 'user'
                        ? (prompUsers || []).map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)
                        : (prompQueues || []).map(q => <option key={q.id} value={q.id}>{q.queue || q.name}</option>)
                    }
                </select>
            </div>

            {/* ============ NOTIFICAÇÃO WHATSAPP ============ */}
            <div style={{ padding: '24px', background: '#F0FDF4', borderRadius: '16px', border: '1px solid #BBF7D0' }}>
                <label style={{ ...labelStyle, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MessageSquare size={18} color="#16A34A" /> Notificação via WhatsApp
                </label>

                <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>Número Destino (E.164)</label>
                    <input
                        type="text"
                        placeholder="+5511999998888"
                        value={safeConfig.notificationWhatsApp?.number || ''}
                        onChange={e => update({ notificationWhatsApp: { ...safeConfig.notificationWhatsApp, number: e.target.value } })}
                        style={inputStyle}
                    />
                    <p style={hintStyle}>O resumo preenchido será enviado para este número</p>
                </div>

                <div>
                    <label style={labelStyle}>Template da Mensagem de Resumo</label>
                    <textarea
                        placeholder={`Novo atendimento para transferência\n\nNome: {{nome_completo}}\nEmpresa: {{empresa}}\nE-mail: {{email}}\nTelefone: {{telefone}}\n\nEnviado automaticamente pelo assistente virtual`}
                        value={safeConfig.notificationWhatsApp?.messageTemplate || ''}
                        onChange={e => update({ notificationWhatsApp: { ...safeConfig.notificationWhatsApp, messageTemplate: e.target.value } })}
                        rows={8}
                        style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.6', resize: 'vertical' }}
                    />
                    <p style={hintStyle}>
                        Use {'{{campo_id}}'} para inserir variáveis. Ex: {'{{nome_completo}}'}, {'{{email}}'}, {'{{cpf}}'}
                    </p>

                    {/* Variáveis disponíveis */}
                    {safeConfig.fields.length > 0 && (
                        <div style={{ marginTop: '12px', padding: '12px 16px', background: 'white', borderRadius: '10px', border: '1px solid #D1FAE5' }}>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: '#065F46', marginBottom: '8px' }}>Variáveis disponíveis:</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {safeConfig.fields.map(f => (
                                    <code key={f.id} style={{
                                        fontSize: '11px', background: '#ECFDF5', padding: '2px 8px',
                                        borderRadius: '4px', color: '#047857', cursor: 'pointer',
                                        border: '1px solid #A7F3D0'
                                    }}
                                        onClick={() => {
                                            const tpl = safeConfig.notificationWhatsApp?.messageTemplate || '';
                                            update({
                                                notificationWhatsApp: {
                                                    ...safeConfig.notificationWhatsApp,
                                                    messageTemplate: tpl + `{{${f.id}}}`
                                                }
                                            });
                                        }}
                                        title="Clique para inserir"
                                    >
                                        {`{{${f.id}}}`}
                                    </code>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ============ CONFIGURAÇÕES ADICIONAIS ============ */}
            <div style={{ padding: '24px', background: '#F8FAFC', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div>
                        <label style={labelStyle}>Máximo de Tentativas por Campo</label>
                        <input
                            type="number"
                            min="1"
                            max="5"
                            value={safeConfig.maxRetries || 2}
                            onChange={e => update({ maxRetries: parseInt(e.target.value) || 2 })}
                            style={{ ...inputStyle, width: '100px' }}
                        />
                    </div>

                    <div>
                        <label style={labelStyle}>Palavras de Cancelamento</label>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                            <input
                                type="text"
                                placeholder="Ex: cancelar"
                                value={cancelInput}
                                onChange={e => setCancelInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCancelKeyword(); } }}
                                style={{ ...inputStyle, flex: 1 }}
                            />
                            <button onClick={addCancelKeyword} style={addBtnSmallStyle}>+</button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {safeConfig.cancelKeywords.map((kw, i) => (
                                <span key={i} style={tagStyle}>
                                    {kw}
                                    <button onClick={() => update({ cancelKeywords: safeConfig.cancelKeywords.filter((_, idx) => idx !== i) })} style={tagRemoveStyle}>×</button>
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* ============ EDITOR DE CAMPOS ============ */}
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div>
                        <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#1F2937' }}>
                            Campos de Coleta ({safeConfig.fields.length})
                        </h4>
                        <p style={{ fontSize: '13px', color: '#6B7280' }}>
                            A IA perguntará cada campo na ordem, um por vez, no WhatsApp
                        </p>
                    </div>

                    <div style={{ position: 'relative' }}>
                        <button
                            onClick={() => setShowAddMenu(!showAddMenu)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                background: '#6366F1', color: 'white', padding: '10px 18px',
                                borderRadius: '10px', border: 'none', fontWeight: 600,
                                fontSize: '14px', cursor: 'pointer', transition: 'all 0.2s',
                                boxShadow: '0 2px 8px rgba(99,102,241,0.3)'
                            }}
                        >
                            <Plus size={16} /> Adicionar Campo
                        </button>

                        {showAddMenu && (
                            <div style={{
                                position: 'absolute', top: '100%', right: 0, marginTop: '8px',
                                background: 'white', borderRadius: '14px', border: '1px solid #E2E8F0',
                                boxShadow: '0 10px 40px rgba(0,0,0,0.12)', padding: '8px', width: '260px',
                                zIndex: 500
                            }}>
                                {FIELD_TYPES.map(ft => (
                                    <button
                                        key={ft.value}
                                        onClick={() => addField(ft.value)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '12px',
                                            width: '100%', padding: '10px 14px', borderRadius: '10px',
                                            border: 'none', background: 'transparent', cursor: 'pointer',
                                            transition: 'background 0.15s', textAlign: 'left'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#F3F4F6'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <div style={{
                                            width: '32px', height: '32px', borderRadius: '8px',
                                            background: `${ft.color}15`, display: 'flex',
                                            alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            <ft.icon size={16} color={ft.color} />
                                        </div>
                                        <span style={{ fontWeight: 600, fontSize: '14px', color: '#374151' }}>{ft.label}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Lista de campos */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {safeConfig.fields.map((field, index) => {
                        const fieldType = FIELD_TYPES.find(t => t.value === field.type) || FIELD_TYPES[0];
                        const isExpanded = expandedField === index;

                        return (
                            <div key={field.id || index} style={{
                                background: 'white', borderRadius: '14px',
                                border: isExpanded ? `2px solid ${fieldType.color}` : '1px solid #E5E7EB',
                                overflow: 'hidden', transition: 'all 0.2s',
                                boxShadow: isExpanded ? `0 4px 12px ${fieldType.color}20` : 'none'
                            }}>
                                {/* Header do campo */}
                                <div
                                    onClick={() => setExpandedField(isExpanded ? null : index)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '12px',
                                        padding: '14px 18px', cursor: 'pointer',
                                        background: isExpanded ? `${fieldType.color}08` : 'transparent'
                                    }}
                                >
                                    <div style={{
                                        width: '34px', height: '34px', borderRadius: '10px',
                                        background: `${fieldType.color}15`, display: 'flex',
                                        alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                    }}>
                                        <fieldType.icon size={18} color={fieldType.color} />
                                    </div>

                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: '14px', color: '#1F2937' }}>
                                            {field.question || `[${fieldType.label}]`}
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                            <span style={{
                                                fontSize: '11px', fontWeight: 600, padding: '1px 8px',
                                                borderRadius: '4px', background: `${fieldType.color}15`,
                                                color: fieldType.color
                                            }}>
                                                {fieldType.label}
                                            </span>
                                            {field.required && (
                                                <span style={{
                                                    fontSize: '11px', fontWeight: 600, padding: '1px 8px',
                                                    borderRadius: '4px', background: '#FEF2F2', color: '#DC2626'
                                                }}>
                                                    Obrigatório
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Ações */}
                                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                                        <button onClick={() => moveField(index, -1)} disabled={index === 0}
                                            style={{ ...iconBtnStyle, opacity: index === 0 ? 0.3 : 1 }} title="Mover para cima">
                                            <ArrowUp size={14} />
                                        </button>
                                        <button onClick={() => moveField(index, 1)} disabled={index === safeConfig.fields.length - 1}
                                            style={{ ...iconBtnStyle, opacity: index === safeConfig.fields.length - 1 ? 0.3 : 1 }} title="Mover para baixo">
                                            <ArrowDown size={14} />
                                        </button>
                                        <button onClick={() => removeField(index)}
                                            style={{ ...iconBtnStyle, color: '#EF4444' }} title="Remover campo">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>

                                    {isExpanded ? <ChevronUp size={18} color="#9CA3AF" /> : <ChevronDown size={18} color="#9CA3AF" />}
                                </div>

                                {/* Detalhes expandidos */}
                                {isExpanded && (
                                    <div style={{ padding: '0 18px 18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: '16px' }}>
                                            <label style={labelStyle}>ID do Campo</label>
                                            <input
                                                type="text"
                                                value={field.id || ''}
                                                onChange={e => updateField(index, { id: e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase() })}
                                                style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '13px' }}
                                            />
                                            <p style={hintStyle}>Identificador único usado no template (ex: nome_completo, cpf)</p>
                                        </div>

                                        <div>
                                            <label style={labelStyle}>Pergunta (texto enviado ao usuário)</label>
                                            <textarea
                                                value={field.question || ''}
                                                onChange={e => updateField(index, { question: e.target.value })}
                                                rows={2}
                                                style={{ ...inputStyle, resize: 'vertical' }}
                                                placeholder="Ex: Qual é o seu nome completo?"
                                            />
                                        </div>

                                        <div style={{ display: 'flex', gap: '20px' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                                <input type="checkbox" checked={field.required}
                                                    onChange={e => updateField(index, { required: e.target.checked })}
                                                    style={{ width: '18px', height: '18px', accentColor: '#6366F1' }} />
                                                <span style={{ fontSize: '14px', fontWeight: 500 }}>Obrigatório</span>
                                            </label>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                                <input type="checkbox" checked={field.skipIfProvided || false}
                                                    onChange={e => updateField(index, { skipIfProvided: e.target.checked })}
                                                    style={{ width: '18px', height: '18px', accentColor: '#6366F1' }} />
                                                <span style={{ fontSize: '14px', fontWeight: 500 }}>Pular se já informado</span>
                                            </label>
                                        </div>

                                        {/* Validações específicas por tipo */}
                                        {field.type === 'select' && (
                                            <div style={{ background: '#FAFAFA', padding: '16px', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
                                                <label style={labelStyle}>Opções de Seleção</label>
                                                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                                    <input
                                                        type="text"
                                                        placeholder="Adicionar opção"
                                                        value={optionInputs[index] || ''}
                                                        onChange={e => setOptionInputs({ ...optionInputs, [index]: e.target.value })}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                const val = (optionInputs[index] || '').trim();
                                                                if (val) {
                                                                    const opts = [...(field.validation?.options || []), val];
                                                                    updateField(index, { validation: { ...field.validation, options: opts, optionsDisplay: opts } });
                                                                    setOptionInputs({ ...optionInputs, [index]: '' });
                                                                }
                                                            }
                                                        }}
                                                        style={{ ...inputStyle, flex: 1 }}
                                                    />
                                                    <button onClick={() => {
                                                        const val = (optionInputs[index] || '').trim();
                                                        if (val) {
                                                            const opts = [...(field.validation?.options || []), val];
                                                            updateField(index, { validation: { ...field.validation, options: opts, optionsDisplay: opts } });
                                                            setOptionInputs({ ...optionInputs, [index]: '' });
                                                        }
                                                    }} style={addBtnSmallStyle}>+</button>
                                                </div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                    {(field.validation?.options || []).map((opt, oi) => (
                                                        <span key={oi} style={{ ...tagStyle, background: '#EDE9FE', color: '#7C3AED', borderColor: '#DDD6FE' }}>
                                                            {opt}
                                                            <button onClick={() => {
                                                                const opts = (field.validation?.options || []).filter((_, idx) => idx !== oi);
                                                                updateField(index, { validation: { ...field.validation, options: opts, optionsDisplay: opts } });
                                                            }} style={{ ...tagRemoveStyle, color: '#7C3AED' }}>×</button>
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {(field.type === 'file' || field.type === 'image') && (
                                            <div style={{ background: '#FAFAFA', padding: '16px', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                                    <div>
                                                        <label style={labelStyle}>Tamanho Máximo (MB)</label>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max="50"
                                                            value={Math.round((field.validation?.maxSizeBytes || 10485760) / 1048576)}
                                                            onChange={e => updateField(index, {
                                                                validation: { ...field.validation, maxSizeBytes: (parseInt(e.target.value) || 10) * 1048576 }
                                                            })}
                                                            style={{ ...inputStyle, width: '100px' }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {field.type === 'text' && (
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                                <div>
                                                    <label style={labelStyle}>Comprimento Mínimo</label>
                                                    <input type="number" min="0"
                                                        value={field.validation?.minLength || ''}
                                                        onChange={e => updateField(index, { validation: { ...field.validation, minLength: parseInt(e.target.value) || undefined } })}
                                                        style={{ ...inputStyle, width: '100px' }} />
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>Comprimento Máximo</label>
                                                    <input type="number" min="0"
                                                        value={field.validation?.maxLength || ''}
                                                        onChange={e => updateField(index, { validation: { ...field.validation, maxLength: parseInt(e.target.value) || undefined } })}
                                                        style={{ ...inputStyle, width: '100px' }} />
                                                </div>
                                            </div>
                                        )}

                                        <div>
                                            <label style={labelStyle}>Mensagem de Erro Customizada (opcional)</label>
                                            <input
                                                type="text"
                                                placeholder="Será usada quando a validação falhar"
                                                value={field.errorMessage || ''}
                                                onChange={e => updateField(index, { errorMessage: e.target.value })}
                                                style={inputStyle}
                                            />
                                        </div>

                                        {/* Condição visibleIf */}
                                        <div style={{ background: '#FFFBEB', padding: '16px', borderRadius: '12px', border: '1px solid #FEF3C7' }}>
                                            <label style={{ ...labelStyle, color: '#92400E', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                Condição de Exibição (opcional)
                                            </label>
                                            <p style={{ fontSize: '12px', color: '#A16207', marginBottom: '12px' }}>
                                                Mostrar este campo somente se outro campo tiver um valor específico
                                            </p>
                                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                                <select
                                                    value={field.visibleIf?.fieldId || ''}
                                                    onChange={e => updateField(index, {
                                                        visibleIf: e.target.value ? { fieldId: e.target.value, equals: field.visibleIf?.equals || '' } : null
                                                    })}
                                                    style={{ ...inputStyle, flex: 1 }}
                                                >
                                                    <option value="">Sem condição</option>
                                                    {safeConfig.fields.filter((_, fi) => fi !== index).map(f => (
                                                        <option key={f.id} value={f.id}>{f.question || f.id}</option>
                                                    ))}
                                                </select>
                                                {field.visibleIf?.fieldId && (
                                                    <>
                                                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#92400E' }}>=</span>
                                                        <input
                                                            type="text"
                                                            placeholder="Valor esperado"
                                                            value={field.visibleIf?.equals ?? ''}
                                                            onChange={e => updateField(index, {
                                                                visibleIf: { ...field.visibleIf, equals: e.target.value }
                                                            })}
                                                            style={{ ...inputStyle, flex: 1 }}
                                                        />
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {safeConfig.fields.length === 0 && (
                        <div style={{
                            textAlign: 'center', padding: '48px 24px', background: '#FAFAFA',
                            borderRadius: '16px', border: '2px dashed #E2E8F0', color: '#9CA3AF'
                        }}>
                            <FileText size={40} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                            <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '4px' }}>
                                Nenhum campo configurado
                            </div>
                            <div style={{ fontSize: '13px' }}>
                                Clique em "Adicionar Campo" para começar
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ============ Estilos reutilizáveis ============
const labelStyle = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 700,
    color: '#374151',
    marginBottom: '6px'
};

const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '10px',
    border: '1px solid #D1D5DB',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s',
    boxSizing: 'border-box'
};

const hintStyle = {
    fontSize: '12px',
    color: '#9CA3AF',
    marginTop: '4px'
};

const tagStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 12px',
    borderRadius: '8px',
    background: '#EEF2FF',
    color: '#4338CA',
    fontSize: '13px',
    fontWeight: 600,
    border: '1px solid #C7D2FE'
};

const tagRemoveStyle = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: 700,
    lineHeight: 1,
    padding: '0 2px',
    color: '#4338CA'
};

const iconBtnStyle = {
    width: '30px',
    height: '30px',
    borderRadius: '8px',
    border: '1px solid #E5E7EB',
    background: 'white',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#6B7280',
    transition: 'all 0.15s'
};

const addBtnSmallStyle = {
    padding: '8px 14px',
    borderRadius: '10px',
    border: 'none',
    background: '#6366F1',
    color: 'white',
    fontWeight: 700,
    fontSize: '16px',
    cursor: 'pointer'
};

export default ConditionalTransferTab;
