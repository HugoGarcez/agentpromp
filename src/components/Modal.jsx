import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const Modal = ({ isOpen, onClose, title, children }) => {
    const modalRef = useRef(null);

    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape') onClose();
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handleBackdropClick = (e) => {
        if (modalRef.current && !modalRef.current.contains(e.target)) {
            onClose();
        }
    };

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                backdropFilter: 'blur(4px)'
            }}
            onClick={handleBackdropClick}
        >
            <div
                ref={modalRef}
                style={{
                    backgroundColor: 'var(--bg-white)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-xl)',
                    width: '100%',
                    maxWidth: '500px',
                    margin: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: '90vh',
                    position: 'relative'
                }}
            >
                <div style={{
                    padding: '20px',
                    borderBottom: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text-dark)' }}>
                        {title}
                    </h2>
                    <button onClick={onClose} style={{ color: 'var(--text-medium)', padding: '4px' }}>
                        <X size={20} />
                    </button>
                </div>

                <div style={{ padding: '24px', overflowY: 'auto' }}>
                    {children}
                </div>
            </div>
        </div>
    );
};

export default Modal;
