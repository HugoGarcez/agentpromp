import React, { useState, useEffect } from 'react';
import { Search, Download, MapPin, Star, Phone, Globe, Filter, AlertTriangle, CheckCircle, XCircle, Loader, ExternalLink } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const LeadFinder = () => {
    const { user } = useAuth();

    // Form state
    const [segment, setSegment] = useState('');
    const [region, setRegion] = useState('');
    const [radius, setRadius] = useState(5000);
    const [maxResults, setMaxResults] = useState(20);

    // Results state
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [searchDone, setSearchDone] = useState(false);
    const [fromCache, setFromCache] = useState(false);

    // Table state
    const [selectedLeads, setSelectedLeads] = useState(new Set());
    const [sortBy, setSortBy] = useState('rating'); // rating, totalRatings
    const [sortDir, setSortDir] = useState('desc');
    const [filterActive, setFilterActive] = useState(false);
    const [stats, setStats] = useState({ searchCount: 0, freeLimit: 3, balance: 0, isBlocked: false });
    const [recharging, setRecharging] = useState(false);

    const fetchStats = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/leads/stats', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) setStats(data);
        } catch (e) {
            console.error('Erro ao buscar stats:', e);
        }
    };

    useEffect(() => {
        fetchStats();
    }, []);

    const handleSearch = async () => {
        if (!segment.trim() || !region.trim()) {
            setError('Preencha o ramo de atuação e a região.');
            return;
        }

        setLoading(true);
        setError('');
        setLeads([]);
        setSelectedLeads(new Set());
        setSearchDone(false);

        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/leads/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ segment, region, radius, maxResults })
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Erro desconhecido na busca.');
                return;
            }

            setLeads(data.leads || []);
            setFromCache(data.fromCache || false);
            setSearchDone(true);

            if (data.leads?.length === 0) {
                setError(data.message || `Nenhum resultado para "${segment}" em "${region}".`);
            }
        } catch (e) {
            setError(`Erro de conexão: ${e.message}`);
        } finally {
            setLoading(false);
            fetchStats();
        }
    };

    const handleReleaseCredits = async () => {
        setRecharging(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/payments/asaas/create-charge', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok && data.invoiceUrl) {
                window.open(data.invoiceUrl, '_blank');
            } else {
                alert(data.error || 'Erro ao gerar cobrança. Verifique as configurações do Asaas no Admin.');
            }
        } catch (e) {
            alert('Erro de conexão ao gerar cobrança.');
        } finally {
            setRecharging(false);
        }
    };

    // Sorting & Filtering
    const getFilteredSortedLeads = () => {
        let filtered = [...leads];

        if (filterActive) {
            filtered = filtered.filter(l => l.status === 'OPERATIONAL');
        }

        filtered.sort((a, b) => {
            const aVal = sortBy === 'rating' ? a.rating : a.totalRatings;
            const bVal = sortBy === 'rating' ? b.rating : b.totalRatings;
            return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
        });

        return filtered;
    };

    // Selection
    const toggleSelectAll = () => {
        const filtered = getFilteredSortedLeads();
        if (selectedLeads.size === filtered.length) {
            setSelectedLeads(new Set());
        } else {
            setSelectedLeads(new Set(filtered.map(l => l.id)));
        }
    };

    const toggleSelect = (id) => {
        const next = new Set(selectedLeads);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedLeads(next);
    };

    // CSV Export
    const exportCSV = () => {
        const filtered = getFilteredSortedLeads();
        const toExport = selectedLeads.size > 0
            ? filtered.filter(l => selectedLeads.has(l.id))
            : filtered;

        if (toExport.length === 0) return;

        const statusMap = {
            'OPERATIONAL': 'Ativo',
            'CLOSED_TEMPORARILY': 'Fechado Temporariamente',
            'CLOSED_PERMANENTLY': 'Fechado',
            'UNKNOWN': 'Desconhecido'
        };

        const headers = 'Nome,Endereço,Telefone,Website,Avaliação,Nº Avaliações,Status,Google Maps URL';
        const rows = toExport.map(l => {
            const escapeCsv = (str) => `"${String(str).replace(/"/g, '""')}"`;
            return [
                escapeCsv(l.name),
                escapeCsv(l.address),
                escapeCsv(l.phone),
                escapeCsv(l.website),
                l.rating,
                l.totalRatings,
                escapeCsv(statusMap[l.status] || l.status),
                escapeCsv(l.googleMapsUrl)
            ].join(',');
        });

        // UTF-8 BOM for Excel compatibility
        const BOM = '\uFEFF';
        const csvContent = BOM + headers + '\n' + rows.join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');

        const safeSegment = segment.replace(/\s+/g, '-').toLowerCase().substring(0, 30);
        const safeRegion = region.replace(/\s+/g, '-').replace(/,/g, '').toLowerCase().substring(0, 30);
        const dateStr = new Date().toISOString().split('T')[0];
        a.href = url;
        a.download = `leads_${safeSegment}_${safeRegion}_${dateStr}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const getStatusBadge = (status) => {
        const map = {
            'OPERATIONAL': { label: 'Ativo', color: '#10B981', bg: '#ECFDF5' },
            'CLOSED_TEMPORARILY': { label: 'Fechado Temp.', color: '#F59E0B', bg: '#FFFBEB' },
            'CLOSED_PERMANENTLY': { label: 'Fechado', color: '#EF4444', bg: '#FEF2F2' },
            'UNKNOWN': { label: '—', color: '#6B7280', bg: '#F3F4F6' }
        };
        const s = map[status] || map['UNKNOWN'];
        return (
            <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600,
                color: s.color, background: s.bg
            }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />
                {s.label}
            </span>
        );
    };

    const getRatingStars = (rating) => {
        if (!rating) return '—';
        const full = Math.floor(rating);
        const stars = [];
        for (let i = 0; i < 5; i++) {
            stars.push(
                <Star
                    key={i}
                    size={14}
                    fill={i < full ? '#F59E0B' : 'none'}
                    color={i < full ? '#F59E0B' : '#D1D5DB'}
                    style={{ marginRight: 1 }}
                />
            );
        }
        return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                {stars}
                <span style={{ fontWeight: 600, fontSize: '13px', color: '#374151' }}>{rating}</span>
            </span>
        );
    };

    const displayedLeads = getFilteredSortedLeads();

    return (
        <div style={{ padding: '0', maxWidth: '1200px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: '24px'
            }}>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-dark)' }}>
                        <div style={{
                            width: 40, height: 40, borderRadius: '12px',
                            background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
                        }}>
                            <Search size={20} color="white" />
                        </div>
                        Lead Finder
                    </h1>
                    <p style={{ color: 'var(--text-medium)', marginTop: '4px', fontSize: '14px' }}>
                        Encontre leads qualificados usando Google Maps. Prospecção inteligente por segmento e região.
                    </p>
                </div>
            </div>

            {/* Search Form */}
            <div style={{
                background: 'var(--bg-white)', borderRadius: '16px',
                padding: '28px', marginBottom: '24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
                border: '1px solid var(--border-color)'
            }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-medium)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Ramo de Atuação
                        </label>
                        <div style={{ position: 'relative' }}>
                            <MapPin size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
                            <input
                                type="text"
                                id="lead-segment"
                                value={segment}
                                onChange={(e) => setSegment(e.target.value)}
                                placeholder="Ex: restaurante, dentista, academia"
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                style={{
                                    width: '100%', padding: '12px 12px 12px 38px', borderRadius: '10px',
                                    border: '1px solid #E5E7EB', fontSize: '14px', transition: 'all 0.2s',
                                    background: 'var(--bg-main)', color: 'var(--text-dark)'
                                }}
                            />
                        </div>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-medium)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Região / Cidade
                        </label>
                        <div style={{ position: 'relative' }}>
                            <Globe size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
                            <input
                                type="text"
                                id="lead-region"
                                value={region}
                                onChange={(e) => setRegion(e.target.value)}
                                placeholder="Ex: Nova Friburgo, RJ"
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                style={{
                                    width: '100%', padding: '12px 12px 12px 38px', borderRadius: '10px',
                                    border: '1px solid #E5E7EB', fontSize: '14px', transition: 'all 0.2s',
                                    background: 'var(--bg-main)', color: 'var(--text-dark)'
                                }}
                            />
                        </div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-medium)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Raio de Busca
                        </label>
                        <select
                            id="lead-radius"
                            value={radius}
                            onChange={(e) => setRadius(Number(e.target.value))}
                            style={{
                                width: '100%', padding: '12px', borderRadius: '10px',
                                border: '1px solid #E5E7EB', fontSize: '14px',
                                background: 'var(--bg-main)', color: 'var(--text-dark)', cursor: 'pointer'
                            }}
                        >
                            <option value={1000}>1 km</option>
                            <option value={3000}>3 km</option>
                            <option value={5000}>5 km</option>
                            <option value={10000}>10 km</option>
                            <option value={20000}>20 km</option>
                            <option value={30000}>30 km</option>
                            <option value={50000}>50 km</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-medium)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Máx. Resultados
                        </label>
                        <select
                            id="lead-max-results"
                            value={maxResults}
                            onChange={(e) => setMaxResults(Number(e.target.value))}
                            style={{
                                width: '100%', padding: '12px', borderRadius: '10px',
                                border: '1px solid #E5E7EB', fontSize: '14px',
                                background: 'var(--bg-main)', color: 'var(--text-dark)', cursor: 'pointer'
                            }}
                        >
                            <option value={20}>20 leads</option>
                            <option value={40}>40 leads</option>
                            <option value={60}>60 leads</option>
                        </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <button
                            id="lead-search-btn"
                            onClick={handleSearch}
                            disabled={loading}
                            style={{
                                width: '100%', padding: '12px 24px', borderRadius: '10px',
                                background: loading ? '#9CA3AF' : 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                                color: 'white', fontWeight: 600, fontSize: '14px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                transition: 'all 0.3s ease',
                                boxShadow: loading ? 'none' : '0 4px 12px rgba(99, 102, 241, 0.3)',
                                border: 'none'
                            }}
                        >
                            {loading ? (
                                <>
                                    <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} />
                                    Buscando...
                                </>
                            ) : (
                                <>
                                    <Search size={18} />
                                    Buscar Leads
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Limit Info */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', borderRadius: '10px',
                    background: stats.isBlocked ? '#FEF2F2' : '#F0F9FF', 
                    border: `1px solid ${stats.isBlocked ? '#FECACA' : '#BAE6FD'}`,
                    fontSize: '13px', color: stats.isBlocked ? '#991B1B' : '#0369A1'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AlertTriangle size={16} />
                        <span>
                            {stats.isBlocked 
                                ? <strong>Limite atingido!</strong>
                                : <>Você usou <strong>{stats.searchCount} de {stats.freeLimit}</strong> consultas gratuitas esta semana.</>
                            }
                        </span>
                    </div>
                    {stats.balance > 0 && (
                        <div style={{ 
                            background: '#10B981', color: 'white', padding: '2px 8px', 
                            borderRadius: '6px', fontSize: '11px', fontWeight: 700 
                        }}>
                            +{stats.balance} CONSULTAS EXTRAS
                        </div>
                    )}
                </div>
            </div>

            {/* Error Message & Limit Block */}
            {error && (
                <div style={{
                    display: 'flex', flexDirection: 'column', gap: '16px',
                    padding: '24px', borderRadius: '16px', marginBottom: '24px',
                    background: error === 'LIMIT_REACHED' ? '#EEF2FF' : '#FEF2F2',
                    border: `1px solid ${error === 'LIMIT_REACHED' ? '#C7D2FE' : '#FECACA'}`,
                    color: error === 'LIMIT_REACHED' ? '#3730A3' : '#991B1B',
                    animation: 'fadeIn 0.3s ease'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {error === 'LIMIT_REACHED' ? <AlertTriangle size={24} /> : <XCircle size={24} />}
                        <div style={{ flex: 1 }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>
                                {error === 'LIMIT_REACHED' ? 'Limite de Consultas Atingido' : 'Erro na Busca'}
                            </h3>
                            <p style={{ fontSize: '14px', opacity: 0.9 }}>
                                {error === 'LIMIT_REACHED' 
                                    ? 'Você atingiu o limite de 3 consultas gratuitas desta semana. Adquira mais consultas para continuar prospectando imediatamente.'
                                    : error}
                            </p>
                        </div>
                    </div>
                    
                    {error === 'LIMIT_REACHED' && (
                        <div style={{ 
                            display: 'flex', alignItems: 'center', gap: '12px', 
                            padding: '16px', background: 'white', borderRadius: '12px'
                        }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: '#6366F1', textTransform: 'uppercase' }}>Pacote Extra</div>
                                <div style={{ fontSize: '18px', fontWeight: 800 }}>+3 Consultas</div>
                                <div style={{ fontSize: '14px', color: '#6B7280' }}>R$ 19,90 pago uma única vez</div>
                            </div>
                            <button 
                                onClick={handleReleaseCredits}
                                disabled={recharging}
                                style={{
                                    padding: '12px 24px', borderRadius: '10px',
                                    background: recharging ? '#94A3B8' : 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                                    color: 'white', fontWeight: 700, fontSize: '14px',
                                    border: 'none', cursor: recharging ? 'not-allowed' : 'pointer',
                                    boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)',
                                    display: 'flex', alignItems: 'center', gap: '8px'
                                }}
                            >
                                {recharging ? <><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Gerando...</> : 'Liberar Agora'}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Loading State */}
            {loading && (
                <div style={{
                    background: 'var(--bg-white)', borderRadius: '16px',
                    padding: '60px', textAlign: 'center',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    border: '1px solid var(--border-color)'
                }}>
                    <Loader size={40} color="#6366F1" style={{ animation: 'spin 1.2s linear infinite', marginBottom: '16px' }} />
                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-dark)', marginBottom: '8px' }}>Buscando leads...</h3>
                    <p style={{ color: 'var(--text-medium)', fontSize: '13px' }}>
                        Geocodificando região, buscando locais e obtendo detalhes. Isso pode levar alguns segundos.
                    </p>
                </div>
            )}

            {/* Results */}
            {searchDone && leads.length > 0 && !loading && (
                <div style={{
                    background: 'var(--bg-white)', borderRadius: '16px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    border: '1px solid var(--border-color)',
                    overflow: 'hidden'
                }}>
                    {/* Results Header */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '16px 24px', borderBottom: '1px solid var(--border-color)',
                        background: 'var(--bg-main)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-dark)' }}>
                                {displayedLeads.length} leads encontrados
                            </span>
                            {fromCache && (
                                <span style={{
                                    fontSize: '11px', padding: '3px 8px', borderRadius: '6px',
                                    background: '#DBEAFE', color: '#1E40AF', fontWeight: 600
                                }}>
                                    Cache
                                </span>
                            )}
                            {selectedLeads.size > 0 && (
                                <span style={{
                                    fontSize: '12px', padding: '3px 10px', borderRadius: '6px',
                                    background: '#EDE9FE', color: '#5B21B6', fontWeight: 600
                                }}>
                                    {selectedLeads.size} selecionados
                                </span>
                            )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            {/* Filter Active Only */}
                            <label style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                fontSize: '13px', color: 'var(--text-medium)', cursor: 'pointer'
                            }}>
                                <input
                                    type="checkbox"
                                    checked={filterActive}
                                    onChange={(e) => setFilterActive(e.target.checked)}
                                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                                />
                                <Filter size={14} />
                                Somente ativos
                            </label>

                            {/* Sort */}
                            <select
                                value={`${sortBy}_${sortDir}`}
                                onChange={(e) => {
                                    const [by, dir] = e.target.value.split('_');
                                    setSortBy(by);
                                    setSortDir(dir);
                                }}
                                style={{
                                    padding: '6px 10px', borderRadius: '8px', fontSize: '13px',
                                    border: '1px solid #E5E7EB', cursor: 'pointer',
                                    background: 'var(--bg-white)', color: 'var(--text-dark)'
                                }}
                            >
                                <option value="rating_desc">⭐ Melhor avaliação</option>
                                <option value="rating_asc">⭐ Menor avaliação</option>
                                <option value="totalRatings_desc">📊 Mais avaliações</option>
                                <option value="totalRatings_asc">📊 Menos avaliações</option>
                            </select>

                            {/* Export CSV */}
                            <button
                                id="lead-export-csv"
                                onClick={exportCSV}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '8px 16px', borderRadius: '8px',
                                    background: '#10B981', color: 'white', fontWeight: 600,
                                    fontSize: '13px', cursor: 'pointer', border: 'none',
                                    transition: 'all 0.2s', boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)'
                                }}
                            >
                                <Download size={16} />
                                Baixar CSV
                            </button>
                        </div>
                    </div>

                    {/* Table */}
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-main)', borderBottom: '2px solid var(--border-color)' }}>
                                    <th style={{ padding: '12px 16px', textAlign: 'center', width: '40px' }}>
                                        <input
                                            type="checkbox"
                                            checked={displayedLeads.length > 0 && selectedLeads.size === displayedLeads.length}
                                            onChange={toggleSelectAll}
                                            style={{ width: 16, height: 16, cursor: 'pointer' }}
                                        />
                                    </th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-medium)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>#</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-medium)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Nome</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-medium)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Endereço</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-medium)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Telefone</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-medium)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Site</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--text-medium)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Avaliação</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--text-medium)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--text-medium)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Maps</th>
                                </tr>
                            </thead>
                            <tbody>
                                {displayedLeads.map((lead, idx) => (
                                    <tr
                                        key={lead.id}
                                        style={{
                                            borderBottom: '1px solid var(--border-color)',
                                            background: selectedLeads.has(lead.id) ? '#F5F3FF' : (idx % 2 === 0 ? 'var(--bg-white)' : 'var(--bg-main)'),
                                            transition: 'background 0.15s'
                                        }}
                                        onMouseOver={(e) => { if (!selectedLeads.has(lead.id)) e.currentTarget.style.background = '#F9FAFB'; }}
                                        onMouseOut={(e) => { if (!selectedLeads.has(lead.id)) e.currentTarget.style.background = idx % 2 === 0 ? 'var(--bg-white)' : 'var(--bg-main)'; }}
                                    >
                                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={selectedLeads.has(lead.id)}
                                                onChange={() => toggleSelect(lead.id)}
                                                style={{ width: 16, height: 16, cursor: 'pointer' }}
                                            />
                                        </td>
                                        <td style={{ padding: '12px 16px', color: 'var(--text-medium)', fontWeight: 500 }}>{idx + 1}</td>
                                        <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-dark)', maxWidth: '200px' }}>
                                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.name}</div>
                                        </td>
                                        <td style={{ padding: '12px 16px', color: 'var(--text-medium)', maxWidth: '220px' }}>
                                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.address}</div>
                                        </td>
                                        <td style={{ padding: '12px 16px', color: 'var(--text-dark)' }}>
                                            {lead.phone ? (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                    <Phone size={12} color="#6B7280" />
                                                    {lead.phone}
                                                </span>
                                            ) : (
                                                <span style={{ color: '#D1D5DB' }}>—</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            {lead.website ? (
                                                <a
                                                    href={lead.website}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    style={{
                                                        color: '#6366F1', fontWeight: 500, fontSize: '12px',
                                                        display: 'inline-flex', alignItems: 'center', gap: '3px',
                                                        maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                                    }}
                                                >
                                                    <Globe size={12} />
                                                    {lead.website.replace(/https?:\/\/(www\.)?/, '').split('/')[0]}
                                                </a>
                                            ) : (
                                                <span style={{ color: '#D1D5DB' }}>—</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                                {getRatingStars(lead.rating)}
                                                <span style={{ fontSize: '11px', color: '#9CA3AF' }}>({lead.totalRatings})</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                            {getStatusBadge(lead.status)}
                                        </td>
                                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                            <a
                                                href={lead.googleMapsUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                    width: 28, height: 28, borderRadius: '8px',
                                                    background: '#EEF2FF', color: '#6366F1',
                                                    transition: 'all 0.2s'
                                                }}
                                                title="Abrir no Google Maps"
                                            >
                                                <ExternalLink size={14} />
                                            </a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Empty State (search done, no leads, no error) */}
            {searchDone && leads.length === 0 && !error && !loading && (
                <div style={{
                    background: 'var(--bg-white)', borderRadius: '16px',
                    padding: '60px', textAlign: 'center',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    border: '1px solid var(--border-color)'
                }}>
                    <MapPin size={40} color="#D1D5DB" style={{ marginBottom: '12px' }} />
                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-dark)', marginBottom: '8px' }}>Nenhum lead encontrado</h3>
                    <p style={{ color: 'var(--text-medium)', fontSize: '13px' }}>
                        Tente aumentar o raio de busca ou usar um termo diferente.
                    </p>
                </div>
            )}

            {/* Keyframe for spin animation */}
            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
};

export default LeadFinder;
