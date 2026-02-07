import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import styles from './MainLayout.module.css';

const MainLayout = () => {
    const location = useLocation();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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

    const toggleSidebar = () => {
        setIsSidebarOpen(!isSidebarOpen);
    };

    return (
        <div className={styles.container}>
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

            {/* Mobile Overlay */}
            <div
                className={`${styles.overlay} ${isSidebarOpen ? styles.overlayVisible : ''}`}
                onClick={() => setIsSidebarOpen(false)}
            />

            <div className={styles.contentWrapper}>
                <Header
                    title={getPageTitle(location.pathname)}
                    onMenuClick={toggleSidebar}
                />
                <main className={styles.main}>
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

export default MainLayout;
