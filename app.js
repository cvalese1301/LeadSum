/* ==========================================================================
   LeadSum - Minimalist Multi-Client Application Logic
   ========================================================================== */

const STORAGE_KEYS = {
  VISIBLE_ACCOUNTS: "leadsum_visible_accounts_v2",
  COST_THRESHOLD: "leadsum_cost_threshold_v2",
  DATE_PRESET: "leadsum_date_preset_v2",
  CUSTOM_SINCE: "leadsum_custom_since_v2",
  CUSTOM_UNTIL: "leadsum_custom_until_v2",
  ONLY_ACTIVE: "leadsum_only_active_v2",
  USER_TOKEN: "leadsum_user_token_v2"
};

const state = {
  user: {
    authenticated: false,
    id: null,
    name: null,
    picture: null,
    token: localStorage.getItem(STORAGE_KEYS.USER_TOKEN) || null
  },
  allAdAccounts: [],
  visibleAccountIds: JSON.parse(localStorage.getItem(STORAGE_KEYS.VISIBLE_ACCOUNTS) || "null"),
  datePreset: localStorage.getItem(STORAGE_KEYS.DATE_PRESET) || "yesterday",
  customSince: localStorage.getItem(STORAGE_KEYS.CUSTOM_SINCE) || "",
  customUntil: localStorage.getItem(STORAGE_KEYS.CUSTOM_UNTIL) || "",
  costThreshold: parseFloat(localStorage.getItem(STORAGE_KEYS.COST_THRESHOLD) || "15.00"),
  onlyActiveCampaigns: localStorage.getItem(STORAGE_KEYS.ONLY_ACTIVE) !== "false",
  clientsData: [],
  searchFilter: "",
  sortColumn: "spend",
  sortDirection: "desc",
  expandedAccountId: null,
  expandedDetailsCache: {},
  loading: false
};

const DOM = {
  // Login & Auth
  loginScreen: document.querySelector("#loginScreen"),
  btnFacebookLogin: document.querySelector("#btnFacebookLogin"),
  loginErrorMsg: document.querySelector("#loginErrorMsg"),
  btnToggleManualToken: document.querySelector("#btnToggleManualToken"),
  manualTokenBox: document.querySelector("#manualTokenBox"),
  inputManualToken: document.querySelector("#inputManualToken"),
  btnSubmitManualToken: document.querySelector("#btnSubmitManualToken"),
  tokenChevron: document.querySelector("#tokenChevron"),
  userProfileBadge: document.querySelector("#userProfileBadge"),
  userProfileAvatar: document.querySelector("#userProfileAvatar"),
  userProfileName: document.querySelector("#userProfileName"),
  btnLogout: document.querySelector("#btnLogout"),

  // Navigation & Date
  dateButtons: document.querySelectorAll(".date-btn"),
  customDatesWrap: document.querySelector("#customDatesWrap"),
  inputDateSince: document.querySelector("#inputDateSince"),
  inputDateUntil: document.querySelector("#inputDateUntil"),
  btnApplyCustomDate: document.querySelector("#btnApplyCustomDate"),
  globalThresholdInput: document.querySelector("#globalThresholdInput"),
  chkOnlyActiveCampaigns: document.querySelector("#chkOnlyActiveCampaigns"),
  btnOpenAccountsModal: document.querySelector("#btnOpenAccountsModal"),
  btnAccountsCountText: document.querySelector("#btnAccountsCountText"),
  btnOpenReportModal: document.querySelector("#btnOpenReportModal"),
  btnRefreshData: document.querySelector("#btnRefreshData"),

  // Totals Bar
  totalLeadsVal: document.querySelector("#totalLeadsVal"),
  totalSpendVal: document.querySelector("#totalSpendVal"),
  totalCplVal: document.querySelector("#totalCplVal"),
  totalBudgetVal: document.querySelector("#totalBudgetVal"),
  totalAlertsVal: document.querySelector("#totalAlertsVal"),

  // Table
  tableDateRangeSubtitle: document.querySelector("#tableDateRangeSubtitle"),
  clientSearchInput: document.querySelector("#clientSearchInput"),
  colHeaderLeads: document.querySelector("#colHeaderLeads"),
  colHeaderSpend: document.querySelector("#colHeaderSpend"),
  clientsTableBody: document.querySelector("#clientsTableBody"),
  footerMetaStatus: document.querySelector("#footerMetaStatus"),
  footerRowsCount: document.querySelector("#footerRowsCount"),
  tableHeaders: document.querySelectorAll(".th-sortable"),

  // Modal Accounts
  modalAccounts: document.querySelector("#modalAccounts"),
  btnCloseAccountsModal: document.querySelector("#btnCloseAccountsModal"),
  accountModalSearchInput: document.querySelector("#accountModalSearchInput"),
  btnSelectAllAccounts: document.querySelector("#btnSelectAllAccounts"),
  btnDeselectAllAccounts: document.querySelector("#btnDeselectAllAccounts"),
  accountsCheckboxList: document.querySelector("#accountsCheckboxList"),
  modalSelectedCount: document.querySelector("#modalSelectedCount"),
  btnSaveAccountSelection: document.querySelector("#btnSaveAccountSelection"),

  // Modal Report
  modalReport: document.querySelector("#modalReport"),
  btnCloseReportModal: document.querySelector("#btnCloseReportModal"),
  reportTextOutput: document.querySelector("#reportTextOutput"),
  reportCopyFeedback: document.querySelector("#reportCopyFeedback"),
  btnCopyReportText: document.querySelector("#btnCopyReportText")
};

// Utilities
const formatCurrency = (val = 0, currency = "EUR") => {
  const num = typeof val === "number" ? val : parseFloat(val || 0);
  const symbol = currency === "USD" ? "$" : (currency === "GBP" ? "£" : "€");
  return `${num.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${symbol}`;
};

const formatNumber = (val = 0) => {
  const num = typeof val === "number" ? val : parseInt(val || 0, 10);
  return num.toLocaleString("it-IT");
};

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.user.token) {
    headers["Authorization"] = `Bearer ${state.user.token}`;
  }
  const res = await fetch(path, { ...options, headers });
  const data = await res.json();
  if (!res.ok || data.error) {
    if (res.status === 401 && !path.startsWith("/api/auth/")) {
      showLoginScreen();
    }
    throw new Error(data.error || `Errore API (${res.status})`);
  }
  return data;
}

/* ==========================================================================
   Facebook SDK & Authentication
   ========================================================================== */

function initFacebookSDK(appId) {
  if (window.FB) return;
  window.fbAsyncInit = function() {
    FB.init({
      appId: appId || "1487594375621582",
      cookie: true,
      xfbml: true,
      version: "v22.0"
    });
  };

  (function(d, s, id) {
    var js, fjs = d.getElementsByTagName(s)[0];
    if (d.getElementById(id)) return;
    js = d.createElement(s); js.id = id;
    js.src = "https://connect.facebook.net/it_IT/sdk.js";
    fjs.parentNode.insertBefore(js, fjs);
  }(document, "script", "facebook-jssdk"));
}

function showLoginScreen() {
  if (DOM.loginScreen) DOM.loginScreen.style.display = "flex";
  if (DOM.userProfileBadge) DOM.userProfileBadge.style.display = "none";
}

function showDashboardUI() {
  if (DOM.loginScreen) DOM.loginScreen.style.display = "none";
  if (DOM.userProfileBadge) {
    DOM.userProfileBadge.style.display = "inline-flex";
    if (DOM.userProfileName) DOM.userProfileName.textContent = state.user.name || "Utente Meta";
    if (DOM.userProfileAvatar) {
      if (state.user.picture) {
        DOM.userProfileAvatar.src = state.user.picture;
        DOM.userProfileAvatar.style.display = "inline-block";
      } else {
        DOM.userProfileAvatar.style.display = "none";
      }
    }
  }
}

function showLoginError(msg) {
  if (DOM.loginErrorMsg) {
    DOM.loginErrorMsg.textContent = msg;
    DOM.loginErrorMsg.style.display = "block";
  }
}

function hideLoginError() {
  if (DOM.loginErrorMsg) DOM.loginErrorMsg.style.display = "none";
}

function loginWithFacebook() {
  hideLoginError();
  if (!window.FB) {
    showLoginError("SDK Facebook in caricamento... Riprova tra qualche secondo.");
    return;
  }

  FB.login(async (response) => {
    if (response.authResponse && response.authResponse.accessToken) {
      try {
        const authRes = await api("/api/auth/facebook-login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ accessToken: response.authResponse.accessToken })
        });

        if (authRes.ok && authRes.accessToken) {
          state.user = {
            authenticated: true,
            ...authRes.user,
            token: authRes.accessToken
          };
          localStorage.setItem(STORAGE_KEYS.USER_TOKEN, authRes.accessToken);
          showDashboardUI();
          await loadInitialAccounts();
        }
      } catch (err) {
        showLoginError(`Errore durante l'accesso: ${err.message}`);
      }
    } else {
      showLoginError("Accesso Facebook annullato o permessi non concessi.");
    }
  }, { scope: "ads_read,read_insights,business_management" });
}

async function handleManualTokenSubmit() {
  const rawToken = DOM.inputManualToken?.value.trim();
  if (!rawToken) {
    showLoginError("Inserisci un Access Token valido.");
    return;
  }
  hideLoginError();

  try {
    const authRes = await api("/api/auth/facebook-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accessToken: rawToken })
    });

    if (authRes.ok && authRes.accessToken) {
      state.user = {
        authenticated: true,
        ...authRes.user,
        token: authRes.accessToken
      };
      localStorage.setItem(STORAGE_KEYS.USER_TOKEN, authRes.accessToken);
      showDashboardUI();
      await loadInitialAccounts();
    }
  } catch (err) {
    showLoginError(`Token non valido: ${err.message}`);
  }
}

function logout() {
  localStorage.removeItem(STORAGE_KEYS.USER_TOKEN);
  state.user = { authenticated: false, id: null, name: null, picture: null, token: null };
  if (window.FB && typeof FB.logout === "function") {
    try { FB.logout(); } catch(e) {}
  }
  showLoginScreen();
}

/* ==========================================================================
   Initialization
   ========================================================================== */

async function initApp() {
  bindEvents();

  // Restore inputs
  if (DOM.globalThresholdInput) DOM.globalThresholdInput.value = state.costThreshold;
  if (DOM.chkOnlyActiveCampaigns) DOM.chkOnlyActiveCampaigns.checked = state.onlyActiveCampaigns;
  if (DOM.inputDateSince && state.customSince) DOM.inputDateSince.value = state.customSince;
  if (DOM.inputDateUntil && state.customUntil) DOM.inputDateUntil.value = state.customUntil;

  syncDateButtonsUI();

  // Check authentication with Meta
  try {
    const auth = await api("/api/auth/me");
    if (auth.appId) initFacebookSDK(auth.appId);

    if (auth.authenticated) {
      state.user = { authenticated: true, ...auth.user, token: state.user.token };
      showDashboardUI();
      await loadInitialAccounts();
    } else {
      showLoginScreen();
    }
  } catch (error) {
    console.warn("Auth initialization note:", error.message);
    showLoginScreen();
  }
}


async function loadInitialAccounts() {
  try {
    const config = await api("/api/meta/config");
    state.allAdAccounts = config.adAccounts || [];

    // If visibleAccountIds not yet configured, select all by default
    if (!state.visibleAccountIds || !Array.isArray(state.visibleAccountIds)) {
      state.visibleAccountIds = state.allAdAccounts.map(a => a.id);
      localStorage.setItem(STORAGE_KEYS.VISIBLE_ACCOUNTS, JSON.stringify(state.visibleAccountIds));
    }

    updateAccountsButtonText();
    await fetchClientsData();
  } catch (error) {
    console.error("Init load error:", error);
    if (DOM.clientsTableBody) {
      DOM.clientsTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--color-rose); padding: 40px;">
            ⚠️ Errore caricamento account da Meta: ${error.message}
          </td>
        </tr>
      `;
    }
  }
}

function updateAccountsButtonText() {
  const total = state.allAdAccounts.length;
  const visible = state.visibleAccountIds.length;
  if (DOM.btnAccountsCountText) {
    DOM.btnAccountsCountText.textContent = visible === total ? `Clienti Visibili (${total})` : `Clienti (${visible}/${total})`;
  }
}

function syncDateButtonsUI() {
  DOM.dateButtons.forEach(btn => {
    if (btn.dataset.preset === state.datePreset) btn.classList.add("active");
    else btn.classList.remove("active");
  });

  if (state.datePreset === "custom") {
    if (DOM.customDatesWrap) DOM.customDatesWrap.style.display = "flex";
  } else {
    if (DOM.customDatesWrap) DOM.customDatesWrap.style.display = "none";
  }

  // Update table column headers
  const labelPreset = getPresetLabel(state.datePreset).toUpperCase();
  if (DOM.colHeaderLeads) DOM.colHeaderLeads.textContent = `LEAD (${labelPreset})`;
  if (DOM.colHeaderSpend) DOM.colHeaderSpend.textContent = `SPESA (${labelPreset})`;
  if (DOM.tableDateRangeSubtitle) {
    if (state.datePreset === "custom" && state.customSince && state.customUntil) {
      DOM.tableDateRangeSubtitle.textContent = `Dati periodo: ${state.customSince} → ${state.customUntil}`;
    } else {
      DOM.tableDateRangeSubtitle.textContent = `Dati periodo: ${getPresetLabel(state.datePreset)}`;
    }
  }
}

function getPresetLabel(preset) {
  switch (preset) {
    case "yesterday": return "Ieri";
    case "today": return "Oggi";
    case "last_7d": return "Ultimi 7 gg";
    case "this_month": return "Questo Mese";
    case "last_month": return "Mese Scorso";
    case "custom": return "Personalizzato";
    default: return preset;
  }
}

/* ==========================================================================
   Data Fetching & Table Rendering
   ========================================================================== */

async function fetchClientsData() {
  state.loading = true;
  if (DOM.btnRefreshData) {
    const icon = DOM.btnRefreshData.querySelector(".refresh-icon");
    if (icon) icon.classList.add("spinning");
  }

  if (DOM.clientsTableBody) {
    DOM.clientsTableBody.innerHTML = `
      <tr>
        <td colspan="7" class="td-loading">
          <div class="loading-spinner"></div>
          <span>Caricamento metriche in tempo reale da Meta Ads...</span>
        </td>
      </tr>
    `;
  }

  const selectedIds = state.visibleAccountIds.length > 0 ? state.visibleAccountIds.join(",") : "none";

  const params = new URLSearchParams({
    accountIds: selectedIds,
    datePreset: state.datePreset,
    threshold: state.costThreshold
  });

  if (state.datePreset === "custom" && state.customSince && state.customUntil) {
    params.set("since", state.customSince);
    params.set("until", state.customUntil);
  }

  try {
    const res = await api(`/api/meta/insights/clients-overview?${params.toString()}`);
    state.clientsData = res.clients || [];

    renderTotalsBar(state.clientsData);
    renderClientsTable();

    if (DOM.footerMetaStatus) {
      DOM.footerMetaStatus.textContent = res.isDemo
        ? "⚠️ Modalità Demo Realistica"
        : `Dati live da Meta API • Aggiornato: ${new Date().toLocaleTimeString("it-IT")}`;
    }
  } catch (error) {
    console.error("Clients overview fetch error:", error);
    if (DOM.clientsTableBody) {
      DOM.clientsTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--color-rose); padding: 40px;">
            ⚠️ Impossibile caricare i dati delle campagne: ${error.message}
          </td>
        </tr>
      `;
    }
  } finally {
    state.loading = false;
    if (DOM.btnRefreshData) {
      const icon = DOM.btnRefreshData.querySelector(".refresh-icon");
      if (icon) icon.classList.remove("spinning");
    }
  }
}

function renderTotalsBar(clients = []) {
  const totalLeads = clients.reduce((sum, c) => sum + (c.totalLeads || 0), 0);
  const totalSpend = clients.reduce((sum, c) => sum + (c.spend || 0), 0);
  const totalBudget = clients.reduce((sum, c) => sum + (c.dailyBudget || 0), 0);
  const totalAlerts = clients.reduce((sum, c) => sum + (c.alertAdsCount || 0), 0);
  const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;

  if (DOM.totalLeadsVal) DOM.totalLeadsVal.textContent = formatNumber(totalLeads);
  if (DOM.totalSpendVal) DOM.totalSpendVal.textContent = formatCurrency(totalSpend);
  if (DOM.totalCplVal) {
    DOM.totalCplVal.textContent = totalLeads > 0 ? formatCurrency(avgCpl) : "€ 0,00";
    DOM.totalCplVal.className = avgCpl > state.costThreshold ? "total-val text-rose" : "total-val text-emerald";
  }
  if (DOM.totalBudgetVal) DOM.totalBudgetVal.textContent = `${formatCurrency(totalBudget)}/gg`;
  if (DOM.totalAlertsVal) {
    DOM.totalAlertsVal.textContent = totalAlerts;
    DOM.totalAlertsVal.className = totalAlerts > 0 ? "total-val text-rose" : "total-val text-emerald";
  }
}

function renderClientsTable() {
  const container = DOM.clientsTableBody;
  if (!container) return;

  const search = (DOM.clientSearchInput?.value || "").toLowerCase().trim();
  let list = [...state.clientsData];

  // Search filter
  if (search) {
    list = list.filter(c => (c.name || "").toLowerCase().includes(search) || (c.id || "").toLowerCase().includes(search));
  }

  // Sorting
  list.sort((a, b) => {
    let valA, valB;
    switch (state.sortColumn) {
      case "name":
        valA = (a.name || "").toLowerCase();
        valB = (b.name || "").toLowerCase();
        return state.sortDirection === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      case "leads":
        valA = a.totalLeads || 0;
        valB = b.totalLeads || 0;
        break;
      case "spend":
        valA = a.spend || 0;
        valB = b.spend || 0;
        break;
      case "cpl":
        valA = a.cpl || 0;
        valB = b.cpl || 0;
        break;
      case "budget":
        valA = a.dailyBudget || 0;
        valB = b.dailyBudget || 0;
        break;
      default:
        valA = a.spend || 0;
        valB = b.spend || 0;
    }
    return state.sortDirection === "asc" ? valA - valB : valB - valA;
  });

  if (DOM.footerRowsCount) {
    DOM.footerRowsCount.textContent = `${list.length} clienti mostrati`;
  }

  if (list.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-dim); padding: 50px;">
          Nessun cliente trovato. Prova a modificare i filtri o seleziona più account dal pulsante "Filtra Clienti".
        </td>
      </tr>
    `;
    return;
  }

  const rowsHtml = list.map(client => {
    const isExpanded = state.expandedAccountId === client.id;
    const hasAlerts = client.alertAdsCount > 0;
    const isOverThreshold = (client.totalLeads > 0 && client.cpl > state.costThreshold) || (client.totalLeads === 0 && client.spend >= state.costThreshold);

    const cplClass = client.totalLeads === 0
      ? "cpl-tag tag-zero"
      : (client.cpl > state.costThreshold ? "cpl-tag tag-danger" : "cpl-tag tag-ok");

    const campaignSubText = state.onlyActiveCampaigns
      ? `${client.activeCampaignsCount} campagne attive`
      : `${client.totalCampaignsCount || client.activeCampaignsCount} campagne totali`;

    return `
      <tr class="client-row ${hasAlerts || isOverThreshold ? "row-danger" : ""} ${isExpanded ? "row-expanded" : ""}" onclick="toggleClientExpand('${client.id}')">
        <td>
          <div class="cell-client">
            <span class="client-name">${client.name}</span>
            <span class="client-sub">${campaignSubText}</span>
          </div>
        </td>
        <td class="text-right">
          <span class="val-mono ${client.totalLeads > 0 ? "text-emerald" : ""}">${client.totalLeads}</span>
        </td>
        <td class="text-right">
          <span class="val-mono">${formatCurrency(client.spend, client.currency)}</span>
        </td>
        <td class="text-right">
          <span class="${cplClass}">
            ${client.totalLeads > 0 ? formatCurrency(client.cpl, client.currency) : "0,00 €"}
          </span>
        </td>
        <td class="text-right">
          <span class="val-mono text-blue">${client.dailyBudget > 0 ? formatCurrency(client.dailyBudget, client.currency) : "-"}</span>
        </td>
        <td class="text-center">
          ${hasAlerts
            ? `<span class="alert-badge badge-danger">⚠️ ${client.alertAdsCount} sopra soglia</span>`
            : `<span class="alert-badge badge-ok">✓ In soglia</span>`
          }
        </td>
        <td class="text-center">
          <span class="expand-chevron">▼</span>
        </td>
      </tr>
      ${isExpanded ? renderExpandedDetailRow(client) : ""}
    `;
  }).join("");

  container.innerHTML = rowsHtml;
}

function renderExpandedDetailRow(client) {
  const detail = state.expandedDetailsCache[client.id];

  if (!detail) {
    return `
      <tr class="detail-row">
        <td colspan="7">
          <div class="client-detail-box" style="text-align: center; padding: 30px;">
            <div class="loading-spinner"></div>
            <span>Caricamento dettagli campagne e inserzioni di ${client.name}...</span>
          </div>
        </td>
      </tr>
    `;
  }

  const { campaigns = [], ads = [] } = detail;
  
  // Apply only active filter if checked
  const filteredCampaigns = state.onlyActiveCampaigns
    ? campaigns.filter(c => c.status === "ACTIVE" || c.effective_status === "ACTIVE")
    : campaigns;

  const filteredAds = state.onlyActiveCampaigns
    ? ads.filter(a => a.status === "ACTIVE" || a.effective_status === "ACTIVE")
    : ads;

  const criticalAds = filteredAds.filter(ad => (ad.totalLeads > 0 && ad.cpl > state.costThreshold) || (ad.totalLeads === 0 && ad.spend >= state.costThreshold));

  return `
    <tr class="detail-row">
      <td colspan="7">
        <div class="client-detail-box">
          
          <!-- Critical Ads Section (if any) -->
          ${criticalAds.length > 0 ? `
            <div>
              <div class="detail-section-title" style="color: var(--color-rose);">
                <span>⚠️ Inserzioni Sopra Soglia (€ ${state.costThreshold.toFixed(2)})</span>
                <span class="badge" style="background: var(--color-rose); color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 0.72rem;">${criticalAds.length} critiche</span>
              </div>
              <table class="sub-table" style="margin-top: 8px;">
                <thead>
                  <tr>
                    <th>Nome Inserzione (Apri in Ads Manager)</th>
                    <th>Campagna</th>
                    <th>Stato</th>
                    <th class="text-right">Spesa</th>
                    <th class="text-right">Lead</th>
                    <th class="text-right">CPL</th>
                    <th class="text-center">Azione</th>
                  </tr>
                </thead>
                <tbody>
                  ${criticalAds.map(ad => `
                    <tr>
                      <td>
                        <a href="${ad.adsManagerUrl || `https://www.facebook.com/adsmanager/manage/ads?selected_ad_ids=${ad.id}`}" target="_blank" rel="noopener noreferrer" class="ad-link-external" onclick="event.stopPropagation()" title="Apri inserzione direttamente in Meta Ads Manager">
                          <strong class="ad-name-text">${ad.name}</strong>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="link-external-icon">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                          </svg>
                        </a>
                      </td>
                      <td style="color: var(--text-dim);">${ad.campaign_name || "-"}</td>
                      <td><span class="alert-badge ${ad.status === "ACTIVE" ? "badge-ok" : "badge-danger"}">${ad.status}</span></td>
                      <td class="text-right val-mono">${formatCurrency(ad.spend)}</td>
                      <td class="text-right val-mono text-emerald">${ad.totalLeads}</td>
                      <td class="text-right val-mono text-rose">${ad.totalLeads > 0 ? formatCurrency(ad.cpl) : "0 lead"}</td>
                      <td class="text-center">
                        <button class="btn btn-xs" style="background: var(--color-rose-bg); color: var(--color-rose); border-color: rgba(244,63,94,0.3);" onclick="event.stopPropagation(); toggleAdStatusInline('${ad.id}', '${ad.status === "ACTIVE" ? "PAUSED" : "ACTIVE"}', '${client.id}')">
                          ${ad.status === "ACTIVE" ? "Metti in Pausa" : "Attiva"}
                        </button>
                      </td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          ` : `
            <div style="padding: 10px; background: rgba(16,185,129,0.06); border-radius: 6px; border: 1px solid rgba(16,185,129,0.2); font-size: 0.82rem; color: var(--color-emerald);">
              ✨ Ottimo! Nessuna inserzione ${state.onlyActiveCampaigns ? "attiva" : ""} di questo cliente supera la soglia di € ${state.costThreshold.toFixed(2)}.
            </div>
          `}

          <!-- Campaigns Section -->
          <div>
            <div class="detail-section-title">
              <span>${state.onlyActiveCampaigns ? "🎯 Campagne Attive del Cliente" : "🎯 Tutte le Campagne del Cliente"} (Apri in Ads Manager)</span>
              <span style="font-size: 0.72rem; color: var(--text-dim); font-weight: normal;">(${filteredCampaigns.length} ${state.onlyActiveCampaigns ? "attive" : "totali"})</span>
            </div>
            <table class="sub-table" style="margin-top: 8px;">
              <thead>
                <tr>
                  <th>Campagna</th>
                  <th>Stato</th>
                  <th>Budget</th>
                  <th class="text-right">Spesa Periodo</th>
                  <th class="text-right">Lead</th>
                  <th class="text-right">CPL</th>
                  <th class="text-right">CTR</th>
                </tr>
              </thead>
              <tbody>
                ${filteredCampaigns.length > 0 ? filteredCampaigns.map(c => `
                  <tr>
                    <td>
                      <a href="${c.adsManagerUrl || `https://www.facebook.com/adsmanager/manage/campaigns?selected_campaign_ids=${c.id}`}" target="_blank" rel="noopener noreferrer" class="ad-link-external" onclick="event.stopPropagation()" title="Apri campagna in Meta Ads Manager">
                        <strong class="ad-name-text">${c.name}</strong>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="link-external-icon">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                          <polyline points="15 3 21 3 21 9"></polyline>
                          <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                      </a>
                    </td>
                    <td><span class="alert-badge ${c.status === "ACTIVE" ? "badge-ok" : "badge-danger"}">${c.status}</span></td>
                    <td style="color: var(--color-blue);">${c.dailyBudgetVal > 0 ? `${formatCurrency(c.dailyBudgetVal)}/gg` : "A livello gruppo"}</td>
                    <td class="text-right val-mono">${formatCurrency(c.spend)}</td>
                    <td class="text-right val-mono text-emerald">${c.totalLeads}</td>
                    <td class="text-right val-mono">${c.totalLeads > 0 ? formatCurrency(c.cpl) : "-"}</td>
                    <td class="text-right val-mono">${(c.ctr || 0).toFixed(2)}%</td>
                  </tr>
                `).join("") : `
                  <tr>
                    <td colspan="7" style="text-align: center; color: var(--text-dim); padding: 18px;">
                      Nessuna campagna attiva al momento per questo account.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>

        </div>
      </td>
    </tr>
  `;
}

window.toggleClientExpand = async function(accountId) {
  if (state.expandedAccountId === accountId) {
    state.expandedAccountId = null;
    renderClientsTable();
    return;
  }

  state.expandedAccountId = accountId;
  renderClientsTable();

  // If detail not in cache, fetch it
  if (!state.expandedDetailsCache[accountId]) {
    try {
      const params = new URLSearchParams({
        accountId,
        datePreset: state.datePreset
      });
      if (state.datePreset === "custom" && state.customSince && state.customUntil) {
        params.set("since", state.customSince);
        params.set("until", state.customUntil);
      }

      const detail = await api(`/api/meta/insights/summary?${params.toString()}`);
      state.expandedDetailsCache[accountId] = detail;
      renderClientsTable();
    } catch (err) {
      alert(`Errore caricamento dettagli account: ${err.message}`);
    }
  }
};

window.toggleAdStatusInline = async function(adId, newStatus, accountId) {
  try {
    await api("/api/meta/ads/toggle-status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adId, status: newStatus })
    });

    // Update in local cache
    if (state.expandedDetailsCache[accountId]?.ads) {
      const ad = state.expandedDetailsCache[accountId].ads.find(a => a.id === adId);
      if (ad) ad.status = newStatus;
    }
    renderClientsTable();
  } catch (err) {
    alert(`Errore modifica stato inserzione: ${err.message}`);
  }
};

/* ==========================================================================
   Account Selection Modal ("Quali account vedere e quali no")
   ========================================================================== */

function openAccountsModal() {
  renderAccountsCheckboxList();
  DOM.modalAccounts?.showModal();
}

function renderAccountsCheckboxList() {
  const container = DOM.accountsCheckboxList;
  if (!container) return;

  const search = (DOM.accountModalSearchInput?.value || "").toLowerCase().trim();
  const accounts = state.allAdAccounts.filter(a => (a.name || "").toLowerCase().includes(search) || (a.id || "").toLowerCase().includes(search));

  const itemsHtml = accounts.map(a => {
    const isChecked = state.visibleAccountIds.includes(a.id);
    return `
      <label class="account-checkbox-item">
        <input type="checkbox" value="${a.id}" ${isChecked ? "checked" : ""} onchange="handleAccountCheckboxToggle('${a.id}', this.checked)">
        <span class="account-item-title">${a.name}</span>
        <span class="account-item-id">${a.id}</span>
      </label>
    `;
  }).join("");

  container.innerHTML = itemsHtml || `<div style="padding: 20px; text-align: center; color: var(--text-dim);">Nessun account trovato</div>`;

  if (DOM.modalSelectedCount) {
    DOM.modalSelectedCount.textContent = `${state.visibleAccountIds.length} su ${state.allAdAccounts.length} account selezionati`;
  }
}

window.handleAccountCheckboxToggle = function(accountId, isChecked) {
  if (isChecked) {
    if (!state.visibleAccountIds.includes(accountId)) state.visibleAccountIds.push(accountId);
  } else {
    state.visibleAccountIds = state.visibleAccountIds.filter(id => id !== accountId);
  }

  if (DOM.modalSelectedCount) {
    DOM.modalSelectedCount.textContent = `${state.visibleAccountIds.length} su ${state.allAdAccounts.length} account selezionati`;
  }
};

function saveAccountSelection() {
  localStorage.setItem(STORAGE_KEYS.VISIBLE_ACCOUNTS, JSON.stringify(state.visibleAccountIds));
  updateAccountsButtonText();
  DOM.modalAccounts?.close();
  state.expandedDetailsCache = {};
  fetchClientsData();
}

/* ==========================================================================
   Report Generator Modal (WhatsApp / Slack formatted summary)
   ========================================================================== */

function openReportModal() {
  const clients = state.clientsData;
  const totalLeads = clients.reduce((sum, c) => sum + (c.totalLeads || 0), 0);
  const totalSpend = clients.reduce((sum, c) => sum + (c.spend || 0), 0);
  const totalBudget = clients.reduce((sum, c) => sum + (c.dailyBudget || 0), 0);
  const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;

  const dateLabel = getPresetLabel(state.datePreset).toUpperCase();
  const now = new Date().toLocaleDateString("it-IT");

  const clientsLines = clients
    .filter(c => c.spend > 0 || c.totalLeads > 0)
    .sort((a, b) => b.totalLeads - a.totalLeads)
    .map(c => `• *${c.name}*: ${c.totalLeads} lead | ${formatCurrency(c.spend)} | CPL: ${c.totalLeads > 0 ? formatCurrency(c.cpl) : "0 lead"}${c.alertAdsCount > 0 ? ` (⚠️ ${c.alertAdsCount} > soglia)` : ""}`)
    .join("\n");

  const reportText = `📊 *RIASSUNTO CLIENTI META ADS - ${dateLabel}*
📅 Data: ${now}
────────────────────────
👥 *CONTATTI TOTALI*: ${formatNumber(totalLeads)} lead
💶 *SPESA TOTALE*: ${formatCurrency(totalSpend)}
🎯 *CPL MEDIO*: ${formatCurrency(avgCpl)}
⏱️ *BUDGET GG ATTIVO*: ${formatCurrency(totalBudget)}/gg
────────────────────────
*DETTAGLIO PER CLIENTE:*
${clientsLines || "Nessun dato di spesa nel periodo."}
────────────────────────
_Generato con LeadSum_`;

  if (DOM.reportTextOutput) DOM.reportTextOutput.value = reportText;
  if (DOM.reportCopyFeedback) DOM.reportCopyFeedback.textContent = "";
  DOM.modalReport?.showModal();
}

/* ==========================================================================
   Event Bindings
   ========================================================================== */

function bindEvents() {
  // Date Presets
  DOM.dateButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const preset = btn.dataset.preset;
      state.datePreset = preset;
      localStorage.setItem(STORAGE_KEYS.DATE_PRESET, preset);
      syncDateButtonsUI();
      if (preset !== "custom") {
        state.expandedDetailsCache = {};
        fetchClientsData();
      }
    });
  });

  // Custom Date Apply
  DOM.btnApplyCustomDate?.addEventListener("click", () => {
    const since = DOM.inputDateSince?.value;
    const until = DOM.inputDateUntil?.value;
    if (!since || !until) {
      alert("Seleziona entrambe le date (Dal e Al).");
      return;
    }
    state.customSince = since;
    state.customUntil = until;
    localStorage.setItem(STORAGE_KEYS.CUSTOM_SINCE, since);
    localStorage.setItem(STORAGE_KEYS.CUSTOM_UNTIL, until);
    syncDateButtonsUI();
    state.expandedDetailsCache = {};
    fetchClientsData();
  });

  // Threshold Input (instant reactive update)
  DOM.globalThresholdInput?.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val > 0) {
      state.costThreshold = val;
      localStorage.setItem(STORAGE_KEYS.COST_THRESHOLD, String(val));
      renderTotalsBar(state.clientsData);
      renderClientsTable();
    }
  });

  // Only Active Campaigns Checkbox (instant reactive update)
  DOM.chkOnlyActiveCampaigns?.addEventListener("change", (e) => {
    state.onlyActiveCampaigns = e.target.checked;
    localStorage.setItem(STORAGE_KEYS.ONLY_ACTIVE, String(state.onlyActiveCampaigns));
    renderClientsTable();
  });

  // Client Search Filter
  DOM.clientSearchInput?.addEventListener("input", () => {
    renderClientsTable();
  });

  // Sorting
  DOM.tableHeaders.forEach(th => {
    th.addEventListener("click", () => {
      const col = th.dataset.sort;
      if (state.sortColumn === col) {
        state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
      } else {
        state.sortColumn = col;
        state.sortDirection = "desc";
      }
      renderClientsTable();
    });
  });

  // Refresh Button
  DOM.btnRefreshData?.addEventListener("click", () => {
    state.expandedDetailsCache = {};
    fetchClientsData();
  });

  // Accounts Modal
  DOM.btnOpenAccountsModal?.addEventListener("click", openAccountsModal);
  DOM.btnCloseAccountsModal?.addEventListener("click", () => DOM.modalAccounts?.close());
  DOM.accountModalSearchInput?.addEventListener("input", renderAccountsCheckboxList);

  DOM.btnSelectAllAccounts?.addEventListener("click", () => {
    state.visibleAccountIds = state.allAdAccounts.map(a => a.id);
    renderAccountsCheckboxList();
  });

  DOM.btnDeselectAllAccounts?.addEventListener("click", () => {
    state.visibleAccountIds = [];
    renderAccountsCheckboxList();
  });

  DOM.btnSaveAccountSelection?.addEventListener("click", saveAccountSelection);

  // Report Modal
  DOM.btnOpenReportModal?.addEventListener("click", openReportModal);
  DOM.btnCloseReportModal?.addEventListener("click", () => DOM.modalReport?.close());

  DOM.btnCopyReportText?.addEventListener("click", async () => {
    if (DOM.reportTextOutput) {
      await navigator.clipboard.writeText(DOM.reportTextOutput.value);
      if (DOM.reportCopyFeedback) DOM.reportCopyFeedback.textContent = "✅ Copiato!";
      setTimeout(() => {
        if (DOM.reportCopyFeedback) DOM.reportCopyFeedback.textContent = "";
      }, 2500);
    }
  });

  // Meta Auth Bindings
  DOM.btnFacebookLogin?.addEventListener("click", loginWithFacebook);
  DOM.btnLogout?.addEventListener("click", logout);
  DOM.btnToggleManualToken?.addEventListener("click", () => {
    if (DOM.manualTokenBox) {
      const isHidden = DOM.manualTokenBox.style.display === "none";
      DOM.manualTokenBox.style.display = isHidden ? "flex" : "none";
      if (DOM.tokenChevron) DOM.tokenChevron.textContent = isHidden ? "▲" : "▼";
    }
  });
  DOM.btnSubmitManualToken?.addEventListener("click", handleManualTokenSubmit);
  DOM.inputManualToken?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleManualTokenSubmit();
  });
}

// Start app
window.addEventListener("DOMContentLoaded", initApp);
