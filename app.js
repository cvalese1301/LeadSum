/* ==========================================================================
   LeadSum - Meta Ads Lead & Campaign Intelligence Application Logic
   ========================================================================== */

const STORAGE_KEYS = {
  COST_THRESHOLD: "leadsum-cost-threshold-v1",
  THRESHOLD_MODE: "leadsum-threshold-mode-v1",
  DATE_PRESET: "leadsum-date-preset-v1",
  STATUS_FILTER: "leadsum-status-filter-v1"
};

const DEFAULT_IMAGE = "assets/default-creative.svg";

// Main Global State
const appState = {
  adAccounts: [],
  hasToken: false,
  isDemo: false,
  
  analytics: {
    accountId: "",
    accountObj: null,
    datePreset: localStorage.getItem(STORAGE_KEYS.DATE_PRESET) || "last_7d",
    since: "",
    until: "",
    statusFilter: localStorage.getItem(STORAGE_KEYS.STATUS_FILTER) || "ACTIVE",
    costThreshold: parseFloat(localStorage.getItem(STORAGE_KEYS.COST_THRESHOLD) || "15.00"),
    thresholdMode: localStorage.getItem(STORAGE_KEYS.THRESHOLD_MODE) || "both",
    activeTableTab: "alert_ads",
    tableSearch: "",
    tableSort: { col: "spend", dir: "desc" },
    summary: null,
    dailyTrends: [],
    loading: false
  }
};

// DOM Elements Registry
const DOM = {
  // Navigation & Header
  navAccountName: document.querySelector("#navAccountName"),
  navStatusIndicator: document.querySelector("#navStatusIndicator"),
  globalRefreshBtn: document.querySelector("#globalRefreshBtn"),
  globalReportBtn: document.querySelector("#globalReportBtn"),
  exportCsvBtn: document.querySelector("#exportCsvBtn"),
  demoBanner: document.querySelector("#demoBanner"),
  dismissDemoBannerBtn: document.querySelector("#dismissDemoBannerBtn"),

  // Analytics Controls
  leadAccountSelect: document.querySelector("#leadAccountSelect"),
  datePills: document.querySelectorAll(".date-pill"),
  leadStatusFilter: document.querySelector("#leadStatusFilter"),
  customDateBar: document.querySelector("#customDateBar"),
  customDateSince: document.querySelector("#customDateSince"),
  customDateUntil: document.querySelector("#customDateUntil"),
  applyCustomDateBtn: document.querySelector("#applyCustomDateBtn"),
  costThresholdInput: document.querySelector("#costThresholdInput"),
  thresholdModeSelect: document.querySelector("#thresholdModeSelect"),
  jumpToAlertsBtn: document.querySelector("#jumpToAlertsBtn"),
  thresholdAlertsCountText: document.querySelector("#thresholdAlertsCountText"),

  // KPI Scorecards
  kpiTotalLeads: document.querySelector("#kpiTotalLeads"),
  kpiFormLeads: document.querySelector("#kpiFormLeads"),
  kpiMsgLeads: document.querySelector("#kpiMsgLeads"),
  kpiPixelLeads: document.querySelector("#kpiPixelLeads"),
  kpiAverageCpl: document.querySelector("#kpiAverageCpl"),
  kpiCplStatus: document.querySelector("#kpiCplStatus"),
  kpiTodaySpend: document.querySelector("#kpiTodaySpend"),
  kpiYesterdaySpend: document.querySelector("#kpiYesterdaySpend"),
  kpiDailyAvgSpend: document.querySelector("#kpiDailyAvgSpend"),
  kpiTotalSpend: document.querySelector("#kpiTotalSpend"),
  kpiDailyBudget: document.querySelector("#kpiDailyBudget"),
  kpiPacingPercent: document.querySelector("#kpiPacingPercent"),
  kpiProjectedText: document.querySelector("#kpiProjectedText"),
  kpiPacingBar: document.querySelector("#kpiPacingBar"),
  kpiAlertAdsCount: document.querySelector("#kpiAlertAdsCount"),
  kpiAlertWastedSpend: document.querySelector("#kpiAlertWastedSpend"),
  viewAlertAdsLink: document.querySelector("#viewAlertAdsLink"),

  // Chart & Secondary Metrics
  dailyTrendChartContainer: document.querySelector("#dailyTrendChartContainer"),
  secMetricImpressions: document.querySelector("#secMetricImpressions"),
  secMetricClicks: document.querySelector("#secMetricClicks"),
  secMetricCtr: document.querySelector("#secMetricCtr"),
  secMetricCpc: document.querySelector("#secMetricCpc"),
  secMetricCpm: document.querySelector("#secMetricCpm"),
  secMetricFrequency: document.querySelector("#secMetricFrequency"),

  // Tables
  tableTabs: document.querySelectorAll(".table-tab"),
  tabAlertAdsBadge: document.querySelector("#tabAlertAdsBadge"),
  tabAllAdsBadge: document.querySelector("#tabAllAdsBadge"),
  tabCampaignsBadge: document.querySelector("#tabCampaignsBadge"),
  tabAdsetsBadge: document.querySelector("#tabAdsetsBadge"),
  tableSearchInput: document.querySelector("#tableSearchInput"),
  dynamicTableContainer: document.querySelector("#dynamicTableContainer"),
  tableResultsCount: document.querySelector("#tableResultsCount"),
  tablesSection: document.querySelector("#tablesSection"),

  // Report Modal
  reportDialog: document.querySelector("#reportDialog"),
  reportOutput: document.querySelector("#reportOutput"),
  copyReportBtn: document.querySelector("#copyReportBtn"),
  closeReportDialogBtn: document.querySelector("#closeReportDialogBtn"),
  reportCopyFeedback: document.querySelector("#reportCopyFeedback")
};

// Formatting Utilities
const formatCurrency = (val = 0, currency = "EUR") => {
  const num = typeof val === "number" ? val : parseFloat(val || 0);
  const symbol = currency === "USD" ? "$" : (currency === "GBP" ? "£" : "€");
  return `${symbol} ${num.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatNumber = (val = 0) => {
  const num = typeof val === "number" ? val : parseInt(val || 0, 10);
  return num.toLocaleString("it-IT");
};

const formatPercent = (val = 0) => {
  const num = typeof val === "number" ? val : parseFloat(val || 0);
  return `${num.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
};

// Generic API Client
async function api(pathname, options = {}) {
  const response = await fetch(pathname, options);
  const payload = await response.json();
  if (!response.ok || payload.error) {
    const err = new Error(payload.error || `Errore API (${response.status})`);
    err.status = response.status;
    err.meta = payload.meta;
    throw err;
  }
  return payload;
}

/* ==========================================================================
   App Initialization
   ========================================================================== */

async function initApp() {
  bindGlobalEvents();
  bindAnalyticsEvents();

  // Set initial inputs from persisted state
  if (DOM.costThresholdInput) DOM.costThresholdInput.value = appState.analytics.costThreshold;
  if (DOM.thresholdModeSelect) DOM.thresholdModeSelect.value = appState.analytics.thresholdMode;
  if (DOM.leadStatusFilter) DOM.leadStatusFilter.value = appState.analytics.statusFilter;

  // Restore date preset button active class
  DOM.datePills.forEach(p => {
    if (p.dataset.preset === appState.analytics.datePreset) p.classList.add("active");
    else p.classList.remove("active");
  });

  // Load configuration & accounts
  await loadInitialConfig();
}

async function loadInitialConfig() {
  try {
    const config = await api("/api/meta/config");
    appState.hasToken = config.hasToken;
    appState.adAccounts = config.adAccounts || [];

    // Populate Account Dropdowns
    renderAccountDropdown();

    if (appState.adAccounts.length > 0) {
      const firstAccount = appState.adAccounts[0];
      appState.analytics.accountId = firstAccount.id;
      appState.analytics.accountObj = firstAccount;
      
      updateNavAccountHeader(firstAccount);
      await loadAnalyticsData();
    } else {
      updateNavAccountHeader(null);
    }
  } catch (error) {
    console.error("Config load error:", error);
    updateNavAccountHeader(null, error.message);
  }
}

function updateNavAccountHeader(account, errorMsg = null) {
  if (errorMsg) {
    if (DOM.navAccountName) DOM.navAccountName.textContent = "Errore Connessione Meta";
    if (DOM.navStatusIndicator) {
      const dot = DOM.navStatusIndicator.querySelector(".status-dot");
      if (dot) dot.className = "status-dot warning";
    }
    return;
  }

  if (!account) {
    if (DOM.navAccountName) DOM.navAccountName.textContent = "Nessun Account Trovato";
    return;
  }

  const isDemo = account.isDemo || account.id.startsWith("act_demo");
  appState.isDemo = isDemo;

  if (DOM.demoBanner) {
    DOM.demoBanner.style.display = isDemo ? "flex" : "none";
  }

  if (DOM.navAccountName) {
    DOM.navAccountName.textContent = `${account.name} (${account.currency || "EUR"})`;
  }

  if (DOM.navStatusIndicator) {
    const dot = DOM.navStatusIndicator.querySelector(".status-dot");
    if (dot) dot.className = isDemo ? "status-dot warning" : "status-dot";
  }
}

function renderAccountDropdown() {
  const optionsHtml = appState.adAccounts.map(acc => `
    <option value="${acc.id}" ${acc.id === appState.analytics.accountId ? "selected" : ""}>
      ${acc.name} (${acc.currency || "EUR"})${acc.isDemo ? " [Demo]" : ""}
    </option>
  `).join("");

  if (DOM.leadAccountSelect) DOM.leadAccountSelect.innerHTML = optionsHtml;
}

/* ==========================================================================
   Analytics Data Fetching & Rendering
   ========================================================================== */

async function loadAnalyticsData() {
  const accountId = appState.analytics.accountId;
  if (!accountId) return;

  appState.analytics.loading = true;
  if (DOM.globalRefreshBtn) {
    const icon = DOM.globalRefreshBtn.querySelector(".refresh-icon");
    if (icon) icon.classList.add("spinning");
  }

  const params = new URLSearchParams({
    accountId,
    datePreset: appState.analytics.datePreset
  });

  if (appState.analytics.datePreset === "custom" && appState.analytics.since && appState.analytics.until) {
    params.set("since", appState.analytics.since);
    params.set("until", appState.analytics.until);
  }

  try {
    const [summary, trendRes] = await Promise.all([
      api(`/api/meta/insights/summary?${params.toString()}`),
      api(`/api/meta/insights/daily?${params.toString()}`)
    ]);

    appState.analytics.summary = summary;
    appState.analytics.dailyTrends = trendRes.dailyTrends || [];

    renderAnalyticsDashboard();
  } catch (error) {
    console.error("Analytics fetch error:", error);
    alert(`Impossibile caricare i dati delle campagne: ${error.message}`);
  } finally {
    appState.analytics.loading = false;
    if (DOM.globalRefreshBtn) {
      const icon = DOM.globalRefreshBtn.querySelector(".refresh-icon");
      if (icon) icon.classList.remove("spinning");
    }
  }
}

function renderAnalyticsDashboard() {
  const summary = appState.analytics.summary;
  if (!summary) return;

  const { kpis, leadBreakdown, account } = summary;
  const currency = account?.currency || "EUR";
  const threshold = appState.analytics.costThreshold;

  // 1. Calculate & Highlight Ads Exceeding Threshold
  const alertAds = filterAlertAds(summary.ads || []);
  const wastedSpend = alertAds.reduce((acc, ad) => acc + ad.spend, 0);

  // 2. Render Top 5 KPI Scorecards
  if (DOM.kpiTotalLeads) DOM.kpiTotalLeads.textContent = formatNumber(kpis.totalLeads);
  if (DOM.kpiFormLeads) DOM.kpiFormLeads.textContent = `📑 ${formatNumber(leadBreakdown?.formLeads || 0)} Form`;
  if (DOM.kpiMsgLeads) DOM.kpiMsgLeads.textContent = `💬 ${formatNumber(leadBreakdown?.messagingLeads || 0)} Chat`;
  if (DOM.kpiPixelLeads) DOM.kpiPixelLeads.textContent = `🌐 ${formatNumber(leadBreakdown?.pixelLeads || 0)} Web`;

  if (DOM.kpiAverageCpl) DOM.kpiAverageCpl.textContent = formatCurrency(kpis.averageCpl, currency);
  if (DOM.kpiCplStatus) {
    const isAbove = kpis.averageCpl > threshold;
    DOM.kpiCplStatus.innerHTML = isAbove
      ? `<span class="dot-danger"></span><span style="color: var(--color-rose)">Sopra soglia di ${formatCurrency(kpis.averageCpl - threshold, currency)}</span>`
      : `<span class="dot-ok"></span><span>Ottimale (${formatCurrency(threshold - kpis.averageCpl, currency)} sotto soglia)</span>`;
  }

  if (DOM.kpiTodaySpend) DOM.kpiTodaySpend.textContent = formatCurrency(kpis.todaySpend, currency);
  if (DOM.kpiYesterdaySpend) DOM.kpiYesterdaySpend.textContent = formatCurrency(kpis.yesterdaySpend, currency);
  if (DOM.kpiDailyAvgSpend) DOM.kpiDailyAvgSpend.textContent = formatCurrency(kpis.averageDailySpend, currency);
  if (DOM.kpiTotalSpend) DOM.kpiTotalSpend.textContent = formatCurrency(kpis.totalSpend, currency);

  if (DOM.kpiDailyBudget) DOM.kpiDailyBudget.textContent = `${formatCurrency(kpis.totalDailyBudget, currency)}/gg`;
  if (DOM.kpiPacingPercent) DOM.kpiPacingPercent.textContent = `${kpis.pacingPercent}%`;
  if (DOM.kpiProjectedText) DOM.kpiProjectedText.textContent = `Proiezione: ${formatCurrency(kpis.projectedTodaySpend, currency)}`;
  if (DOM.kpiPacingBar) {
    DOM.kpiPacingBar.style.width = `${Math.min(100, kpis.pacingPercent)}%`;
    DOM.kpiPacingBar.style.backgroundColor = kpis.pacingPercent > 100 ? "var(--color-rose)" : (kpis.pacingPercent > 80 ? "var(--color-amber)" : "var(--color-emerald)");
  }

  if (DOM.kpiAlertAdsCount) DOM.kpiAlertAdsCount.textContent = `${alertAds.length} ${alertAds.length === 1 ? "Inserzione" : "Inserzioni"}`;
  if (DOM.kpiAlertWastedSpend) DOM.kpiAlertWastedSpend.textContent = `Spesa critica: ${formatCurrency(wastedSpend, currency)}`;
  if (DOM.thresholdAlertsCountText) DOM.thresholdAlertsCountText.textContent = `⚠️ ${alertAds.length} Inserzioni Sopra Soglia (${formatCurrency(threshold, currency)})`;

  // 3. Render Secondary Metrics Strip
  if (DOM.secMetricImpressions) DOM.secMetricImpressions.textContent = formatNumber(kpis.impressions);
  if (DOM.secMetricClicks) DOM.secMetricClicks.textContent = formatNumber(kpis.clicks);
  if (DOM.secMetricCtr) DOM.secMetricCtr.textContent = formatPercent(kpis.ctr);
  if (DOM.secMetricCpc) DOM.secMetricCpc.textContent = formatCurrency(kpis.cpc, currency);
  if (DOM.secMetricCpm) DOM.secMetricCpm.textContent = formatCurrency(kpis.cpm, currency);
  if (DOM.secMetricFrequency) DOM.secMetricFrequency.textContent = (kpis.frequency || 1).toFixed(2);

  // 4. Update Tab Badges
  if (DOM.tabAlertAdsBadge) DOM.tabAlertAdsBadge.textContent = alertAds.length;
  if (DOM.tabAllAdsBadge) DOM.tabAllAdsBadge.textContent = (summary.ads || []).length;
  if (DOM.tabCampaignsBadge) DOM.tabCampaignsBadge.textContent = (summary.campaigns || []).length;
  if (DOM.tabAdsetsBadge) DOM.tabAdsetsBadge.textContent = (summary.adsets || []).length;

  // 5. Render Daily Trend Chart
  renderDailyTrendChart(appState.analytics.dailyTrends, currency);

  // 6. Render Active Data Table
  renderDynamicTable();
}

function filterAlertAds(ads = []) {
  const threshold = appState.analytics.costThreshold;
  const mode = appState.analytics.thresholdMode;

  return ads.filter(ad => {
    // Status filter
    if (appState.analytics.statusFilter === "ACTIVE" && ad.status !== "ACTIVE" && ad.effective_status !== "ACTIVE") return false;
    if (appState.analytics.statusFilter === "PAUSED" && ad.status === "ACTIVE" && ad.effective_status === "ACTIVE") return false;

    const cpl = ad.cpl || 0;
    const leads = ad.totalLeads || 0;
    const spend = ad.spend || 0;

    const isHighCpl = leads > 0 && cpl > threshold;
    const isWastedSpend = leads === 0 && spend >= threshold;

    if (mode === "cpl_only") return isHighCpl;
    if (mode === "zero_leads_only") return isWastedSpend;
    return isHighCpl || isWastedSpend;
  });
}

/* ==========================================================================
   Interactive SVG Trend Chart
   ========================================================================== */

function renderDailyTrendChart(trends = [], currency = "EUR") {
  const container = DOM.dailyTrendChartContainer;
  if (!container) return;

  if (!trends || trends.length === 0) {
    container.innerHTML = `<div class="chart-loading">Nessun dato di trend disponibile per questo intervallo di date.</div>`;
    return;
  }

  const width = 1000;
  const height = 240;
  const padding = { top: 20, right: 30, bottom: 40, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxSpend = Math.max(...trends.map(t => t.spend), 10);
  const maxLeads = Math.max(...trends.map(t => t.leads), 5);
  const barWidth = Math.max(12, Math.min(48, (chartW / trends.length) * 0.5));
  const step = chartW / trends.length;

  // Generate SVG elements
  const barElements = [];
  const linePoints = [];
  const dotElements = [];

  trends.forEach((item, index) => {
    const x = padding.left + (index * step) + (step / 2);
    const barH = (item.spend / maxSpend) * chartH;
    const barY = padding.top + chartH - barH;
    const lineY = padding.top + chartH - ((item.leads / maxLeads) * chartH);

    linePoints.push(`${x},${lineY}`);

    barElements.push(`
      <rect class="chart-bar" x="${x - barWidth / 2}" y="${barY}" width="${barWidth}" height="${barH}" rx="4"
            fill="url(#spendGrad)" data-spend="${item.spend}" data-leads="${item.leads}" data-cpl="${item.cpl}" data-date="${item.dateFormatted || item.date}"></rect>
    `);

    dotElements.push(`
      <circle class="chart-dot" cx="${x}" cy="${lineY}" r="4.5" fill="#10b981" stroke="#090d16" stroke-width="2"
              data-spend="${item.spend}" data-leads="${item.leads}" data-cpl="${item.cpl}" data-date="${item.dateFormatted || item.date}"></circle>
    `);
  });

  const linePath = linePoints.join(" ");

  container.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="spendGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="#0284c7" stop-opacity="0.3"/>
        </linearGradient>
      </defs>

      <!-- Grid lines -->
      <line x1="${padding.left}" y1="${padding.top}" x2="${width - padding.right}" y2="${padding.top}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4"/>
      <line x1="${padding.left}" y1="${padding.top + chartH / 2}" x2="${width - padding.right}" y2="${padding.top + chartH / 2}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4"/>
      <line x1="${padding.left}" y1="${padding.top + chartH}" x2="${width - padding.right}" y2="${padding.top + chartH}" stroke="rgba(255,255,255,0.15)"/>

      <!-- Bars (Spend) -->
      ${barElements.join("")}

      <!-- Leads Line -->
      <polyline fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${linePath}"/>
      
      <!-- Leads Dots -->
      ${dotElements.join("")}

      <!-- X-Axis Labels -->
      ${trends.map((t, idx) => {
        const x = padding.left + (idx * step) + (step / 2);
        return `<text x="${x}" y="${height - 12}" fill="#64748b" font-size="11" text-anchor="middle" font-family="Plus Jakarta Sans">${t.dateFormatted || t.date}</text>`;
      }).join("")}
    </svg>
    <div class="chart-tooltip" id="chartTooltip"></div>
  `;

  // Attach hover listeners for interactive tooltip
  const tooltip = container.querySelector("#chartTooltip");
  const interactives = container.querySelectorAll(".chart-bar, .chart-dot");

  interactives.forEach(el => {
    el.addEventListener("mouseenter", () => {
      const date = el.dataset.date;
      const spend = parseFloat(el.dataset.spend || 0);
      const leads = parseInt(el.dataset.leads || 0, 10);
      const cpl = parseFloat(el.dataset.cpl || 0);

      tooltip.innerHTML = `
        <div style="font-weight: 700; color: #f8fafc; margin-bottom: 4px;">📅 ${date}</div>
        <div style="color: #38bdf8;">💶 Spesa: <strong>${formatCurrency(spend, currency)}</strong></div>
        <div style="color: #10b981;">👥 Contatti: <strong>${leads} lead</strong></div>
        <div style="color: #cbd5e1; font-size: 0.74rem; margin-top: 2px;">CPL: ${cpl > 0 ? formatCurrency(cpl, currency) : "N/D"}</div>
      `;
      tooltip.style.display = "block";
    });

    el.addEventListener("mousemove", (e) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left + 15;
      const y = e.clientY - rect.top - 40;
      tooltip.style.left = `${Math.min(x, rect.width - 160)}px`;
      tooltip.style.top = `${Math.max(10, y)}px`;
    });

    el.addEventListener("mouseleave", () => {
      tooltip.style.display = "none";
    });
  });
}

/* ==========================================================================
   Data Table Rendering & Sorting
   ========================================================================== */

function renderDynamicTable() {
  const summary = appState.analytics.summary;
  if (!summary) return;

  const tab = appState.analytics.activeTableTab;
  const currency = summary.account?.currency || "EUR";
  const threshold = appState.analytics.costThreshold;
  const search = (DOM.tableSearchInput?.value || "").toLowerCase().trim();

  let items = [];

  if (tab === "alert_ads") {
    items = filterAlertAds(summary.ads || []);
  } else if (tab === "all_ads") {
    items = (summary.ads || []).filter(ad => {
      if (appState.analytics.statusFilter === "ACTIVE" && ad.status !== "ACTIVE" && ad.effective_status !== "ACTIVE") return false;
      if (appState.analytics.statusFilter === "PAUSED" && ad.status === "ACTIVE" && ad.effective_status === "ACTIVE") return false;
      return true;
    });
  } else if (tab === "campaigns") {
    items = (summary.campaigns || []).filter(c => {
      if (appState.analytics.statusFilter === "ACTIVE" && c.status !== "ACTIVE" && c.effective_status !== "ACTIVE") return false;
      if (appState.analytics.statusFilter === "PAUSED" && c.status === "ACTIVE" && c.effective_status === "ACTIVE") return false;
      return true;
    });
  } else if (tab === "adsets") {
    items = (summary.adsets || []).filter(a => {
      if (appState.analytics.statusFilter === "ACTIVE" && a.status !== "ACTIVE" && a.effective_status !== "ACTIVE") return false;
      if (appState.analytics.statusFilter === "PAUSED" && a.status === "ACTIVE" && a.effective_status === "ACTIVE") return false;
      return true;
    });
  }

  // Apply search query
  if (search) {
    items = items.filter(item => {
      const name = (item.name || "").toLowerCase();
      const id = (item.id || "").toLowerCase();
      const campName = (item.campaign_name || "").toLowerCase();
      const adsetName = (item.adset_name || "").toLowerCase();
      return name.includes(search) || id.includes(search) || campName.includes(search) || adsetName.includes(search);
    });
  }

  if (DOM.tableResultsCount) {
    DOM.tableResultsCount.textContent = `Mostrati ${items.length} risultati su ${tab === "alert_ads" ? "inserzioni critiche" : tab}`;
  }

  if (items.length === 0) {
    DOM.dynamicTableContainer.innerHTML = `
      <div style="padding: 40px; text-align: center; color: var(--text-muted);">
        <div style="font-size: 2rem; margin-bottom: 8px;">✨</div>
        <strong style="color: #fff; display: block; font-size: 1rem;">Nessun elemento trovato per questi filtri</strong>
        <p style="font-size: 0.84rem; margin-top: 4px;">${tab === "alert_ads" ? "Ottimo! Nessuna inserzione supera la soglia di costo impostata." : "Prova a modificare i filtri di ricerca o la selezione temporale."}</p>
      </div>
    `;
    return;
  }

  if (tab === "alert_ads" || tab === "all_ads") {
    renderAdsTable(items, currency, threshold);
  } else if (tab === "campaigns") {
    renderCampaignsTable(items, currency, threshold);
  } else if (tab === "adsets") {
    renderAdsetsTable(items, currency, threshold);
  }
}

function renderAdsTable(ads, currency, threshold) {
  const rowsHtml = ads.map(ad => {
    const isOverThreshold = (ad.totalLeads > 0 && ad.cpl > threshold) || (ad.totalLeads === 0 && ad.spend >= threshold);
    const cplClass = ad.totalLeads === 0 ? (ad.spend >= threshold ? "cpl-warning" : "cpl-optimal") : (ad.cpl > threshold ? "cpl-danger" : "cpl-optimal");
    const isActive = ad.status === "ACTIVE" || ad.effective_status === "ACTIVE";

    return `
      <tr class="${isOverThreshold ? "row-alert" : ""}">
        <td>
          <div class="cell-ad-info">
            <img class="ad-thumb-img" src="${ad.creative?.thumbnail_url || DEFAULT_IMAGE}" alt="Anteprima" onerror="this.src='${DEFAULT_IMAGE}'">
            <div class="ad-title-block">
              <strong>${ad.name}</strong>
              <span>Campagna: ${ad.campaign_name || "N/D"}</span>
              <span>Gruppo: ${ad.adset_name || "N/D"}</span>
            </div>
          </div>
        </td>
        <td>
          <span class="status-badge ${isActive ? "status-active" : "status-paused"}">
            ${isActive ? "🟢 Attiva" : "⏸️ In Pausa"}
          </span>
        </td>
        <td><strong>${formatCurrency(ad.spend, currency)}</strong></td>
        <td>
          <strong style="font-size: 1rem; color: #10b981;">${ad.totalLeads}</strong>
          <span style="font-size: 0.74rem; color: var(--text-muted); display: block;">lead</span>
        </td>
        <td>
          <span class="cpl-badge ${cplClass}">
            ${ad.totalLeads > 0 ? formatCurrency(ad.cpl, currency) : (ad.spend > 0 ? "0 lead" : "€ 0,00")}
          </span>
        </td>
        <td>${formatPercent(ad.ctr)}</td>
        <td>
          <button class="btn ${isActive ? "btn-danger-sm" : "btn-success-sm"}" onclick="handleToggleAdStatus('${ad.id}', '${isActive ? "PAUSED" : "ACTIVE"}')">
            ${isActive ? "Metti in Pausa" : "Attiva Inserzione"}
          </button>
        </td>
      </tr>
    `;
  }).join("");

  DOM.dynamicTableContainer.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Inserzione / Creativo</th>
          <th>Stato</th>
          <th>Spesa Periodo</th>
          <th>Contatti (Lead)</th>
          <th>Costo / Contatto (CPL)</th>
          <th>CTR %</th>
          <th>Azione Rapida</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  `;
}

function renderCampaignsTable(campaigns, currency, threshold) {
  const rowsHtml = campaigns.map(c => {
    const isActive = c.status === "ACTIVE" || c.effective_status === "ACTIVE";
    const cplClass = c.totalLeads > 0 && c.cpl > threshold ? "cpl-danger" : "cpl-optimal";

    return `
      <tr>
        <td>
          <strong>${c.name}</strong>
          <span style="font-size: 0.74rem; color: var(--text-dim); display: block;">ID: ${c.id} • ${c.objective || "LEADS"}</span>
        </td>
        <td>
          <span class="status-badge ${isActive ? "status-active" : "status-paused"}">
            ${isActive ? "🟢 Attiva" : "⏸️ In Pausa"}
          </span>
        </td>
        <td>
          <span class="pill pill-muted">${c.budgetType || "ABO"}</span>
          <strong style="margin-left: 4px;">${c.dailyBudgetVal > 0 ? `${formatCurrency(c.dailyBudgetVal, currency)}/gg` : "A livello gruppo"}</strong>
        </td>
        <td><strong style="color: #38bdf8;">${formatCurrency(c.todaySpend, currency)}</strong></td>
        <td><strong>${formatCurrency(c.spend, currency)}</strong></td>
        <td>
          <strong style="font-size: 1rem; color: #10b981;">${c.totalLeads}</strong>
          <span style="font-size: 0.74rem; color: var(--text-muted); display: block;">lead</span>
        </td>
        <td>
          <span class="cpl-badge ${cplClass}">
            ${c.totalLeads > 0 ? formatCurrency(c.cpl, currency) : "N/D"}
          </span>
        </td>
        <td>${formatPercent(c.ctr)}</td>
      </tr>
    `;
  }).join("");

  DOM.dynamicTableContainer.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Nome Campagna</th>
          <th>Stato</th>
          <th>Budget Giornaliero</th>
          <th>Spesa Oggi</th>
          <th>Spesa Periodo</th>
          <th>Contatti (Lead)</th>
          <th>Costo Medio / Lead</th>
          <th>CTR %</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  `;
}

function renderAdsetsTable(adsets, currency, threshold) {
  const rowsHtml = adsets.map(a => {
    const isActive = a.status === "ACTIVE" || a.effective_status === "ACTIVE";
    const cplClass = a.totalLeads > 0 && a.cpl > threshold ? "cpl-danger" : "cpl-optimal";

    return `
      <tr>
        <td>
          <strong>${a.name}</strong>
          <span style="font-size: 0.74rem; color: var(--text-dim); display: block;">Campagna: ${a.campaign_name}</span>
        </td>
        <td>
          <span class="status-badge ${isActive ? "status-active" : "status-paused"}">
            ${isActive ? "🟢 Attivo" : "⏸️ In Pausa"}
          </span>
        </td>
        <td>
          <strong>${a.dailyBudgetVal > 0 ? `${formatCurrency(a.dailyBudgetVal, currency)}/gg` : "Gestito da CBO"}</strong>
        </td>
        <td><strong>${formatCurrency(a.spend, currency)}</strong></td>
        <td>
          <strong style="font-size: 1rem; color: #10b981;">${a.totalLeads}</strong>
          <span style="font-size: 0.74rem; color: var(--text-muted); display: block;">lead</span>
        </td>
        <td>
          <span class="cpl-badge ${cplClass}">
            ${a.totalLeads > 0 ? formatCurrency(a.cpl, currency) : "N/D"}
          </span>
        </td>
        <td>${formatPercent(a.ctr)}</td>
      </tr>
    `;
  }).join("");

  DOM.dynamicTableContainer.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Nome Gruppo Inserzioni</th>
          <th>Stato</th>
          <th>Budget Giornaliero</th>
          <th>Spesa Periodo</th>
          <th>Contatti Ricevuti</th>
          <th>Costo / Lead</th>
          <th>CTR %</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  `;
}

// Global action called from onclick in table rows
window.handleToggleAdStatus = async function(adId, newStatus) {
  try {
    await api("/api/meta/ads/toggle-status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adId, status: newStatus })
    });

    // Optimistically update locally
    if (appState.analytics.summary?.ads) {
      const ad = appState.analytics.summary.ads.find(a => a.id === adId);
      if (ad) {
        ad.status = newStatus;
        ad.effective_status = newStatus;
      }
    }

    renderAnalyticsDashboard();
  } catch (err) {
    alert(`Errore aggiornamento inserzione: ${err.message}`);
  }
};

/* ==========================================================================
   Report Generator & CSV Export
   ========================================================================== */

function openQuickReportModal() {
  const summary = appState.analytics.summary;
  if (!summary) return;

  const { kpis, leadBreakdown, account, campaigns = [], ads = [] } = summary;
  const currency = account?.currency || "EUR";
  const threshold = appState.analytics.costThreshold;
  const alertAds = filterAlertAds(ads);

  const topCampaign = [...campaigns].sort((a, b) => b.totalLeads - a.totalLeads)[0];

  const now = new Date();
  const dateStr = now.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });

  const reportText = `📊 *REPORT METRICHE META ADS - ${account?.name || "Account"}*
📅 *Data Report*: ${dateStr} • Periodo: ${appState.analytics.datePreset.toUpperCase()}
────────────────────────
👥 *CONTATTI RICEVUTI*: ${formatNumber(kpis.totalLeads)} lead
   • 📑 Moduli Facebook/IG: ${leadBreakdown?.formLeads || 0}
   • 💬 Chat WhatsApp / Direct: ${leadBreakdown?.messagingLeads || 0}
   • 🌐 Conversioni Pixel Web: ${leadBreakdown?.pixelLeads || 0}

💶 *COSTO MEDIO / CONTATTO (CPL)*: ${formatCurrency(kpis.averageCpl, currency)}
   ${kpis.averageCpl <= threshold ? `🟢 Sotto soglia massima (${formatCurrency(threshold, currency)})` : `🔴 Sopra soglia massima (${formatCurrency(threshold, currency)})`}

⏱️ *SPESA GIORNALIERA*:
   • Spesa di Oggi: ${formatCurrency(kpis.todaySpend, currency)}
   • Spesa di Ieri: ${formatCurrency(kpis.yesterdaySpend, currency)}
   • Media Giornaliera: ${formatCurrency(kpis.averageDailySpend, currency)}/gg

🎯 *BUDGET & PACING*:
   • Budget Giornaliero Attivo: ${formatCurrency(kpis.totalDailyBudget, currency)}/gg
   • Pacing di Oggi: ${kpis.pacingPercent}% (Proiezione: ${formatCurrency(kpis.projectedTodaySpend, currency)})

💰 *SPESA TOTALE PERIODO*: ${formatCurrency(kpis.totalSpend, currency)}
────────────────────────
${alertAds.length > 0 ? `⚠️ *INSERZIONI CRITICHE (> ${formatCurrency(threshold, currency)})*: ${alertAds.length} inserzioni
   ${alertAds.slice(0, 3).map(a => `• ${a.name}: ${formatCurrency(a.spend, currency)} (${a.totalLeads} lead @ ${a.totalLeads > 0 ? formatCurrency(a.cpl, currency) : "0 lead"})`).join("\n   ")}` : "✅ *Tutte le inserzioni sono entro la soglia di costo desiderata!*"}

🏆 *Top Performer*: ${topCampaign ? `${topCampaign.name} (${topCampaign.totalLeads} lead @ ${formatCurrency(topCampaign.cpl, currency)})` : "N/D"}
────────────────────────
_Generato con LeadSum Intelligence_`;

  if (DOM.reportOutput) DOM.reportOutput.value = reportText;
  if (DOM.reportCopyFeedback) DOM.reportCopyFeedback.textContent = "";
  DOM.reportDialog?.showModal();
}

function exportCsvData() {
  const summary = appState.analytics.summary;
  if (!summary || !summary.ads) return;

  const currency = summary.account?.currency || "EUR";
  const threshold = appState.analytics.costThreshold;

  const headers = ["Tipo", "ID", "Nome", "Campagna", "Gruppo", "Stato", "Spesa", "Contatti", "CPL", "CTR", "Alert Soglia"];
  const rows = [];

  // Ads rows
  (summary.ads || []).forEach(ad => {
    const isAlert = (ad.totalLeads > 0 && ad.cpl > threshold) || (ad.totalLeads === 0 && ad.spend >= threshold);
    rows.push([
      "Inserzione",
      `"${ad.id}"`,
      `"${(ad.name || "").replace(/"/g, '""')}"`,
      `"${(ad.campaign_name || "").replace(/"/g, '""')}"`,
      `"${(ad.adset_name || "").replace(/"/g, '""')}"`,
      ad.status,
      ad.spend.toFixed(2),
      ad.totalLeads,
      ad.cpl.toFixed(2),
      ad.ctr.toFixed(2),
      isAlert ? "SI" : "NO"
    ]);
  });

  const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `leadsum_report_${summary.account?.id || "meta"}_${new Date().toISOString().split("T")[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/* ==========================================================================
   Event Listeners Binding
   ========================================================================== */

function bindGlobalEvents() {
  DOM.globalRefreshBtn?.addEventListener("click", () => loadAnalyticsData());
  DOM.globalReportBtn?.addEventListener("click", () => openQuickReportModal());
  DOM.exportCsvBtn?.addEventListener("click", () => exportCsvData());
  DOM.dismissDemoBannerBtn?.addEventListener("click", () => {
    if (DOM.demoBanner) DOM.demoBanner.style.display = "none";
  });

  // Modal events
  DOM.closeReportDialogBtn?.addEventListener("click", () => DOM.reportDialog?.close());
  DOM.copyReportBtn?.addEventListener("click", async () => {
    if (DOM.reportOutput) {
      await navigator.clipboard.writeText(DOM.reportOutput.value);
      if (DOM.reportCopyFeedback) DOM.reportCopyFeedback.textContent = "✅ Report copiato negli appunti!";
      setTimeout(() => {
        if (DOM.reportCopyFeedback) DOM.reportCopyFeedback.textContent = "";
      }, 3000);
    }
  });
}

function bindAnalyticsEvents() {
  // Account Change
  DOM.leadAccountSelect?.addEventListener("change", async (e) => {
    const accountId = e.target.value;
    const accountObj = appState.adAccounts.find(a => a.id === accountId);
    appState.analytics.accountId = accountId;
    appState.analytics.accountObj = accountObj;
    updateNavAccountHeader(accountObj);
    await loadAnalyticsData();
  });

  // Date Preset Pills
  DOM.datePills.forEach(pill => {
    pill.addEventListener("click", async () => {
      DOM.datePills.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");

      const preset = pill.dataset.preset;
      appState.analytics.datePreset = preset;
      localStorage.setItem(STORAGE_KEYS.DATE_PRESET, preset);

      if (preset === "custom") {
        if (DOM.customDateBar) DOM.customDateBar.style.display = "flex";
      } else {
        if (DOM.customDateBar) DOM.customDateBar.style.display = "none";
        await loadAnalyticsData();
      }
    });
  });

  // Custom Date Apply
  DOM.applyCustomDateBtn?.addEventListener("click", async () => {
    const since = DOM.customDateSince?.value;
    const until = DOM.customDateUntil?.value;
    if (!since || !until) {
      alert("Seleziona sia la data di inizio che quella di fine.");
      return;
    }
    appState.analytics.since = since;
    appState.analytics.until = until;
    await loadAnalyticsData();
  });

  // Status Filter
  DOM.leadStatusFilter?.addEventListener("change", (e) => {
    appState.analytics.statusFilter = e.target.value;
    localStorage.setItem(STORAGE_KEYS.STATUS_FILTER, e.target.value);
    renderAnalyticsDashboard();
  });

  // Cost Threshold Dynamic Input (Immediate reactive feedback)
  DOM.costThresholdInput?.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val >= 0) {
      appState.analytics.costThreshold = val;
      localStorage.setItem(STORAGE_KEYS.COST_THRESHOLD, String(val));
      renderAnalyticsDashboard();
    }
  });

  // Threshold Mode Selector
  DOM.thresholdModeSelect?.addEventListener("change", (e) => {
    appState.analytics.thresholdMode = e.target.value;
    localStorage.setItem(STORAGE_KEYS.THRESHOLD_MODE, e.target.value);
    renderAnalyticsDashboard();
  });

  // Jump to alerts click
  DOM.jumpToAlertsBtn?.addEventListener("click", () => {
    switchTableTab("alert_ads");
    DOM.tablesSection?.scrollIntoView({ behavior: "smooth" });
  });

  DOM.viewAlertAdsLink?.addEventListener("click", () => {
    switchTableTab("alert_ads");
    DOM.tablesSection?.scrollIntoView({ behavior: "smooth" });
  });

  // Table Tabs
  DOM.tableTabs.forEach(tabBtn => {
    tabBtn.addEventListener("click", () => {
      switchTableTab(tabBtn.dataset.tableTab);
    });
  });

  // Table Search Input
  DOM.tableSearchInput?.addEventListener("input", () => {
    renderDynamicTable();
  });
}

function switchTableTab(tabName) {
  appState.analytics.activeTableTab = tabName;
  DOM.tableTabs.forEach(t => {
    if (t.dataset.tableTab === tabName) t.classList.add("active");
    else t.classList.remove("active");
  });
  renderDynamicTable();
}

// Start Application on Load
window.addEventListener("DOMContentLoaded", initApp);
