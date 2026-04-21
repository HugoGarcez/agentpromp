import React, { useState, useEffect, useCallback } from 'react';
import { KanbanSquare, Play, Pause, Save, RefreshCw, ChevronRight, X, Settings2, Zap, Activity } from 'lucide-react';

const API = (path, opts = {}) => {
    const token = localStorage.getItem('token');
    return fetch(path, {
        ...opts,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, ...(opts.headers || {}) },
    }).then(r => r.json());
};

// ─── Stage Config Modal ───────────────────────────────────────────────────────

const StageModal = ({ stage, onSave, onClose }) => {
    const [condition, setCondition] = useState(stage.advanceCondition || '');
    const [waitingDays, setWaitingDays] = useState(stage.waitingDays ?? 0);

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: 'var(--bg-white)', borderRadius: 'var(--radius-lg)', padding: 24, width: '100%', maxWidth: 520, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h3 style={{ color: 'var(--text-dark)', margin: 0 }}>
                        <Settings2 size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                        Configurar: {stage.stageName}
                    </h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-medium)' }}>
                        <X size={20} />
                    </button>
                </div>

                <label style={{ display: 'block', marginBottom: 6, color: 'var(--text-medium)', fontSize: 13 }}>
                    Condição para avançar (linguagem natural)
                </label>
                <textarea
                    value={condition}
                    onChange={e => setCondition(e.target.value)}
                    placeholder="Ex: Quando o lead confirmar interesse e informar o CNPJ..."
                    rows={4}
                    style={{
                        width: '100%', padding: 10, borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-color)', background: 'var(--bg-main)',
                        color: 'var(--text-dark)', fontSize: 14, resize: 'vertical', boxSizing: 'border-box',
                    }}
                />

                <label style={{ display: 'block', marginTop: 16, marginBottom: 6, color: 'var(--text-medium)', fontSize: 13 }}>
                    Dias máximos na etapa (0 = sem limite)
                </label>
                <input
                    type="number"
                    min={0}
                    value={waitingDays}
                    onChange={e => setWaitingDays(Number(e.target.value))}
                    style={{
                        width: 100, padding: 8, borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-color)', background: 'var(--bg-main)',
                        color: 'var(--text-dark)', fontSize: 14,
                    }}
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
                    <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-medium)', cursor: 'pointer' }}>
                        Cancelar
                    </button>
                    <button
                        onClick={() => onSave({ ...stage, advanceCondition: condition, waitingDays })}
                        style={{ padding: '8px 18px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary-blue)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                        <Save size={15} /> Salvar Condição
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Entry Trigger Modal ──────────────────────────────────────────────────────

const EntryTriggerModal = ({ trigger, stages, onSave, onClose }) => {
    const [condition, setCondition] = useState(trigger?.condition || '');
    const [defaultStageId, setDefaultStageId] = useState(trigger?.defaultStageId || stages[0]?.stageId || '');
    const [defaultValue, setDefaultValue] = useState(trigger?.defaultValue || '');

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: 'var(--bg-white)', borderRadius: 'var(--radius-lg)', padding: 24, width: '100%', maxWidth: 520, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h3 style={{ color: 'var(--text-dark)', margin: 0 }}>
                        <Zap size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                        Gatilho de Entrada no Funil
                    </h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-medium)' }}>
                        <X size={20} />
                    </button>
                </div>

                <label style={{ display: 'block', marginBottom: 6, color: 'var(--text-medium)', fontSize: 13 }}>
                    Condição para criar oportunidade (linguagem natural)
                </label>
                <textarea
                    value={condition}
                    onChange={e => setCondition(e.target.value)}
                    placeholder="Ex: Quando um novo lead mencionar interesse em produtos VAR pelo WhatsApp..."
                    rows={4}
                    style={{
                        width: '100%', padding: 10, borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-color)', background: 'var(--bg-main)',
                        color: 'var(--text-dark)', fontSize: 14, resize: 'vertical', boxSizing: 'border-box',
                    }}
                />

                <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
                    <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', marginBottom: 6, color: 'var(--text-medium)', fontSize: 13 }}>Etapa inicial</label>
                        <select
                            value={defaultStageId}
                            onChange={e => setDefaultStageId(Number(e.target.value))}
                            style={{ width: '100%', padding: 8, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-dark)', fontSize: 14 }}
                        >
                            {stages.map(s => <option key={s.stageId} value={s.stageId}>{s.stageName}</option>)}
                        </select>
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', marginBottom: 6, color: 'var(--text-medium)', fontSize: 13 }}>Valor padrão (R$)</label>
                        <input
                            type="number"
                            min={0}
                            value={defaultValue}
                            onChange={e => setDefaultValue(Number(e.target.value))}
                            placeholder="0"
                            style={{ width: '100%', padding: 8, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-dark)', fontSize: 14, boxSizing: 'border-box' }}
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
                    <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-medium)', cursor: 'pointer' }}>
                        Cancelar
                    </button>
                    <button
                        onClick={() => onSave({ condition, defaultStageId: Number(defaultStageId), defaultValue: defaultValue || undefined })}
                        style={{ padding: '8px 18px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary-blue)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                        <Save size={15} /> Salvar Gatilho
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const CRMAutomation = () => {
    const [tab, setTab] = useState('config');
    const [pipelines, setPipelines] = useState([]);
    const [selectedPipeline, setSelectedPipeline] = useState(null);
    const [stages, setStages] = useState([]);
    const [entryTrigger, setEntryTrigger] = useState(null);
    const [automationId, setAutomationId] = useState(null);
    const [isActive, setIsActive] = useState(true);
    const [stageModal, setStageModal] = useState(null);
    const [showEntryModal, setShowEntryModal] = useState(false);
    const [monitor, setMonitor] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState(null);

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    };

    // Load pipelines
    useEffect(() => {
        API('/api/crm-automation/pipelines')
            .then(data => {
                const list = data?.data?.data || data?.data || [];
                setPipelines(list);
            })
            .catch(() => showToast('Erro ao carregar pipelines. Verifique as credenciais Promp.', 'error'));
    }, []);

    // Load saved config when pipeline changes
    const loadConfig = useCallback(async (pipeline) => {
        if (!pipeline) return;
        setLoading(true);
        try {
            const cfgData = await API(`/api/crm-automation/config?pipelineId=${pipeline.id}`);
            const existing = cfgData?.data?.[0];
            if (existing) {
                setAutomationId(existing.id);
                setIsActive(existing.isActive);
                const savedStages = JSON.parse(existing.stages || '[]');
                // Merge saved conditions into pipeline stages
                const merged = (pipeline.stages || []).map((ps, i) => {
                    const saved = savedStages.find(s => s.stageId === ps.id);
                    return {
                        stageId: ps.id,
                        stageName: ps.name,
                        stageOrder: ps.order ?? i,
                        advanceCondition: saved?.advanceCondition || '',
                        waitingDays: saved?.waitingDays ?? 0,
                    };
                });
                setStages(merged);
                setEntryTrigger(existing.entryTrigger ? JSON.parse(existing.entryTrigger) : null);
            } else {
                setAutomationId(null);
                setIsActive(true);
                setEntryTrigger(null);
                const fresh = (pipeline.stages || []).map((ps, i) => ({
                    stageId: ps.id,
                    stageName: ps.name,
                    stageOrder: ps.order ?? i,
                    advanceCondition: '',
                    waitingDays: 0,
                }));
                setStages(fresh);
            }
        } catch {
            showToast('Erro ao carregar configuração.', 'error');
        } finally {
            setLoading(false);
        }
    }, []);

    const handlePipelineChange = (e) => {
        const pl = pipelines.find(p => String(p.id) === e.target.value);
        setSelectedPipeline(pl || null);
        if (pl) loadConfig(pl);
    };

    // Load monitor
    const loadMonitor = useCallback(async () => {
        setLoading(true);
        try {
            const q = selectedPipeline ? `?pipelineId=${selectedPipeline.id}` : '';
            const data = await API(`/api/crm-automation/monitor${q}`);
            setMonitor(data?.data || []);
        } catch {
            showToast('Erro ao carregar monitor.', 'error');
        } finally {
            setLoading(false);
        }
    }, [selectedPipeline]);

    useEffect(() => {
        if (tab === 'monitor') loadMonitor();
    }, [tab, loadMonitor]);

    const handleSaveStage = (updated) => {
        setStages(prev => prev.map(s => s.stageId === updated.stageId ? updated : s));
        setStageModal(null);
    };

    const handleSave = async () => {
        if (!selectedPipeline) return showToast('Selecione um pipeline primeiro.', 'error');
        setSaving(true);
        try {
            const payload = {
                pipelineId: selectedPipeline.id,
                pipelineName: selectedPipeline.name,
                stages,
                entryTrigger,
                isActive,
            };
            let res;
            if (automationId) {
                res = await API(`/api/crm-automation/config/${automationId}`, { method: 'PUT', body: JSON.stringify(payload) });
            } else {
                res = await API('/api/crm-automation/config', { method: 'POST', body: JSON.stringify(payload) });
                if (res.success) setAutomationId(res.data.id);
            }
            if (res.success) {
                showToast('Configuração salva com sucesso!');
            } else {
                showToast(res.message || 'Erro ao salvar.', 'error');
            }
        } catch {
            showToast('Erro ao salvar configuração.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleToggleActive = async () => {
        if (!automationId) return;
        const newVal = !isActive;
        try {
            await API(`/api/crm-automation/config/${automationId}`, { method: 'PUT', body: JSON.stringify({ isActive: newVal }) });
            setIsActive(newVal);
            showToast(newVal ? 'Automação ativada.' : 'Automação pausada.');
        } catch {
            showToast('Erro ao alterar status.', 'error');
        }
    };

    const handleForceEvaluate = async (oppId) => {
        try {
            const res = await API(`/api/crm-automation/evaluate/${oppId}`, { method: 'POST' });
            if (res.success) {
                showToast(`Avaliação: ${res.evaluation.action} — ${res.evaluation.reasoning}`);
            } else {
                showToast(res.message || 'Erro na avaliação.', 'error');
            }
        } catch {
            showToast('Erro ao avaliar.', 'error');
        }
    };

    const configuredCount = stages.filter(s => s.advanceCondition).length;

    return (
        <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>

            {/* Toast */}
            {toast && (
                <div style={{
                    position: 'fixed', top: 24, right: 24, zIndex: 9999,
                    padding: '12px 20px', borderRadius: 'var(--radius-md)',
                    background: toast.type === 'error' ? '#ef4444' : '#22c55e',
                    color: '#fff', fontSize: 14, boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                }}>
                    {toast.msg}
                </div>
            )}

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                <div>
                    <h1 style={{ color: 'var(--text-dark)', margin: 0, fontSize: 22, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <KanbanSquare size={24} /> CRM IA
                    </h1>
                    <p style={{ color: 'var(--text-medium)', margin: '4px 0 0', fontSize: 14 }}>
                        Automação inteligente de funil de vendas com IA
                    </p>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '2px solid var(--border-color)', marginBottom: 24 }}>
                {[
                    { key: 'config', label: 'Configuração', icon: <Settings2 size={16} /> },
                    { key: 'monitor', label: 'Monitor', icon: <Activity size={16} /> },
                ].map(t => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        style={{
                            padding: '10px 20px', border: 'none', cursor: 'pointer',
                            background: 'transparent', display: 'flex', alignItems: 'center', gap: 6,
                            color: tab === t.key ? 'var(--primary-blue)' : 'var(--text-medium)',
                            borderBottom: tab === t.key ? '2px solid var(--primary-blue)' : '2px solid transparent',
                            marginBottom: -2, fontSize: 14, fontWeight: tab === t.key ? 600 : 400,
                        }}
                    >
                        {t.icon} {t.label}
                    </button>
                ))}
            </div>

            {/* ── CONFIG TAB ── */}
            {tab === 'config' && (
                <>
                    {/* Pipeline selector */}
                    <div style={{ background: 'var(--bg-white)', borderRadius: 'var(--radius-lg)', padding: 20, marginBottom: 20, border: '1px solid var(--border-color)' }}>
                        <label style={{ display: 'block', marginBottom: 8, color: 'var(--text-medium)', fontSize: 13 }}>Pipeline</label>
                        <select
                            value={selectedPipeline?.id || ''}
                            onChange={handlePipelineChange}
                            style={{ width: '100%', maxWidth: 380, padding: 10, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-dark)', fontSize: 14 }}
                        >
                            <option value="">Selecionar pipeline...</option>
                            {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>

                        {selectedPipeline && automationId && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
                                <span style={{ fontSize: 13, color: isActive ? '#22c55e' : 'var(--text-medium)' }}>
                                    {isActive ? '● Ativo' : '○ Pausado'}
                                </span>
                                <button
                                    onClick={handleToggleActive}
                                    style={{ padding: '6px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-medium)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
                                >
                                    {isActive ? <><Pause size={14} /> Pausar</> : <><Play size={14} /> Ativar</>}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Stages */}
                    {selectedPipeline && !loading && stages.length > 0 && (
                        <>
                            <div style={{ marginBottom: 12 }}>
                                <h3 style={{ color: 'var(--text-dark)', margin: '0 0 4px', fontSize: 16 }}>Etapas do Funil</h3>
                                <p style={{ color: 'var(--text-medium)', margin: 0, fontSize: 13 }}>
                                    {configuredCount}/{stages.length} etapas configuradas
                                </p>
                            </div>

                            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, marginBottom: 20 }}>
                                {stages.map((stage, i) => (
                                    <div key={stage.stageId} style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                        <div style={{
                                            background: 'var(--bg-white)', border: `2px solid ${stage.advanceCondition ? 'var(--primary-blue)' : 'var(--border-color)'}`,
                                            borderRadius: 'var(--radius-lg)', padding: 16, width: 160,
                                        }}>
                                            <div style={{ fontSize: 12, color: 'var(--text-medium)', marginBottom: 4 }}>Etapa {i + 1}</div>
                                            <div style={{ fontWeight: 600, color: 'var(--text-dark)', fontSize: 14, marginBottom: 10, wordBreak: 'break-word' }}>
                                                {stage.stageName}
                                            </div>
                                            {stage.advanceCondition ? (
                                                <div style={{ fontSize: 11, color: 'var(--primary-blue)', marginBottom: 10, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                    {stage.advanceCondition}
                                                </div>
                                            ) : (
                                                <div style={{ fontSize: 11, color: 'var(--text-medium)', marginBottom: 10 }}>Sem condição definida</div>
                                            )}
                                            <button
                                                onClick={() => setStageModal(stage)}
                                                style={{ width: '100%', padding: '6px 0', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-medium)', cursor: 'pointer', fontSize: 12 }}
                                            >
                                                <Settings2 size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                                                Configurar
                                            </button>
                                        </div>
                                        {i < stages.length - 1 && <ChevronRight size={18} color="var(--text-medium)" />}
                                    </div>
                                ))}
                            </div>

                            {/* Entry trigger */}
                            <div style={{ background: 'var(--bg-white)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontWeight: 600, color: 'var(--text-dark)', fontSize: 14 }}>
                                        <Zap size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                                        Gatilho de Entrada
                                    </div>
                                    <div style={{ fontSize: 13, color: 'var(--text-medium)', marginTop: 4 }}>
                                        {entryTrigger?.condition || 'Não configurado'}
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowEntryModal(true)}
                                    style={{ padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-medium)', cursor: 'pointer', fontSize: 13, flexShrink: 0 }}
                                >
                                    Configurar
                                </button>
                            </div>

                            {/* Save button */}
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                style={{ padding: '10px 24px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary-blue)', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, opacity: saving ? 0.7 : 1 }}
                            >
                                <Save size={16} /> {saving ? 'Salvando...' : 'Salvar Configuração'}
                            </button>
                        </>
                    )}

                    {loading && <p style={{ color: 'var(--text-medium)' }}>Carregando...</p>}
                    {!selectedPipeline && !loading && (
                        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-medium)' }}>
                            <KanbanSquare size={48} style={{ marginBottom: 12, opacity: 0.3 }} />
                            <p>Selecione um pipeline para configurar a automação.</p>
                        </div>
                    )}
                </>
            )}

            {/* ── MONITOR TAB ── */}
            {tab === 'monitor' && (
                <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h3 style={{ color: 'var(--text-dark)', margin: 0 }}>Oportunidades em Automação</h3>
                        <button
                            onClick={loadMonitor}
                            style={{ padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-medium)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
                        >
                            <RefreshCw size={14} /> Atualizar
                        </button>
                    </div>

                    {loading && <p style={{ color: 'var(--text-medium)' }}>Carregando...</p>}

                    {!loading && monitor.length === 0 && (
                        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-medium)' }}>
                            <Activity size={48} style={{ marginBottom: 12, opacity: 0.3 }} />
                            <p>Nenhuma oportunidade ativa no momento.</p>
                        </div>
                    )}

                    {!loading && monitor.length > 0 && (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                                        {['Lead', 'Oportunidade', 'Etapa Atual', 'Dias', 'Última Avaliação', 'Ação'].map(h => (
                                            <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-medium)', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {monitor.map(opp => {
                                        const days = Math.floor((Date.now() - new Date(opp.stageEnteredAt).getTime()) / 86_400_000);
                                        const lastEval = opp.lastEvaluatedAt ? new Date(opp.lastEvaluatedAt).toLocaleString('pt-BR') : '—';
                                        return (
                                            <tr key={opp.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                <td style={{ padding: '10px 12px', color: 'var(--text-dark)', fontWeight: 600 }}>{opp.contactName}</td>
                                                <td style={{ padding: '10px 12px', color: 'var(--text-medium)' }}>{opp.opportunityName}</td>
                                                <td style={{ padding: '10px 12px' }}>
                                                    <span style={{ background: 'var(--bg-main)', padding: '3px 8px', borderRadius: 20, fontSize: 12, color: 'var(--primary-blue)' }}>
                                                        {opp.currentStageName}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '10px 12px', color: days > 7 ? '#ef4444' : 'var(--text-medium)' }}>{days}d</td>
                                                <td style={{ padding: '10px 12px', color: 'var(--text-medium)', fontSize: 12 }}>{lastEval}</td>
                                                <td style={{ padding: '10px 12px' }}>
                                                    <button
                                                        onClick={() => handleForceEvaluate(opp.id)}
                                                        title="Forçar avaliação da IA"
                                                        style={{ padding: '5px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--primary-blue)', cursor: 'pointer', fontSize: 12 }}
                                                    >
                                                        Avaliar
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}

            {/* Modals */}
            {stageModal && (
                <StageModal
                    stage={stageModal}
                    onSave={handleSaveStage}
                    onClose={() => setStageModal(null)}
                />
            )}
            {showEntryModal && (
                <EntryTriggerModal
                    trigger={entryTrigger}
                    stages={stages}
                    onSave={(t) => { setEntryTrigger(t); setShowEntryModal(false); }}
                    onClose={() => setShowEntryModal(false)}
                />
            )}
        </div>
    );
};

export default CRMAutomation;
