import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            await login(email, password);
            navigate('/');
        } catch (err) {
            setError('Falha no login. Verifique suas credenciais.');
        }
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            backgroundColor: 'var(--bg-main)',
            padding: '20px'
        }}>
            <div style={{
                backgroundColor: 'var(--bg-white)',
                padding: '40px',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-xl)', // slightly deeper shadow
                width: '100%',
                maxWidth: '400px',
                border: '1px solid var(--border-color)'
            }}>
                <div style={{ marginBottom: '30px', textAlign: 'center' }}>
                    <h1 style={{
                        color: 'var(--primary-blue)',
                        fontSize: '24px',
                        fontWeight: 'bold',
                        marginBottom: '8px'
                    }}>Promp</h1>
                    <p style={{ color: 'var(--text-medium)', fontSize: '14px' }}>Entre para gerenciar seus agentes</p>
                </div>

                {error && (
                    <div style={{
                        backgroundColor: '#FEF2F2',
                        color: '../var(--danger-red)',
                        padding: '12px',
                        borderRadius: 'var(--radius-sm)',
                        marginBottom: '20px',
                        fontSize: '14px',
                        border: '1px solid #FECACA'
                    }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{
                            display: 'block',
                            marginBottom: '6px',
                            fontSize: '14px',
                            color: 'var(--text-dark)',
                            textAlign: 'left'
                        }}>Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border-color)',
                                backgroundColor: 'var(--bg-main)',
                                color: 'var(--text-dark)',
                                fontSize: '16px',
                                outline: 'none',
                                transition: 'border-color 0.2s',
                            }}
                            onFocus={(e) => e.target.style.borderColor = 'var(--primary-blue)'}
                            onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'}
                        />
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                        <label style={{
                            display: 'block',
                            marginBottom: '6px',
                            fontSize: '14px',
                            color: 'var(--text-dark)',
                            textAlign: 'left'
                        }}>Senha</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border-color)',
                                backgroundColor: 'var(--bg-main)',
                                color: 'var(--text-dark)',
                                fontSize: '16px',
                                outline: 'none',
                                transition: 'border-color 0.2s',
                            }}
                            onFocus={(e) => e.target.style.borderColor = 'var(--primary-blue)'}
                            onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'}
                        />
                    </div>

                    <div style={{ textAlign: 'right', marginBottom: '24px' }}>
                        <a href="/forgot-password" style={{ fontSize: '14px', color: 'var(--primary-blue)', textDecoration: 'none' }}>
                            Esqueci minha senha
                        </a>
                    </div>

                    <button
                        type="submit"
                        style={{
                            width: '100%',
                            padding: '12px',
                            backgroundColor: 'var(--primary-blue)',
                            color: 'white',
                            borderRadius: 'var(--radius-md)',
                            fontSize: '16px',
                            fontWeight: '500',
                            transition: 'opacity 0.2s',
                        }}
                        onMouseOver={(e) => e.target.style.opacity = '0.9'}
                        onMouseOut={(e) => e.target.style.opacity = '1'}
                    >
                        Entrar
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Login;
