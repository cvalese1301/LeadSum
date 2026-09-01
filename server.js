const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const env = loadEnv(path.join(ROOT, ".env"));

function getEnv(key, defaultVal = "") {
  return process.env[key] || env[key] || defaultVal;
}

const PORT = Number(getEnv("PORT", 4173));
const API_VERSION = getEnv("META_API_VERSION", "v22.0");
const GRAPH_BASE = `https://graph.facebook.com/${API_VERSION}`;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8"
};

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};

  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .reduce((acc, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return acc;
      const separator = trimmed.indexOf("=");
      if (separator === -1) return acc;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim();
      acc[key] = value;
      return acc;
    }, {});
}

function parseNamedIds(value) {
  if (!value) return [];
  return value.split(",").map((item) => {
    const [label, id] = item.split(":");
    return { label: label.trim(), id: id.trim() };
  }).filter((item) => item.label && item.id);
}

function json(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

function token() {
  return getEnv("META_ACCESS_TOKEN");
}

function extractTokenFromReq(req) {
  const authHeader = req.headers["authorization"] || "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  if (req.headers["x-meta-token"]) {
    return String(req.headers["x-meta-token"]).trim();
  }
  return token();
}

async function graph(pathname, params = {}, accessToken = token()) {
  if (!accessToken) {
    const error = new Error("Token di accesso Meta non fornito. Effettua il login.");
    error.status = 401;
    throw error;
  }


  const url = new URL(`${GRAPH_BASE}/${pathname.replace(/^\//, "")}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url);
  const payload = await response.json();

  if (!response.ok || payload.error) {
    const error = new Error(payload.error?.message || `Errore Meta API ${response.status}`);
    error.status = response.status;
    error.meta = payload.error || payload;
    throw error;
  }

  return payload;
}

async function graphPost(pathname, params = {}, accessToken = token()) {
  if (!accessToken) {
    const error = new Error("META_ACCESS_TOKEN mancante nel file .env");
    error.status = 400;
    throw error;
  }

  const url = new URL(`${GRAPH_BASE}/${pathname.replace(/^\//, "")}`);
  const body = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      body.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
    }
  });
  body.set("access_token", accessToken);

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  const payload = await response.json();

  if (!response.ok || payload.error) {
    const error = new Error(payload.error?.message || `Errore Meta API ${response.status}`);
    error.status = response.status;
    error.meta = payload.error || payload;
    throw error;
  }

  return payload;
}

function pageTokenForId(pageId) {
  const page = parseNamedIds(env.META_FACEBOOK_PAGES).find((item) => item.id === pageId);
  if (!page) return null;
  return env[`META_PAGE_ACCESS_TOKEN_${page.label}`] || null;
}

function pageTokenForInstagramId(instagramId) {
  const instagram = parseNamedIds(env.META_INSTAGRAM_ACCOUNTS).find((item) => item.id === instagramId);
  if (!instagram) return null;
  return env[`META_PAGE_ACCESS_TOKEN_${instagram.label}`] || null;
}

function pageForInstagramId(instagramId) {
  const instagram = parseNamedIds(env.META_INSTAGRAM_ACCOUNTS).find((item) => item.id === instagramId);
  if (!instagram) return null;
  return parseNamedIds(env.META_FACEBOOK_PAGES).find((item) => item.label === instagram.label) || null;
}

async function dynamicPageTokenForId(pageId) {
  if (!pageId) return null;
  try {
    const page = await graph(`/${pageId}`, { fields: "access_token" });
    return page.access_token || null;
  } catch {
    return null;
  }
}

function configuredSources() {
  return {
    facebookPages: parseNamedIds(env.META_FACEBOOK_PAGES),
    instagramAccounts: parseNamedIds(env.META_INSTAGRAM_ACCOUNTS)
  };
}

function dedupeById(items) {
  return Array.from(new Map(items.filter((item) => item.id).map((item) => [item.id, item])).values());
}

function normalizeBusinessPage(page, sourceType) {
  return {
    id: page.id,
    label: page.name || page.username || page.id,
    name: page.name || page.username || "",
    sourceType
  };
}

function normalizeBusinessInstagram(page, sourceType) {
  const instagram = page.instagram_business_account;
  if (!instagram?.id) return null;
  return {
    id: instagram.id,
    label: instagram.username || instagram.name || page.name || instagram.id,
    name: instagram.name || instagram.username || "",
    pageId: page.id,
    pageName: page.name || "",
    sourceType
  };
}

async function listBusinessPages(businessId, edge, sourceType) {
  const payload = await graph(`/${businessId}/${edge}`, {
    fields: "id,name,username,instagram_business_account{id,username,name}",
    limit: "100"
  });
  const pages = payload.data || [];
  return {
    facebookPages: pages.map((page) => normalizeBusinessPage(page, sourceType)),
    instagramAccounts: pages.map((page) => normalizeBusinessInstagram(page, sourceType)).filter(Boolean)
  };
}

async function listSourcesForAdAccount(accountId) {
  const fallback = configuredSources();
  if (!accountId) return { ...fallback, mode: "configured", note: "Account pubblicitario non selezionato." };

  try {
    const account = await graph(`/${accountId}`, { fields: "id,name,business{id,name}" });
    const businessId = account.business?.id;
    if (!businessId) {
      return { ...fallback, mode: "configured", note: "Questo account non espone un Business Manager collegato: uso le fonti configurate." };
    }

    const collected = { facebookPages: [], instagramAccounts: [] };
    const errors = [];
    for (const [edge, sourceType] of [["owned_pages", "business_owned"], ["client_pages", "business_client"]]) {
      try {
        const sources = await listBusinessPages(businessId, edge, sourceType);
        collected.facebookPages.push(...sources.facebookPages);
        collected.instagramAccounts.push(...sources.instagramAccounts);
      } catch (error) {
        errors.push(`${edge}: ${error.message}`);
      }
    }

    const facebookPages = dedupeById(collected.facebookPages);
    const instagramAccounts = dedupeById(collected.instagramAccounts);
    if (!facebookPages.length && !instagramAccounts.length) {
      return {
        ...fallback,
        mode: "configured",
        note: errors.length ? `Meta non ha restituito pagine dal business: ${errors.join(" | ")}` : "Nessuna pagina business trovata: uso le fonti configurate."
      };
    }

    return {
      facebookPages,
      instagramAccounts,
      mode: "business",
      business: account.business,
      note: `Fonti prese dal Business Manager ${account.business.name || businessId}.`
    };
  } catch (error) {
    return { ...fallback, mode: "configured", note: `Non riesco a leggere il business dell'account: ${error.message}` };
  }
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function listAdAccounts(accessToken = token()) {
  if (!accessToken) {
    return [];
  }

  const payload = await graph("/me/adaccounts", {
    fields: "id,account_id,name,account_status,currency,timezone_name",
    limit: "100"
  }, accessToken);
  return payload.data || [];
}


function parseInsightsMetrics(row = {}) {
  const spend = parseFloat(row.spend || 0);
  const impressions = parseInt(row.impressions || 0, 10);
  const clicks = parseInt(row.clicks || 0, 10);
  const reach = parseInt(row.reach || 0, 10);
  const ctr = parseFloat(row.ctr || (impressions > 0 ? (clicks / impressions) * 100 : 0));
  const cpc = parseFloat(row.cpc || (clicks > 0 ? spend / clicks : 0));
  const cpm = parseFloat(row.cpm || (impressions > 0 ? (spend / impressions) * 1000 : 0));
  const frequency = parseFloat(row.frequency || (reach > 0 ? impressions / reach : 1));

  const actions = Array.isArray(row.actions) ? row.actions : [];
  const actionMap = {};
  actions.forEach((a) => {
    if (a && a.action_type) {
      actionMap[a.action_type] = parseFloat(a.value || 0);
    }
  });

  const formLeads = (actionMap["onsite_conversion.lead_grouped"] || 0) +
                    (actionMap["leadgen_grouped"] || 0) +
                    (actionMap["onsite_conversion.flow_lead"] || 0);

  const pixelLeads = (actionMap["offsite_conversion.fb_pixel_lead"] || 0) +
                     (actionMap["offsite_conversion.custom.lead"] || 0);

  const messagingLeads = (actionMap["onsite_conversion.messaging_conversation_started_7d"] || 0) +
                         (actionMap["onsite_conversion.messaging_user_depth_2_or_higher"] || 0) +
                         (actionMap["onsite_conversion.messaging_first_reply"] || 0);

  const genericLeads = (actionMap["lead"] || 0);
  const contactActions = (actionMap["contact"] || 0) +
                         (actionMap["complete_registration"] || 0) +
                         (actionMap["schedule"] || 0) +
                         (actionMap["submit_application"] || 0);

  let totalLeads = 0;
  if (actionMap["onsite_conversion.lead_grouped"] !== undefined && actionMap["onsite_conversion.lead_grouped"] > 0) {
    totalLeads = actionMap["onsite_conversion.lead_grouped"] + pixelLeads;
  } else if (genericLeads > 0) {
    totalLeads = genericLeads;
  } else {
    totalLeads = formLeads + pixelLeads + messagingLeads + contactActions;
  }

  const cpl = totalLeads > 0 ? spend / totalLeads : 0;

  return {
    spend: Math.round(spend * 100) / 100,
    impressions,
    clicks,
    reach,
    frequency: Math.round(frequency * 100) / 100,
    ctr: Math.round(ctr * 100) / 100,
    cpc: Math.round(cpc * 100) / 100,
    cpm: Math.round(cpm * 100) / 100,
    totalLeads,
    formLeads,
    pixelLeads,
    messagingLeads,
    contactActions,
    cpl: Math.round(cpl * 100) / 100,
    actionMap
  };
}

function calculateActiveDailyBudgets(campaigns = [], adsets = []) {
  let totalDailyBudget = 0;
  const campaignBudgetMap = {};
  const adsetBudgetMap = {};

  const activeCampaigns = campaigns.filter(c => c.status === "ACTIVE" || c.effective_status === "ACTIVE");
  const activeCampaignIds = new Set(activeCampaigns.map(c => c.id));

  campaigns.forEach(c => {
    const rawDaily = parseFloat(c.daily_budget || 0) / 100;
    const rawLifetime = parseFloat(c.lifetime_budget || 0) / 100;
    const isCBO = rawDaily > 0 || rawLifetime > 0;
    campaignBudgetMap[c.id] = {
      isCBO,
      dailyBudget: rawDaily,
      lifetimeBudget: rawLifetime,
      type: isCBO ? (rawDaily > 0 ? "CBO Giornaliero" : "CBO Totale") : "ABO"
    };

    if (activeCampaignIds.has(c.id) && rawDaily > 0) {
      totalDailyBudget += rawDaily;
    }
  });

  adsets.forEach(a => {
    const rawDaily = parseFloat(a.daily_budget || 0) / 100;
    const rawLifetime = parseFloat(a.lifetime_budget || 0) / 100;
    const parentCBO = campaignBudgetMap[a.campaign_id]?.isCBO;

    adsetBudgetMap[a.id] = {
      dailyBudget: rawDaily,
      lifetimeBudget: rawLifetime,
      isABO: !parentCBO && rawDaily > 0
    };

    if (activeCampaignIds.has(a.campaign_id) && !parentCBO && (a.status === "ACTIVE" || a.effective_status === "ACTIVE") && rawDaily > 0) {
      totalDailyBudget += rawDaily;
    }
  });

  return { totalDailyBudget: Math.round(totalDailyBudget * 100) / 100, campaignBudgetMap, adsetBudgetMap };
}

function getDemoInsightsData(datePreset = "last_7d") {
  const daysCount = datePreset === "today" ? 1 : (datePreset === "yesterday" ? 1 : (datePreset === "last_30d" ? 30 : 7));
  const mult = daysCount === 1 ? 1 : (daysCount === 30 ? 4.2 : 1.8);

  const campaigns = [
    {
      id: "cmp_demo_101",
      name: "🔥 [CBO] Lead Gen - Acquisizione Contatti Immobiliari",
      status: "ACTIVE",
      effective_status: "ACTIVE",
      objective: "OUTCOME_LEADS",
      daily_budget: "6000",
      lifetime_budget: null,
      budgetType: "CBO Giornaliero",
      dailyBudgetVal: 60.00,
      todaySpend: 42.80,
      todayLeads: 9,
      todayCpl: 4.75,
      spend: Math.round(312.40 * mult * 100) / 100,
      totalLeads: Math.round(68 * mult),
      formLeads: Math.round(58 * mult),
      pixelLeads: Math.round(10 * mult),
      messagingLeads: 0,
      cpl: 4.59,
      impressions: Math.round(18500 * mult),
      clicks: Math.round(540 * mult),
      ctr: 2.92,
      cpc: 0.58,
      cpm: 16.88
    },
    {
      id: "cmp_demo_102",
      name: "💬 [ABO] WhatsApp Direct - Consulenza & Preventivi",
      status: "ACTIVE",
      effective_status: "ACTIVE",
      objective: "OUTCOME_ENGAGEMENT",
      daily_budget: null,
      lifetime_budget: null,
      budgetType: "ABO (Livello Gruppo)",
      dailyBudgetVal: 40.00,
      todaySpend: 28.50,
      todayLeads: 5,
      todayCpl: 5.70,
      spend: Math.round(198.60 * mult * 100) / 100,
      totalLeads: Math.round(32 * mult),
      formLeads: 0,
      pixelLeads: 0,
      messagingLeads: Math.round(32 * mult),
      cpl: 6.20,
      impressions: Math.round(12400 * mult),
      clicks: Math.round(390 * mult),
      ctr: 3.15,
      cpc: 0.51,
      cpm: 16.01
    },
    {
      id: "cmp_demo_103",
      name: "🌐 [CBO] Remarketing Pixel - Form Registrazione Webinar",
      status: "ACTIVE",
      effective_status: "ACTIVE",
      objective: "OUTCOME_LEADS",
      daily_budget: "2500",
      lifetime_budget: null,
      budgetType: "CBO Giornaliero",
      dailyBudgetVal: 25.00,
      todaySpend: 16.90,
      todayLeads: 2,
      todayCpl: 8.45,
      spend: Math.round(118.20 * mult * 100) / 100,
      totalLeads: Math.round(14 * mult),
      formLeads: 0,
      pixelLeads: Math.round(14 * mult),
      messagingLeads: 0,
      cpl: 8.44,
      impressions: Math.round(5200 * mult),
      clicks: Math.round(165 * mult),
      ctr: 3.17,
      cpc: 0.72,
      cpm: 22.73
    },
    {
      id: "cmp_demo_104",
      name: "🛑 [ABO] Test Nuovo Target Geografico [In Pausa]",
      status: "PAUSED",
      effective_status: "PAUSED",
      objective: "OUTCOME_LEADS",
      daily_budget: null,
      lifetime_budget: null,
      budgetType: "ABO",
      dailyBudgetVal: 0.00,
      todaySpend: 0.00,
      todayLeads: 0,
      todayCpl: 0.00,
      spend: Math.round(48.50 * mult * 100) / 100,
      totalLeads: 2,
      formLeads: 2,
      pixelLeads: 0,
      messagingLeads: 0,
      cpl: 24.25,
      impressions: Math.round(2100 * mult),
      clicks: Math.round(42 * mult),
      ctr: 2.00,
      cpc: 1.15,
      cpm: 23.09
    }
  ];

  const adsets = [
    {
      id: "adset_demo_201",
      campaign_id: "cmp_demo_101",
      campaign_name: "🔥 [CBO] Lead Gen - Acquisizione Contatti Immobiliari",
      name: "🎯 Lookalike 1% Acquirenti & Form Inviati",
      status: "ACTIVE",
      effective_status: "ACTIVE",
      daily_budget: null,
      dailyBudgetVal: 0.00,
      spend: Math.round(184.20 * mult * 100) / 100,
      totalLeads: Math.round(45 * mult),
      cpl: 4.09,
      impressions: Math.round(11200 * mult),
      clicks: Math.round(340 * mult),
      ctr: 3.04
    },
    {
      id: "adset_demo_202",
      campaign_id: "cmp_demo_101",
      campaign_name: "🔥 [CBO] Lead Gen - Acquisizione Contatti Immobiliari",
      name: "🎯 Interessi Real Estate & Mutui Casa (28-55)",
      status: "ACTIVE",
      effective_status: "ACTIVE",
      daily_budget: null,
      dailyBudgetVal: 0.00,
      spend: Math.round(128.20 * mult * 100) / 100,
      totalLeads: Math.round(23 * mult),
      cpl: 5.57,
      impressions: Math.round(7300 * mult),
      clicks: Math.round(200 * mult),
      ctr: 2.74
    },
    {
      id: "adset_demo_203",
      campaign_id: "cmp_demo_102",
      campaign_name: "💬 [ABO] WhatsApp Direct - Consulenza & Preventivi",
      name: "📱 WhatsApp - Target Locale Raggio 25km",
      status: "ACTIVE",
      effective_status: "ACTIVE",
      daily_budget: "2500",
      dailyBudgetVal: 25.00,
      spend: Math.round(124.60 * mult * 100) / 100,
      totalLeads: Math.round(22 * mult),
      cpl: 5.66,
      impressions: Math.round(7800 * mult),
      clicks: Math.round(250 * mult),
      ctr: 3.20
    },
    {
      id: "adset_demo_204",
      campaign_id: "cmp_demo_102",
      campaign_name: "💬 [ABO] WhatsApp Direct - Consulenza & Preventivi",
      name: "📱 WhatsApp - Retargeting Interazioni Social 60gg",
      status: "ACTIVE",
      effective_status: "ACTIVE",
      daily_budget: "1500",
      dailyBudgetVal: 15.00,
      spend: Math.round(74.00 * mult * 100) / 100,
      totalLeads: Math.round(10 * mult),
      cpl: 7.40,
      impressions: Math.round(4600 * mult),
      clicks: Math.round(140 * mult),
      ctr: 3.04
    },
    {
      id: "adset_demo_205",
      campaign_id: "cmp_demo_103",
      campaign_name: "🌐 [CBO] Remarketing Pixel - Form Registrazione Webinar",
      name: "🖥️ Visitatori Landing Page 30gg",
      status: "ACTIVE",
      effective_status: "ACTIVE",
      daily_budget: null,
      dailyBudgetVal: 0.00,
      spend: Math.round(118.20 * mult * 100) / 100,
      totalLeads: Math.round(14 * mult),
      cpl: 8.44,
      impressions: Math.round(5200 * mult),
      clicks: Math.round(165 * mult),
      ctr: 3.17
    }
  ];

  const ads = [
    {
      id: "ad_demo_301",
      name: "ADV 01 - Video Tour Villa con Giardino [Top]",
      campaign_id: "cmp_demo_101",
      campaign_name: "🔥 [CBO] Lead Gen - Acquisizione Contatti Immobiliari",
      adset_id: "adset_demo_201",
      adset_name: "🎯 Lookalike 1% Acquirenti & Form Inviati",
      status: "ACTIVE",
      effective_status: "ACTIVE",
      spend: Math.round(112.50 * mult * 100) / 100,
      totalLeads: Math.round(31 * mult),
      cpl: 3.63,
      impressions: Math.round(7400 * mult),
      clicks: Math.round(230 * mult),
      ctr: 3.11,
      cpc: 0.49,
      cpm: 15.20,
      creative: {
        title: "Nuova Villa con Giardino a pochi minuti dal centro",
        body: "Scarica subito la scheda tecnica e prenota una visita privata prima che vada esaurita.",
        thumbnail_url: "assets/default-creative.svg"
      }
    },
    {
      id: "ad_demo_302",
      name: "ADV 02 - Carosello 5 Bilocali Ristrutturati",
      campaign_id: "cmp_demo_101",
      campaign_name: "🔥 [CBO] Lead Gen - Acquisizione Contatti Immobiliari",
      adset_id: "adset_demo_201",
      adset_name: "🎯 Lookalike 1% Acquirenti & Form Inviati",
      status: "ACTIVE",
      effective_status: "ACTIVE",
      spend: Math.round(71.70 * mult * 100) / 100,
      totalLeads: Math.round(14 * mult),
      cpl: 5.12,
      impressions: Math.round(3800 * mult),
      clicks: Math.round(110 * mult),
      ctr: 2.89,
      cpc: 0.65,
      cpm: 18.87,
      creative: {
        title: "Guarda i bilocali disponibili con rata mutuo agevolata",
        body: "Compila il modulo per ricevere la planimetria dettagliata.",
        thumbnail_url: "assets/default-creative.svg"
      }
    },
    {
      id: "ad_demo_303",
      name: "ADV 03 - Immagine Singola: Consulenza Mutuo 100%",
      campaign_id: "cmp_demo_101",
      campaign_name: "🔥 [CBO] Lead Gen - Acquisizione Contatti Immobiliari",
      adset_id: "adset_demo_202",
      adset_name: "🎯 Interessi Real Estate & Mutui Casa (28-55)",
      status: "ACTIVE",
      effective_status: "ACTIVE",
      spend: Math.round(82.40 * mult * 100) / 100,
      totalLeads: Math.round(18 * mult),
      cpl: 4.58,
      impressions: Math.round(4900 * mult),
      clicks: Math.round(140 * mult),
      ctr: 2.86,
      cpc: 0.59,
      cpm: 16.82,
      creative: {
        title: "Calcola la rata del tuo mutuo su misura",
        body: "Richiedi un check gratuito con i nostri consulenti dedicati.",
        thumbnail_url: "assets/default-creative.svg"
      }
    },
    {
      id: "ad_demo_304",
      name: "ADV 04 - [CRITICA] Copy Lungo Filosofico [Costo Alto]",
      campaign_id: "cmp_demo_101",
      campaign_name: "🔥 [CBO] Lead Gen - Acquisizione Contatti Immobiliari",
      adset_id: "adset_demo_202",
      adset_name: "🎯 Interessi Real Estate & Mutui Casa (28-55)",
      status: "ACTIVE",
      effective_status: "ACTIVE",
      spend: Math.round(45.80 * mult * 100) / 100,
      totalLeads: Math.round(2 * mult) || 1,
      cpl: 22.90,
      impressions: Math.round(2400 * mult),
      clicks: Math.round(60 * mult),
      ctr: 2.50,
      cpc: 0.76,
      cpm: 19.08,
      creative: {
        title: "Perché comprare casa oggi è la scelta migliore per il tuo futuro",
        body: "Riflessione sul mercato immobiliare attuale e opportunità...",
        thumbnail_url: "assets/default-creative.svg"
      }
    },
    {
      id: "ad_demo_305",
      name: "ADV 05 - [SPRECO] Reel Grafico Senza CTA [0 Lead]",
      campaign_id: "cmp_demo_101",
      campaign_name: "🔥 [CBO] Lead Gen - Acquisizione Contatti Immobiliari",
      adset_id: "adset_demo_202",
      adset_name: "🎯 Interessi Real Estate & Mutui Casa (28-55)",
      status: "ACTIVE",
      effective_status: "ACTIVE",
      spend: 34.50,
      totalLeads: 0,
      cpl: 0.00,
      impressions: 2100,
      clicks: 35,
      ctr: 1.67,
      cpc: 0.99,
      cpm: 16.43,
      creative: {
        title: "Scopri le nostre novità del mese",
        body: "Guarda il video per maggiori informazioni",
        thumbnail_url: "assets/default-creative.svg"
      }
    },
    {
      id: "ad_demo_306",
      name: "ADV 06 - WhatsApp: Scrivici su WA per info immediata",
      campaign_id: "cmp_demo_102",
      campaign_name: "💬 [ABO] WhatsApp Direct - Consulenza & Preventivi",
      adset_id: "adset_demo_203",
      adset_name: "📱 WhatsApp - Target Locale Raggio 25km",
      status: "ACTIVE",
      effective_status: "ACTIVE",
      spend: Math.round(124.60 * mult * 100) / 100,
      totalLeads: Math.round(22 * mult),
      cpl: 5.66,
      impressions: Math.round(7800 * mult),
      clicks: Math.round(250 * mult),
      ctr: 3.20,
      cpc: 0.50,
      cpm: 15.97,
      creative: {
        title: "Parla subito con un nostro agente su WhatsApp",
        body: "Rispondiamo in meno di 5 minuti senza impegno.",
        thumbnail_url: "assets/default-creative.svg"
      }
    },
    {
      id: "ad_demo_307",
      name: "ADV 07 - [CRITICA] WhatsApp Retargeting Offer Scaduta",
      campaign_id: "cmp_demo_102",
      campaign_name: "💬 [ABO] WhatsApp Direct - Consulenza & Preventivi",
      adset_id: "adset_demo_204",
      adset_name: "📱 WhatsApp - Retargeting Interazioni Social 60gg",
      status: "ACTIVE",
      effective_status: "ACTIVE",
      spend: Math.round(74.00 * mult * 100) / 100,
      totalLeads: Math.round(3 * mult) || 2,
      cpl: 24.67,
      impressions: Math.round(4600 * mult),
      clicks: Math.round(140 * mult),
      ctr: 3.04,
      cpc: 0.53,
      cpm: 16.09,
      creative: {
        title: "Hai ancora dubbi? Chatta con noi",
        body: "Promozione esclusiva valida solo per questa settimana...",
        thumbnail_url: "assets/default-creative.svg"
      }
    },
    {
      id: "ad_demo_308",
      name: "ADV 08 - Pixel Landing: Iscrizione Guida Gratuita PDF",
      campaign_id: "cmp_demo_103",
      campaign_name: "🌐 [CBO] Remarketing Pixel - Form Registrazione Webinar",
      adset_id: "adset_demo_205",
      adset_name: "🖥️ Visitatori Landing Page 30gg",
      status: "ACTIVE",
      effective_status: "ACTIVE",
      spend: Math.round(118.20 * mult * 100) / 100,
      totalLeads: Math.round(14 * mult),
      cpl: 8.44,
      impressions: Math.round(5200 * mult),
      clicks: Math.round(165 * mult),
      ctr: 3.17,
      cpc: 0.72,
      cpm: 22.73,
      creative: {
        title: "Guida Completa 2026 all'Acquisto Casa",
        body: "Inserisci la tua email per scaricare subito il PDF gratuito.",
        thumbnail_url: "assets/default-creative.svg"
      }
    }
  ];

  const totalSpend = campaigns.reduce((acc, c) => acc + c.spend, 0);
  const totalLeads = campaigns.reduce((acc, c) => acc + c.totalLeads, 0);
  const formLeads = campaigns.reduce((acc, c) => acc + c.formLeads, 0);
  const pixelLeads = campaigns.reduce((acc, c) => acc + c.pixelLeads, 0);
  const messagingLeads = campaigns.reduce((acc, c) => acc + c.messagingLeads, 0);
  const impressions = campaigns.reduce((acc, c) => acc + c.impressions, 0);
  const clicks = campaigns.reduce((acc, c) => acc + c.clicks, 0);
  const averageCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;
  const totalDailyBudget = 125.00; // 60 (CBO) + 40 (ABO) + 25 (CBO)
  const todaySpend = 88.20;
  const yesterdaySpend = 114.40;
  const averageDailySpend = Math.round((totalSpend / daysCount) * 100) / 100;
  const pacingPercent = Math.round((todaySpend / totalDailyBudget) * 1000) / 10;
  const projectedTodaySpend = Math.round(todaySpend * 1.35 * 100) / 100;

  return {
    isDemo: true,
    account: {
      id: "act_demo_123456789",
      name: "Account Demo - Lead Intelligence",
      currency: "EUR",
      timezone_name: "Europe/Rome",
      status: "ACTIVE"
    },
    dateRange: {
      preset: datePreset,
      daysCount
    },
    kpis: {
      totalSpend: Math.round(totalSpend * 100) / 100,
      totalLeads,
      averageCpl: Math.round(averageCpl * 100) / 100,
      todaySpend,
      yesterdaySpend,
      averageDailySpend,
      totalDailyBudget,
      pacingPercent,
      projectedTodaySpend,
      impressions,
      clicks,
      ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
      cpc: clicks > 0 ? Math.round((totalSpend / clicks) * 100) / 100 : 0,
      cpm: impressions > 0 ? Math.round((totalSpend / impressions) * 100000) / 100 : 0
    },
    leadBreakdown: {
      formLeads,
      pixelLeads,
      messagingLeads
    },
    campaigns,
    adsets,
    ads
  };
}

function getDemoDailyTrendData(datePreset = "last_7d") {
  const days = datePreset === "last_30d" ? 30 : (datePreset === "last_14d" ? 14 : 7);
  const list = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const baseSpend = isWeekend ? 115 : 92;
    const spend = Math.round((baseSpend + (Math.sin(i) * 18) + (Math.random() * 10)) * 100) / 100;
    const leads = Math.max(3, Math.round(spend / (4.8 + Math.sin(i * 1.5) * 1.2)));
    const cpl = Math.round((spend / leads) * 100) / 100;
    const impressions = Math.round(spend * 58);
    const clicks = Math.round(impressions * 0.028);

    list.push({
      date: dateStr,
      dateFormatted: d.toLocaleDateString("it-IT", { day: "2-digit", month: "short" }),
      spend,
      leads,
      cpl,
      impressions,
      clicks,
      ctr: Math.round((clicks / impressions) * 10000) / 100
    });
  }

  return list;
}

async function fetchLiveInsightsSummary(accountId, query = {}, accessToken = token()) {
  const datePreset = query.datePreset || "last_7d";
  const since = query.since;
  const until = query.until;

  const timeParams = {};
  if (since && until) {
    timeParams.time_range = JSON.stringify({ since, until });
  } else {
    timeParams.date_preset = datePreset;
  }

  const [accountInfo, campaignsRes, adsetsRes, adsRes] = await Promise.all([
    graph(`/${accountId}`, { fields: "id,account_id,name,currency,timezone_name,account_status" }, accessToken),
    graph(`/${accountId}/campaigns`, {
      fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget,budget_remaining,buying_type,created_time,updated_time",
      limit: "200"
    }, accessToken),
    graph(`/${accountId}/adsets`, {
      fields: "id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,budget_remaining,optimization_goal,billing_event,bid_amount,created_time,updated_time",
      limit: "250"
    }, accessToken),
    graph(`/${accountId}/ads`, {
      fields: "id,name,status,effective_status,campaign_id,adset_id,creative{id,name,title,body,image_url,thumbnail_url,object_story_id,instagram_permalink_url},created_time,updated_time",
      limit: "300"
    }, accessToken)
  ]);

  const campaigns = campaignsRes.data || [];
  const adsets = adsetsRes.data || [];
  const ads = adsRes.data || [];

  const { totalDailyBudget, campaignBudgetMap, adsetBudgetMap } = calculateActiveDailyBudgets(campaigns, adsets);

  const [accountInsightsRes, todayInsightsRes, yesterdayInsightsRes, campaignInsightsRes, adsetInsightsRes, adInsightsRes] = await Promise.all([
    graph(`/${accountId}/insights`, {
      ...timeParams,
      fields: "spend,impressions,clicks,reach,ctr,cpc,cpm,frequency,actions,cost_per_action_type"
    }, accessToken).catch(() => ({ data: [] })),
    graph(`/${accountId}/insights`, {
      date_preset: "today",
      fields: "spend,actions"
    }, accessToken).catch(() => ({ data: [] })),
    graph(`/${accountId}/insights`, {
      date_preset: "yesterday",
      fields: "spend,actions"
    }, accessToken).catch(() => ({ data: [] })),
    graph(`/${accountId}/insights`, {
      ...timeParams,
      level: "campaign",
      fields: "campaign_id,campaign_name,spend,impressions,clicks,reach,ctr,cpc,cpm,actions,cost_per_action_type",
      limit: "200"
    }, accessToken).catch(() => ({ data: [] })),
    graph(`/${accountId}/insights`, {
      ...timeParams,
      level: "adset",
      fields: "adset_id,adset_name,campaign_id,spend,impressions,clicks,reach,ctr,cpc,cpm,actions,cost_per_action_type",
      limit: "250"
    }, accessToken).catch(() => ({ data: [] })),
    graph(`/${accountId}/insights`, {
      ...timeParams,
      level: "ad",
      fields: "ad_id,ad_name,adset_id,campaign_id,spend,impressions,clicks,reach,ctr,cpc,cpm,actions,cost_per_action_type",
      limit: "300"
    }, accessToken).catch(() => ({ data: [] }))
  ]);

  const todayCampaignInsightsRes = await graph(`/${accountId}/insights`, {
    date_preset: "today",
    level: "campaign",
    fields: "campaign_id,spend,actions",
    limit: "200"
  }, accessToken).catch(() => ({ data: [] }));

  const todayCampaignMap = {};
  (todayCampaignInsightsRes.data || []).forEach(row => {
    const parsed = parseInsightsMetrics(row);
    todayCampaignMap[row.campaign_id] = {
      spend: parsed.spend,
      leads: parsed.totalLeads,
      cpl: parsed.cpl
    };
  });

  const accountMetric = parseInsightsMetrics(accountInsightsRes.data?.[0] || {});
  const todayMetric = parseInsightsMetrics(todayInsightsRes.data?.[0] || {});
  const yesterdayMetric = parseInsightsMetrics(yesterdayInsightsRes.data?.[0] || {});

  const campaignMap = new Map(campaigns.map(c => [c.id, c]));
  const adsetMap = new Map(adsets.map(a => [a.id, a]));

  const campaignInsightMap = {};
  (campaignInsightsRes.data || []).forEach(row => {
    campaignInsightMap[row.campaign_id] = parseInsightsMetrics(row);
  });

  const adsetInsightMap = {};
  (adsetInsightsRes.data || []).forEach(row => {
    adsetInsightMap[row.adset_id] = parseInsightsMetrics(row);
  });

  const adInsightMap = {};
  (adInsightsRes.data || []).forEach(row => {
    adInsightMap[row.ad_id] = parseInsightsMetrics(row);
  });

  const numericActId = String(accountInfo.account_id || accountInfo.id || accountId).replace(/^act_/, "");

  const enrichedCampaigns = campaigns.map(c => {
    const metrics = campaignInsightMap[c.id] || parseInsightsMetrics({});
    const today = todayCampaignMap[c.id] || { spend: 0, leads: 0, cpl: 0 };
    const budgetInfo = campaignBudgetMap[c.id] || { isCBO: false, dailyBudget: 0, lifetimeBudget: 0, type: "ABO" };

    return {
      id: c.id,
      name: c.name,
      adsManagerUrl: `https://www.facebook.com/adsmanager/manage/campaigns?act=${numericActId}&selected_campaign_ids=${c.id}`,
      status: c.status,
      effective_status: c.effective_status,
      objective: c.objective,
      budgetType: budgetInfo.type,
      dailyBudgetVal: budgetInfo.dailyBudget,
      lifetimeBudgetVal: budgetInfo.lifetimeBudget,
      todaySpend: today.spend,
      todayLeads: today.leads,
      todayCpl: today.cpl,
      spend: metrics.spend,
      totalLeads: metrics.totalLeads,
      formLeads: metrics.formLeads,
      pixelLeads: metrics.pixelLeads,
      messagingLeads: metrics.messagingLeads,
      cpl: metrics.cpl,
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      ctr: metrics.ctr,
      cpc: metrics.cpc,
      cpm: metrics.cpm
    };
  });

  const enrichedAdsets = adsets.map(a => {
    const metrics = adsetInsightMap[a.id] || parseInsightsMetrics({});
    const parentCamp = campaignMap.get(a.campaign_id);
    const budgetInfo = adsetBudgetMap[a.id] || { dailyBudget: 0, lifetimeBudget: 0, isABO: false };

    return {
      id: a.id,
      name: a.name,
      campaign_id: a.campaign_id,
      campaign_name: parentCamp?.name || a.campaign_id,
      adsManagerUrl: `https://www.facebook.com/adsmanager/manage/adsets?act=${numericActId}&selected_adset_ids=${a.id}`,
      status: a.status,
      effective_status: a.effective_status,
      dailyBudgetVal: budgetInfo.dailyBudget,
      lifetimeBudgetVal: budgetInfo.lifetimeBudget,
      isABO: budgetInfo.isABO,
      spend: metrics.spend,
      totalLeads: metrics.totalLeads,
      cpl: metrics.cpl,
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      ctr: metrics.ctr,
      cpc: metrics.cpc,
      cpm: metrics.cpm
    };
  });

  const enrichedAds = ads.map(ad => {
    const metrics = adInsightMap[ad.id] || parseInsightsMetrics({});
    const parentCamp = campaignMap.get(ad.campaign_id);
    const parentAdset = adsetMap.get(ad.adset_id);

    return {
      id: ad.id,
      name: ad.name,
      campaign_id: ad.campaign_id,
      campaign_name: parentCamp?.name || ad.campaign_id,
      adset_id: ad.adset_id,
      adset_name: parentAdset?.name || ad.adset_id,
      adsManagerUrl: `https://www.facebook.com/adsmanager/manage/ads?act=${numericActId}&selected_ad_ids=${ad.id}`,
      status: ad.status,
      effective_status: ad.effective_status,
      spend: metrics.spend,
      totalLeads: metrics.totalLeads,
      cpl: metrics.cpl,
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      ctr: metrics.ctr,
      cpc: metrics.cpc,
      cpm: metrics.cpm,
      creative: ad.creative || null
    };
  });


  const daysCount = datePreset === "today" || datePreset === "yesterday" ? 1 : (datePreset === "last_30d" ? 30 : (datePreset === "last_14d" ? 14 : 7));
  const averageDailySpend = Math.round((accountMetric.spend / daysCount) * 100) / 100;
  const pacingPercent = totalDailyBudget > 0 ? Math.round((todayMetric.spend / totalDailyBudget) * 1000) / 10 : 0;
  const projectedTodaySpend = Math.round(todayMetric.spend * 1.35 * 100) / 100;

  return {
    isDemo: false,
    account: {
      id: accountInfo.id,
      account_id: accountInfo.account_id,
      name: accountInfo.name,
      currency: accountInfo.currency || "EUR",
      timezone_name: accountInfo.timezone_name || "Europe/Rome",
      status: accountInfo.account_status === 1 ? "ACTIVE" : "OTHER"
    },
    dateRange: {
      preset: datePreset,
      since,
      until,
      daysCount
    },
    kpis: {
      totalSpend: accountMetric.spend,
      totalLeads: accountMetric.totalLeads,
      averageCpl: accountMetric.cpl,
      todaySpend: todayMetric.spend,
      yesterdaySpend: yesterdayMetric.spend,
      averageDailySpend,
      totalDailyBudget,
      pacingPercent,
      projectedTodaySpend,
      impressions: accountMetric.impressions,
      clicks: accountMetric.clicks,
      ctr: accountMetric.ctr,
      cpc: accountMetric.cpc,
      cpm: accountMetric.cpm,
      frequency: accountMetric.frequency,
      reach: accountMetric.reach
    },
    leadBreakdown: {
      formLeads: accountMetric.formLeads,
      pixelLeads: accountMetric.pixelLeads,
      messagingLeads: accountMetric.messagingLeads
    },
    campaigns: enrichedCampaigns,
    adsets: enrichedAdsets,
    ads: enrichedAds
  };
}

async function fetchLiveDailyTrend(accountId, query = {}) {
  const datePreset = query.datePreset || "last_7d";
  const since = query.since;
  const until = query.until;

  const timeParams = {};
  if (since && until) {
    timeParams.time_range = JSON.stringify({ since, until });
  } else {
    timeParams.date_preset = datePreset;
  }

  const payload = await graph(`/${accountId}/insights`, {
    ...timeParams,
    time_increment: "1",
    fields: "date_start,spend,impressions,clicks,actions,cost_per_action_type",
    limit: "100"
  });

  return (payload.data || []).map(row => {
    const parsed = parseInsightsMetrics(row);
    const dateObj = new Date(row.date_start);
    return {
      date: row.date_start,
      dateFormatted: isNaN(dateObj.getTime()) ? row.date_start : dateObj.toLocaleDateString("it-IT", { day: "2-digit", month: "short" }),
      spend: parsed.spend,
      leads: parsed.totalLeads,
      cpl: parsed.cpl,
      impressions: parsed.impressions,
      clicks: parsed.clicks,
      ctr: parsed.ctr
    };
  });
}

async function findRule(accountId, ruleId) {
  if (!accountId || !ruleId) return null;
  const payload = await graph(`/${accountId}/adrules_library`, {
    fields: "id,name,evaluation_spec,execution_spec,schedule_spec,status,created_time,updated_time",
    limit: "100"
  });
  return (payload.data || []).find((rule) => rule.id === ruleId) || null;
}

function parseMetaJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === "object") return structuredClone(value);
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mergeAdIdsIntoEvaluationSpec(evaluationSpec, adIds) {
  const spec = parseMetaJson(evaluationSpec, {});
  const filters = Array.isArray(spec.filters) ? spec.filters : [];
  const adIdFilter = filters.find((filter) => filter.field === "ad.id" && filter.operator === "IN" && Array.isArray(filter.value));

  if (!adIdFilter) {
    return {
      updatedSpec: spec,
      changed: false,
      message: "Regola non aggiornata: questa regola non contiene una lista di ID inserzione modificabile."
    };
  }

  const existing = new Set(adIdFilter.value.map(String));
  adIds.map(String).forEach((id) => existing.add(id));
  const nextValue = Array.from(existing);
  const changed = nextValue.length !== adIdFilter.value.length;
  adIdFilter.value = nextValue;

  return {
    updatedSpec: spec,
    changed,
    message: changed
      ? "Regola applicata: ho aggiunto questa inserzione alla lista della regola."
      : "Regola gia applicata: questa inserzione era gia nella lista della regola."
  };
}

async function applyRuleToCreatedAds(accountId, ruleId, adIds) {
  if (!ruleId || !adIds.length) {
    return { applied: false, message: "Nessuna regola selezionata." };
  }

  const rule = await findRule(accountId, ruleId);
  if (!rule) {
    return { applied: false, message: "Regola non trovata nell'account pubblicitario selezionato." };
  }

  const merge = mergeAdIdsIntoEvaluationSpec(rule.evaluation_spec, adIds);
  if (!merge.changed) {
    return { applied: false, message: merge.message };
  }

  await graphPost(`/${ruleId}`, { evaluation_spec: merge.updatedSpec });
  return { applied: true, message: merge.message };
}

async function handleApi(req, res, url) {
  try {
    const userToken = extractTokenFromReq(req);

    // Auth 1: Validate session / Get user profile
    if (url.pathname === "/api/auth/me") {
      const appId = getEnv("META_APP_ID", "1487594375621582");
      if (!userToken) {
        return json(res, 200, { authenticated: false, appId });
      }

      try {
        const userRes = await graph("/me", { fields: "id,name,picture{url}" }, userToken);
        return json(res, 200, {
          authenticated: true,
          appId,
          user: {
            id: userRes.id,
            name: userRes.name,
            picture: userRes.picture?.data?.url || null
          }
        });
      } catch (err) {
        return json(res, 200, {
          authenticated: false,
          appId,
          error: err.message
        });
      }
    }

    // Auth 2: Exchange Facebook Login Token
    if (url.pathname === "/api/auth/facebook-login" && req.method === "POST") {
      const body = await readJsonBody(req);
      const incomingToken = body.accessToken;
      const appId = getEnv("META_APP_ID", "1487594375621582");
      const appSecret = getEnv("META_APP_SECRET", "c5bdacb60e9268b584c504403eb452d1");

      if (!incomingToken) {
        return json(res, 400, { error: "Access token non fornito" });
      }

      try {
        let finalToken = incomingToken;
        if (appSecret) {
          try {
            const exchangeRes = await fetch(`https://graph.facebook.com/${API_VERSION}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${incomingToken}`);
            const exchangeData = await exchangeRes.json();
            if (exchangeData.access_token) {
              finalToken = exchangeData.access_token;
            }
          } catch (e) {
            console.warn("Could not exchange for long lived token:", e.message);
          }
        }

        const userRes = await graph("/me", { fields: "id,name,picture{url}" }, finalToken);
        return json(res, 200, {
          ok: true,
          accessToken: finalToken,
          user: {
            id: userRes.id,
            name: userRes.name,
            picture: userRes.picture?.data?.url || null
          }
        });
      } catch (err) {
        return json(res, 401, {
          ok: false,
          error: `Login Meta non riuscito: ${err.message}`
        });
      }
    }

    // 0. Client Overview (Dashboard multi-account)
    if (url.pathname === "/api/meta/insights/clients-overview") {
      const accountIdsParam = url.searchParams.get("accountIds");
      const datePreset = url.searchParams.get("datePreset") || "yesterday";
      const since = url.searchParams.get("since");
      const until = url.searchParams.get("until");
      const threshold = parseFloat(url.searchParams.get("threshold") || "15.00");

      let targetAccounts = [];
      if (accountIdsParam) {
        const ids = accountIdsParam.split(",").map(s => s.trim()).filter(Boolean);
        const allAccs = await listAdAccounts(userToken).catch(() => []);
        targetAccounts = allAccs.filter(a => ids.includes(a.id));
      } else {
        targetAccounts = await listAdAccounts(userToken).catch(() => []);
      }

      if (targetAccounts.length === 0 && !userToken) {
        const demo = getDemoInsightsData(datePreset);
        return json(res, 200, {
          isDemo: true,
          datePreset,
          clients: [
            {
              id: "act_demo_1",
              name: "Dott Sante Vass",
              activeCampaignsCount: 11,
              totalLeads: 16,
              spend: 434.30,
              cpl: 27.14,
              dailyBudget: 467.00,
              alertAdsCount: 3,
              currency: "EUR"
            },
            {
              id: "act_demo_2",
              name: "SVD",
              activeCampaignsCount: 9,
              totalLeads: 109,
              spend: 1637.93,
              cpl: 15.03,
              dailyBudget: 1850.00,
              alertAdsCount: 2,
              currency: "EUR"
            },
            {
              id: "act_demo_3",
              name: "PAA",
              activeCampaignsCount: 4,
              totalLeads: 9,
              spend: 24.20,
              cpl: 2.69,
              dailyBudget: 35.00,
              alertAdsCount: 0,
              currency: "EUR"
            },
            {
              id: "act_demo_4",
              name: "PAR",
              activeCampaignsCount: 4,
              totalLeads: 8,
              spend: 34.25,
              cpl: 4.28,
              dailyBudget: 45.00,
              alertAdsCount: 0,
              currency: "EUR"
            },
            {
              id: "act_demo_5",
              name: "Bar Nol",
              activeCampaignsCount: 1,
              totalLeads: 1,
              spend: 2.87,
              cpl: 2.87,
              dailyBudget: 10.00,
              alertAdsCount: 0,
              currency: "EUR"
            },
            {
              id: "act_demo_6",
              name: "Galullo",
              activeCampaignsCount: 5,
              totalLeads: 0,
              spend: 101.58,
              cpl: 0.00,
              dailyBudget: 120.00,
              alertAdsCount: 2,
              currency: "EUR"
            },
            {
              id: "act_demo_7",
              name: "Asd Sp",
              activeCampaignsCount: 2,
              totalLeads: 4,
              spend: 16.89,
              cpl: 4.22,
              dailyBudget: 20.00,
              alertAdsCount: 0,
              currency: "EUR"
            },
            {
              id: "act_demo_8",
              name: "Cesena Sub",
              activeCampaignsCount: 2,
              totalLeads: 1,
              spend: 12.40,
              cpl: 12.40,
              dailyBudget: 15.00,
              alertAdsCount: 0,
              currency: "EUR"
            }
          ]
        });
      }

      const timeParams = {};
      if (datePreset === "custom" && since && until) {
        timeParams.time_range = JSON.stringify({ since, until });
      } else {
        timeParams.date_preset = datePreset;
      }

      // Fetch all clients metrics in parallel
      const clientPromises = targetAccounts.map(async (acc) => {
        try {
          const [insightsRes, campaignsRes, adsetsRes] = await Promise.all([
            graph(`/${acc.id}/insights`, {
              ...timeParams,
              fields: "spend,actions",
              limit: "5"
            }, userToken).catch(() => ({ data: [] })),

            graph(`/${acc.id}/campaigns`, {
              fields: "id,name,status,effective_status,daily_budget",
              effective_status: "['ACTIVE']",
              limit: "100"
            }, userToken).catch(() => ({ data: [] })),

            graph(`/${acc.id}/adsets`, {
              fields: "id,name,campaign_id,status,effective_status,daily_budget",
              effective_status: "['ACTIVE']",
              limit: "100"
            }, userToken).catch(() => ({ data: [] }))
          ]);

          const parsed = parseInsightsMetrics(insightsRes.data?.[0] || {});
          const activeCampaigns = campaignsRes.data || [];
          const activeAdsets = adsetsRes.data || [];
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

          const totalDailyBudget = Math.round((cboTotal + aboTotal) * 100) / 100;

          // If CPL > threshold, flag alert
          const isHighCpl = parsed.totalLeads > 0 && parsed.cpl > threshold;
          const isZeroLeadWaste = parsed.totalLeads === 0 && parsed.spend >= threshold;
          const alertAdsCount = (isHighCpl || isZeroLeadWaste) ? 1 : 0;

          return {
            id: acc.id,
            account_id: acc.account_id,
            name: acc.name,
            currency: acc.currency || "EUR",
            activeCampaignsCount: activeCampaigns.length,
            totalCampaignsCount: campaignsRes.data?.length || activeCampaigns.length,
            totalLeads: parsed.totalLeads,
            formLeads: parsed.formLeads,
            messagingLeads: parsed.messagingLeads,
            pixelLeads: parsed.pixelLeads,
            spend: parsed.spend,
            cpl: parsed.cpl,
            dailyBudget: totalDailyBudget,
            cboBudget: cboTotal,
            aboBudget: aboTotal,
            impressions: parsed.impressions,
            clicks: parsed.clicks,
            ctr: parsed.ctr,
            alertAdsCount
          };

        } catch (err) {
          return {
            id: acc.id,
            account_id: acc.account_id,
            name: acc.name,
            currency: acc.currency || "EUR",
            activeCampaignsCount: 0,
            totalLeads: 0,
            spend: 0,
            cpl: 0,
            dailyBudget: 0,
            alertAdsCount: 0,
            error: err.message
          };
        }
      });


      const clients = await Promise.all(clientPromises);

      return json(res, 200, {
        isDemo: false,
        datePreset,
        since: since || null,
        until: until || null,
        clients
      });
    }

    // 1. Insights Overview & Summary
    if (url.pathname === "/api/meta/insights/summary") {
      const accountId = url.searchParams.get("accountId") || env.META_AD_ACCOUNT_ID || "act_demo_123456789";
      const datePreset = url.searchParams.get("datePreset") || "last_7d";
      const since = url.searchParams.get("since");
      const until = url.searchParams.get("until");

      if (accountId.startsWith("act_demo") || accountId === "demo" || !token()) {
        return json(res, 200, getDemoInsightsData(datePreset));
      }

      try {
        const summary = await fetchLiveInsightsSummary(accountId, { datePreset, since, until }, userToken);
        return json(res, 200, summary);
      } catch (error) {
        console.warn("Live insights error, returning fallback demo data:", error.message);
        const demoData = getDemoInsightsData(datePreset);
        demoData.liveError = error.message;
        return json(res, 200, demoData);
      }
    }

    // 2. Daily Trend Breakdown
    if (url.pathname === "/api/meta/insights/daily") {
      const accountId = url.searchParams.get("accountId") || "demo";
      const datePreset = url.searchParams.get("datePreset") || "last_7d";
      const since = url.searchParams.get("since");
      const until = url.searchParams.get("until");

      if (accountId.startsWith("act_demo") || accountId === "demo" || !userToken) {
        return json(res, 200, { dailyTrends: getDemoDailyTrendData(datePreset) });
      }

      try {
        const dailyTrends = await fetchLiveDailyTrend(accountId, { datePreset, since, until }, userToken);
        return json(res, 200, { dailyTrends });
      } catch (error) {
        console.warn("Live daily trend error, returning fallback demo trend:", error.message);
        return json(res, 200, { dailyTrends: getDemoDailyTrendData(datePreset), liveError: error.message });
      }
    }

    // 3. Toggle Ad Status (Pause / Activate)
    if (url.pathname === "/api/meta/ads/toggle-status" && req.method === "POST") {
      const body = await readJsonBody(req);
      const { adId, status } = body;

      if (!adId || !status) {
        return json(res, 400, { error: "Parametri mancanti: adId e status sono obbligatori" });
      }

      if (adId.startsWith("ad_demo") || !userToken) {
        return json(res, 200, { ok: true, adId, status, message: `Stato inserzione demo aggiornato a ${status}` });
      }

      const response = await graphPost(`/${adId}`, { status }, userToken);
      return json(res, 200, { ok: true, adId, status, meta: response });
    }

    // 4. Create Ads in Bulk (Existing feature)
    if (url.pathname === "/api/meta/create-ads" && req.method === "POST") {
      const body = await readJsonBody(req);
      const results = [];

      for (const post of body.ads || []) {
        try {
          const creativeParams = {
            name: post.adName,
            status: "ACTIVE"
          };

          if (post.platform === "Facebook") {
            creativeParams.object_story_id = post.sourcePostId;
          } else {
            const page = pageForInstagramId(post.instagramAccountId);
            creativeParams.object_id = page?.id || post.pageId;
            creativeParams.instagram_user_id = post.instagramAccountId;
            creativeParams.source_instagram_media_id = post.sourcePostId;
          }

          const creative = await graphPost(`/${body.adAccountId}/adcreatives`, creativeParams, userToken);
          const ad = await graphPost(`/${body.adAccountId}/ads`, {
            name: post.adName,
            adset_id: post.adsetId,
            creative: { creative_id: creative.id },
            status: body.status || "PAUSED"
          }, userToken);

          results.push({
            ok: true,
            localId: post.id,
            adName: post.adName,
            platform: post.platform,
            adId: ad.id,
            creativeId: creative.id,
            ruleId: post.ruleId || null
          });
        } catch (error) {
          results.push({
            ok: false,
            localId: post.id,
            adName: post.adName,
            platform: post.platform,
            error: error.message,
            meta: error.meta || null
          });
        }
      }

      const createdByRule = results
        .filter((result) => result.ok && result.ruleId)
        .reduce((acc, result) => {
          acc[result.ruleId] ||= [];
          acc[result.ruleId].push(result.adId);
          return acc;
        }, {});

      for (const [ruleId, adIds] of Object.entries(createdByRule)) {
        try {
          const ruleResult = await applyRuleToCreatedAds(body.adAccountId, ruleId, adIds);
          results
            .filter((result) => result.ok && result.ruleId === ruleId)
            .forEach((result) => {
              result.ruleApplied = ruleResult.applied;
              result.ruleMessage = ruleResult.message;
            });
        } catch (error) {
          results
            .filter((result) => result.ok && result.ruleId === ruleId)
            .forEach((result) => {
              result.ruleApplied = false;
              result.ruleMessage = `Inserzione creata, ma regola non applicata: ${error.message}`;
              result.ruleMeta = error.meta || null;
            });
        }
      }

      return json(res, 200, { data: results });
    }

    if (url.pathname === "/api/meta/config") {
      let adAccounts = [];
      let adAccountsError = null;
      try {
        adAccounts = await listAdAccounts(userToken);
      } catch (error) {
        adAccountsError = error.message;
        adAccounts = [
          {
            id: "act_demo_123456789",
            account_id: "demo_123456789",
            name: "Account Demo - Lead Intelligence",
            account_status: 1,
            currency: "EUR",
            timezone_name: "Europe/Rome",
            isDemo: true
          }
        ];
      }
      return json(res, 200, {
        apiVersion: API_VERSION,
        loginConfigId: getEnv("META_LOGIN_CONFIG_ID", null),
        hasToken: Boolean(userToken),
        ...configuredSources(),
        adAccounts,
        adAccountsError
      });
    }

    if (url.pathname === "/api/meta/sources") {
      const accountId = url.searchParams.get("accountId");
      return json(res, 200, await listSourcesForAdAccount(accountId));
    }

    if (url.pathname === "/api/meta/adaccounts") {
      return json(res, 200, { data: await listAdAccounts() });
    }

    if (url.pathname === "/api/meta/campaigns") {
      const accountId = url.searchParams.get("accountId");
      if (!accountId || accountId.startsWith("act_demo") || !token()) {
        const demo = getDemoInsightsData("last_7d");
        return json(res, 200, { data: demo.campaigns });
      }
      const payload = await graph(`/${accountId}/campaigns`, {
        fields: "id,name,status,effective_status,objective,created_time,updated_time",
        limit: "100"
      });
      return json(res, 200, payload);
    }

    if (url.pathname === "/api/meta/adsets") {
      const accountId = url.searchParams.get("accountId");
      const campaignId = url.searchParams.get("campaignId");
      if (!accountId || accountId.startsWith("act_demo") || !token()) {
        const demo = getDemoInsightsData("last_7d");
        let sets = demo.adsets;
        if (campaignId) sets = sets.filter(s => s.campaign_id === campaignId);
        return json(res, 200, { data: sets });
      }
      const filtering = campaignId ? JSON.stringify([{ field: "campaign.id", operator: "EQUAL", value: campaignId }]) : "";
      const payload = await graph(`/${accountId}/adsets`, {
        fields: "id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,billing_event,optimization_goal",
        filtering,
        limit: "100"
      });
      return json(res, 200, payload);
    }

    if (url.pathname === "/api/meta/rules") {
      const accountId = url.searchParams.get("accountId");
      if (!accountId || accountId.startsWith("act_demo") || !token()) {
        return json(res, 200, { data: [] });
      }
      const payload = await graph(`/${accountId}/adrules_library`, {
        fields: "id,name,evaluation_spec,execution_spec,schedule_spec,status,created_time,updated_time",
        limit: "100"
      });
      return json(res, 200, payload);
    }

    if (url.pathname === "/api/meta/facebook-posts") {
      const pageId = url.searchParams.get("pageId");
      const pageAccessToken = pageTokenForId(pageId) || await dynamicPageTokenForId(pageId);
      const payload = await graph(`/${pageId}/posts`, {
        fields: "id,message,permalink_url,created_time,full_picture,status_type,attachments{media_type,title,description,unshimmed_url}",
        limit: "50"
      }, pageAccessToken || token());
      return json(res, 200, payload);
    }

    if (url.pathname === "/api/meta/instagram-media") {
      const instagramId = url.searchParams.get("instagramId");
      const pageId = url.searchParams.get("pageId");
      const pageAccessToken = pageTokenForInstagramId(instagramId) || await dynamicPageTokenForId(pageId);
      const payload = await graph(`/${instagramId}/media`, {
        fields: "id,caption,media_type,media_url,permalink,timestamp,thumbnail_url",
        limit: "50"
      }, pageAccessToken || token());
      return json(res, 200, payload);
    }

    return json(res, 404, { error: "Endpoint non trovato" });
  } catch (error) {
    return json(res, error.status || 500, {
      error: error.message,
      meta: error.meta || null
    });
  }
}

function serveStatic(req, res, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(ROOT, requestedPath));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes[ext] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url);
    return;
  }

  serveStatic(req, res, url);
});

server.listen(PORT, () => {
  console.log(`LeadSum & Post Inserter running on http://localhost:${PORT}`);
});
