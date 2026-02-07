import React, { useState, useRef, useEffect } from 'react';
import { Bell, User, LogOut, Key, ChevronDown, Menu } from 'lucide-react';
import styles from './Header.module.css';
import { useAuth } from '../../contexts/AuthContext';
import Modal from '../Modal';

const Header = ({ title, onMenuClick }) => {
    const { user, logout } = useAuth();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Password Change State
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [message, setMessage] = useState({ type: '', text: '' });
    const [loading, setLoading] = useState(false);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsDropdownOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleChangePassword = async (e) => {
        e.preventDefault();
        setMessage({ type: '', text: '' });

        if (newPassword !== confirmPassword) {
            setMessage({ type: 'error', text: 'As novas senhas não coincidem' });
            return;
        }

        if (newPassword.length < 6) {
            setMessage({ type: 'error', text: 'A nova senha deve ter pelo menos 6 caracteres' });
            return;
        }

        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ currentPassword, newPassword })
            });

            const data = await response.json();

            if (response.ok) {
                setMessage({ type: 'success', text: 'Senha alterada com sucesso!' });
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
                setTimeout(() => setIsPasswordModalOpen(false), 2000);
            } else {
                setMessage({ type: 'error', text: data.message || 'Erro ao alterar senha' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Erro de conexão' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <header className={styles.header}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
                <button className={styles.menuButton} onClick={onMenuClick}>
                    <Menu size={24} />
                </button>
                <h1 className={styles.title}>{title || 'Painel'}</h1>
            </div>

            <div className={styles.actions}>
                <button title="Notificações">
                    <Bell size={20} color="var(--text-medium)" />
                </button>

                <div className={styles.userProfile} ref={dropdownRef} onClick={() => setIsDropdownOpen(!isDropdownOpen)} style={{ cursor: 'pointer', position: 'relative' }}>
                    <div className={styles.avatar}>
                        {user?.email ? user.email.charAt(0).toUpperCase() : 'U'}
                    </div>
                    {/* <ChevronDown size={16} color="var(--text-medium)" /> */}

                    {isDropdownOpen && (
                        <div style={{
                            position: 'absolute',
                            top: '100%',
                            right: 0,
                            marginTop: '8px',
                            backgroundColor: 'var(--bg-white)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-md)',
                            boxShadow: 'var(--shadow-md)',
                            width: '200px',
                            zIndex: 50,
                            overflow: 'hidden'
                        }}>
                            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
                                <p style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--text-dark)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {user?.email}
                                </p>
                                <p style={{ fontSize: '12px', color: 'var(--text-light)' }}>
                                    {user?.role === 'ADMIN' ? 'Administrador' : 'Usuário'}
                                </p>
                            </div>

                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsPasswordModalOpen(true);
                                    setIsDropdownOpen(false);
                                }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    width: '100%',
                                    padding: '12px 16px',
                                    textAlign: 'left',
                                    color: 'var(--text-medium)',
                                    transition: 'background 0.2s',
                                    fontSize: '14px'
                                }}
                                onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-main)'}
                                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <Key size={16} />
                                Alterar Senha
                            </button>

                            <button
                                onClick={() => logout()}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    width: '100%',
                                    padding: '12px 16px',
                                    textAlign: 'left',
                                    color: 'var(--danger-red)',
                                    transition: 'background 0.2s',
                                    fontSize: '14px',
                                    borderTop: '1px solid var(--border-color)'
                                }}
                                onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-main)'}
                                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <LogOut size={16} />
                                Sair
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <Modal
                isOpen={isPasswordModalOpen}
                onClose={() => setIsPasswordModalOpen(false)}
                title="Alterar Senha"
            >
                <form onSubmit={handleChangePassword}>
                    {message.text && (
                        <div style={{
                            padding: '10px',
                            borderRadius: 'var(--radius-sm)',
                            marginBottom: '16px',
                            fontSize: '14px',
                            backgroundColor: message.type === 'error' ? '#FEF2F2' : '#F0FDF4',
                            color: message.type === 'error' ? 'var(--danger-red)' : 'var(--success-green)',
                            border: `1px solid ${message.type === 'error' ? '#FECACA' : '#BBF7D0'}`
                        }}>
                            {message.text}
                        </div>
                    )}

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: 'var(--text-dark)' }}>Senha Atual</label>
                        <input
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            required
                            style={{
                                width: '100%',
                                padding: '10px',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border-color)',
                                backgroundColor: 'var(--bg-main)',
                                color: 'var(--text-dark)'
                            }}
                        />
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: 'var(--text-dark)' }}>Nova Senha</label>
                        <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                            style={{
                                width: '100%',
                                padding: '10px',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border-color)',
                                backgroundColor: 'var(--bg-main)',
                                color: 'var(--text-dark)'
                            }}
                        />
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: 'var(--text-dark)' }}>Confirmar Nova Senha</label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            style={{
                                width: '100%',
                                padding: '10px',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border-color)',
                                backgroundColor: 'var(--bg-main)',
                                color: 'var(--text-dark)'
                            }}
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                        <button
                            type="button"
                            onClick={() => setIsPasswordModalOpen(false)}
                            style={{
                                padding: '10px 16px',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border-color)',
                                color: 'var(--text-medium)',
                                fontSize: '14px'
                            }}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                padding: '10px 16px',
                                borderRadius: 'var(--radius-md)',
                                backgroundColor: 'var(--primary-blue)',
                                color: 'white',
                                fontSize: '14px',
                                fontWeight: '500',
                                opacity: loading ? 0.7 : 1
                            }}
                        >
                            {loading ? 'Salvando...' : 'Alterar Senha'}
                        </button>
                    </div>
                </form>
            </Modal>
        </header>
    );
};

export default Header;
