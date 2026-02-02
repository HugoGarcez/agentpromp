import React from 'react';

const Dashboard = () => {
    return (
        <div>
            <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '16px' }}>Bem-vindo, Usuário!</h2>
            <p style={{ color: 'var(--text-medium)' }}>Acesse rapidamente as principais funcionalidades do sistema</p>

            {/* Placeholder for dashboard cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', marginTop: '32px' }}>
                {[1, 2, 3].map((i) => (
                    <div key={i} style={{
                        background: 'var(--bg-white)',
                        padding: '24px',
                        borderRadius: 'var(--radius-md)',
                        boxShadow: 'var(--shadow-sm)'
                    }}>
                        <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>Funcionalidade {i}</h3>
                        <p style={{ color: 'var(--text-light)', fontSize: '14px' }}>Descrição da funcionalidade...</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Dashboard;
