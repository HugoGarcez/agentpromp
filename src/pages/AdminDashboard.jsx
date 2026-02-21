import React, { useState, useEffect } from 'react';
import { Users, Building, Bot, Plus, Edit, Bell, CheckCircle, Trash2, Clock } from 'lucide-react';
import Modal from '../components/Modal';

const STAT_Cards = ({ stats }) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: '#E0F2FE', color: '#0284C7' }}>
                    <Users size={20} />
                </div>
                <span style={{ color: '#6B7280', fontSize: '14px' }}>Usuários</span>
            </div>
            <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827' }}>{stats.users || 0}</p>
        </div>
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: '#F3E8FF', color: '#9333EA' }}>
                    <Building size={20} />
                </div>
                <span style={{ color: '#6B7280', fontSize: '14px' }}>Empresas</span>
            </div>
            <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827' }}>{stats.companies || 0}</p>
        </div>
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: '#DCFCE7', color: '#16A34A' }}>
                    <Bot size={20} />
                </div>
                <span style={{ color: '#6B7280', fontSize: '14px' }}>IAs Configuradas</span>
            </div>
            <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827' }}>{stats.configs || 0}</p>
        </div>
    </div>
);

const AdminDashboard = () => {
    const [stats, setStats] = useState({});
    const [users, setUsers] = useState([]);
    const [activeTab, setActiveTab] = useState('users'); // 'users' or 'notifications'

    // User Modal State
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [userFormData, setUserFormData] = useState({ email: '', password: '', role: 'USER', companyName: '' });

    // Notification State
    const [notifications, setNotifications] = useState([]);
    const [isNotifModalOpen, setIsNotifModalOpen] = useState(false);
    const [currentNotif, setCurrentNotif] = useState(null);
    const [notifFormData, setNotifFormData] = useState({ title: '', content: '', type: 'INFO', status: 'DRAFT' });

    useEffect(() => {
        fetchStats();
        fetchUsers();
        fetchNotifications();
    }, []);

    const fetchStats = async () => {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) setStats(await res.json());
    };

    const fetchUsers = async () => {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) setUsers(await res.json());
    };

    const fetchNotifications = async () => {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/admin/notifications', { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) setNotifications(await res.json());
    };

    const handleUserSubmit = async (e) => {
        e.preventDefault();
        const token = localStorage.getItem('token');
        const url = currentUser ? `/api/admin/users/${currentUser.id}` : '/api/admin/users';
        const method = currentUser ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(userFormData)
        });

        if (res.ok) {
            setIsUserModalOpen(false);
            fetchUsers();
            fetchStats();
            setCurrentUser(null);
            setUserFormData({ email: '', password: '', role: 'USER', companyName: '' });
        } else {
            alert('Erro ao salvar usuário');
        }
    };

    const handleNotifSubmit = async (e) => {
        e.preventDefault();
        const token = localStorage.getItem('token');
        const url = currentNotif ? `/api/admin/notifications/${currentNotif.id}` : '/api/admin/notifications';
        const method = currentNotif ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(notifFormData)
        });

        if (res.ok) {
            setIsNotifModalOpen(false);
            fetchNotifications();
            setCurrentNotif(null);
            setNotifFormData({ title: '', content: '', type: 'INFO', status: 'DRAFT' });
        } else {
            alert('Erro ao salvar notificação');
        }
    };

    const deleteNotif = async (id) => {
        if (!confirm('Excluir esta notificação?')) return;
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/admin/notifications/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) fetchNotifications();
    };

    const approveNotif = async (notif) => {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/admin/notifications/${notif.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ ...notif, status: 'APPROVED' })
        });
        if (res.ok) fetchNotifications();
    };

    const openEditUser = (user) => {
        setCurrentUser(user);
        setUserFormData({
            email: user.email,
            password: '',
            role: user.role,
            companyName: user.company?.name || ''
        });
        setIsUserModalOpen(true);
    };

    const openCreateUser = () => {
        setCurrentUser(null);
        setUserFormData({ email: '', password: '', role: 'USER', companyName: '' });
        setIsUserModalOpen(true);
    };

    const openEditNotif = (notif) => {
        setCurrentNotif(notif);
        setNotifFormData({
            title: notif.title,
            content: notif.content,
            type: notif.type,
            status: notif.status
        });
        setIsNotifModalOpen(true);
    };

    const openCreateNotif = () => {
        setCurrentNotif(null);
        setNotifFormData({ title: '', content: '', type: 'INFO', status: 'DRAFT' });
        setIsNotifModalOpen(true);
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>Painel Administrativo</h2>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        onClick={openCreateNotif}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            backgroundColor: '#6B7280', color: 'white',
                            padding: '10px 16px', borderRadius: '8px', fontWeight: '500'
                        }}
                    >
                        <Bell size={18} /> Nova Notificação
                    </button>
                    <button
                        onClick={openCreateUser}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            backgroundColor: 'var(--primary-blue)', color: 'white',
                            padding: '10px 16px', borderRadius: '8px', fontWeight: '500'
                        }}
                    >
                        <Plus size={18} /> Novo Usuário
                    </button>
                </div>
            </div>

            <STAT_Cards stats={stats} />

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '24px', marginBottom: '16px', borderBottom: '1px solid #E5E7EB' }}>
                <button
                    onClick={() => setActiveTab('users')}
                    style={{
                        padding: '12px 16px', fontSize: '14px', fontWeight: '600',
                        color: activeTab === 'users' ? 'var(--primary-blue)' : '#6B7280',
                        borderBottom: activeTab === 'users' ? '2px solid var(--primary-blue)' : 'none',
                        background: 'none', border: 'none', cursor: 'pointer'
                    }}
                >
                    Usuários
                </button>
                <button
                    onClick={() => setActiveTab('notifications')}
                    style={{
                        padding: '12px 16px', fontSize: '14px', fontWeight: '600',
                        color: activeTab === 'notifications' ? 'var(--primary-blue)' : '#6B7280',
                        borderBottom: activeTab === 'notifications' ? '2px solid var(--primary-blue)' : 'none',
                        background: 'none', border: 'none', cursor: 'pointer'
                    }}
                >
                    Notificações
                </button>
            </div>

            {activeTab === 'users' ? (
                <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead style={{ backgroundColor: '#F9FAFB' }}>
                            <tr>
                                <th style={{ padding: '16px', fontSize: '12px', color: '#6B7280', textTransform: 'uppercase' }}>Usuário</th>
                                <th style={{ padding: '16px', fontSize: '12px', color: '#6B7280', textTransform: 'uppercase' }}>Empresa (ID)</th>
                                <th style={{ padding: '16px', fontSize: '12px', color: '#6B7280', textTransform: 'uppercase' }}>Perfil</th>
                                <th style={{ padding: '16px', fontSize: '12px', color: '#6B7280', textTransform: 'uppercase' }}>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(user => (
                                <tr key={user.id} style={{ borderTop: '1px solid #E5E7EB' }}>
                                    <td style={{ padding: '16px' }}>
                                        <div style={{ fontWeight: '500', color: '#111827' }}>{user.email}</div>
                                        <div style={{ fontSize: '12px', color: '#6B7280' }}>Cadastrado em {new Date(user.createdAt).toLocaleDateString()}</div>
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        <div style={{ fontWeight: '500' }}>{user.company?.name}</div>
                                        <div style={{ fontSize: '10px', color: '#9CA3AF', fontFamily: 'monospace' }}>{user.company?.id}</div>
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        <span style={{
                                            padding: '2px 8px', borderRadius: '99px', fontSize: '12px', fontWeight: '500',
                                            backgroundColor: user.role === 'ADMIN' ? '#DBEAFE' : '#E5E7EB',
                                            color: user.role === 'ADMIN' ? '#1E40AF' : '#374151'
                                        }}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        <button onClick={() => openEditUser(user)} style={{ color: '#4B5563', background: 'none', border: 'none', cursor: 'pointer' }} title="Editar">
                                            <Edit size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead style={{ backgroundColor: '#F9FAFB' }}>
                            <tr>
                                <th style={{ padding: '16px', fontSize: '12px', color: '#6B7280', textTransform: 'uppercase' }}>Título</th>
                                <th style={{ padding: '16px', fontSize: '12px', color: '#6B7280', textTransform: 'uppercase' }}>Status</th>
                                <th style={{ padding: '16px', fontSize: '12px', color: '#6B7280', textTransform: 'uppercase' }}>Data</th>
                                <th style={{ padding: '16px', fontSize: '12px', color: '#6B7280', textTransform: 'uppercase' }}>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {notifications.map(notif => (
                                <tr key={notif.id} style={{ borderTop: '1px solid #E5E7EB' }}>
                                    <td style={{ padding: '16px' }}>
                                        <div style={{ fontWeight: '500', color: '#111827' }}>{notif.title}</div>
                                        <div style={{ fontSize: '12px', color: '#6B7280' }}>Tipo: {notif.type}</div>
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        <span style={{
                                            padding: '2px 8px', borderRadius: '99px', fontSize: '12px', fontWeight: '500',
                                            backgroundColor: notif.status === 'APPROVED' ? '#DCFCE7' : '#FEF3C7',
                                            color: notif.status === 'APPROVED' ? '#16A34A' : '#D97706',
                                            display: 'inline-flex', alignItems: 'center', gap: '4px'
                                        }}>
                                            {notif.status === 'APPROVED' ? <CheckCircle size={14} /> : <Clock size={14} />}
                                            {notif.status === 'APPROVED' ? 'Aprovado' : 'Rascunho'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '16px', fontSize: '14px', color: '#6B7280' }}>
                                        {new Date(notif.createdAt).toLocaleDateString()}
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        <div style={{ display: 'flex', gap: '12px' }}>
                                            {notif.status === 'DRAFT' && (
                                                <button onClick={() => approveNotif(notif)} style={{ color: '#16A34A', background: 'none', border: 'none', cursor: 'pointer' }} title="Aprovar">
                                                    <CheckCircle size={18} />
                                                </button>
                                            )}
                                            <button onClick={() => openEditNotif(notif)} style={{ color: '#4B5563', background: 'none', border: 'none', cursor: 'pointer' }} title="Editar">
                                                <Edit size={18} />
                                            </button>
                                            <button onClick={() => deleteNotif(notif.id)} style={{ color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer' }} title="Excluir">
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* User Modal */}
            <Modal isOpen={isUserModalOpen} onClose={() => setIsUserModalOpen(false)} title={currentUser ? "Editar Usuário" : "Novo Usuário"}>
                <form onSubmit={handleUserSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {!currentUser && (
                        <div>
                            <label style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>Email</label>
                            <input
                                type="email" value={userFormData.email}
                                onChange={e => setUserFormData({ ...userFormData, email: e.target.value })}
                                required
                                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #D1D5DB' }}
                            />
                        </div>
                    )}

                    <div>
                        <label style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>
                            {currentUser ? 'Nova Senha (deixe em branco para manter)' : 'Senha'}
                        </label>
                        <input
                            type="password" value={userFormData.password}
                            onChange={e => setUserFormData({ ...userFormData, password: e.target.value })}
                            required={!currentUser}
                            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #D1D5DB' }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>Nome da Empresa</label>
                        <input
                            type="text" value={userFormData.companyName}
                            onChange={e => setUserFormData({ ...userFormData, companyName: e.target.value })}
                            required
                            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #D1D5DB' }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>Perfil</label>
                        <select
                            value={userFormData.role}
                            onChange={e => setUserFormData({ ...userFormData, role: e.target.value })}
                            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #D1D5DB' }}
                        >
                            <option value="USER">Usuário</option>
                            <option value="ADMIN">Administrador</option>
                        </select>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                        <button type="submit" style={{ backgroundColor: 'var(--primary-blue)', color: 'white', padding: '10px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer' }}>
                            Salvar
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Notification Modal */}
            <Modal isOpen={isNotifModalOpen} onClose={() => setIsNotifModalOpen(false)} title={currentNotif ? "Editar Notificação" : "Nova Notificação"}>
                <form onSubmit={handleNotifSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>Título</label>
                        <input
                            type="text" value={notifFormData.title}
                            onChange={e => setNotifFormData({ ...notifFormData, title: e.target.value })}
                            required
                            placeholder="Ex: Correção no sistema de áudio"
                            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #D1D5DB' }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>Conteúdo (Descrição)</label>
                        <textarea
                            value={notifFormData.content}
                            onChange={e => setNotifFormData({ ...notifFormData, content: e.target.value })}
                            required
                            rows={4}
                            placeholder="Descreva o que foi alterado ou corrigido..."
                            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #D1D5DB', resize: 'vertical' }}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>Tipo</label>
                            <select
                                value={notifFormData.type}
                                onChange={e => setNotifFormData({ ...notifFormData, type: e.target.value })}
                                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #D1D5DB' }}
                            >
                                <option value="INFO">Informativo</option>
                                <option value="FIX">Correção (Bug Fix)</option>
                                <option value="IMPROVEMENT">Melhoria</option>
                                <option value="NEWS">Novidade</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>Status</label>
                            <select
                                value={notifFormData.status}
                                onChange={e => setNotifFormData({ ...notifFormData, status: e.target.value })}
                                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #D1D5DB' }}
                            >
                                <option value="DRAFT">Rascunho (Privado)</option>
                                <option value="APPROVED">Aprovado (Público)</option>
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                        <button type="submit" style={{ backgroundColor: 'var(--primary-blue)', color: 'white', padding: '10px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer' }}>
                            Salvar
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default AdminDashboard;
