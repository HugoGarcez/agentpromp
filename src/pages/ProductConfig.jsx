import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Package, Image as ImageIcon, Save, Loader2, FileText, CreditCard, Briefcase, Link as LinkIcon, ToggleLeft, ToggleRight } from 'lucide-react';

const ProductConfig = () => {
    const [showForm, setShowForm] = useState(false);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [config, setConfig] = useState(null);

    const token = localStorage.getItem('token');

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

    if (loading) return <div style={{ padding: 24, textAlign: 'center' }}><Loader2 className="animate-spin" /> Carregando...</div>;

    return (
        <div style={{ background: 'var(--bg-white)', padding: '24px', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Produtos e Serviços ({products.length})</h2>
                {!showForm && (
                    <div style={{ display: 'flex', gap: '8px' }}>
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
