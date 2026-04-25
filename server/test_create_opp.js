import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';

const prisma = new PrismaClient();

async function run() {
  const company = await prisma.company.findFirst({
    where: { prompUuid: { not: null }, prompToken: { not: null } }
  });
  if (!company) {
    console.log("No company with Promp config found.");
    return;
  }
  
  const PROMP_BASE_URL = process.env.PROMP_BASE_URL || 'https://api.promp.com.br';
  const url = `${PROMP_BASE_URL}/v2/api/external/${company.prompUuid}/createOpportunity`;
  
  try {
    const payload = {
      pipelineId: 29,
      stageId: 104, // Use one of the stages from the UI config
      ticketId: 12345, // Fake ticket
      name: "Teste Oportunidade"
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${company.prompToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    console.log("createOpportunity status:", res.status);
    const text = await res.text();
    console.log("createOpportunity body:", text);
  } catch (e) {
    console.error("Fetch error:", e);
  }
}

run();
