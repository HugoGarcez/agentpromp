import React, { useState } from 'react';
import { Upload, File, Trash2 } from 'lucide-react';

const FilesTab = ({ files = [], onUpdate }) => {

    const handleFileUpload = (e) => {
        const newFiles = Array.from(e.target.files).map(file => {
            // Read file content as text (for now, simpler relative to binary upload)
            // Ideally parent handles reading, but doing it here to keep UI logic simple
            // We'll pass the File object or read it here.

            // For MVP: Let's read it here to text if possible, or just pass metadata + file object
            // To ensure persistence, we likely need to convert to Base64 or Text immediately 
            // OR uploading to a server endpoint.
            // Given the requirement "persist system", we'll simulate persistence by storing in the big JSON config for now.
            // WARNING: Large files in JSON column is bad. But for small text files it's okay.

            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    resolve({
                        name: file.name,
                        size: (file.size / 1024).toFixed(2) + ' KB',
                        type: file.type,
                        content: ev.target.result // Text content
                    });
                };
                reader.readAsText(file);
            });
        });

        Promise.all(newFiles).then(readFiles => {
            onUpdate([...files, ...readFiles]);
        });
    };

    const removeFile = (index) => {
        onUpdate(files.filter((_, i) => i !== index));
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
                <p style={{ color: 'var(--text-light)', fontSize: '14px' }}>ou arraste e solte seus arquivos aqui (TXT, MD, CSV)</p>
                <input
                    id="fileInput"
                    type="file"
                    multiple
                    accept=".txt,.md,.csv,.json"
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
                                style={{ padding: '8px', color: 'var(--text-light)', cursor: 'pointer' }}
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
