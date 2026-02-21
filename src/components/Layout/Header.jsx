import React, { useState, useRef, useEffect } from 'react';
import { Bell, User, LogOut, Key, ChevronDown, Menu, Info, ShieldAlert, Sparkles, MessageSquare } from 'lucide-react';
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
    const [notifications, setNotifications] = useState([]);
    const [isNotifOpen, setIsNotifOpen] = useState(false);
    const [selectedNotif, setSelectedNotif] = useState(null);

    // Fetch notifications
    useEffect(() => {
        const fetchNotifications = async () => {
            const token = localStorage.getItem('token');
            if (!token) return;
            try {
                const res = await fetch('/api/notifications', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) setNotifications(await res.json());
            } catch (error) {
                console.error("Error fetching notifications:", error);
            }
        };

        fetchNotifications();
        // Refresh every 5 minutes
        const interval = setInterval(fetchNotifications, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

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
                <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => setIsNotifOpen(true)}>
                    <button title="Notificações" style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <Bell size={20} color="var(--text-medium)" />
                    </button>
                    {notifications.length > 0 && (
                        <span style={{
                            position: 'absolute',
                            top: '-5px',
                            right: '-5px',
                            background: '#DC2626',
                            color: 'white',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            padding: '1px 5px',
                            borderRadius: '10px',
                            border: '2px solid white',
                            pointerEvents: 'none'
                        }}>
                            {notifications.length}
                        </span>
                    )}
                </div>

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

            {/* Notifications List Modal */}
            <Modal isOpen={isNotifOpen} onClose={() => setIsNotifOpen(false)} title="Notificações e Atualizações">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '60vh', overflowY: 'auto', paddingRight: '4px' }}>
                    {notifications.length === 0 ? (
                        <p style={{ textAlign: 'center', color: '#6B7280', padding: '24px' }}>Nenhuma notificação por enquanto.</p>
                    ) : (
                        notifications.map(notif => (
                            <div
                                key={notif.id}
                                onClick={() => { setSelectedNotif(notif); setIsNotifOpen(false); }}
                                style={{
                                    padding: '16px',
                                    borderRadius: '8px',
                                    border: '1px solid #E5E7EB',
                                    cursor: 'pointer',
                                    transition: 'background 0.2s'
                                }}
                                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                    <div style={{
                                        padding: '8px',
                                        borderRadius: '8px',
                                        backgroundColor: notif.type === 'FIX' ? '#FEE2E2' : notif.type === 'IMPROVEMENT' ? '#DCFCE7' : notif.type === 'NEWS' ? '#FEF3C7' : '#E0F2FE',
                                        color: notif.type === 'FIX' ? '#DC2626' : notif.type === 'IMPROVEMENT' ? '#16A34A' : notif.type === 'NEWS' ? '#D97706' : '#0284C7'
                                    }}>
                                        {notif.type === 'FIX' ? <ShieldAlert size={20} /> : notif.type === 'IMPROVEMENT' ? <Sparkles size={20} /> : notif.type === 'NEWS' ? <Info size={20} /> : <MessageSquare size={20} />}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                            <h4 style={{ fontSize: '15px', fontWeight: 'bold', color: '#111827' }}>{notif.title}</h4>
                                            <span style={{ fontSize: '11px', color: '#9CA3AF' }}>{new Date(notif.createdAt).toLocaleDateString()}</span>
                                        </div>
                                        <p style={{ fontSize: '13px', color: '#4B5563', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                            {notif.content}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </Modal>

            {/* Notification Detail Modal */}
            <Modal isOpen={!!selectedNotif} onClose={() => setSelectedNotif(null)} title={selectedNotif?.title || "Notificação"}>
                {selectedNotif && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <span style={{
                                padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600',
                                backgroundColor: selectedNotif.type === 'FIX' ? '#FEE2E2' : selectedNotif.type === 'IMPROVEMENT' ? '#DCFCE7' : selectedNotif.type === 'NEWS' ? '#FEF3C7' : '#E0F2FE',
                                color: selectedNotif.type === 'FIX' ? '#DC2626' : selectedNotif.type === 'IMPROVEMENT' ? '#16A34A' : selectedNotif.type === 'NEWS' ? '#D97706' : '#0284C7'
                            }}>
                                {selectedNotif.type === 'FIX' ? 'Correção' : selectedNotif.type === 'IMPROVEMENT' ? 'Melhoria' : selectedNotif.type === 'NEWS' ? 'Novidade' : 'Informativo'}
                            </span>
                            <span style={{ fontSize: '12px', color: '#6B7280' }}>Publicado em {new Date(selectedNotif.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div style={{ fontSize: '15px', color: '#1F2937', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                            {selectedNotif.content}
                        </div>
                        <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button
                                onClick={() => setSelectedNotif(null)}
                                style={{
                                    backgroundColor: 'var(--primary-blue)',
                                    color: 'white',
                                    padding: '8px 20px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontWeight: '500'
                                }}
                            >
                                Entendi
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </header>
    );
};

export default Header;
