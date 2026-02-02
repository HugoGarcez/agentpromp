import React, { useState } from 'react';
import { Upload, File, Trash2 } from 'lucide-react';

const FilesTab = () => {
    const [files, setFiles] = useState([]);

    const handleFileUpload = (e) => {
        const newFiles = Array.from(e.target.files).map(file => ({
            name: file.name,
            size: (file.size / 1024).toFixed(2) + ' KB',
            type: file.type
        }));
        setFiles([...files, ...newFiles]);
    };

    const removeFile = (index) => {
        setFiles(files.filter((_, i) => i !== index));
    };

    return (
        <div>
            <div style={{
                border: '2px dashed #E5E7EB',
                borderRadius: 'var(--radius-md)',
                padding: '32px',
                textAlign: 'center',
                marginBottom: '24px',
                cursor: 'pointer'
            }}
                onClick={() => document.getElementById('fileInput').click()}
            >
                <Upload size={32} color="var(--primary-blue)" style={{ marginBottom: '12px' }} />
                <h3 style={{ fontSize: '16px', fontWeight: 500, marginBottom: '8px' }}>Clique para fazer upload</h3>
                <p style={{ color: 'var(--text-light)', fontSize: '14px' }}>ou arraste e solte seus arquivos aqui</p>
                <input
                    id="fileInput"
                    type="file"
                    multiple
                    style={{ display: 'none' }}
                    onChange={handleFileUpload}
                />
            </div>

            <div>
                <h4 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Arquivos ({files.length})</h4>
                {files.length === 0 && <p style={{ color: 'var(--text-light)', fontSize: '14px' }}>Nenhum arquivo enviado.</p>}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {files.map((file, index) => (
                        <div key={index} style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px',
                            border: '1px solid #E5E7EB',
                            borderRadius: 'var(--radius-md)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{
                                    width: '40px',
                                    height: '40px',
                                    background: 'var(--primary-light)',
                                    borderRadius: 'var(--radius-sm)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <File size={20} color="var(--primary-blue)" />
                                </div>
                                <div>
                                    <p style={{ fontWeight: 500, fontSize: '14px' }}>{file.name}</p>
                                    <p style={{ color: 'var(--text-light)', fontSize: '12px' }}>{file.size}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => removeFile(index)}
                                style={{ padding: '8px', color: 'var(--text-light)', hover: { color: 'var(--danger-red)' } }}
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default FilesTab;
