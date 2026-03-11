const fs = require('fs');

function updateConfigApi() {
    let content = fs.readFileSync('index.js', 'utf8');

    // 1. Update getCompanyConfig
    const getCompanyOld = `const getCompanyConfig = async (companyId) => {
    if (!companyId) return null;

    try {
        const config = await prisma.agentConfig.findFirst({
            where: { companyId },`;
            
    const getCompanyNew = `const getCompanyConfig = async (companyId, agentId = null) => {
    if (!companyId) return null;

    try {
        let whereClause = { companyId };
        if (agentId) whereClause.id = agentId;
        
        const config = await prisma.agentConfig.findFirst({
            where: whereClause,`;

    content = content.replace(getCompanyOld, getCompanyNew);

    // 2. Update GET /api/config
    const getApiOld = `app.get('/api/config', authenticateToken, async (req, res) => {
    const companyId = req.user.companyId;
    try {
        const config = await getCompanyConfig(companyId);`;
        
    const getApiNew = `app.get('/api/config', authenticateToken, async (req, res) => {
    const companyId = req.user.companyId;
    const agentId = req.query.agentId; // Allow fetching specific agent
    try {
        const config = await getCompanyConfig(companyId, agentId);`;

    content = content.replace(getApiOld, getApiNew);

    // 3. Update POST /api/config
    const postApiOld = `        const currentConfig = await prisma.agentConfig.findFirst({ where: { companyId } });`;
    const postApiNew = `        const agentId = newConfig.agentId;
        let whereClause = { companyId };
        if (agentId) whereClause.id = agentId;
        
        const currentConfig = await prisma.agentConfig.findFirst({ where: whereClause });`;
        
    content = content.replace(postApiOld, postApiNew);
    
    // 4. Update the upsert logic in POST /api/config
    const upsertOld = `        let updatedConfig = await prisma.agentConfig.findFirst({ where: { companyId } });
        if (updatedConfig) {
            updatedConfig = await prisma.agentConfig.update({ where: { id: updatedConfig.id }, data });
        } else {
            updatedConfig = await prisma.agentConfig.create({ data });
        }`;
        
    const upsertNew = `        let updatedConfig = await prisma.agentConfig.findFirst({ where: whereClause });
        if (updatedConfig) {
            updatedConfig = await prisma.agentConfig.update({ where: { id: updatedConfig.id }, data });
        } else {
            updatedConfig = await prisma.agentConfig.create({ data });
        }`;

    content = content.replace(upsertOld, upsertNew);

    fs.writeFileSync('index.js', content, 'utf8');
    console.log('API /api/config updated with agentId support.');
}

updateConfigApi();
