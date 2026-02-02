import React, { useState, useEffect } from 'react';
import { Users, Building, Bot, Plus, Edit } from 'lucide-react';
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
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentUser, setCurrentUser] = useState(null); // For editing

    // Form State
    const [formData, setFormData] = useState({ email: '', password: '', role: 'USER', companyName: '' });

    useEffect(() => {
        fetchStats();
        fetchUsers();
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

    const handleSubmit = async (e) => {
        e.preventDefault();
        const token = localStorage.getItem('token');
        const url = currentUser ? `/api/admin/users/${currentUser.id}` : '/api/admin/users';
        const method = currentUser ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(formData)
        });

        if (res.ok) {
            setIsModalOpen(false);
            fetchUsers();
            fetchStats();
            setCurrentUser(null);
            setFormData({ email: '', password: '', role: 'USER', companyName: '' });
        } else {
            alert('Erro ao salvar usuário');
        }
    };

    const openEdit = (user) => {
        setCurrentUser(user);
        setFormData({
            email: user.email,
            password: '', // Leave blank if not changing
            role: user.role,
            companyName: user.company?.name || ''
        });
        setIsModalOpen(true);
    };

    const openCreate = () => {
        setCurrentUser(null);
        setFormData({ email: '', password: '', role: 'USER', companyName: '' });
        setIsModalOpen(true);
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>Painel Administrativo</h2>
                <button
                    onClick={openCreate}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        backgroundColor: 'var(--primary-blue)', color: 'white',
                        padding: '10px 16px', borderRadius: '8px', fontWeight: '500'
                    }}
                >
                    <Plus size={18} /> Novo Usuário
                </button>
            </div>

            <STAT_Cards stats={stats} />

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
                                    <button onClick={() => openEdit(user)} style={{ color: '#4B5563' }} title="Editar">
                                        <Edit size={18} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={currentUser ? "Editar Usuário" : "Novo Usuário"}>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {!currentUser && ( // Email is immutable generally for simplicity here
                        <div>
                            <label style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>Email</label>
                            <input
                                type="email" value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
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
                            type="password" value={formData.password}
                            onChange={e => setFormData({ ...formData, password: e.target.value })}
                            required={!currentUser}
                            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #D1D5DB' }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>Nome da Empresa</label>
                        <input
                            type="text" value={formData.companyName}
                            onChange={e => setFormData({ ...formData, companyName: e.target.value })}
                            required
                            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #D1D5DB' }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>Perfil</label>
                        <select
                            value={formData.role}
                            onChange={e => setFormData({ ...formData, role: e.target.value })}
                            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #D1D5DB' }}
                        >
                            <option value="USER">Usuário</option>
                            <option value="ADMIN">Administrador</option>
                        </select>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                        <button type="submit" style={{ backgroundColor: 'var(--primary-blue)', color: 'white', padding: '10px 20px', borderRadius: '6px' }}>
                            Salvar
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default AdminDashboard;
