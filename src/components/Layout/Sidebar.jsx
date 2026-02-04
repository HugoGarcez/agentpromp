import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, Bot, ShoppingBag, Settings, Moon, Sun, Shield } from 'lucide-react';
import styles from './Sidebar.module.css';
import logo from '../../assets/logo.png';
import logoDark from '../../assets/logo-dark.png';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';

const Sidebar = () => {
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logoContainer}>
        <img src={theme === 'dark' ? logoDark : logo} alt="Promp IA Logo" style={{ height: '32px' }} />
      </div>

      <nav className={styles.nav}>
        <NavLink
          to="/"
          className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
        >
          <LayoutDashboard size={20} className={styles.navIcon} />
          <span>Painel</span>
        </NavLink>

        <NavLink
          to="/ai-config"
          className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
        >
          <Bot size={20} className={styles.navIcon} />
          <span>Configuração IA</span>
        </NavLink>

        <NavLink
          to="/test-ai"
          className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
        >
          <MessageSquare size={20} className={styles.navIcon} />
          <span>Testar IA</span>
        </NavLink>

        <NavLink
          to="/products"
          className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
        >
          <ShoppingBag size={20} className={styles.navIcon} />
          <span>Produtos</span>
        </NavLink>

        {/* Placeholder for other items from reference */}
        <div className={styles.navItem}>
          <MessageSquare size={20} className={styles.navIcon} />
          <span>Atendimento</span>
        </div>

        <NavLink
          to="/settings"
          className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
        >
          <Settings size={20} className={styles.navIcon} />
          <span>Configurações</span>
        </NavLink>

        {user?.role === 'ADMIN' && (
          <NavLink
            to="/admin"
            className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
          >
            <Shield size={20} className={styles.navIcon} />
            <span>Admin</span>
          </NavLink>
            <span>Admin</span>
          </NavLink>
        )}

        {user?.role === 'ADMIN' && (
          <NavLink
            to="/admin-config"
            className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
          >
            <Lock size={20} className={styles.navIcon} />
            <span>Config Global</span>
          </NavLink>
        )}
      </nav>

      <div style={{ padding: '16px', borderTop: '1px solid var(--border-color)' }}>
        <button
          onClick={toggleTheme}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            width: '100%',
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-medium)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            background: 'transparent'
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-main)'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          <span>{theme === 'light' ? 'Modo Escuro' : 'Modo Claro'}</span>
        </button>
      </div>
    </aside >
  );
};

export default Sidebar;
