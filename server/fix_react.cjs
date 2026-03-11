const fs = require('fs');

function fixReactFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');

    // 1. Add states
    if (!content.includes('const [agents,')) {
        content = content.replace(/(const \[activeSection[^;]+;|\s*const \[activeTab[^;]+;)/, 
            "$1\n    const [agents, setAgents] = useState([]);\n    const [selectedAgentId, setSelectedAgentId] = useState('');\n");
    }

    // 2. Update fetchConfig API call
    content = content.replace(/const res = await fetch\('\/api\/config'/, 
        "const url = selectedAgentId ? `/api/config?agentId=\${selectedAgentId}` : '/api/config';\n                const res = await fetch(url");

    // 3. Update handleSave API call
    content = content.replace(/body: JSON\.stringify\(\{/, 
        "body: JSON.stringify({\n                    agentId: selectedAgentId,");

    // 4. Add Agents fetcher inside useEffect
    // We need to fetch agents on mount. We can insert it inside useEffect right before fetchConfig();
    const fetchAgentsCode = `
        const fetchAgents = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await fetch('/api/agents', { headers: { 'Authorization': \`Bearer \${token}\` } });
                if (res.ok) {
                    const data = await res.json();
                    setAgents(data);
                    if (data.length > 0 && !selectedAgentId) setSelectedAgentId(data[0].id);
                }
            } catch (e) {
                console.error("Failed to fetch agents:", e);
            }
        };
        fetchAgents();
    `;
    
    // We only want to inject this inside the main useEffect that loads things.
    // In Settings it's `React.useEffect(() => { ... if (!user ...`
    if (!content.includes('fetchAgents()')) {
        content = content.replace(/const fetchConfig = async \(\) => \{/, fetchAgentsCode + "\n        const fetchConfig = async () => {");
    }

    // 5. Make fetchConfig trigger when selectedAgentId changes
    // Add selectedAgentId to the dependency array of useEffect.
    // `}, [user]);` -> `}, [user, selectedAgentId]);`
    content = content.replace(/\}, \[user\]\);/, "}, [user, selectedAgentId]);");

    // 6. Add UI Select dropdown before Main Content
    // In Settings: `{/* Main Content */}`
    // In AIConfig: `{/* Content Area */}`
    
    const uiSnippet = `
            {/* AGENT SELECTOR */}
            <div style={{ padding: '16px', background: 'var(--bg-white)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span style={{ fontWeight: 600 }}>Agente Selecionado:</span>
                <select 
                    value={selectedAgentId} 
                    onChange={e => setSelectedAgentId(e.target.value)}
                    style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '200px' }}
                >
                    {agents.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                </select>
            </div>
    `;

    if (filePath.includes('Settings')) {
        content = content.replace(/\{\/\* Main Content \*\/\}/, uiSnippet + "\n            {/* Main Content */}");
    } else if (filePath.includes('AIConfig')) {
        content = content.replace(/\{\/\* Content Area \*\/\}/, uiSnippet + "\n            {/* Content Area */}");
    }

    fs.writeFileSync(filePath, content, 'utf8');
}

try {
    fixReactFile('../src/pages/Settings.jsx');
    fixReactFile('../src/pages/AIConfig.jsx');
    console.log('React files updated.');
} catch (e) {
    console.error('Error updating React:', e);
}
