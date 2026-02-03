import React, { useState } from 'react';
import { MessageCircle, Trash2, Plus } from 'lucide-react';

const QATab = ({ qaList = [], onUpdate }) => {
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState('');

    const addQA = () => {
        if (question && answer) {
            onUpdate([...qaList, { question, answer }]);
            setQuestion('');
            setAnswer('');
        }
    };

    const removeQA = (index) => {
        onUpdate(qaList.filter((_, i) => i !== index));
    };

    return (
        <div>
            <div style={{ background: 'var(--bg-main)', padding: '16px', borderRadius: 'var(--radius-md)', marginBottom: '24px' }}>
                <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Pergunta</label>
                    <input
                        type="text"
                        placeholder="Ex: Qual o horário de atendimento?"
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
                        placeholder="Ex: Nosso atendimento é das 9h às 18h."
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
                            border: '1px solid #E5E7EB',
                            borderRadius: 'var(--radius-md)',
                            background: 'white'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                <h5 style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-dark)' }}>{qa.question}</h5>
                                <button
                                    onClick={() => removeQA(index)}
                                    style={{ color: 'var(--text-light)' }}
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                            <p style={{ color: 'var(--text-medium)', fontSize: '14px', lineHeight: '1.5' }}>{qa.answer}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default QATab;
