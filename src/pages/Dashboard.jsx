import React, { useEffect, useState } from 'react';
import { Bot, Package, Zap, ExternalLink, ArrowRight, Activity, AlertCircle, ShoppingCart, Heart, Users, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Dashboard = () => {
    const navigate = useNavigate();
    const [config, setConfig] = useState(null);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState({ name: 'Usuário' }); // Fallback

    useEffect(() => {
        const fetchData = async () => {
            const token = localStorage.getItem('token');
            if (!token) return;

            try {
                // Fetch Config
                const resConfig = await fetch('/api/config', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (resConfig.ok) {
                    const data = await resConfig.json();
                    setConfig(data);
                }

                // Fetch Stats
                const resStats = await fetch('/api/stats', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (resStats.ok) {
                    const data = await resStats.json();
                    setStats(data);
                }

                // Fetch User for name
                const resUser = await fetch('/api/auth/me', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (resUser.ok) {
                    const data = await resUser.json();
                    if (data.user) setUser(data.user);
                }

            } catch (error) {
                console.error("Error loading dashboard data:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    // Derived Data
    const productsCount = config?.products?.length || 0;
    const personaName = config?.persona?.name || 'Assistente Padrão';
    const isAiActive = !!config?.integrations?.openaiKey;
    const isVoiceActive = !!config?.integrations?.elevenLabsKey;

    if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-medium)' }}>Carregando painel...</div>;

    return (
        <div style={{ paddingBottom: '40px' }}>
            {/* Header Section */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                <div>
                    <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '8px' }}>Bem-vindo, {user.email?.split('@')[0] || 'Usuário'}! 👋</h2>
                    <p style={{ color: 'var(--text-medium)' }}>Aqui está o resumo do seu Agente de Vendas hoje.</p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <a
                        href="https://app.promp.com.br"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '10px 16px',
                            background: 'var(--bg-white)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-md)',
                            color: 'var(--text-dark)',
                            textDecoration: 'none',
                            fontSize: '14px',
                            fontWeight: '500',
                            transition: 'all 0.2s',
                            boxShadow: 'var(--shadow-sm)'
                        }}
                    >
                        <ExternalLink size={16} />
                        Voltar para Painel
                    </a>
                </div>
            </div>

            {/* Dashboard Grid - Principais */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '32px' }}>

                {/* Card 1: AI Status */}
                <div style={{ background: 'var(--bg-white)', padding: '24px', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <div style={{ width: 40, height: 40, borderRadius: '8px', background: 'rgba(37, 99, 235, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Bot size={24} color="var(--primary-blue)" />
                        </div>
                        <span style={{
                            fontSize: '12px',
                            padding: '4px 8px',
                            borderRadius: '12px',
                            background: isAiActive ? '#DEF7EC' : '#FDE8E8',
                            color: isAiActive ? '#03543F' : '#9B1C1C',
                            height: 'fit-content'
                        }}>
                            {isAiActive ? 'Ativo' : 'Inativo'}
                        </span>
                    </div>
                    <h3 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-medium)', marginBottom: '4px' }}>Identidade da IA</h3>
                    <p style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>{personaName}</p>
                    <button
                        onClick={() => navigate('/ai-config')}
                        style={{ width: '100%', padding: '8px', background: 'var(--bg-main)', border: 'none', borderRadius: '6px', color: 'var(--primary-blue)', fontSize: '13px', fontWeight: '500', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    >
                        Editar Persona <ArrowRight size={14} />
                    </button>
                </div>

                {/* Card 2: Products */}
                <div style={{ background: 'var(--bg-white)', padding: '24px', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <div style={{ width: 40, height: 40, borderRadius: '8px', background: 'rgba(245, 158, 11, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Package size={24} color="#D97706" />
                        </div>
                        {productsCount === 0 && (
                            <div title="IA sem produtos" style={{ color: '#DC2626' }}><AlertCircle size={20} /></div>
                        )}
                    </div>
                    <h3 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-medium)', marginBottom: '4px' }}>Produtos Cadastrados</h3>
                    <p style={{ fontSize: '20px', fontWeight: '700', marginBottom: '16px' }}>{productsCount} <span style={{ fontSize: '13px', fontWeight: '400', color: 'var(--text-light)' }}>itens</span></p>
                    <button
                        onClick={() => navigate('/products')}
                        style={{ width: '100%', padding: '8px', background: 'var(--bg-main)', border: 'none', borderRadius: '6px', color: '#D97706', fontSize: '13px', fontWeight: '500', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    >
                        Gerenciar Catálogo <ArrowRight size={14} />
                    </button>
                </div>

                {/* Card 3: Quick Actions / Integrations */}
                <div style={{ background: 'var(--bg-white)', padding: '24px', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <div style={{ width: 40, height: 40, borderRadius: '8px', background: 'rgba(124, 58, 237, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Zap size={24} color="#7C3AED" />
                        </div>
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-medium)', marginBottom: '8px' }}>Integrações</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'var(--text-dark)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: isVoiceActive ? '#10B981' : '#E5E7EB' }}></div>
                                ElevenLabs (Voz): <strong>{isVoiceActive ? 'ON' : 'OFF'}</strong>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }}></div>
                                WhatsApp: <strong>Conectado</strong>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={() => navigate('/test-ai')}
                        style={{ width: '100%', padding: '10px', background: 'var(--primary-blue)', border: 'none', borderRadius: '6px', color: 'white', fontSize: '13px', fontWeight: '500', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    >
                        <Activity size={16} /> Testar Agente Agora
                    </button>
                </div>

            </div>

            {/* Stats Grid - Novas Métricas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>

                {/* Card 4: Produtos Mais Desejados */}
                <div style={{ background: 'var(--bg-white)', padding: '24px', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                        <div style={{ width: 32, height: 32, borderRadius: '6px', background: 'rgba(236, 72, 153, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Heart size={18} color="#EC4899" />
                        </div>
                        <h3 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-dark)' }}>Produtos mais desejados</h3>
                    </div>
                    {!stats?.desiredProducts?.length ? (
                        <p style={{ fontSize: '13px', color: 'var(--text-light)', textAlign: 'center', padding: '20px 0' }}>Sem dados suficientes ainda.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {stats.desiredProducts.map((p, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '14px', color: 'var(--text-medium)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%', fontWeight: '500' }}>{p.name}</span>
                                    <span style={{ fontSize: '12px', fontWeight: '600', background: 'var(--bg-main)', padding: '2px 8px', borderRadius: '10px', color: 'var(--text-medium)' }}>{p.count} pedidos</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Card 5: Produtos Mais Vendidos */}
                <div style={{ background: 'var(--bg-white)', padding: '24px', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                        <div style={{ width: 32, height: 32, borderRadius: '6px', background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <ShoppingCart size={18} color="#10B981" />
                        </div>
                        <h3 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-dark)' }}>Produtos mais vendidos</h3>
                    </div>
                    {!stats?.soldProducts?.length ? (
                        <p style={{ fontSize: '13px', color: 'var(--text-light)', textAlign: 'center', padding: '20px 0' }}>Sem vendas registradas ainda.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {stats.soldProducts.map((p, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '14px', color: 'var(--text-medium)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%', fontWeight: '500' }}>{p.name}</span>
                                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#10B981', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '10px' }}>{p.count} pagos</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Card 6: Clientes Mais Ativos */}
                <div style={{ background: 'var(--bg-white)', padding: '24px', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                        <div style={{ width: 32, height: 32, borderRadius: '6px', background: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Users size={18} color="#3B82F6" />
                        </div>
                        <h3 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-dark)' }}>Clientes mais ativos</h3>
                    </div>
                    {!stats?.activeCustomers?.length ? (
                        <p style={{ fontSize: '13px', color: 'var(--text-light)', textAlign: 'center', padding: '20px 0' }}>Buscando contatos...</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {stats.activeCustomers.map((c, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '13px', color: 'var(--text-medium)', fontFamily: 'monospace' }}>
                                        {c.session.length > 15 ? `...${c.session.slice(-9)}` : c.session}
                                    </span>
                                    <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-light)' }}>{c.count} mensagens</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Card 7: Tempo Poupado */}
                <div style={{ background: 'var(--bg-white)', padding: '24px', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(37, 99, 235, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                        <Clock size={24} color="var(--primary-blue)" />
                    </div>
                    <h3 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-medium)', marginBottom: '4px' }}>Tempo polpado com IA</h3>
                    <p style={{ fontSize: '28px', fontWeight: '800', color: 'var(--primary-blue)', marginBottom: '4px' }}>{stats?.timeSaved || '0h 0min'}</p>
                    <p style={{ fontSize: '12px', color: 'var(--text-light)' }}>Baseado em {stats?.totalAiMessages || 0} respostas automáticas</p>
                </div>

            </div>
        </div>
    );
};

export default Dashboard;
