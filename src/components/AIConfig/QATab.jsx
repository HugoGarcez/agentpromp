import React, { useState } from 'react';
import { MessageCircle, Trash2, Plus, Pencil, Check, X } from 'lucide-react';

const QATab = ({ qaList = [], onUpdate }) => {
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState('');
    const [editingIndex, setEditingIndex] = useState(null);
    const [editQuestion, setEditQuestion] = useState('');
    const [editAnswer, setEditAnswer] = useState('');

    const addQA = () => {
        if (question && answer) {
            onUpdate([...qaList, { question, answer }]);
            setQuestion('');
            setAnswer('');
        }
    };

    const removeQA = (index) => {
        if (editingIndex === index) setEditingIndex(null);
        onUpdate(qaList.filter((_, i) => i !== index));
    };

    const startEdit = (index) => {
        setEditingIndex(index);
        setEditQuestion(qaList[index].question);
        setEditAnswer(qaList[index].answer);
    };

    const saveEdit = () => {
        if (!editQuestion || !editAnswer) return;
        const updated = qaList.map((item, i) =>
            i === editingIndex ? { question: editQuestion, answer: editAnswer } : item
        );
        onUpdate(updated);
        setEditingIndex(null);
    };

    const cancelEdit = () => setEditingIndex(null);

    return (
        <div>
            <div style={{ background: 'var(--bg-main)', padding: '16px', borderRadius: 'var(--radius-md)', marginBottom: '24px' }}>
                <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Pergunta</label>
                    <input
                        type="text"
                        placeholder="Ex: Qual o horário de atendimento? / Entregam em todo Brasil?"
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '10px',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid #D1D5DB',
                            outline: 'none'
                        }}
                    />
                </div>
                <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Resposta</label>
                    <textarea
                        placeholder="Ex: Funcionamos de seg a sex das 9h às 18h. Entregamos via Correios para todo o país."
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        rows={4}
                        style={{
                            width: '100%',
                            padding: '10px',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid #D1D5DB',
                            outline: 'none',
                            resize: 'vertical'
                        }}
                    />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        onClick={addQA}
                        disabled={!question || !answer}
                        style={{
                            backgroundColor: question && answer ? 'var(--primary-blue)' : '#9CA3AF',
                            color: 'white',
                            padding: '10px 24px',
                            borderRadius: 'var(--radius-md)',
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            cursor: question && answer ? 'pointer' : 'not-allowed'
                        }}
                    >
                        <Plus size={18} />
                        Adicionar Q&A
                    </button>
                </div>
            </div>

            <div>
                <h4 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Perguntas Cadastradas ({qaList.length})</h4>
                {qaList.length === 0 && <p style={{ color: 'var(--text-light)', fontSize: '14px' }}>Nenhuma pergunta cadastrada.</p>}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {qaList.map((qa, index) => (
                        <div key={index} style={{
                            padding: '16px',
                            border: `1px solid ${editingIndex === index ? 'var(--primary-blue)' : '#E5E7EB'}`,
                            borderRadius: 'var(--radius-md)',
                            background: 'white'
                        }}>
                            {editingIndex === index ? (
                                <>
                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500 }}>Pergunta</label>
                                        <input
                                            type="text"
                                            value={editQuestion}
                                            onChange={(e) => setEditQuestion(e.target.value)}
                                            style={{
                                                width: '100%',
                                                padding: '8px 10px',
                                                borderRadius: 'var(--radius-md)',
                                                border: '1px solid #D1D5DB',
                                                outline: 'none',
                                                fontSize: '14px'
                                            }}
                                        />
                                    </div>
                                    <div style={{ marginBottom: '12px' }}>
                                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500 }}>Resposta</label>
                                        <textarea
                                            value={editAnswer}
                                            onChange={(e) => setEditAnswer(e.target.value)}
                                            rows={3}
                                            style={{
                                                width: '100%',
                                                padding: '8px 10px',
                                                borderRadius: 'var(--radius-md)',
                                                border: '1px solid #D1D5DB',
                                                outline: 'none',
                                                resize: 'vertical',
                                                fontSize: '14px'
                                            }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                        <button
                                            onClick={cancelEdit}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '4px',
                                                padding: '6px 14px', borderRadius: 'var(--radius-md)',
                                                border: '1px solid #D1D5DB', fontSize: '13px',
                                                color: 'var(--text-medium)', cursor: 'pointer', background: 'white'
                                            }}
                                        >
                                            <X size={14} /> Cancelar
                                        </button>
                                        <button
                                            onClick={saveEdit}
                                            disabled={!editQuestion || !editAnswer}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '4px',
                                                padding: '6px 14px', borderRadius: 'var(--radius-md)',
                                                fontSize: '13px', fontWeight: 500, cursor: editQuestion && editAnswer ? 'pointer' : 'not-allowed',
                                                background: editQuestion && editAnswer ? 'var(--primary-blue)' : '#9CA3AF',
                                                color: 'white', border: 'none'
                                            }}
                                        >
                                            <Check size={14} /> Salvar
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                        <h5 style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-dark)' }}>{qa.question}</h5>
                                        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                                            <button
                                                onClick={() => startEdit(index)}
                                                style={{ color: 'var(--text-light)' }}
                                                title="Editar"
                                            >
                                                <Pencil size={16} />
                                            </button>
                                            <button
                                                onClick={() => removeQA(index)}
                                                style={{ color: 'var(--text-light)' }}
                                                title="Remover"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </div>
                                    <p style={{ color: 'var(--text-medium)', fontSize: '14px', lineHeight: '1.5' }}>{qa.answer}</p>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default QATab;
