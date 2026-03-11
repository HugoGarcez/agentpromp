const fs = require('fs');

function addCreateButton(file) {
    let content = fs.readFileSync(file, 'utf8');

    // The selector injected previously
    const targetString = \`</select>
            </div>\`;

    // The new UI to insert
    const insertUI = \`</select>
                <button 
                    onClick={async () => {
                        const name = prompt('Nome do novo agente:');
                        if (!name) return;
                        const token = localStorage.getItem('token');
                        const res = await fetch('/api/agents', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': \\\`Bearer \\\${token}\\\` },
                            body: JSON.stringify({ name })
                        });
                        if (res.ok) {
                            const newAg = await res.json();
                            setAgents([...agents, newAg]);
                            setSelectedAgentId(newAg.id);
                        }
                    }}
                    style={{ padding: '8px 16px', background: 'var(--primary-blue)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 500 }}
                >
                    + Novo
                </button>
            </div>\`;

    if (content.includes('</select>') && !content.includes('+ Novo')) {
        content = content.replace(targetString, insertUI);
        fs.writeFileSync(file, content, 'utf8');
        console.log('Button added to', file);
    }
}

try {
    addCreateButton('../src/pages/Settings.jsx');
    addCreateButton('../src/pages/AIConfig.jsx');
} catch(e) { console.error(e) }
