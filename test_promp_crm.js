import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const company = await prisma.company.findFirst({
    where: { prompUuid: { not: null }, prompToken: { not: null } }
  });
  if (!company) {
    console.log("No company with Promp config found.");
    return;
  }
  
  console.log("Found company with UUID:", company.prompUuid);
  
  const PROMP_BASE_URL = process.env.PROMP_BASE_URL || 'https://api.promp.com.br';
  const url = `${PROMP_BASE_URL}/v2/api/external/${company.prompUuid}/listOpportunities?page=1&limit=10`;
  
  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${company.prompToken}`,
        'Content-Type': 'application/json'
      }
    });
    console.log("listOpportunities status:", res.status);
    const text = await res.text();
    console.log("listOpportunities body:", text.slice(0, 500));
  } catch (e) {
    console.error("Fetch error:", e);
  }
  
  // also test createNotes
  try {
    const url2 = `${PROMP_BASE_URL}/v2/api/external/${company.prompUuid}/createNotes`;
    const res2 = await fetch(url2, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${company.prompToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
         notes: "Teste de nota",
         ticketId: 1
      })
    });
    console.log("createNotes status:", res2.status);
    const text2 = await res2.text();
    console.log("createNotes body:", text2.slice(0, 500));
  } catch (e) {
    console.error("Fetch error:", e);
  }
  
  process.exit(0);
}

run();
