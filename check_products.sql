-- Execute este SQL direto no PostgreSQL da VPS para ver os produtos

-- Ver todas as empresas e seus produtos
SELECT 
    c.name as empresa,
    c.id as company_id,
    ac.id as config_id,
    ac.products::text
FROM "Company" c
LEFT JOIN "AgentConfig" ac ON ac."companyId" = c.id
ORDER BY c."createdAt" DESC;
