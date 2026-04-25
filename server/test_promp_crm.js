import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const company = await prisma.company.findFirst();
  if (!company) {
    console.log("No company found.");
    return;
  }
  
  console.log("Found company UUID:", company.prompUuid, "Token length:", company.prompToken?.length);
  
  const automations = await prisma.pipelineAutomation.findMany({
    include: { company: true }
  });
  
  if (automations.length === 0) {
      console.log("No automations found.");
      return;
  }
  
  const automation = automations[0];
  const prompUuid = automation.company.prompUuid;
  const prompToken = automation.company.prompToken;
  console.log("Automation uses UUID:", prompUuid, "Pipeline:", automation.pipelineId);
  
  const PROMP_BASE_URL = process.env.PROMP_BASE_URL || 'https://api.promp.com.br';
  const url = `${PROMP_BASE_URL}/v2/api/external/${prompUuid}/listOpportunities?page=1&limit=10&pipelineId=${automation.pipelineId}`;
  
  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${prompToken}`,
        'Content-Type': 'application/json'
      }
    });
    console.log("listOpportunities status:", res.status);
    const text = await res.text();
    console.log("listOpportunities body:", text.slice(0, 500));
  } catch (e) {
    console.error("Fetch error:", e);
  }
  
  process.exit(0);
}

run();
