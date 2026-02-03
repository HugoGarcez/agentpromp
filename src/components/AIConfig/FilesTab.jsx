import React, { useState } from 'react';
import { Upload, File, Trash2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';

// Set worker source for PDF.js (Use CDN or local copy if possible, CDN is easier for MVP)
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

const FilesTab = ({ files = [], onUpdate }) => {

    // Helper: Read PDF Content
    const readPdf = async (file) => {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = "";

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += `\n--- Página ${i} ---\n${pageText}`;
        }
        return fullText;
    };

    // Helper: Read Excel/CSV Content
    const readExcel = async (file) => {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer);
        let fullText = "";

        workbook.SheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            const text = XLSX.utils.sheet_to_txt(sheet); // or sheet_to_csv
            fullText += `\n--- Planilha: ${sheetName} ---\n${text}`;
        });

        return fullText;
    };

    const handleFileUpload = (e) => {
        const uploadedFiles = Array.from(e.target.files);

        const filePromises = uploadedFiles.map(async (file) => {
            let content = "";
            let type = file.type;

            try {
                if (file.name.endsWith('.pdf')) {
                    content = await readPdf(file);
                    type = "application/pdf";
                } else if (file.name.match(/\.(xlsx|xls|csv)$/i)) {
                    content = await readExcel(file);
                    type = "application/vnd.ms-excel";
                } else {
                    // Fallback to text
                    content = await file.text();
                }
            } catch (err) {
                console.error("Error reading file:", file.name, err);
                content = `[Erro ao ler arquivo: ${err.message}]`;
            }

            return {
                name: file.name,
                size: (file.size / 1024).toFixed(2) + ' KB',
                type: type,
                content: content
            };
        });

        Promise.all(filePromises).then(newReadFiles => {
            onUpdate([...files, ...newReadFiles]);
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
                <p style={{ color: 'var(--text-light)', fontSize: '14px' }}>
                    Arraste ou clique para adicionar (PDF, Excel, CSV, TXT)
                </p>
                <input
                    id="fileInput"
                    type="file"
                    multiple
                    accept=".txt,.md,.csv,.json,.pdf,.xls,.xlsx"
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
