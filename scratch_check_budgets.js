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

async function testAllAccounts() {
  for (const acc of testAccounts) {
    const [cRes, aRes, adRes] = await Promise.all([
      fetch(`https://graph.facebook.com/v22.0/${acc.id}/campaigns?fields=id,name,status,effective_status,daily_budget,lifetime_budget&limit=100&access_token=${token}`).then(r => r.json()),
      fetch(`https://graph.facebook.com/v22.0/${acc.id}/adsets?fields=id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget&limit=100&access_token=${token}`).then(r => r.json()),
      fetch(`https://graph.facebook.com/v22.0/${acc.id}/ads?fields=id,name,campaign_id,adset_id,status,effective_status&limit=100&access_token=${token}`).then(r => r.json())
    ]);

    const campaigns = cRes.data || [];
    const adsets = aRes.data || [];
    const ads = adRes.data || [];

    const activeCampIds = new Set(campaigns.filter(c => c.status === 'ACTIVE' || c.effective_status === 'ACTIVE').map(c => c.id));
    const activeAdsetIds = new Set(adsets.filter(a => a.status === 'ACTIVE' || a.effective_status === 'ACTIVE').map(a => a.id));

    // An ad is considered active if effective_status === 'ACTIVE' OR (status === 'ACTIVE' and its parent adset and campaign are active)
    const trulyActiveAdsetsWithAds = new Set();
    const trulyActiveCampaignsWithAds = new Set();

    ads.forEach(ad => {
      const isAdActive = ad.effective_status === 'ACTIVE' || (ad.status === 'ACTIVE' && activeAdsetIds.has(ad.adset_id) && activeCampIds.has(ad.campaign_id));
      if (isAdActive) {
        trulyActiveAdsetsWithAds.add(ad.adset_id);
        trulyActiveCampaignsWithAds.add(ad.campaign_id);
      }
    });

    const activeCampMap = new Map(campaigns.filter(c => activeCampIds.has(c.id)).map(c => [c.id, c]));

    let cboTotal = 0;
    campaigns.forEach(c => {
      const isCampActive = activeCampIds.has(c.id);
      const daily = parseFloat(c.daily_budget || 0) / 100;
      const hasActiveAd = trulyActiveCampaignsWithAds.has(c.id);
      if (isCampActive && hasActiveAd && daily > 0) {
        cboTotal += daily;
      }
    });

    let aboTotal = 0;
    adsets.forEach(a => {
      const parentCamp = activeCampMap.get(a.campaign_id);
      const isCampActive = activeCampIds.has(a.campaign_id);
      const isAdsetActive = activeAdsetIds.has(a.id);
      const parentIsCBO = parentCamp && parseFloat(parentCamp.daily_budget || 0) > 0;
      const hasActiveAd = trulyActiveAdsetsWithAds.has(a.id);
      const daily = parseFloat(a.daily_budget || 0) / 100;

      if (isCampActive && isAdsetActive && !parentIsCBO && hasActiveAd && daily > 0) {
        aboTotal += daily;
      }
    });

    const totalBudget = Math.round((cboTotal + aboTotal) * 100) / 100;

    console.log(`\nClient: ${acc.name} (${acc.id})`);
    console.log(`  Campaigns: ${campaigns.length} (Active: ${activeCampIds.size}), AdSets: ${adsets.length} (Active: ${activeAdsetIds.size}), Ads: ${ads.length} (Active: ${ads.filter(a => a.status === 'ACTIVE' || a.effective_status === 'ACTIVE').length})`);
    console.log(`  Active CBO: €${cboTotal}/gg, Active ABO: €${aboTotal}/gg => TOTAL ACTIVE DAILY BUDGET: €${totalBudget}/gg`);
    if (ads.length > 0) {
      ads.forEach(ad => {
        console.log(`    - Ad "${ad.name}": status=${ad.status}, effective_status=${ad.effective_status}, campaign_id=${ad.campaign_id}, adset_id=${ad.adset_id}`);
      });
    }
  }
}

testAllAccounts().catch(console.error);


