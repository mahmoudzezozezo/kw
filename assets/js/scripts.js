function calculateCostBreakdown(kWh) {
  if (kWh <= 0) {
    return {
      consumptionCost: 0,
      serviceFee: 0,
      total: 0,
      tierLabel: "--"
    };
  }

  const consumptionCost = kWh * 2.74;
  const serviceFee = 0;
  const total = consumptionCost + serviceFee;

  return { consumptionCost, serviceFee, total, tierLabel: "" };
}

function calculateCost(kWh) {
  return calculateCostBreakdown(kWh).total;
}

function getCategoryAr(kWh) {
  if (kWh <= 50)   return "الشريحة الأولى";
  if (kWh <= 100)  return "الشريحة الثانية";
  if (kWh <= 200)  return "الشريحة الثالثة";
  if (kWh <= 350)  return "الشريحة الرابعة";
  if (kWh <= 650)  return "الشريحة الخامسة";
  if (kWh <= 1000) return "الشريحة السادسة";
  return "الشريحة السابعة";
}

function getCategoryEn(kWh) {
  if (kWh <= 50)   return "Tier 1";
  if (kWh <= 100)  return "Tier 2";
  if (kWh <= 200)  return "Tier 3";
  if (kWh <= 350)  return "Tier 4";
  if (kWh <= 650)  return "Tier 5";
  if (kWh <= 1000) return "Tier 6";
  return "Tier 7";
}

function logAr(line) { document.getElementById("terminal-ar").textContent += "\n" + line; }
function logEn(line) { document.getElementById("terminal-en").textContent += "\n" + line; }

function displayAveragePerDayAr(data) {
  PAG.MAIN_PAGE = 1;
  renderMainTable('ar');
}

function displayAveragePerDayEn(data) {
  PAG.MAIN_PAGE = 1;
  renderMainTable('en');
}

async function fetchReadings() {
  const snapshot = await db.collection("readings").orderBy("dateTime", "asc").get();
  const data = [];
  snapshot.forEach(doc => {
    const d = doc.data();
    const ts = d.dateTime?.toDate();
    if (ts && !isNaN(ts.getTime()) && typeof d.reading === "number") {
      data.push({ timestamp: ts, reading: d.reading, docId: doc.id });
    }
  });
  return data;
}

async function fetchBills() {
  const snapshot = await db.collection("bills").orderBy("date", "asc").get();
  const data = [];
  snapshot.forEach(doc => {
    const d = doc.data();
    const date = d.date?.toDate();
    if (date && !isNaN(date.getTime()) && typeof d.totalBill === "number") {
      data.push({ date, cost: d.totalBill, month: date.toISOString().slice(0, 7), docId: doc.id });
    }
  });
  return data;
}

function processElecData(data) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  let windowData = data.filter((row) => row.timestamp >= thirtyDaysAgo);
  if (windowData.length < 2 && data.length >= 2) {
    windowData = data.slice(-2);
  }
  if (windowData.length < 2) return { data, error: true };
  const first = windowData[0];
  const last = windowData[windowData.length - 1];
  const totalUsage = last.reading - first.reading;
  if (totalUsage <= 0) return { data, error: true };
  const daysDiff = (last.timestamp - first.timestamp) / (1000 * 60 * 60 * 24);
  const avgPerDay = totalUsage / daysDiff;
  const breakdown = calculateCostBreakdown(totalUsage);
  return { data, first, last, totalUsage, daysDiff, avgPerDay, breakdown, error: false };
}

async function loadData(lang) {
  const isAr = lang === "ar";
  const terminal = isAr ? document.getElementById("terminal-ar") : document.getElementById("terminal-en");
  terminal.innerHTML = isAr ? "> جاري تحميل بيانات استهلاك الكهرباء..." : "> Loading electricity usage data...";
  showLoading();

  try {
    const readings = await fetchReadings();
    if (readings.length < 2) {
      (isAr ? logAr : logEn)("> ❌ Not enough data or invalid data.");
      hideLoading();
      return;
    }
    const result = processElecData(readings);
    if (result.error) {
      (isAr ? logAr : logEn)("> ❌ Not enough data or invalid data.");
      hideLoading();
      return;
    }
    const { data, first, last, totalUsage, avgPerDay, breakdown } = result;
    const category = isAr ? getCategoryAr(totalUsage) : getCategoryEn(totalUsage);
    updateSummaryCards({ totalUsage, avgPerDay, cost: breakdown.total, tier: category, breakdown });

    if (isAr) {
      logAr("> ملخص استهلاك الكهرباء للشهر الماضي");
      logAr("----------------------------------------");
      logAr(`📅 أول قراءة: ${first.timestamp.toLocaleDateString("ar-EG")}`);
      logAr(`📅 آخر قراءة:  ${last.timestamp.toLocaleDateString("ar-EG")}`);
      logAr(`⚡ إجمالي الاستهلاك: ${totalUsage} كيلوواط/ساعة`);
      logAr(`📊 المتوسط اليومي: ${avgPerDay.toFixed(2)} كيلوواط/يوم`);
      logAr(`💡 تكلفة الاستهلاك: ${breakdown.consumptionCost.toFixed(2)} جنيه`);
      logAr(`🔧 رسوم الخدمة: ${breakdown.serviceFee.toFixed(2)} جنيه`);
      logAr(`💰 إجمالي الفاتورة المقدرة: ${breakdown.total.toFixed(2)} جنيه`);
      logAr(`📈 الشريحة: ${category}`);
    } else {
      logEn("> Electricity Usage Summary for Last Month");
      logEn("----------------------------------------");
      logEn(`📅 First Reading: ${first.timestamp.toLocaleDateString("en-US")}`);
      logEn(`📅 Last Reading:  ${last.timestamp.toLocaleDateString("en-US")}`);
      logEn(`⚡ Total Usage: ${totalUsage} kWh`);
      logEn(`📊 Average per day: ${avgPerDay.toFixed(2)} kWh/day`);
      logEn(`💡 Consumption cost: ${breakdown.consumptionCost.toFixed(2)} EGP`);
      logEn(`🔧 Service fee: ${breakdown.serviceFee.toFixed(2)} EGP`);
      logEn(`💰 Estimated total bill: ${breakdown.total.toFixed(2)} EGP`);
      logEn(`📈 Billing tier: ${category}`);
    }
    currentData = data;
    (isAr ? displayAveragePerDayAr : displayAveragePerDayEn)(data);
    displayRollingCostChartEn(data);
  } catch (err) {
    (isAr ? logAr : logEn)("> ❌ " + (isAr ? "خطأ: " : "Error: ") + err.message);
  }
  hideLoading();
}

function loadArabicData() { loadData("ar"); }
function loadEnglishData() { loadData("en"); }

function displayRollingCostChartEn(data, monthsPeriod = 12) {
  const chartContainer = document.getElementById("shared-chart-container");
  chartContainer.innerHTML = "";
  const canvas = document.createElement("canvas");
  canvas.id = "rolling-cost-chart";
  chartContainer.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  const pairCosts = [];
  for (let i = 0; i < data.length - 1; i++) {
    const prev = data[i], next = data[i + 1];
    const daysDiff = (next.timestamp - prev.timestamp) / (1000 * 60 * 60 * 24);
    const usage = next.reading - prev.reading;
    if (usage > 0 && daysDiff > 0) {
      const monthlyEstimate = (usage / daysDiff) * 30;
      const cost = calculateCost(monthlyEstimate);
      const month = next.timestamp.toISOString().slice(0, 7);
      pairCosts.push({ label: month, cost, date: next.timestamp });
    }
  }

  fetchBills().then(billingData => {
    const billingByMonth = {};
    billingData.forEach((e) => { billingByMonth[e.month] = e.cost; });

    const estMonths = [...new Set(pairCosts.map((p) => p.label))];
    const billMonths = billingData.map((b) => b.month);
    const months = [...new Set([...estMonths, ...billMonths])].sort().slice(-monthsPeriod);

    const estimatedCostsByMonth = {};
    months.forEach((month) => {
      const entries = pairCosts.filter((p) => p.label === month);
      estimatedCostsByMonth[month] = entries.length ? entries[entries.length - 1].cost : null;
    });

    new Chart(ctx, {
      type: "line",
      data: {
        labels: months,
        datasets: [
          {
            label: "Estimated Bill",
            data: months.map((m) => estimatedCostsByMonth[m] || null),
            borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.1)",
            tension: 0.4, fill: true,
            pointBackgroundColor: "#10b981", pointBorderColor: "#ffffff", pointBorderWidth: 2, pointRadius: 5, pointHoverRadius: 8,
          },
          {
            label: "Actual Bill",
            data: months.map((m) => billingByMonth[m] || null),
            borderColor: "#0ea5e9", backgroundColor: "rgba(14,165,233,0.1)",
            tension: 0.4, fill: false, spanGaps: true,
            pointBackgroundColor: "#0ea5e9", pointBorderColor: "#ffffff", pointBorderWidth: 2, pointRadius: 5, pointHoverRadius: 8,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { labels: { color: "#f1f5f9", usePointStyle: true, padding: 20 } },
          tooltip: {
            backgroundColor: "#1e293b", titleColor: "#f1f5f9", bodyColor: "#94a3b8",
            borderColor: "#0ea5e9", borderWidth: 1, cornerRadius: 8, displayColors: true,
            callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(2)} EGP` },
          },
        },
        scales: {
          x: { ticks: { color: "#94a3b8", maxTicksLimit: 8 }, grid: { color: "#334155", drawBorder: false }, border: { display: false } },
          y: { beginAtZero: true, ticks: { color: "#94a3b8", callback: (v) => v.toFixed(0) + " EGP" }, grid: { color: "#334155", drawBorder: false }, border: { display: false } },
        },
      },
    });
  }).catch((err) => { logEn("> ❌ Failed to fetch billing data: " + err.message); });
}

let currentData = [];
let currentLang = "ar";
let currentSummary = {};

// Pagination
const PAG = { MAIN_PAGE: 1, MAIN_PER_PAGE: 20, MANAGE_PER_PAGE: 15, MGR_READ_PAGE: 1, MGR_BILL_PAGE: 1 };

function renderPagination(current, total, prevFn, goFn, rtl) {
  if (total <= 1) return '';
  let h = '<div class="pagination"><div class="pagination-inner">';
  h += `<button class="page-btn" onclick="${prevFn}(${-1})" ${current <= 1 ? 'disabled' : ''}>${rtl ? '›' : '‹'}</button>`;
  for (let p = 1; p <= total; p++) {
    if (p === current) { h += `<span class="page-current">${p}</span>`; }
    else if (p === 1 || p === total || Math.abs(p - current) <= 1) { h += `<button class="page-btn" onclick="${goFn}(${p})">${p}</button>`; }
    else if (Math.abs(p - current) === 2) { h += `<span class="page-dots">…</span>`; }
  }
  h += `<button class="page-btn" onclick="${prevFn}(${1})" ${current >= total ? 'disabled' : ''}>${rtl ? '‹' : '›'}</button>`;
  h += `<span class="page-info">${current}/${total}</span></div></div>`;
  return h;
}

function changeMainPage(delta) {
  const data = currentData;
  if (data.length < 2) return;
  const total = Math.ceil((data.length - 1) / PAG.MAIN_PER_PAGE) || 1;
  PAG.MAIN_PAGE = Math.max(1, Math.min(PAG.MAIN_PAGE + delta, total));
  if (currentLang === "ar") renderMainTable('ar'); else renderMainTable('en');
}

function goToMainPage(p) {
  PAG.MAIN_PAGE = p;
  if (currentLang === "ar") renderMainTable('ar'); else renderMainTable('en');
}

function renderMainTable(lang) {
  const data = currentData;
  if (data.length < 2) return;
  const isAr = lang === 'ar';
  const totalPairs = data.length - 1;
  const totalPages = Math.ceil(totalPairs / PAG.MAIN_PER_PAGE) || 1;
  PAG.MAIN_PAGE = Math.min(PAG.MAIN_PAGE, totalPages);
  const endIdx = totalPairs - (PAG.MAIN_PAGE - 1) * PAG.MAIN_PER_PAGE;
  const startIdx = Math.max(0, totalPairs - PAG.MAIN_PAGE * PAG.MAIN_PER_PAGE);

  const headers = isAr
    ? ['#','التاريخ والوقت','القراءة','الفارق (س)','المعدل (ك.و/يوم)','التكلفة']
    : ['#','Date & Time','Reading','Diff (hrs)','Avg (kWh/day)','Est. Cost'];

  let html = '<div id="main-table-wrap"><table><thead><tr>';
  headers.forEach(h => html += `<th>${h}</th>`);
  html += '</tr></thead><tbody>';
  let num = startIdx + 1;
  for (let i = startIdx; i < endIdx; i++) {
    const row = data[i], next = data[i + 1];
    if (!next) continue;
    const hoursDiff = (next.timestamp - row.timestamp) / (1000 * 60 * 60);
    const usage = next.reading - row.reading;
    const avg = usage / (hoursDiff / 24);
    const bd = calculateCostBreakdown(usage);
    const dateStr = row.timestamp.toLocaleString(isAr ? "ar-EG" : "en-US");
    html += `<tr><td>${num}</td><td>${dateStr}</td><td>${row.reading}</td><td>${hoursDiff.toFixed(1)}</td><td>${avg.toFixed(2)}</td><td>${bd.total.toFixed(2)}${isAr?' جنيه':' EGP'}</td></tr>`;
    num++;
  }
  html += `</tbody></table>${renderPagination(PAG.MAIN_PAGE, totalPages, 'changeMainPage', 'goToMainPage', isAr)}</div>`;

  const existing = document.getElementById("main-table-wrap");
  const terminal = document.getElementById(isAr ? "terminal-ar" : "terminal-en");
  if (existing) existing.outerHTML = html;
  else terminal.innerHTML += html;
}

function showLoading() { document.getElementById("loading-overlay").style.display = "flex"; }
function hideLoading() { document.getElementById("loading-overlay").style.display = "none"; }
const el = (id) => document.getElementById(id);

function updateSummaryCards(summary) {
  if (el("total-usage"))    el("total-usage").textContent    = typeof summary.totalUsage === "number" ? summary.totalUsage.toString() : "--";
  if (el("daily-avg"))      el("daily-avg").textContent      = summary.avgPerDay ? summary.avgPerDay.toFixed(1) : "--";
  if (el("estimated-cost")) el("estimated-cost").textContent = summary.cost ? summary.cost.toFixed(0) : "--";
  if (el("billing-tier"))   el("billing-tier").textContent   = summary.tier || "--";
  if (summary.breakdown) {
    const bd = summary.breakdown;
    if (el("cost-consumption")) el("cost-consumption").textContent = bd.consumptionCost.toFixed(2);
    if (el("cost-service"))     el("cost-service").textContent     = bd.serviceFee.toFixed(2);
    if (el("cost-total"))       el("cost-total").textContent       = bd.total.toFixed(2);

    const bars = document.querySelectorAll('.breakdown-bar');
    if (bars.length && bd.total > 0) {
      const costs = [bd.consumptionCost, bd.serviceFee];
      bars.forEach((bar, i) => {
        bar.style.width = (costs[i] / bd.total * 100) + '%';
      });
    }
  }
  currentSummary = summary;
  updateProjectionsDisplay();
}

function updateProjectionsDisplay() {
  if (!currentSummary.avgPerDay) {
    ["projected-usage", "projected-cost", "projected-tier"].forEach((id) => el(id) && (el(id).textContent = "--"));
    el("projection-trend") && (el("projection-trend").innerHTML = '<i class="fas fa-minus"></i><span>--</span>');
    return;
  }
  const projectedUsage = currentSummary.avgPerDay * 30;
  const projBd = calculateCostBreakdown(projectedUsage);
  const projTier = currentLang === "ar" ? getCategoryAr(projectedUsage) : getCategoryEn(projectedUsage);

  if (el("projected-usage")) el("projected-usage").innerHTML =
    currentLang === "ar" ? `${projectedUsage.toFixed(0)} <span class="unit-text">كيلووات/ساعة</span>` : `${projectedUsage.toFixed(0)} <span class="unit-text">kWh</span>`;
  if (el("projected-cost")) el("projected-cost").innerHTML =
    currentLang === "ar" ? `${projBd.total.toFixed(0)} <span class="unit-text">جنيه</span>` : `${projBd.total.toFixed(0)} <span class="unit-text">EGP</span>`;
  if (el("projected-tier")) el("projected-tier").textContent = projTier;

  if (el("proj-consumption")) el("proj-consumption").textContent = projBd.consumptionCost.toFixed(2);
  if (el("proj-service"))     el("proj-service").textContent     = projBd.serviceFee.toFixed(2);
  if (el("proj-total"))       el("proj-total").textContent       = projBd.total.toFixed(2);

  const savings = currentSummary.cost - projBd.total;
  const trendEl = el("projection-trend");
  if (!trendEl) return;
  if (Math.abs(savings) < 5) {
    trendEl.className = "trend neutral";
    trendEl.innerHTML = currentLang === "ar" ? '<i class="fas fa-equals"></i><span>مماثل للشهر الحالي</span>' : '<i class="fas fa-equals"></i><span>Similar to current month</span>';
  } else if (savings > 0) {
    trendEl.className = "trend positive";
    trendEl.innerHTML = currentLang === "ar" ? `<i class="fas fa-arrow-down"></i><span>توفير ${savings.toFixed(0)} جنيه</span>` : `<i class="fas fa-arrow-down"></i><span>Save ${savings.toFixed(0)} EGP</span>`;
  } else {
    trendEl.className = "trend negative";
    trendEl.innerHTML = currentLang === "ar" ? `<i class="fas fa-arrow-up"></i><span>زيادة ${Math.abs(savings).toFixed(0)} جنيه</span>` : `<i class="fas fa-arrow-up"></i><span>Increase ${Math.abs(savings).toFixed(0)} EGP</span>`;
  }
}

const langSwitchBtn = document.getElementById("lang-switch");
const contentEn = document.getElementById("content-en");
const contentAr = document.getElementById("content-ar");
const body = document.body;

langSwitchBtn.addEventListener("click", () => {
  if (currentLang === "ar") {
    currentLang = "en"; body.className = "lang-en";
    langSwitchBtn.innerHTML = `<i class="fas fa-language"></i><span>التبديل إلى العربية / Switch to Arabic</span>`;
    document.documentElement.lang = "en"; document.documentElement.dir = "ltr";
    if (!contentEn.dataset.loaded || contentEn.dataset.loaded === "false") { showLoading(); loadEnglishData(); contentEn.dataset.loaded = "true"; }
    else { updateProjectionsDisplay(); hideLoading(); }
  } else {
    currentLang = "ar"; body.className = "lang-ar";
    langSwitchBtn.innerHTML = `<i class="fas fa-language"></i><span>Switch to English / التبديل إلى الإنجليزية</span>`;
    document.documentElement.lang = "ar"; document.documentElement.dir = "rtl";
    if (!contentAr.dataset.loaded || contentAr.dataset.loaded === "false") { showLoading(); loadArabicData(); contentAr.dataset.loaded = "true"; }
    else { updateProjectionsDisplay(); hideLoading(); }
  }
});

function refreshData() {
  showLoading();
  if (currentLang === "ar") { contentAr.dataset.loaded = "false"; document.getElementById("terminal-ar").innerHTML = "> جاري تحميل بيانات استهلاك الكهرباء..."; loadArabicData(); }
  else { contentEn.dataset.loaded = "false"; document.getElementById("terminal-en").innerHTML = "> Loading electricity usage data..."; loadEnglishData(); }
}

function exportData() {
  if (currentData.length === 0) { alert(currentLang === "ar" ? "لا توجد بيانات للتصدير" : "No data to export"); return; }
  const csv = Papa.unparse(currentData.map((row) => ({ date: row.timestamp.toISOString(), reading: row.reading })));
  const blob = new Blob([csv], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `electricity-usage-${new Date().toISOString().split("T")[0]}.csv`; a.click();
  window.URL.revokeObjectURL(url);
}

function closeModal(button) {
  const modal = button.closest(".modal-overlay");
  modal.style.opacity = "0";
  setTimeout(() => modal.remove(), 300);
}

function toggleFilters() { document.getElementById("search-input").focus(); }

document.getElementById("chart-period")?.addEventListener("change", function () {
  if (currentData.length > 0) displayRollingCostChartEn(currentData, parseInt(this.value));
});

// ── Password Protection ──────────────────────────────────────────────────────
const MANAGER_PASSWORD = "1122";

function showModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = "flex";
  el.style.opacity = "0";
  setTimeout(() => el.style.opacity = "1", 10);
}

function hideModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.opacity = "0";
  setTimeout(() => el.style.display = "none", 200);
}

function isAuthenticated() {
  return sessionStorage.getItem("elec_auth") === "true";
}

function openManageData() {
  if (isAuthenticated()) {
    showModal("manage-modal");
    loadManageReadings();
    return;
  }
  document.getElementById("password-error").style.display = "none";
  document.getElementById("password-input").value = "";
  showModal("password-modal");
  setTimeout(() => document.getElementById("password-input").focus(), 300);
}

function checkPassword(event) {
  event.preventDefault();
  const pwd = document.getElementById("password-input").value;
  if (pwd === MANAGER_PASSWORD) {
    sessionStorage.setItem("elec_auth", "true");
    hideModal("password-modal");
    showModal("manage-modal");
    loadManageReadings();
  } else {
    const err = document.getElementById("password-error");
    err.style.display = "block";
    document.getElementById("password-input").focus();
  }
}

// ── Tab Switching ────────────────────────────────────────────────────────────
function switchTab(btn, tab) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  document.querySelectorAll(".tab-content").forEach(c => c.style.display = "none");
  document.getElementById("manage-" + tab + "-tab").style.display = "block";
  if (tab === "readings") loadManageReadings();
  if (tab === "bills")    loadManageBills();
}

// ── Load Readings for Management ─────────────────────────────────────────────
async function loadManageReadings() {
  const tbody = document.querySelector("#manage-readings-table tbody");
  if (!tbody) return;
  const pagEl = document.getElementById("manage-readings-pag");
  try {
    const snapshot = await db.collection("readings").orderBy("dateTime", "desc").get();
    const rows = [];
    snapshot.forEach(doc => {
      const d = doc.data();
      const ts = d.dateTime?.toDate();
      if (ts && !isNaN(ts.getTime()) && typeof d.reading === "number") {
        rows.push({ docId: doc.id, dateTime: ts, reading: d.reading });
      }
    });
    const total = rows.length;
    const totalPages = Math.ceil(total / PAG.MANAGE_PER_PAGE) || 1;
    PAG.MGR_READ_PAGE = Math.min(PAG.MGR_READ_PAGE, totalPages);
    const start = (PAG.MGR_READ_PAGE - 1) * PAG.MANAGE_PER_PAGE;
    const end = Math.min(start + PAG.MANAGE_PER_PAGE, total);
    const pageRows = rows.slice(start, end);
    tbody.innerHTML = pageRows.map((r, i) => `
      <tr>
        <td>${total - start - i}</td>
        <td>${r.dateTime.toLocaleString(currentLang === "ar" ? "ar-EG" : "en-US")}</td>
        <td>${r.reading}</td>
        <td class="action-cell">
          <button class="action-btn-xs edit-btn" onclick="editReading('${r.docId}')" title="Edit"><i class="fas fa-pen"></i></button>
          <button class="action-btn-xs delete-btn" onclick="confirmDelete('reading','${r.docId}')" title="Delete"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `).join("");
    document.getElementById("readings-count").textContent = `${start + 1}-${end} of ${total}`;
    if (pagEl) pagEl.outerHTML = buildManagePagination(PAG.MGR_READ_PAGE, totalPages, 'readings');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4" class="error-cell">Error: ${e.message}</td></tr>`;
  }
}

// ── Load Bills for Management ────────────────────────────────────────────────
async function loadManageBills() {
  const tbody = document.querySelector("#manage-bills-table tbody");
  if (!tbody) return;
  const pagEl = document.getElementById("manage-bills-pag");
  try {
    const snapshot = await db.collection("bills").orderBy("date", "desc").get();
    const rows = [];
    snapshot.forEach(doc => {
      const d = doc.data();
      const date = d.date?.toDate();
      if (date && !isNaN(date.getTime()) && typeof d.totalBill === "number") {
        rows.push({ docId: doc.id, date, totalBill: d.totalBill });
      }
    });
    const total = rows.length;
    const totalPages = Math.ceil(total / PAG.MANAGE_PER_PAGE) || 1;
    PAG.MGR_BILL_PAGE = Math.min(PAG.MGR_BILL_PAGE, totalPages);
    const start = (PAG.MGR_BILL_PAGE - 1) * PAG.MANAGE_PER_PAGE;
    const end = Math.min(start + PAG.MANAGE_PER_PAGE, total);
    const pageRows = rows.slice(start, end);
    tbody.innerHTML = pageRows.map((r, i) => `
      <tr>
        <td>${total - start - i}</td>
        <td>${r.date.toISOString().slice(0, 7)}</td>
        <td>${r.totalBill.toFixed(2)} EGP</td>
        <td class="action-cell">
          <button class="action-btn-xs edit-btn" onclick="editBill('${r.docId}')" title="Edit"><i class="fas fa-pen"></i></button>
          <button class="action-btn-xs delete-btn" onclick="confirmDelete('bill','${r.docId}')" title="Delete"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `).join("");
    document.getElementById("bills-count").textContent = `${start + 1}-${end} of ${total}`;
    if (pagEl) pagEl.outerHTML = buildManagePagination(PAG.MGR_BILL_PAGE, totalPages, 'bills');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4" class="error-cell">Error: ${e.message}</td></tr>`;
  }
}

function changeManagePage(delta, type) {
  if (type === 'readings') {
    const txt = document.getElementById("readings-count").textContent;
    const totalItems = parseInt(txt.split('of')[1]) || 0;
    const total = Math.ceil(totalItems / PAG.MANAGE_PER_PAGE) || 1;
    PAG.MGR_READ_PAGE = Math.max(1, Math.min(PAG.MGR_READ_PAGE + delta, total));
    loadManageReadings();
  } else {
    const txt = document.getElementById("bills-count").textContent;
    const totalItems = parseInt(txt.split('of')[1]) || 0;
    const total = Math.ceil(totalItems / PAG.MANAGE_PER_PAGE) || 1;
    PAG.MGR_BILL_PAGE = Math.max(1, Math.min(PAG.MGR_BILL_PAGE + delta, total));
    loadManageBills();
  }
}

function goToManagePage(p, type) {
  if (type === 'readings') { PAG.MGR_READ_PAGE = p; loadManageReadings(); }
  else { PAG.MGR_BILL_PAGE = p; loadManageBills(); }
}

function buildManagePagination(current, total, type) {
  if (total <= 1) return '<div id="manage-' + type + '-pag"></div>';
  const rtl = currentLang === "ar";
  let h = '<div id="manage-' + type + '-pag" class="pagination"><div class="pagination-inner">';
  h += `<button class="page-btn" onclick="changeManagePage(${-1},'${type}')" ${current <= 1 ? 'disabled' : ''}>${rtl ? '›' : '‹'}</button>`;
  for (let p = 1; p <= total; p++) {
    if (p === current) h += `<span class="page-current">${p}</span>`;
    else if (p === 1 || p === total || Math.abs(p - current) <= 1) h += `<button class="page-btn" onclick="goToManagePage(${p},'${type}')">${p}</button>`;
    else if (Math.abs(p - current) === 2) h += `<span class="page-dots">…</span>`;
  }
  h += `<button class="page-btn" onclick="changeManagePage(${1},'${type}')" ${current >= total ? 'disabled' : ''}>${rtl ? '‹' : '›'}</button>`;
  h += `<span class="page-info">${current}/${total}</span></div></div>`;
  return h;
}

// ── Edit Reading ─────────────────────────────────────────────────────────────
async function editReading(docId) {
  try {
    const doc = await db.collection("readings").doc(docId).get();
    const d = doc.data();
    if (!d) return;
    const ts = d.dateTime?.toDate();
    document.getElementById("edit-reading-id").value = docId;
    const offset = ts.getTimezoneOffset();
    const local = new Date(ts.getTime() - offset * 60000);
    document.getElementById("edit-reading-date").value = local.toISOString().slice(0, 16);
    document.getElementById("edit-reading-value").value = d.reading;
    showModal("edit-reading-modal");
  } catch (e) {
    alert("Error: " + e.message);
  }
}

async function saveEditReading(event) {
  event.preventDefault();
  const docId = document.getElementById("edit-reading-id").value;
  const dateStr = document.getElementById("edit-reading-date").value;
  const reading = parseFloat(document.getElementById("edit-reading-value").value);
  if (!dateStr || isNaN(reading)) return;
  try {
    await db.collection("readings").doc(docId).update({
      dateTime: firebase.firestore.Timestamp.fromDate(new Date(dateStr)),
      reading
    });
    hideModal("edit-reading-modal");
    loadManageReadings();
    refreshData();
  } catch (e) {
    alert("Error: " + e.message);
  }
}

// ── Edit Bill ────────────────────────────────────────────────────────────────
async function editBill(docId) {
  try {
    const doc = await db.collection("bills").doc(docId).get();
    const d = doc.data();
    if (!d) return;
    const date = d.date?.toDate();
    document.getElementById("edit-bill-id").value = docId;
    document.getElementById("edit-bill-month").value = date.toISOString().slice(0, 7);
    document.getElementById("edit-bill-amount").value = d.totalBill;
    showModal("edit-bill-modal");
  } catch (e) {
    alert("Error: " + e.message);
  }
}

async function saveEditBill(event) {
  event.preventDefault();
  const docId = document.getElementById("edit-bill-id").value;
  const monthStr = document.getElementById("edit-bill-month").value;
  const amount = parseFloat(document.getElementById("edit-bill-amount").value);
  if (!monthStr || isNaN(amount)) return;
  try {
    await db.collection("bills").doc(docId).update({
      date: firebase.firestore.Timestamp.fromDate(new Date(monthStr + "-01T00:00:00")),
      totalBill: amount
    });
    hideModal("edit-bill-modal");
    loadManageBills();
    refreshData();
  } catch (e) {
    alert("Error: " + e.message);
  }
}

// ── Delete ───────────────────────────────────────────────────────────────────
let pendingDelete = null;

function confirmDelete(type, docId) {
  pendingDelete = { type, docId };
  const msg = document.getElementById("confirm-message");
  if (type === "reading") {
    msg.innerHTML = '<span class="ar-text">هل أنت متأكد من حذف هذه القراءة؟</span><span class="en-text">Are you sure you want to delete this reading?</span>';
  } else {
    msg.innerHTML = '<span class="ar-text">هل أنت متأكد من حذف هذه الفاتورة؟</span><span class="en-text">Are you sure you want to delete this bill?</span>';
  }
  showModal("confirm-modal");
}

async function executeDelete() {
  if (!pendingDelete) return;
  const { type, docId } = pendingDelete;
  pendingDelete = null;
  try {
    await db.collection(type === "reading" ? "readings" : "bills").doc(docId).delete();
    hideModal("confirm-modal");
    if (type === "reading") loadManageReadings();
    else loadManageBills();
    refreshData();
  } catch (e) {
    alert("Error: " + e.message);
  }
}

// ── Keyboard shortcuts for manage modals ─────────────────────────────────────
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    ["password-modal","manage-modal","confirm-modal","edit-reading-modal","edit-bill-modal"].forEach(id => {
      const m = document.getElementById(id);
      if (m && m.style.display === "flex") hideModal(id);
    });
  }
});

function openAddReadingModal() {
  const modal = document.getElementById('add-reading-modal')
  modal.style.display = 'flex'
  modal.style.opacity = '0'
  setTimeout(() => modal.style.opacity = '1', 10)

  const now = new Date()
  const offset = now.getTimezoneOffset()
  const local = new Date(now.getTime() - offset * 60000)
  document.getElementById('reading-date').value = local.toISOString().slice(0, 16)
  document.getElementById('form-status').style.display = 'none'
  document.getElementById('form-status').className = 'form-status'

  setTimeout(() => document.getElementById('reading-value').focus(), 300)
  modal.onclick = (e) => { if (e.target === modal) closeAddReadingModal() }
}

function closeAddReadingModal() {
  const modal = document.getElementById('add-reading-modal')
  modal.style.opacity = '0'
  modal.onclick = null
  setTimeout(() => modal.style.display = 'none', 200)
}

async function submitReading(event) {
  event.preventDefault()
  const statusEl = document.getElementById('form-status')
  const submitBtn = document.getElementById('submit-btn')

  const dateTimeStr = document.getElementById('reading-date').value
  const reading = parseFloat(document.getElementById('reading-value').value)
  const notes = document.getElementById('reading-notes').value

  statusEl.style.display = 'none'
  statusEl.className = 'form-status'
  submitBtn.disabled = true
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...'

  try {
    await db.collection('readings').add({
      dateTime: firebase.firestore.Timestamp.fromDate(new Date(dateTimeStr)),
      reading,
      notes: notes || '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    })

    statusEl.className = 'form-status success'
    statusEl.textContent = currentLang === 'ar'
      ? '✅ تم إرسال القراءة بنجاح!'
      : '✅ Reading submitted successfully!'
    statusEl.style.display = 'block'
    event.target.reset()
    setTimeout(() => { closeAddReadingModal(); refreshData(); }, 1500)
  } catch (err) {
    statusEl.className = 'form-status error'
    statusEl.textContent = currentLang === 'ar'
      ? '❌ فشل الإرسال: ' + err.message
      : '❌ Submission failed: ' + err.message
    statusEl.style.display = 'block'
  } finally {
    submitBtn.disabled = false
    submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> ' +
      (currentLang === 'ar' ? 'إرسال' : 'Submit')
  }
}

function openAddBillModal() {
  const modal = document.getElementById('add-bill-modal')
  modal.style.display = 'flex'
  modal.style.opacity = '0'
  setTimeout(() => modal.style.opacity = '1', 10)

  const now = new Date()
  document.getElementById('bill-month').value = now.toISOString().slice(0, 7)
  document.getElementById('bill-form-status').style.display = 'none'
  document.getElementById('bill-form-status').className = 'form-status'

  setTimeout(() => document.getElementById('bill-amount').focus(), 300)
  modal.onclick = (e) => { if (e.target === modal) closeAddBillModal() }
}

function closeAddBillModal() {
  const modal = document.getElementById('add-bill-modal')
  modal.style.opacity = '0'
  modal.onclick = null
  setTimeout(() => modal.style.display = 'none', 200)
}

async function submitBill(event) {
  event.preventDefault()
  const statusEl = document.getElementById('bill-form-status')
  const submitBtn = document.getElementById('bill-submit-btn')

  const monthStr = document.getElementById('bill-month').value
  const amount = parseFloat(document.getElementById('bill-amount').value)
  const notes = document.getElementById('bill-notes').value

  if (!monthStr || isNaN(amount) || amount <= 0) {
    statusEl.className = 'form-status error'
    statusEl.textContent = currentLang === 'ar' ? '❌ يرجى إدخال شهر ومبلغ صحيح' : '❌ Please enter a valid month and amount'
    statusEl.style.display = 'block'
    return
  }

  statusEl.style.display = 'none'
  statusEl.className = 'form-status'
  submitBtn.disabled = true
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...'

  try {
    const date = new Date(monthStr + '-01T00:00:00')

    await db.collection('bills').add({
      date: firebase.firestore.Timestamp.fromDate(date),
      totalBill: amount,
      notes: notes || '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    })

    statusEl.className = 'form-status success'
    statusEl.textContent = currentLang === 'ar'
      ? '✅ تم إرسال الفاتورة بنجاح!'
      : '✅ Bill submitted successfully!'
    statusEl.style.display = 'block'
    event.target.reset()
    setTimeout(() => { closeAddBillModal(); refreshData(); }, 1500)
  } catch (err) {
    statusEl.className = 'form-status error'
    statusEl.textContent = currentLang === 'ar'
      ? '❌ فشل الإرسال: ' + err.message
      : '❌ Submission failed: ' + err.message
    statusEl.style.display = 'block'
  } finally {
    submitBtn.disabled = false
    submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> ' +
      (currentLang === 'ar' ? 'إرسال' : 'Submit')
  }
}

window.onload = () => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js");
  }
  body.className = "lang-ar";
  showLoading();
  loadArabicData();
  contentAr.dataset.loaded = "true";

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const readingModal = document.getElementById('add-reading-modal')
      const billModal = document.getElementById('add-bill-modal')
      if (readingModal.style.display === 'flex') closeAddReadingModal()
      else if (billModal.style.display === 'flex') closeAddBillModal()
    }
    if (e.ctrlKey || e.metaKey) {
      if (e.key === "r") { e.preventDefault(); refreshData(); }
      if (e.key === "e") { e.preventDefault(); exportData(); }
      if (e.key === "l") { e.preventDefault(); langSwitchBtn.click(); }
      if (e.key === "k") { e.preventDefault(); openAddReadingModal(); }
      if (e.key === "b") { e.preventDefault(); openAddBillModal(); }
    }
  });

  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", function () {
      const term = this.value.toLowerCase();
      document.querySelectorAll("table").forEach((table) => {
        table.querySelectorAll("tbody tr").forEach((row) => {
          row.style.display = row.textContent.toLowerCase().includes(term) ? "" : "none";
        });
      });
    });
  }
};
