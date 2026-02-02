import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

const MainLayout = () => {
    const location = useLocation();

    // Determine page title based on path
    const getPageTitle = (path) => {
        switch (path) {
            case '/ai-config': return 'Configuração IA';
            case '/test-ai': return 'Testar IA';
            case '/products': return 'Produtos';
            case '/settings': return 'Configurações';
            case '/': return 'Painel';
            default: return 'Painel';
        }
    };

    return (
        <div style={{ display: 'flex', minHeight: '100vh' }}>
            <Sidebar />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <Header title={getPageTitle(location.pathname)} />
                <main style={{
                    marginLeft: '250px',
                    padding: '32px',
                    flex: 1,
                    backgroundColor: 'var(--bg-main)'
                }}>
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

export default MainLayout;
