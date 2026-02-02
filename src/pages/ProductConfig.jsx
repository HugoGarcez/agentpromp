import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Package, Image as ImageIcon } from 'lucide-react';

const ProductConfig = () => {
    const [showForm, setShowForm] = useState(false);
    const [products, setProducts] = useState(() => {
        const saved = localStorage.getItem('promp_ai_products');
        return saved ? JSON.parse(saved) : [];
    });

    React.useEffect(() => {
        try {
            localStorage.setItem('promp_ai_products', JSON.stringify(products));
        } catch (error) {
            console.error("Erro ao salvar produtos:", error);
            if (error.name === 'QuotaExceededError') {
                alert('Erro Crítico: Limite de armazenamento excedido! Sua última alteração não pôde ser salva. Tente remover produtos antigos ou usar imagens menores.');
                // Optional: Revert state if needed, but alert is first step.
            }
        }
    }, [products]);

    const [formData, setFormData] = useState({
        name: '',
        price: '',
        description: '',
        variations: '',
        colors: '',
        image: null
    });

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            // Limit image size to 300KB to be safe
            if (file.size > 300 * 1024) {
                alert('A imagem é muito grande! Por favor, escolha uma imagem com menos de 300KB para evitar problemas de memória.');
                return;
            }

            const reader = new FileReader();
            reader.onloadend = () => {
                setFormData(prev => ({ ...prev, image: reader.result }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        // Calculate potential new state size
        const productsCopy = [...products];
        const newProduct = { ...formData, id: formData.id || Date.now() };

        let newProductsState;
        if (formData.id) {
            newProductsState = productsCopy.map(p => p.id === formData.id ? newProduct : p);
        } else {
            newProductsState = [...productsCopy, newProduct];
        }

        // ESTIMATE SIZE: JSON string length. 5MB approx 5,242,880 chars (1 byte/char approx for UTF-16 in JS string, but localStorage is usually char count limit)
        // Safe limit: 4.5 million characters
        const estimatedSize = JSON.stringify(newProductsState).length;

        if (estimatedSize > 4500000) {
            alert(`Atenção: O armazenamento está quase cheio (${Math.round(estimatedSize / 1024)}KB). Não é possível salvar este produto. Tente remover imagens ou produtos antigos.`);
            return;
        }

        setProducts(newProductsState);
        setFormData({ name: '', price: '', description: '', variations: '', colors: '', image: null });
        setShowForm(false);
    };

    const handleEdit = (product) => {
        setFormData(product);
        setShowForm(true);
    };

    const deleteProduct = (id) => {
        setProducts(products.filter(p => p.id !== id));
    };

    return (
        <div style={{ background: 'var(--bg-white)', padding: '24px', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Produtos</h2>
                {!showForm && (
                    <button
                        onClick={() => {
                            setFormData({ name: '', price: '', description: '', variations: '', colors: '', image: null });
                            setShowForm(true);
                        }}
                        style={{
                            backgroundColor: 'var(--primary-blue)',
                            color: 'white',
                            padding: '10px 16px',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                    >
                        <Plus size={18} />
                        Novo Produto
                    </button>
                )}
            </div>

            {showForm ? (
                <form onSubmit={handleSubmit} style={{ marginBottom: '24px', padding: '24px', border: '1px solid #E5E7EB', borderRadius: 'var(--radius-md)' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>{formData.id ? 'Editar Produto' : 'Adicionar Produto'}</h3>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Nome do Produto</label>
                            <input
                                type="text"
                                name="name"
                                value={formData.name}
                                onChange={handleInputChange}
                                required
                                style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid #D1D5DB' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Preço (R$)</label>
                            <input
                                type="number"
                                name="price"
                                value={formData.price}
                                onChange={handleInputChange}
                                required
                                step="0.01"
                                style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid #D1D5DB' }}
                            />
                        </div>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Descrição</label>
                        <textarea
                            name="description"
                            value={formData.description}
                            onChange={handleInputChange}
                            rows={3}
                            style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid #D1D5DB', resize: 'vertical' }}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Variações (P, M, G)</label>
                            <input
                                type="text"
                                name="variations"
                                value={formData.variations}
                                onChange={handleInputChange}
                                placeholder="Separadas por vírgula"
                                style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid #D1D5DB' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Cores</label>
                            <input
                                type="text"
                                name="colors"
                                value={formData.colors}
                                onChange={handleInputChange}
                                placeholder="Ex: Azul, Vermelho"
                                style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid #D1D5DB' }}
                            />
                        </div>
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Imagem do Produto</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <label style={{
                                cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '10px 16px',
                                border: '1px solid #D1D5DB',
                                borderRadius: 'var(--radius-md)',
                                background: 'var(--bg-white)',
                                color: 'var(--text-medium)'
                            }}>
                                <ImageIcon size={20} />
                                <span>Escolher Imagem</span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageChange}
                                    style={{ display: 'none' }}
                                />
                            </label>
                            {formData.image && (
                                <img src={formData.image} alt="Preview" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '4px' }} />
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                        <button
                            type="button"
                            onClick={() => setShowForm(false)}
                            style={{ padding: '10px 16px', color: 'var(--text-medium)', fontWeight: 500 }}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            style={{
                                backgroundColor: 'var(--primary-blue)',
                                color: 'white',
                                padding: '10px 24px',
                                borderRadius: 'var(--radius-md)',
                                fontWeight: 500
                            }}
                        >
                            {formData.id ? 'Salvar Alterações' : 'Salvar Produto'}
                        </button>
                    </div>
                </form>
            ) : (
                <div>
                    {products.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-light)' }}>
                            <Package size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                            <p>Nenhum produto cadastrado.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gap: '16px' }}>
                            {products.map(product => (
                                <div key={product.id} style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '16px',
                                    border: '1px solid #E5E7EB',
                                    borderRadius: 'var(--radius-md)'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                        {product.image ? (
                                            <img src={product.image} alt={product.name} style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: 'var(--radius-md)' }} />
                                        ) : (
                                            <div style={{ width: '64px', height: '64px', borderRadius: 'var(--radius-md)', background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Package size={24} color="#9CA3AF" />
                                            </div>
                                        )}
                                        <div>
                                            <h4 style={{ fontWeight: 600, fontSize: '16px', marginBottom: '4px' }}>{product.name}</h4>
                                            <p style={{ color: 'var(--text-medium)', fontSize: '14px' }}>R$ {product.price}</p>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
                                                {product.variations && (
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        {product.variations.split(',').map((v, i) => (
                                                            <span key={i} style={{ background: 'var(--bg-main)', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', color: 'var(--text-medium)' }}>
                                                                {v.trim()}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                                {product.colors && (
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        {product.colors.split(',').map((c, i) => (
                                                            <span key={`c-${i}`} style={{ border: '1px solid #E5E7EB', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', color: 'var(--text-medium)' }}>
                                                                {c.trim()}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                                        <button onClick={() => handleEdit(product)} style={{ color: 'var(--text-light)', cursor: 'pointer' }}><Edit2 size={18} /></button>
                                        <button onClick={() => deleteProduct(product.id)} style={{ color: 'var(--text-light)', cursor: 'pointer' }}><Trash2 size={18} /></button>
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
