const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.trim().split('=');
  if (k && v.length) acc[k.trim()] = v.join('=').trim();
  return acc;
}, {});

const token = env.META_ACCESS_TOKEN;
const testAccounts = [
  { id: 'act_1431982563684605', name: 'Dott Sante Vassallo' },
  { id: 'act_1348353952726075', name: 'SVD SRL' },
  { id: 'act_369452318493607', name: 'Pulzoni Antonelli - Rent' },
  { id: 'act_1285703325167443', name: 'Pulzoni Antonelli - Auto e Moto' },
  { id: 'act_378472188256400', name: 'Broker Noleggio' },
  { id: 'act_777606880847637', name: 'Partenope Experience' },
  { id: 'act_1357284689000232', name: 'Asd Sporting Arechi' },
  { id: 'act_135241018772815', name: 'Cesena Sub' }
];

async function inspect(acc) {
  const cUrl = `https://graph.facebook.com/v22.0/${acc.id}/campaigns?fields=id,name,status,effective_status,daily_budget,lifetime_budget&effective_status=['ACTIVE']&limit=100&access_token=${token}`;
  const cRes = await fetch(cUrl).then(r => r.json());
  const activeCampaigns = cRes.data || [];

  const aUrl = `https://graph.facebook.com/v22.0/${acc.id}/adsets?fields=id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget&effective_status=['ACTIVE']&limit=100&access_token=${token}`;
  const aRes = await fetch(aUrl).then(r => r.json());
  const activeAdsets = aRes.data || [];

  const activeCampMap = new Map(activeCampaigns.map(c => [c.id, c]));
  let cboTotal = 0;
  activeCampaigns.forEach(c => {
    const daily = parseFloat(c.daily_budget || 0) / 100;
    if (daily > 0) cboTotal += daily;
  });

  let aboTotal = 0;
  activeAdsets.forEach(a => {
    const parentCamp = activeCampMap.get(a.campaign_id);
    const parentIsCBO = parentCamp && parseFloat(parentCamp.daily_budget || 0) > 0;
    const daily = parseFloat(a.daily_budget || 0) / 100;
    if (parentCamp && !parentIsCBO && daily > 0) {
      aboTotal += daily;
    }
  });

  const total = Math.round((cboTotal + aboTotal) * 100) / 100;
  console.log(`${acc.name} (${acc.id}) -> CBO: €${cboTotal} | ABO: €${aboTotal} | TOTAL BUDGET ATTIVO: €${total}/gg (Attive: ${activeCampaigns.length} camp, ${activeAdsets.length} adsets)`);
}

async function run() {
  for (const a of testAccounts) {
    await inspect(a);
  }
}

run();
