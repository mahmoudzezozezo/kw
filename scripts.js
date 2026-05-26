const csvUrl =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQe94jYbetR9dIujTmievlAez-y5YhG5fSvNnjyRLCIGMwYi-f21wpADcMMkD1g6w2nXWMKJSol-JIc/pub?output=csv";

const billCsvUrl =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSB7bTJmKXWgsACWjB7kuKxWHT5KK60AnmpUhHHTGVaVltbX8jj2deC0SH4EslaFDs_3_sZfFiq7258/pub?output=csv";

// Normalize a parsed row's keys to lowercase trimmed strings
function normalizeRow(row) {
  const normalized = {};
  for (const key of Object.keys(row)) {
    normalized[key.trim().toLowerCase()] = row[key];
  }
  return normalized;
}

function isCurlRequest() {
  return !navigator.userAgent || navigator.userAgent.includes("curl");
}

// ─── Official ERA tariff effective 1 Sep 2024 ───────────────────────────────
// Source: https://egyptera.org/en/TarrifAug2024.aspx
//
// Egypt uses a BRACKET system, not simple marginal tiers:
//
//  0–50    kWh → flat 0.68 EGP/kWh on entire consumption  + 1  EGP service fee
//  51–100  kWh → flat 0.78 EGP/kWh on entire consumption  + 2  EGP service fee
//  101–200 kWh → flat 0.95 EGP/kWh on entire consumption  + 6  EGP service fee
//  201–350 kWh → progressive: 200×0.95 + (usage-200)×1.55 + 11 EGP service fee
//  351–650 kWh → progressive: 200×0.95 + 150×1.55 + (usage-350)×1.95 + 15 EGP
//  651–1000 kWh→ flat 2.10 EGP/kWh on ALL kWh             + 25 EGP service fee
//  >1000   kWh → flat 2.23 EGP/kWh on ALL kWh             + 40 EGP service fee
//
// Verified: 255 kWh → (200×0.95)+(55×1.55)+11 = 190+85.25+11 = 286.25 EGP ✓
// ────────────────────────────────────────────────────────────────────────────
function calculateCostBreakdown(kWh) {
  let consumptionCost = 0;
  let serviceFee = 0;
  let tierLabel = "";

  if (kWh <= 0) return { consumptionCost: 0, serviceFee: 0, total: 0, tierLabel: "--" };

  if (kWh <= 50) {
    consumptionCost = kWh * 0.68;
    serviceFee = 1;
    tierLabel = "Tier 1 (≤50 kWh @ 0.68 EGP/kWh)";
  } else if (kWh <= 100) {
    consumptionCost = kWh * 0.78;
    serviceFee = 2;
    tierLabel = "Tier 2 (≤100 kWh @ 0.78 EGP/kWh)";
  } else if (kWh <= 200) {
    consumptionCost = kWh * 0.95;
    serviceFee = 6;
    tierLabel = "Tier 3 (≤200 kWh @ 0.95 EGP/kWh)";
  } else if (kWh <= 350) {
    consumptionCost = (200 * 0.95) + ((kWh - 200) * 1.55);
    serviceFee = 11;
    tierLabel = "Tier 4 (201–350 kWh: 200×0.95 + rest×1.55)";
  } else if (kWh <= 650) {
    consumptionCost = (200 * 0.95) + (150 * 1.55) + ((kWh - 350) * 1.95);
    serviceFee = 15;
    tierLabel = "Tier 5 (351–650 kWh: 200×0.95 + 150×1.55 + rest×1.95)";
  } else if (kWh <= 1000) {
    consumptionCost = kWh * 2.10;
    serviceFee = 25;
    tierLabel = "Tier 6 (≤1000 kWh @ 2.10 EGP/kWh flat)";
  } else {
    consumptionCost = kWh * 2.23;
    serviceFee = 40;
    tierLabel = "Tier 7 (>1000 kWh @ 2.23 EGP/kWh flat)";
  }

  return { consumptionCost, serviceFee, total: consumptionCost + serviceFee, tierLabel };
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

// Render average per day table in Arabic
function displayAveragePerDayAr(data) {
  let tableHtml = "<table><thead><tr><th>#</th><th>التاريخ والوقت</th><th>القراءة</th><th>الفارق الزمني (ساعات)</th><th>المعدل اليومي (كيلوواط/ساعة)</th><th>التكلفة المقدرة</th></tr></thead><tbody>";
  const startIndex = Math.max(0, data.length - 21);
  for (let i = startIndex; i < data.length - 1; i++) {
    const row = data[i];
    const nextRow = data[i + 1];
    if (nextRow) {
      const hoursDiff = (nextRow.timestamp - row.timestamp) / (1000 * 60 * 60);
      const daysDiff = hoursDiff / 24;
      const kWhUsage = nextRow.reading - row.reading;
      const avgPerDay = kWhUsage / daysDiff;
      const bd = calculateCostBreakdown(kWhUsage);
      tableHtml += `<tr>
        <td>${i + 1}</td>
        <td>${row.timestamp.toLocaleString("ar-EG")}</td>
        <td>${row.reading}</td>
        <td>${hoursDiff.toFixed(1)}</td>
        <td>${avgPerDay.toFixed(2)}</td>
        <td>${bd.total.toFixed(2)} جنيه</td>
      </tr>`;
    }
  }
  tableHtml += "</tbody></table>";
  document.getElementById("terminal-ar").innerHTML += tableHtml;
}

// Render average per day table in English
function displayAveragePerDayEn(data) {
  let tableHtml = "<table><thead><tr><th>#</th><th>Date & Time</th><th>Reading</th><th>Time Diff (hrs)</th><th>Avg/Day (kWh)</th><th>Est. Bill</th></tr></thead><tbody>";
  const startIndex = Math.max(0, data.length - 21);
  for (let i = startIndex; i < data.length - 1; i++) {
    const row = data[i];
    const nextRow = data[i + 1];
    if (nextRow) {
      const hoursDiff = (nextRow.timestamp - row.timestamp) / (1000 * 60 * 60);
      const daysDiff = hoursDiff / 24;
      const kWhUsage = nextRow.reading - row.reading;
      const avgPerDay = kWhUsage / daysDiff;
      const bd = calculateCostBreakdown(kWhUsage);
      tableHtml += `<tr>
        <td>${i + 1}</td>
        <td>${row.timestamp.toLocaleString("en-US")}</td>
        <td>${row.reading}</td>
        <td>${hoursDiff.toFixed(1)}</td>
        <td>${avgPerDay.toFixed(2)}</td>
        <td>${bd.total.toFixed(2)} EGP</td>
      </tr>`;
    }
  }
  tableHtml += "</tbody></table>";
  document.getElementById("terminal-en").innerHTML += tableHtml;
}

function parseElecData(csvText) {
  const parsed = Papa.parse(csvText, { header: true });
  return parsed.data
    .map(normalizeRow)
    .filter((row) => row["date time"]?.trim() && row["reading"]?.trim())
    .map((row) => ({
      timestamp: new Date(row["date time"].trim()),
      reading: parseInt(row["reading"].trim()),
    }))
    .filter((row) => !isNaN(row.timestamp.getTime()) && !isNaN(row.reading))
    .sort((a, b) => a.timestamp - b.timestamp);
}

function parseBillData(csvText) {
  const parsed = Papa.parse(csvText, { header: true });
  return parsed.data
    .map(normalizeRow)
    .filter((row) => row["date"]?.trim() && row["total_bill"]?.trim())
    .map((row) => ({
      date: new Date(row["date"].trim()),
      cost: parseFloat(row["total_bill"].trim()),
      month: new Date(row["date"].trim()).toISOString().slice(0, 7),
    }))
    .filter((row) => !isNaN(row.date.getTime()) && !isNaN(row.cost));
}

function processElecData(csvText) {
  const data = parseElecData(csvText);
  const now = new Date();
  const last30DaysData = data.filter((row) => row.timestamp >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
  if (last30DaysData.length < 2) return { data, error: true };
  const first = last30DaysData[0];
  const last = last30DaysData[last30DaysData.length - 1];
  const totalUsage = last.reading - first.reading;
  if (totalUsage <= 0) return { data, error: true };
  const daysDiff = (last.timestamp - first.timestamp) / (1000 * 60 * 60 * 24);
  const avgPerDay = totalUsage / daysDiff;
  const breakdown = calculateCostBreakdown(totalUsage);
  return { data, first, last, totalUsage, daysDiff, avgPerDay, breakdown, error: false };
}

function loadArabicData() {
  document.getElementById("terminal-ar").innerHTML = "> جاري تحميل بيانات استهلاك الكهرباء...";
  fetch(csvUrl)
    .then((r) => r.text())
    .then((csvText) => {
      const result = processElecData(csvText);
      if (result.error) { logAr("> ❌ لا توجد بيانات كافية أو بيانات غير صالحة."); hideLoading(); return; }
      const { data, first, last, totalUsage, avgPerDay, breakdown } = result;
      const category = getCategoryAr(totalUsage);
      updateSummaryCards({ totalUsage, avgPerDay, cost: breakdown.total, tier: category, breakdown });
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
      currentData = data;
      displayAveragePerDayAr(data);
      displayRollingCostChartEn(data);
      hideLoading();
    })
    .catch((err) => { logAr("> ❌ خطأ: " + err.message); hideLoading(); });
}

function loadEnglishData() {
  const terminalEn = document.getElementById("terminal-en");
  if (!terminalEn) { hideLoading(); return; }
  terminalEn.innerHTML = "> Loading electricity usage data...";
  fetch(csvUrl)
    .then((r) => r.text())
    .then((csvText) => {
      const result = processElecData(csvText);
      if (result.error) { logEn("> ❌ Not enough data or invalid data."); hideLoading(); return; }
      const { data, first, last, totalUsage, avgPerDay, breakdown } = result;
      const category = getCategoryEn(totalUsage);
      updateSummaryCards({ totalUsage, avgPerDay, cost: breakdown.total, tier: category, breakdown });
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
      currentData = data;
      displayAveragePerDayEn(data);
      displayRollingCostChartEn(data);
      hideLoading();
    })
    .catch((err) => { logEn("> ❌ Error: " + err.message); hideLoading(); });
}

function displayRollingCostChartEn(data, monthsPeriod = 12) {
  const chartContainer = document.getElementById("shared-chart-container");
  chartContainer.innerHTML = "";
  const canvas = document.createElement("canvas");
  canvas.id = "rolling-cost-chart";
  chartContainer.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  const rollingCosts = [];
  for (let i = 0; i < data.length; i++) {
    const currentDate = data[i].timestamp;
    const startDate = new Date(currentDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const windowData = data.filter((r) => r.timestamp >= startDate && r.timestamp <= currentDate);
    if (windowData.length < 2) continue;
    const usage = windowData[windowData.length - 1].reading - windowData[0].reading;
    if (usage > 0) {
      rollingCosts.push({ date: currentDate, cost: calculateCost(usage), month: currentDate.toISOString().slice(0, 7) });
    }
  }

  fetch(billCsvUrl)
    .then((r) => r.text())
    .then((csvText) => {
      const billingData = parseBillData(csvText);
      const billingByMonth = {};
      billingData.forEach((e) => { billingByMonth[e.month] = e.cost; });

      const months = [...new Set(rollingCosts.map((rc) => rc.month))];
      const filteredMonths = months.slice(-monthsPeriod);

      const estimatedCostsByMonth = {};
      months.forEach((month) => {
        const costsInMonth = rollingCosts.filter((rc) => rc.month === month);
        estimatedCostsByMonth[month] = costsInMonth.length ? costsInMonth[costsInMonth.length - 1].cost : null;
      });

      new Chart(ctx, {
        type: "line",
        data: {
          labels: filteredMonths,
          datasets: [
            {
              label: "Estimated Bill",
              data: filteredMonths.map((m) => estimatedCostsByMonth[m] || null),
              borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.1)",
              tension: 0.4, fill: true,
              pointBackgroundColor: "#10b981", pointBorderColor: "#ffffff", pointBorderWidth: 2, pointRadius: 5, pointHoverRadius: 8,
            },
            {
              label: "Actual Bill",
              data: filteredMonths.map((m) => billingByMonth[m] || null),
              borderColor: "#3b82f6", backgroundColor: "rgba(59,130,246,0.1)",
              tension: 0.4, fill: false, spanGaps: true,
              pointBackgroundColor: "#3b82f6", pointBorderColor: "#ffffff", pointBorderWidth: 2, pointRadius: 5, pointHoverRadius: 8,
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
              borderColor: "#3b82f6", borderWidth: 1, cornerRadius: 8, displayColors: true,
              callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(2)} EGP` },
            },
          },
          scales: {
            x: { ticks: { color: "#94a3b8", maxTicksLimit: 8 }, grid: { color: "#334155", drawBorder: false }, border: { display: false } },
            y: { beginAtZero: true, ticks: { color: "#94a3b8", callback: (v) => v.toFixed(0) + " EGP" }, grid: { color: "#334155", drawBorder: false }, border: { display: false } },
          },
        },
      });
    })
    .catch((err) => { logEn("> ❌ Failed to fetch billing CSV: " + err.message); });
}

// ── Global state ──────────────────────────────────────────────────────────────
let currentData = [];
let currentLang = "ar";
let currentSummary = {};

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

// ── Language switch ───────────────────────────────────────────────────────────
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

// ── Quick actions ─────────────────────────────────────────────────────────────
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

// ── Init ──────────────────────────────────────────────────────────────────────
window.onload = () => {
  body.className = "lang-ar";
  showLoading();
  loadArabicData();
  contentAr.dataset.loaded = "true";

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === "r") { e.preventDefault(); refreshData(); }
      if (e.key === "e") { e.preventDefault(); exportData(); }
      if (e.key === "l") { e.preventDefault(); langSwitchBtn.click(); }
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
