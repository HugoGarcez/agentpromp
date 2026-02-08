import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Package, Image as ImageIcon, Save, Loader2, FileText, CreditCard, Briefcase, Link as LinkIcon, ToggleLeft, ToggleRight, Bot } from 'lucide-react';

const ProductConfig = () => {
    const [showForm, setShowForm] = useState(false);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [config, setConfig] = useState(null);

    // AI Import State
    const [showImportModal, setShowImportModal] = useState(false);
    const [importUrl, setImportUrl] = useState('');
    const [importing, setImporting] = useState(false);
    const [importSchedule, setImportSchedule] = useState('once'); // 'once' | 'daily'

    // Scheduled Sources State
    const [sources, setSources] = useState([]);
    const [loadingSources, setLoadingSources] = useState(false);

    // Bulk Actions State
    const [selectedItems, setSelectedItems] = useState(new Set());

    const token = localStorage.getItem('token');

    // Fetch Sources when Modal Opens
    useEffect(() => {
        if (showImportModal && token) {
            fetchSources();
        }
    }, [showImportModal, token]);

    const fetchSources = async () => {
        setLoadingSources(true);
        try {
            const res = await fetch('/api/products/sources', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setSources(data);
            }
        } catch (error) {
            console.error("Error fetching sources:", error);
        } finally {
            setLoadingSources(false);
        }
    };

    const handleDeleteSource = async (id) => {
        if (!confirm("Parar monitoramento deste link?")) return;
        try {
            const res = await fetch(`/api/products/sources/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setSources(prev => prev.filter(s => s.id !== id));
            }
        } catch (error) {
            alert("Erro ao remover fonte.");
        }
    };

    // Fetch Products (and Services)
    useEffect(() => {
        if (!token) return;

        const fetchConfig = async () => {
            try {
                const response = await fetch('/api/config', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    setConfig(data);
                    // Ensure products exist
                    let serverItems = data.products || [];
                    setProducts(serverItems);
                }
            } catch (error) {
                console.error("Error loading config:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchConfig();
    }, [token]);

    const saveItemsToApi = async (newItems, currentConfig = config) => {
        setSaving(true);
        try {
            const payload = {
                ...currentConfig,
                products: newItems // We use the same 'products' array for both Products and Services
            };

            const response = await fetch('/api/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('Failed to save to server');

            setProducts(newItems);
            setConfig(payload);
            return true;
        } catch (error) {
            console.error("Error saving items:", error);
            alert("Erro ao salvar no servidor. Verifique sua conexão.");
            return false;
        } finally {
            setSaving(false);
        }
    };

    const initialFormState = {
        type: 'product', // 'product' | 'service'
        name: '',
        price: '',
        description: '',
        image: null,
        variantItems: [], // Only for Products

        // Service Specific
        paymentConditions: '',
        pdf: null, // Base64 PDF
        active: true, // NEW: Active Status

        // Common New Fields
        paymentLink: '',
        hasPaymentLink: false,

        // NEW: Unit & Payment Methods
        unit: 'Unidade',
        customUnit: '',
        paymentPrices: [
            { id: 'pix', label: 'Pix', active: false, price: '' },
            { id: 'cash', label: 'Dinheiro', active: false, price: '' },
            { id: 'card', label: 'Cartão', active: false, price: '' },
            { id: 'check', label: 'Cheque', active: false, price: '' },
            { id: 'presential', label: 'Presencial', active: false, price: '' }
        ]
    };

    const [formData, setFormData] = useState(initialFormState);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleTogglePaymentLink = () => {
        setFormData(prev => ({ ...prev, hasPaymentLink: !prev.hasPaymentLink }));
    };

    // --- BULK ACTION LOGIC ---
    const toggleSelect = (id) => {
        const newSelected = new Set(selectedItems);
        if (newSelected.has(id)) newSelected.delete(id);
        else newSelected.add(id);
        setSelectedItems(newSelected);
    };

    const toggleSelectAll = () => {
        if (selectedItems.size === products.length) {
            setSelectedItems(new Set());
        } else {
            setSelectedItems(new Set(products.map(p => p.id)));
        }
    };

    const handleBulkDelete = async () => {
        if (!confirm(`Excluir ${selectedItems.size} itens selecionados?`)) return;
        const newItems = products.filter(p => !selectedItems.has(p.id));
        if (await saveItemsToApi(newItems)) {
            setSelectedItems(new Set());
        }
    };

    const handleBulkToggle = async (status) => { // status: true (enable) or false (disable)
        const newItems = products.map(p => selectedItems.has(p.id) ? { ...p, active: status } : p);
        if (await saveItemsToApi(newItems)) {
            setSelectedItems(new Set());
        }
    };


    // --- VARIATION LOGIC (For Products) ---
    const addVariation = () => {
        const newId = `var_${Date.now()}`;
        const newVariant = { id: newId, name: '', price: formData.price, sku: '', image: null, color: '', size: '' };
        setFormData(prev => ({ ...prev, variantItems: [...(prev.variantItems || []), newVariant] }));
    };

    const updateVariation = (id, field, value) => {
        setFormData(prev => ({
            ...prev,
            variantItems: prev.variantItems.map(v => v.id === id ? { ...v, [field]: value } : v)
        }));
    };

    const removeVariation = (id) => {
        setFormData(prev => ({ ...prev, variantItems: prev.variantItems.filter(v => v.id !== id) }));
    };

    const handleVariantImageChange = (id, e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 300 * 1024) { alert('Imagem muito grande (Max 300KB)'); return; }
            const reader = new FileReader();
            reader.onloadend = () => updateVariation(id, 'image', reader.result);
            reader.readAsDataURL(file);
        }
    };

    // --- FILE I/O ---
    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 500 * 1024) { alert('Imagem muito grande (Max 500KB)'); return; }
            const reader = new FileReader();
            reader.onloadend = () => setFormData(prev => ({ ...prev, image: reader.result }));
            reader.readAsDataURL(file);
        }
    };

    const handlePdfChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.type !== 'application/pdf') { alert('Apenas arquivos PDF são permitidos.'); return; }
            if (file.size > 2 * 1024 * 1024) { alert('PDF muito grande (Max 2MB)'); return; } // 2MB limit for base64 safety

            const reader = new FileReader();
            reader.onloadend = () => setFormData(prev => ({ ...prev, pdf: reader.result }));
            reader.readAsDataURL(file);
        }
    };

    // --- PAYMENT METHOD LOGIC ---
    const togglePaymentMethod = (id) => {
        setFormData(prev => ({
            ...prev,
            paymentPrices: prev.paymentPrices.map(p => p.id === id ? { ...p, active: !p.active } : p)
        }));
    };

    const updatePaymentPrice = (id, newPrice) => {
        setFormData(prev => ({
            ...prev,
            paymentPrices: prev.paymentPrices.map(p => p.id === id ? { ...p, price: newPrice } : p)
        }));
    };

    const addCustomPaymentMethod = () => {
        const name = prompt("Nome do novo método de pagamento:");
        if (name) {
            const newId = `custom_${Date.now()}`;
            setFormData(prev => ({
                ...prev,
                paymentPrices: [...prev.paymentPrices, { id: newId, label: name, active: true, price: '' }]
            }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const itemsCopy = [...products];
        // Ensure type defaults to product if missing (legacy)
        const newItem = { ...formData, id: formData.id || Date.now(), type: formData.type || 'product' };

        let newItemsState;
        if (formData.id) {
            newItemsState = itemsCopy.map(p => p.id === formData.id ? newItem : p);
        } else {
            newItemsState = [...itemsCopy, newItem];
        }

        const success = await saveItemsToApi(newItemsState);
        if (success) {
            setFormData(initialFormState);
            setShowForm(false);
        }
    };

    const handleEdit = (item) => {
        setFormData({ ...initialFormState, ...item }); // Merge to ensure new fields (like hasPaymentLink) exist
        setShowForm(true);
    };

    const deleteItem = async (id) => {
        if (!confirm("Tem certeza que deseja excluir este item?")) return;
        const newItemsState = products.filter(p => p.id !== id);
        await saveItemsToApi(newItemsState);
    };

    const toggleActiveItem = async (id, currentStatus) => {
        // Optimistic UI update
        const newStatus = !currentStatus;
        const newItemsState = products.map(p => p.id === id ? { ...p, active: newStatus } : p);
        if (await saveItemsToApi(newItemsState)) {
            // Success
        }
    };

    // Helper to open form
    const openForm = (type) => {
        setFormData({ ...initialFormState, type });
        setShowForm(true);
    };

    const handleImport = async () => {
        if (!importUrl) return;
        setImporting(true);
        try {
            // 1. Extract Immediate
            const res = await fetch('/api/products/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ url: importUrl })
            });
            const data = await res.json();

            if (data.success && data.products) {
                // Formatting
                const newItems = data.products.map(p => ({
                    id: `imp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                    name: p.name || 'Produto Sem Nome',
                    price: p.price || 0,
                    description: p.description || '',
                    image: p.image || null,
                    type: 'product',
                    active: true,
                    unit: 'Unidade',
                    variantItems: p.variantItems || []
                }));

                // Save to List
                // Save to List
                // START MERGE LOGIC
                let updatedList = [...products];

                newItems.forEach(newItem => {
                    const existingIndex = updatedList.findIndex(p => p.name.trim().toLowerCase() === newItem.name.trim().toLowerCase());

                    if (existingIndex >= 0) {
                        // UPDATE EXISTING
                        updatedList[existingIndex] = {
                            ...updatedList[existingIndex],
                            ...newItem,
                            id: updatedList[existingIndex].id, // Keep original ID
                            active: updatedList[existingIndex].active, // Keep original status
                            image: newItem.image || updatedList[existingIndex].image // Prefer new image, fallback to old
                        };
                    } else {
                        // ADD NEW
                        updatedList.push(newItem);
                    }
                });
                // END MERGE LOGIC

                // Save to Server
                await saveItemsToApi(updatedList, config);

                alert(`Sucesso! ${newItems.length} produtos importados.`);

                // 2. Schedule if requested
                if (importSchedule !== 'once') {
                    await fetch('/api/products/sources', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ url: importUrl, type: 'URL', frequency: importSchedule })
                    });
                    fetchSources(); // Refresh sources list
                    alert('Monitoramento agendado!');
                }

                if (importSchedule === 'once') {
                    setShowImportModal(false);
                    setImportUrl('');
                }
            } else {
                alert('Erro na extração: ' + (data.error || 'Falha desconhecida'));
            }

        } catch (error) {
            console.error('Import error:', error);
            alert('Erro ao importar: ' + error.message);
        } finally {
            setImporting(false);
        }
    };

    if (loading) return <div style={{ padding: 24, textAlign: 'center' }}><Loader2 className="animate-spin" /> Carregando...</div>;

    return (
        <div style={{ background: 'var(--bg-white)', padding: '24px', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Produtos e Serviços ({products.length})</h2>
                    {products.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', background: '#F3F4F6', padding: '4px 8px', borderRadius: '6px' }}>
                            <input
                                type="checkbox"
                                checked={selectedItems.size === products.length && products.length > 0}
                                onChange={toggleSelectAll}
                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                            />
                            <span style={{ color: '#4B5563' }}>Selecionar Tudo</span>
                        </div>
                    )}
                </div>

                {!showForm && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={() => setShowImportModal(true)}
                            style={{
                                backgroundColor: '#8B5CF6', margin: 0, color: 'white', padding: '10px 16px', borderRadius: 'var(--radius-sm)', fontSize: '14px',
                                display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', border: 'none'
                            }}
                        >
                            <Bot size={18} /> Importar (IA)
                        </button>
                        <button
                            onClick={() => openForm('product')}
                            disabled={saving}
                            style={{
                                backgroundColor: 'var(--primary-blue)', margin: 0, color: 'white', padding: '10px 16px', borderRadius: 'var(--radius-sm)', fontSize: '14px',
                                display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', border: 'none'
                            }}
                        >
                            <Package size={18} /> Novo Produto
                        </button>
                        <button
                            onClick={() => openForm('service')}
                            disabled={saving}
                            style={{
                                backgroundColor: '#10B981', margin: 0, color: 'white', padding: '10px 16px', borderRadius: 'var(--radius-sm)', fontSize: '14px',
                                display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', border: 'none'
                            }}
                        >
                            <Briefcase size={18} /> Novo Serviço
                        </button>
                    </div>
                )}
            </div>

            {/* BULK ACTION BAR */}
            {selectedItems.size > 0 && !showForm && (
                <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#EFF6FF', padding: '12px 16px', border: '1px solid #BFDBFE', borderRadius: '8px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, color: '#1E40AF' }}>{selectedItems.size} itens selecionados</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => handleBulkToggle(false)} disabled={saving} style={{ background: 'white', color: '#6B7280', border: '1px solid #D1D5DB', padding: '6px 12px', borderRadius: '4px', fontSize: '13px', cursor: 'pointer', display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <ToggleLeft size={16} /> Desativar
                        </button>
                        <button onClick={() => handleBulkToggle(true)} disabled={saving} style={{ background: 'white', color: '#10B981', border: '1px solid #10B981', padding: '6px 12px', borderRadius: '4px', fontSize: '13px', cursor: 'pointer', display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <ToggleRight size={16} /> Ativar
                        </button>
                        <button onClick={handleBulkDelete} disabled={saving} style={{ background: '#EF4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', fontSize: '13px', cursor: 'pointer', display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <Trash2 size={16} /> Excluir
                        </button>
                    </div>
                </div>
            )}

            {/* IMPORT MODAL */}
            {showImportModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: 'white', padding: '24px', borderRadius: '8px', width: '600px', maxWidth: '90%', maxHeight: '80vh', overflowY: 'auto' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Bot color="#8B5CF6" /> Importar Produtos com IA
                        </h3>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>URL da Loja / Produto</label>
                            <input
                                type="text"
                                placeholder="https://loja.com/produto"
                                value={importUrl}
                                onChange={e => setImportUrl(e.target.value)}
                                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                            />
                        </div>

                        <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <input
                                type="checkbox"
                                checked={importSchedule === 'daily'}
                                onChange={e => setImportSchedule(e.target.checked ? 'daily' : 'once')}
                                id="scheduleCheck"
                            />
                            <label htmlFor="scheduleCheck" style={{ fontSize: '14px', color: '#4B5563' }}>
                                Manter sincronizado (Verificar diariamente)
                            </label>
                        </div>

                        {/* SCHEDULED SOURCES LIST */}
                        <div style={{ marginTop: '24px', borderTop: '1px solid #E5E7EB', paddingTop: '16px' }}>
                            <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: '#4B5563' }}>Fontes Monitoradas ({sources.length})</h4>
                            {loadingSources ? (
                                <p style={{ padding: '12px', fontSize: '12px', color: '#9CA3AF', textAlign: 'center' }}>Carregando fontes...</p>
                            ) : (
                                <div style={{ background: '#F9FAFB', borderRadius: '6px', border: '1px solid #E5E7EB', maxHeight: '150px', overflowY: 'auto' }}>
                                    {sources.length === 0 ? (
                                        <p style={{ padding: '12px', fontSize: '12px', color: '#9CA3AF', textAlign: 'center' }}>Nenhuma fonte configurada.</p>
                                    ) : (
                                        sources.map(source => (
                                            <div key={source.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #E5E7EB' }}>
                                                <div style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '350px' }}>
                                                    <span style={{ fontSize: '12px', fontWeight: 500, display: 'block' }}>{source.url}</span>
                                                    <span style={{ fontSize: '11px', color: '#6B7280' }}>
                                                        {source.frequency === 'daily' ? 'Diário' : source.frequency} | Próx: {new Date(source.nextRun).toLocaleDateString()}
                                                    </span>
                                                </div>
                                                <button onClick={() => handleDeleteSource(source.id)} style={{ padding: '4px', color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                            <button onClick={() => setShowImportModal(false)} style={{ padding: '8px 16px', background: 'transparent', border: 'none', cursor: 'pointer' }}>Cancelar</button>
                            <button
                                onClick={handleImport}
                                disabled={importing || !importUrl}
                                style={{
                                    padding: '8px 24px', background: '#8B5CF6', color: 'white', borderRadius: '6px', border: 'none', cursor: 'pointer',
                                    opacity: (importing || !importUrl) ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '8px'
                                }}
                            >
                                {importing ? <Loader2 className="animate-spin" size={16} /> : <Bot size={16} />}
                                {importing ? 'Analisando...' : 'Iniciar Extração'}
                            </button>
                        </div>
                        {importing && <p style={{ fontSize: '12px', color: '#6B7280', marginTop: '12px', textAlign: 'center' }}>Isso pode levar até 30 segundos. A IA está lendo a página...</p>}
                    </div>
                </div>
            )}

            {saving && <div style={{ color: 'var(--primary-blue)', marginBottom: 10, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}> <Loader2 size={14} className="animate-spin" /> Salvando alterações...</div>}

            {showForm ? (
                <form onSubmit={handleSubmit} style={{ marginBottom: '24px', padding: '24px', border: '1px solid #E5E7EB', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 600 }}>
                            {formData.id ? 'Editar' : 'Novo'} {formData.type === 'service' ? 'Serviço' : 'Produto'}
                        </h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button type="button" onClick={() => setFormData(prev => ({ ...prev, active: !prev.active }))} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ fontSize: '12px', fontWeight: 500, color: formData.active ? '#10B981' : '#9CA3AF' }}>{formData.active ? 'Ativo' : 'Inativo'}</span>
                                {formData.active ? <ToggleRight size={24} color="#10B981" /> : <ToggleLeft size={24} color="#9CA3AF" />}
                            </button>
                            <span style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '12px', background: formData.type === 'service' ? '#D1FAE5' : '#DBEAFE', color: formData.type === 'service' ? '#065F46' : '#1E40AF' }}>
                                {formData.type === 'service' ? 'Serviço' : 'Produto'}
                            </span>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Nome</label>
                            <input type="text" name="name" value={formData.name} onChange={handleInputChange} required
                                style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid #D1D5DB' }} />
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Preço Base (R$)</label>
                                <input type="number" name="price" value={formData.price} onChange={handleInputChange} required step="0.01"
                                    style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid #D1D5DB' }} />
                            </div>
                            <div style={{ width: '120px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Unidade</label>
                                <select name="unit" value={formData.unit} onChange={handleInputChange}
                                    style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid #D1D5DB' }}>
                                    <option value="Unidade">Unidade</option>
                                    <option value="Kg">Kg</option>
                                    <option value="Rolo">Rolo</option>
                                    <option value="Metros">Metros</option>
                                    <option value="Outro">Outro...</option>
                                </select>
                            </div>
                            {formData.unit === 'Outro' && (
                                <div style={{ width: '100px' }}>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Qual?</label>
                                    <input type="text" name="customUnit" value={formData.customUnit} onChange={handleInputChange} placeholder="Ex: Litro"
                                        style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid #D1D5DB' }} />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* PAYMENT METHODS MATRIX */}
                    <div style={{ marginBottom: '16px', padding: '16px', background: '#F0FDFA', borderRadius: '8px', border: '1px solid #99F6E4' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <label style={{ fontSize: '14px', fontWeight: 600, color: '#0F766E' }}>Preços por Pagamento (Matriz)</label>
                            <button type="button" onClick={addCustomPaymentMethod} style={{ fontSize: '11px', background: 'white', border: '1px solid #0F766E', color: '#0F766E', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>+ Novo Método</button>
                        </div>
                        <div style={{ display: 'grid', gap: '8px' }}>
                            {formData.paymentPrices?.map(pm => (
                                <div key={pm.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', opacity: pm.active ? 1 : 0.6 }}>
                                    <input type="checkbox" checked={pm.active} onChange={() => togglePaymentMethod(pm.id)} style={{ cursor: 'pointer' }} />
                                    <span style={{ fontSize: '14px', minWidth: '80px', fontWeight: 500 }}>{pm.label}</span>
                                    {pm.active && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
                                            <span style={{ fontSize: '12px', color: '#6B7280' }}>R$</span>
                                            <input
                                                type="number"
                                                placeholder={formData.price || "Preço"}
                                                value={pm.price}
                                                onChange={(e) => updatePaymentPrice(pm.id, e.target.value)}
                                                step="0.01"
                                                style={{ padding: '6px', borderRadius: '4px', border: '1px solid #D1D5DB', width: '100px' }}
                                            />
                                            <span style={{ fontSize: '11px', color: '#9CA3AF' }}>(Deixe vazio p/ usar base)</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Descrição</label>
                        <textarea name="description" value={formData.description} onChange={handleInputChange} rows={3}
                            style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid #D1D5DB', resize: 'vertical' }} />
                    </div>

                    {/* PAYMENT LINK SECTION */}
                    <div style={{ marginBottom: '16px', padding: '16px', background: '#F0F9FF', borderRadius: '8px', border: '1px solid #BAE6FD' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: formData.hasPaymentLink ? '12px' : '0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <CreditCard size={18} color="#0284C7" />
                                <span style={{ fontWeight: 500, color: '#0369A1' }}>Link de Pagamento</span>
                            </div>
                            <button type="button" onClick={handleTogglePaymentLink} style={{ background: 'none', border: 'none', cursor: 'pointer', color: formData.hasPaymentLink ? '#0284C7' : '#94A3B8' }}>
                                {formData.hasPaymentLink ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                            </button>
                        </div>

                        {formData.hasPaymentLink && (
                            <input
                                type="text"
                                name="paymentLink"
                                placeholder="https://pagamento..."
                                value={formData.paymentLink}
                                onChange={handleInputChange}
                                style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid #7DD3FC' }}
                            />
                        )}
                    </div>

                    {/* SERVICE SPECIFIC FIELDS */}
                    {formData.type === 'service' && (
                        <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Condições de Pagamento</label>
                                <input type="text" name="paymentConditions" placeholder="Ex: 50% entrada, 50% na entrega" value={formData.paymentConditions} onChange={handleInputChange}
                                    style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid #D1D5DB' }} />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>PDF Informativo (Enviado se cliente pedir detalhes)</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', border: '1px dashed #D1D5DB', borderRadius: 'var(--radius-md)', background: 'white' }}>
                                        <FileText size={18} color="#EF4444" />
                                        <span>{formData.pdf ? 'PDF Selecionado (Clique para trocar)' : 'Upload PDF'}</span>
                                        <input type="file" accept="application/pdf" onChange={handlePdfChange} style={{ display: 'none' }} />
                                    </label>
                                    {formData.pdf && <span style={{ fontSize: '12px', color: '#10B981' }}>Arquivo carregado!</span>}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* PRODUCT VARIATIONS */}
                    {formData.type === 'product' && (
                        <div style={{ marginBottom: '24px', padding: '16px', background: '#F9FAFB', borderRadius: 'var(--radius-md)', border: '1px solid #E5E7EB' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <label style={{ fontSize: '14px', fontWeight: 600 }}>Variações</label>
                                <button type="button" onClick={addVariation} style={{ fontSize: '12px', padding: '6px 12px', border: '1px solid #D1D5DB', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Plus size={14} /> Add
                                </button>
                            </div>
                            <div style={{ display: 'grid', gap: '12px' }}>
                                {formData.variantItems?.map((variant) => (
                                    <div key={variant.id} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 1fr 40px', gap: '8px', alignItems: 'center', background: 'white', padding: '10px', borderRadius: '4px', border: '1px solid #E5E7EB' }}>
                                        <label style={{ cursor: 'pointer', width: '32px', height: '32px', border: '1px dashed #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                            {variant.image ? <img src={variant.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ImageIcon size={14} color="#ccc" />}
                                            <input type="file" style={{ display: 'none' }} accept="image/*" onChange={(e) => handleVariantImageChange(variant.id, e)} />
                                        </label>
                                        <input type="text" placeholder="Cor" value={variant.color} onChange={(e) => updateVariation(variant.id, 'color', e.target.value)} style={{ padding: '6px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '4px' }} />
                                        <input type="text" placeholder="Tam" value={variant.size} onChange={(e) => updateVariation(variant.id, 'size', e.target.value)} style={{ padding: '6px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '4px' }} />
                                        <input type="number" placeholder="Preço" value={variant.price} onChange={(e) => updateVariation(variant.id, 'price', e.target.value)} style={{ padding: '6px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '4px' }} />
                                        <button type="button" onClick={() => removeVariation(variant.id)} style={{ color: '#EF4444', cursor: 'pointer' }}><Trash2 size={16} /></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* MAIN IMAGE (Common) */}
                    <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Imagem Principal</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', border: '1px solid #D1D5DB', borderRadius: 'var(--radius-md)' }}>
                                <ImageIcon size={20} /> <span>Escolher Imagem</span>
                                <input type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
                            </label>
                            {formData.image && <img src={formData.image} alt="Preview" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '4px' }} />}
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                        <button type="button" onClick={() => setShowForm(false)} disabled={saving} style={{ padding: '10px 16px', color: '#6B7280', cursor: 'pointer', border: 'none', background: 'transparent' }}>Cancelar</button>
                        <button type="submit" disabled={saving} style={{ backgroundColor: 'var(--primary-blue)', color: 'white', padding: '10px 24px', borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer' }}>
                            {saving ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                </form>
            ) : (
                <div>
                    {products.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9CA3AF' }}>
                            <Package size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                            <p>Nenhum item cadastrado.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gap: '16px' }}>
                            {products.map(item => (
                                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', border: '1px solid #E5E7EB', borderRadius: 'var(--radius-md)', background: item.type === 'service' ? '#FDFDFD' : 'white', opacity: (item.active === false) ? 0.6 : 1 }}>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                        {/* SELECTION CHECKBOX */}
                                        <input
                                            type="checkbox"
                                            checked={selectedItems.has(item.id)}
                                            onChange={() => toggleSelect(item.id)}
                                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                        />

                                        {/* Icon/Image */}
                                        <div style={{ width: '50px', height: '50px', borderRadius: '8px', overflow: 'hidden', background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {item.image ? (
                                                <img src={item.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                item.type === 'service' ? <Briefcase size={24} color="#10B981" /> : <Package size={24} color="#3B82F6" />
                                            )}
                                        </div>

                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <h4 style={{ fontWeight: 600, fontSize: '16px' }}>{item.name}</h4>
                                                <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '10px', background: item.type === 'service' ? '#D1FAE5' : '#DBEAFE', color: item.type === 'service' ? '#065F46' : '#1E40AF', textTransform: 'uppercase' }}>
                                                    {item.type === 'service' ? 'Serviço' : 'Produto'}
                                                </span>
                                            </div>
                                            <p style={{ color: '#6B7280', fontSize: '14px' }}>R$ {item.price}</p>

                                            {/* Meta Data Badges */}
                                            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                                {item.hasPaymentLink && (
                                                    <span style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '2px', color: '#0369A1' }}>
                                                        <LinkIcon size={10} /> Link Pgto
                                                    </span>
                                                )}
                                                {item.pdf && (
                                                    <span style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '2px', color: '#EF4444' }}>
                                                        <FileText size={10} /> PDF
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <button onClick={() => toggleActiveItem(item.id, item.active !== false)} title={item.active !== false ? "Inativar" : "Ativar"} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                            {(item.active !== false) ? <ToggleRight size={24} color="#10B981" /> : <ToggleLeft size={24} color="#9CA3AF" />}
                                        </button>
                                        <button onClick={() => handleEdit(item)} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer' }}><Edit2 size={18} /></button>
                                        <button onClick={() => deleteItem(item.id)} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer' }}><Trash2 size={18} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ProductConfig;
