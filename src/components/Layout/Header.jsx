import React from 'react';
import { Bell, User } from 'lucide-react';
import styles from './Header.module.css';

const Header = ({ title }) => {
    return (
        <header className={styles.header}>
            <h1 className={styles.title}>{title || 'Painel'}</h1>

            <div className={styles.actions}>
                <button>
                    <Bell size={20} color="var(--text-medium)" />
                </button>
                <div className={styles.userProfile}>
                    <div className={styles.avatar}>U</div>
                    {/* <span style={{ fontSize: '14px', color: 'var(--text-medium)' }}>Usuário</span> */}
                </div>
            </div>
        </header>
    );
};

export default Header;
