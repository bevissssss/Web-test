const App = (() => {
  const _cm = new Date().toISOString().slice(0, 7);
  let state = {
    transactions:    [],
    settings:        {},
    section:         'dashboard',
    incomeFilter:    { month: _cm, category: '' },
    expenseFilter:   { month: _cm, category: '' },
    editingId:       null,
    customCatType:   'income',
    simMonthlyInvest: 0,
    cfFilter:        { month: _cm },
    simFilter:       { month: _cm },
    allocFilter:     { month: _cm },
  };

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // ─── Cloud Sync (Google Sheets) ──────────────────────────────────────────────

  const SHEET_API = 'https://script.google.com/macros/s/AKfycbwBTvvKkK6KjMfUn9zaleLWOhtErbvB7kcV23gsLzVtAb1CvzBovIIOjtuDzhL9HQWPBQ/exec';

  async function saveToSheet(transactions) {
    await fetch(SHEET_API, { method: 'POST', body: JSON.stringify(transactions) });
  }

  async function loadFromSheet() {
    const res = await fetch(SHEET_API);
    return await res.json();
  }

  function cloudSync() {
    saveToSheet(DB.getTransactions()).catch(() => {});
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  function fmt(n) {
    const sym = state.settings.currency || '₫';
    if (sym === '₫') return new Intl.NumberFormat('vi-VN').format(Math.round(n)) + ' ₫';
    return sym + new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
  }

  function fmtDate(s) {
    const [y, m, d] = s.split('-');
    return state.settings.dateFormat === 'DD/MM/YYYY' ? `${d}/${m}/${y}` : `${m}/${d}/${y}`;
  }

  function monthKey(dateStr) { return dateStr.slice(0, 7); }
  function monthLabel(key)   { const [y, m] = key.split('-'); return `${MONTHS[+m - 1]} ${y}`; }

  function buildMonthYearOptions(type, selected) {
    const range = [];
    for (let y = 2028; y >= 2024; y--)
      for (let m = 12; m >= 1; m--)
        range.push(`${y}-${String(m).padStart(2, '0')}`);
    const txMonths = state.transactions.filter(t => t.type === type).map(t => monthKey(t.date));
    const allMonths = [...new Set([...range, ...txMonths])].sort().reverse();
    let html = '', lastYear = '';
    allMonths.forEach(m => {
      const y = m.slice(0, 4);
      if (y !== lastYear) {
        html += `<option value="${y}" ${y === selected ? 'selected' : ''}>── ${y} (Year) ──</option>`;
        lastYear = y;
      }
      html += `<option value="${m}" ${m === selected ? 'selected' : ''}>${monthLabel(m)}</option>`;
    });
    return html;
  }

  function last6Months() {
    const now = new Date(), out = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return out;
  }

  function byMonth(txs) {
    return txs.reduce((acc, t) => { const k = monthKey(t.date); (acc[k] = acc[k] || []).push(t); return acc; }, {});
  }

  function sum(txs) { return txs.reduce((s, t) => s + t.amount, 0); }

  function computeAvgNet(filterMonth) {
    const grouped = byMonth(state.transactions);
    const isYear  = filterMonth && filterMonth.length === 4;
    const isMo    = filterMonth && filterMonth.length === 7;
    let months;
    if (isYear)    months = Array.from({ length: 12 }, (_, i) => `${filterMonth}-${String(i + 1).padStart(2, '0')}`);
    else if (isMo) months = [filterMonth];
    else           months = Object.keys(grouped).sort();
    const n   = months.length || 1;
    const inc = months.reduce((s, m) => s + sum((grouped[m] || []).filter(t => t.type === 'income')), 0) / n;
    const exp = months.reduce((s, m) => s + sum((grouped[m] || []).filter(t => t.type === 'expense')), 0) / n;
    return Math.max(0, inc - exp);
  }

  function fmtInputNum(n) {
    const v = Math.round(Number(n) || 0);
    if (v <= 0) return '';
    const locale = (state.settings.currency || '₫') === '₫' ? 'vi-VN' : 'en-US';
    return new Intl.NumberFormat(locale).format(v);
  }
  function parseInputNum(s) {
    return parseFloat(String(s || '').replace(/[^0-9]/g, '')) || 0;
  }
  function attachNumFmt(el, onChange) {
    const format = () => {
      const raw = parseInputNum(el.value);
      const cur = el.selectionStart;
      const oldLen = el.value.length;
      el.value = raw > 0 ? fmtInputNum(raw) : '';
      const delta = el.value.length - oldLen;
      try { el.setSelectionRange(cur + delta, cur + delta); } catch (_) {}
      onChange?.();
    };
    el.addEventListener('input', format);
    el.value = fmtInputNum(parseInputNum(el.value) || 0) || el.value;
  }

  function deltaBadge(curr, prev, positiveIsGood = true) {
    if (prev === 0) return `<span class="stat-delta neutral">— no prior data</span>`;
    const pct  = ((curr - prev) / prev) * 100;
    const dir  = pct >= 0 ? 'up' : 'down';
    const good = positiveIsGood ? dir === 'up' : dir === 'down';
    const cls  = good ? 'good' : 'bad';
    const arrow = dir === 'up' ? '↑' : '↓';
    return `<span class="stat-delta ${cls}">${arrow} ${Math.abs(pct).toFixed(1)}% vs prev month</span>`;
  }

  function statCard(icon, title, value, badge = '') {
    return `<div class="stat-card">
      <div class="stat-icon">${icon}</div>
      <div class="stat-body">
        <div class="stat-title">${title}</div>
        <div class="stat-value">${value}</div>
        ${badge}
      </div>
    </div>`;
  }

  function toast(msg, type = 'success') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    document.getElementById('toastContainer').appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 350); }, 3000);
  }

  // ─── Router ──────────────────────────────────────────────────────────────────

  function navigate(hash) {
    const newSec = (hash || '').replace('#', '') || 'dashboard';
    if (state.section === 'dashboard' && newSec !== 'dashboard') VN100.stop();
    if (state.section === 'simulator' && newSec !== 'simulator') stopSimPriceRefresh();
    state.section = newSec;
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
    document.getElementById(newSec)?.classList.add('active');
    document.querySelector(`.nav-link[data-section="${newSec}"]`)?.classList.add('active');
    state.transactions = DB.getTransactions();
    renderSection(newSec);
    ScrollAnim.enter(document.getElementById(newSec));
  }

  function renderSection(sec) {
    const map = { dashboard: renderDashboard, income: renderIncome, expenses: renderExpenses, cashflow: renderCashFlow, simulator: renderSimulator, allocation: renderAllocation, settings: renderSettings };
    map[sec]?.();
  }

  // ─── Dashboard ───────────────────────────────────────────────────────────────

  function renderDashboard() {
    const months  = last6Months();
    const grouped = byMonth(state.transactions);
    const cur     = months.at(-1), prev = months.at(-2);

    const curInc  = sum((grouped[cur]  || []).filter(t => t.type === 'income'));
    const prevInc = sum((grouped[prev] || []).filter(t => t.type === 'income'));
    const curExp  = sum((grouped[cur]  || []).filter(t => t.type === 'expense'));
    const prevExp = sum((grouped[prev] || []).filter(t => t.type === 'expense'));
    const net     = curInc - curExp;
    const prevNet = prevInc - prevExp;
    const rate    = curInc  > 0 ? (net / curInc) * 100 : 0;
    const prevRate= prevInc > 0 ? (prevNet / prevInc) * 100 : 0;

    document.getElementById('dashboardStats').innerHTML =
      statCard('↑', 'Total Income',   fmt(curInc),  deltaBadge(curInc, prevInc, true)) +
      statCard('↓', 'Total Expenses', fmt(curExp),  deltaBadge(curExp, prevExp, false)) +
      statCard('≋', 'Net Cash Flow',  fmt(net),     deltaBadge(net, prevNet, true)) +
      statCard('%', 'Savings Rate',   `${rate.toFixed(1)}%`, deltaBadge(rate, prevRate, true));
    ScrollAnim.staggerCards(document.getElementById('dashboardStats'));

    const labels      = months.map(monthLabel);
    const incomeData  = months.map(m => sum((grouped[m] || []).filter(t => t.type === 'income')));
    const expenseData = months.map(m => sum((grouped[m] || []).filter(t => t.type === 'expense')));
    Charts.dashboardOverview('dashboardChart', labels, incomeData, expenseData);
    Charts.monthlyBar('dashboardIncomeChart',  labels, incomeData,  '#10b981', 'Monthly Income',  '#10b981');
    Charts.monthlyBar('dashboardExpenseChart', labels, expenseData, '#ff6b35', 'Monthly Expenses', '#ff6b35');

    VN100.start();
  }

  // ─── Income ──────────────────────────────────────────────────────────────────

  function renderIncome() {
    if (!state.incomeFilter.month) state.incomeFilter.month = monthKey(new Date().toISOString().slice(0, 10));
    const { month, category } = state.incomeFilter;
    const isYear = month.length === 4;
    const allIncomeTxs = state.transactions.filter(t => t.type === 'income');

    // ── Per-category colors from Charts.CAT_COLORS ───────────────────────────
    const dynColors = Object.fromEntries(
      [...new Set(allIncomeTxs.map(t => t.category))].map(c => [c, Charts.CAT_COLORS[c] || '#64748b'])
    );

    // ── Filter for table ─────────────────────────────────────────────────────
    let txs = [...allIncomeTxs];
    const isDay = month.length === 10;
    if (isDay)       txs = txs.filter(t => t.date === month);
    else if (isYear) txs = txs.filter(t => t.date.startsWith(month));
    else if (month)  txs = txs.filter(t => monthKey(t.date) === month);
    if (category)   txs = txs.filter(t => t.category === category);
    txs.sort((a, b) => b.date.localeCompare(a.date));

    // ── Dropdowns ────────────────────────────────────────────────────────────
    document.getElementById('incomeCatFilter').innerHTML =
      '<option value="">All Categories</option>' +
      DB.getAllIncomeCategories().map(c => `<option value="${c}" ${c === category ? 'selected' : ''}>${c}</option>`).join('');

    // ── Table ─────────────────────────────────────────────────────────────────
    document.getElementById('incomeTxBody').innerHTML = txs.length
      ? txs.map(tx => `<tr>
          <td>${fmtDate(tx.date)}</td>
          <td><span class="cat-dot" style="background:${dynColors[tx.category] || '#64748b'}"></span>${tx.category}</td>
          <td class="amt-income">+${fmt(tx.amount)}</td>
          <td class="tx-note">${tx.note || '—'}</td>
          <td>
            <button class="btn-icon" onclick="App.openModal('income','${tx.id}')">✎</button>
            <button class="btn-icon btn-icon-del" onclick="App.confirmDelete('${tx.id}')">✕</button>
          </td>
        </tr>`).join('')
      : '<tr><td colspan="5" class="empty-state">No income records match filters</td></tr>';

    // ── Helper: show chart or empty message ───────────────────────────────────
    function setChartOrEmpty(canvasId, hasData, msg) {
      Charts.destroy(canvasId);
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      const wrap = canvas.parentElement;
      let emptyEl = wrap.querySelector('.chart-empty');
      if (!emptyEl) { emptyEl = document.createElement('div'); emptyEl.className = 'chart-empty'; wrap.appendChild(emptyEl); }
      canvas.style.display = hasData ? '' : 'none';
      emptyEl.style.display = hasData ? 'none' : '';
      emptyEl.textContent = msg;
    }

    // ── Bar chart ─────────────────────────────────────────────────────────────
    const incSubEl = document.getElementById('incomeDailySubtitle');
    if (isYear) {
      const yearMonths = Array.from({length: 12}, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
      const grouped    = byMonth(allIncomeTxs.filter(t => t.date.startsWith(month)));
      const yearData   = yearMonths.map(m => sum(grouped[m] || []));
      const hasData    = yearData.some(v => v > 0);
      setChartOrEmpty('incomeDailyChart', hasData, `No data for ${month}`);
      if (hasData) Charts.monthlyBar('incomeDailyChart', yearMonths.map(monthLabel), yearData, '#10b981', 'Monthly Income', '#10b981');
      if (incSubEl) incSubEl.textContent = month;
    } else {
      const dayMapI = {};
      if (isDay) {
        allIncomeTxs.filter(t => t.date === month)
          .forEach(t => { (dayMapI[t.date] = dayMapI[t.date] || []).push(t); });
      } else {
        const chartMonthI = month || monthKey(new Date().toISOString().slice(0, 10));
        allIncomeTxs.filter(t => monthKey(t.date) === chartMonthI)
          .forEach(t => { (dayMapI[t.date] = dayMapI[t.date] || []).push(t); });
      }
      const sortedDaysI = Object.keys(dayMapI).sort();
      const subtitleI   = isDay ? fmtDate(month) : monthLabel(month || monthKey(new Date().toISOString().slice(0, 10)));
      setChartOrEmpty('incomeDailyChart', sortedDaysI.length > 0, `No data for ${subtitleI}`);
      if (sortedDaysI.length > 0) Charts.dailyStackedBar('incomeDailyChart', sortedDaysI.map(d => fmtDate(d)), sortedDaysI, dayMapI, dynColors);
      if (incSubEl) incSubEl.textContent = subtitleI;
    }

    // ── Category donut (filtered by same year/month scope) ────────────────────
    const catScope = isDay
      ? allIncomeTxs.filter(t => t.date === month)
      : isYear
        ? allIncomeTxs.filter(t => t.date.startsWith(month))
        : month
          ? allIncomeTxs.filter(t => monthKey(t.date) === month)
          : allIncomeTxs;
    const catTotals = {};
    catScope.forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
    const cLabels   = Object.keys(catTotals);
    const emptyMsg  = isDay ? `No data for ${fmtDate(month)}` : isYear ? `No data for ${month}` : month ? `No data for ${monthLabel(month)}` : 'No income data';
    setChartOrEmpty('incomeCatChart', cLabels.length > 0, emptyMsg);
    if (cLabels.length > 0) Charts.categoryDonut('incomeCatChart', cLabels, cLabels.map(c => catTotals[c]), dynColors);
  }

  // ─── Expenses ────────────────────────────────────────────────────────────────

  function renderExpenses() {
    if (!state.expenseFilter.month) state.expenseFilter.month = monthKey(new Date().toISOString().slice(0, 10));
    const { month, category } = state.expenseFilter;
    const isYear = month.length === 4;
    const allExpenseTxs = state.transactions.filter(t => t.type === 'expense');

    // ── Per-category colors from Charts.CAT_COLORS ───────────────────────────
    const dynColors = Object.fromEntries(
      [...new Set(allExpenseTxs.map(t => t.category))].map(c => [c, Charts.CAT_COLORS[c] || '#64748b'])
    );

    // ── Filter for table ─────────────────────────────────────────────────────
    let txs = [...allExpenseTxs];
    const isDay = month.length === 10;
    if (isDay)       txs = txs.filter(t => t.date === month);
    else if (isYear) txs = txs.filter(t => t.date.startsWith(month));
    else if (month)  txs = txs.filter(t => monthKey(t.date) === month);
    if (category)   txs = txs.filter(t => t.category === category);
    txs.sort((a, b) => b.date.localeCompare(a.date));

    // ── Dropdowns ────────────────────────────────────────────────────────────
    const actualCats = [...new Set(allExpenseTxs.map(t => t.category))].sort();
    document.getElementById('expenseCatFilter').innerHTML =
      '<option value="">All Categories</option>' +
      actualCats.map(c => `<option value="${c}" ${c === category ? 'selected' : ''}>${c}</option>`).join('');

    // ── Table ─────────────────────────────────────────────────────────────────
    document.getElementById('expenseTxBody').innerHTML = txs.length
      ? txs.map(tx => `<tr>
          <td>${fmtDate(tx.date)}</td>
          <td><span class="cat-dot" style="background:${dynColors[tx.category] || '#64748b'}"></span>${tx.category}</td>
          <td class="amt-expense">-${fmt(tx.amount)}</td>
          <td class="tx-note">${tx.note || '—'}</td>
          <td>
            <button class="btn-icon" onclick="App.openModal('expense','${tx.id}')">✎</button>
            <button class="btn-icon btn-icon-del" onclick="App.confirmDelete('${tx.id}')">✕</button>
          </td>
        </tr>`).join('')
      : '<tr><td colspan="5" class="empty-state">No expense records match filters</td></tr>';

    // ── Helper: show chart or empty message ───────────────────────────────────
    function setChartOrEmpty(canvasId, hasData, msg) {
      Charts.destroy(canvasId);
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      const wrap = canvas.parentElement;
      let emptyEl = wrap.querySelector('.chart-empty');
      if (!emptyEl) { emptyEl = document.createElement('div'); emptyEl.className = 'chart-empty'; wrap.appendChild(emptyEl); }
      canvas.style.display = hasData ? '' : 'none';
      emptyEl.style.display = hasData ? 'none' : '';
      emptyEl.textContent = msg;
    }

    // ── Bar chart ─────────────────────────────────────────────────────────────
    const expSubEl = document.getElementById('expenseDailySubtitle');
    if (isYear) {
      const yearMonths = Array.from({length: 12}, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
      const grouped    = byMonth(allExpenseTxs.filter(t => t.date.startsWith(month)));
      const yearData   = yearMonths.map(m => sum(grouped[m] || []));
      const hasData    = yearData.some(v => v > 0);
      setChartOrEmpty('expenseDailyChart', hasData, `No data for ${month}`);
      if (hasData) Charts.monthlyBar('expenseDailyChart', yearMonths.map(monthLabel), yearData, '#ff6b35', 'Monthly Expenses', '#ff6b35');
      if (expSubEl) expSubEl.textContent = month;
    } else {
      const dayMapE = {};
      if (isDay) {
        allExpenseTxs.filter(t => t.date === month)
          .forEach(t => { (dayMapE[t.date] = dayMapE[t.date] || []).push(t); });
      } else {
        const chartMonthE = month || monthKey(new Date().toISOString().slice(0, 10));
        allExpenseTxs.filter(t => monthKey(t.date) === chartMonthE)
          .forEach(t => { (dayMapE[t.date] = dayMapE[t.date] || []).push(t); });
      }
      const sortedDaysE = Object.keys(dayMapE).sort();
      const subtitleE   = isDay ? fmtDate(month) : monthLabel(month || monthKey(new Date().toISOString().slice(0, 10)));
      setChartOrEmpty('expenseDailyChart', sortedDaysE.length > 0, `No data for ${subtitleE}`);
      if (sortedDaysE.length > 0) Charts.dailyStackedBar('expenseDailyChart', sortedDaysE.map(d => fmtDate(d)), sortedDaysE, dayMapE, dynColors);
      if (expSubEl) expSubEl.textContent = subtitleE;
    }

    // ── Category donut (filtered by same year/month scope) ────────────────────
    const catScope = isDay
      ? allExpenseTxs.filter(t => t.date === month)
      : isYear
        ? allExpenseTxs.filter(t => t.date.startsWith(month))
        : month
          ? allExpenseTxs.filter(t => monthKey(t.date) === month)
          : allExpenseTxs;
    const catTotals = {};
    catScope.forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
    const cLabels  = Object.keys(catTotals);
    const emptyMsg = isDay ? `No data for ${fmtDate(month)}` : isYear ? `No data for ${month}` : month ? `No data for ${monthLabel(month)}` : 'No expense data';
    setChartOrEmpty('expenseCatChart', cLabels.length > 0, emptyMsg);
    if (cLabels.length > 0) Charts.categoryDonut('expenseCatChart', cLabels, cLabels.map(c => catTotals[c]), dynColors);
  }

  // ─── Cash Flow ───────────────────────────────────────────────────────────────

  function renderCashFlow() {
    const grouped  = byMonth(state.transactions);
    const selMonth = state.cfFilter.month;
    const isYear   = selMonth.length === 4;
    const isMo     = selMonth.length === 7;

    // Chart window: full year if year selected, else rolling last 6
    const chartMonths = isYear
      ? Array.from({ length: 12 }, (_, i) => `${selMonth}-${String(i + 1).padStart(2, '0')}`)
      : last6Months();

    const netFlows   = chartMonths.map(m => sum((grouped[m] || []).filter(t => t.type === 'income')) - sum((grouped[m] || []).filter(t => t.type === 'expense')));
    const cumulative = netFlows.reduce((acc, v, i) => { acc.push((acc[i - 1] || 0) + v); return acc; }, []);

    if (isMo) {
      const inc = sum((grouped[selMonth] || []).filter(t => t.type === 'income'));
      const exp = sum((grouped[selMonth] || []).filter(t => t.type === 'expense'));
      const net = inc - exp;
      const lbl = monthLabel(selMonth);
      document.getElementById('cashflowStats').innerHTML =
        statCard('↑', `Income — ${lbl}`,   fmt(inc)) +
        statCard('↓', `Expenses — ${lbl}`, fmt(exp)) +
        statCard('≋', `Net Flow — ${lbl}`, `<span class="${net >= 0 ? 'amt-income' : 'amt-expense'}">${fmt(net)}</span>`);
    } else {
      const scope  = isYear ? chartMonths : last6Months();
      const n      = scope.length || 1;
      const avgInc = scope.reduce((s, m) => s + sum((grouped[m] || []).filter(t => t.type === 'income')), 0) / n;
      const avgExp = scope.reduce((s, m) => s + sum((grouped[m] || []).filter(t => t.type === 'expense')), 0) / n;
      const avgNet = avgInc - avgExp;
      const suffix = isYear ? ` — ${selMonth}` : '';
      document.getElementById('cashflowStats').innerHTML =
        statCard('↑', `Avg Monthly Income${suffix}`,   fmt(avgInc)) +
        statCard('↓', `Avg Monthly Expenses${suffix}`, fmt(avgExp)) +
        statCard('≋', `Avg Net Flow${suffix}`, `<span class="${avgNet >= 0 ? 'amt-income' : 'amt-expense'}">${fmt(avgNet)}</span>`);
    }
    ScrollAnim.staggerCards(document.getElementById('cashflowStats'));

    const labels = chartMonths.map(monthLabel);
    Charts.cashFlowBar('cashflowBarChart', labels, netFlows);
    Charts.cumulativeArea('cashflowCumulativeChart', labels, cumulative);
  }

  // ─── Simulator price cache ───────────────────────────────────────────────────

  const simPriceCache = new Map(); // ticker → { price, change }
  let simPriceTimer = null;

  const SIM_PRICE_SEEDS = {
    MWG: 69500, VCB: 87200, FPT: 134500, HPG: 27400, MBB: 25600,
    VNM: 64800, TCB: 24600, VHM: 38900, MSN: 52300, VIC: 41200,
    VPB: 18400, ACB: 25800, BID: 48600, CTG: 34500, STB: 21400,
  };

  async function fetchSimStockData(ticker) {
    ticker = (ticker || '').toUpperCase().trim();
    if (!ticker) return null;
    const url = `https://apipubaws.tcbs.com.vn/stock-insight/v1/stock/last-data?ticker=${ticker}&type=stock`;
    const parse = j => {
      const d = j?.data;
      if (!d) return null;
      const price = d.lastPrice ?? d.p ?? d.last ?? d.close ?? 0;
      if (!price) return null;
      const prev = d.referencePrice ?? d.ref ?? d.closePrice ?? d.prevClose ?? 0;
      return { price, change: prev ? (price - prev) / prev * 100 : 0 };
    };
    // Try Vercel proxy first (server-side, no CORS issues)
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch(`/api/price?ticker=${ticker}`, { signal: ctrl.signal });
      clearTimeout(tid);
      if (r.ok) {
        const j = await r.json();
        if (j?.price) return { price: j.price, change: j.prevClose ? (j.price - j.prevClose) / j.prevClose * 100 : 0 };
      }
    } catch {}
    // Fallback: direct TCBS
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch(url, { signal: ctrl.signal });
      clearTimeout(tid);
      if (r.ok) { const d = parse(await r.json()); if (d) return d; }
    } catch {}
    const seed = SIM_PRICE_SEEDS[ticker];
    if (seed) return { price: seed, change: 0, demo: true };
    return null;
  }

  function updateSimPriceEl(i, data) {
    const el = document.getElementById(`simLivePrice${i}`);
    if (!el) return;
    if (!data) { el.innerHTML = '<span class="sim-live-val" style="color:var(--muted)">—</span>'; return; }
    const priceStr = new Intl.NumberFormat('vi-VN').format(Math.round(data.price));
    if (data.demo) {
      el.innerHTML = `<span class="sim-live-val">${priceStr}</span><span class="sim-live-chg" style="color:var(--muted);font-style:italic">demo</span>`;
      return;
    }
    const isUp = data.change >= 0;
    el.innerHTML = `<span class="sim-live-val">${priceStr}</span>
      <span class="sim-live-chg ${isUp ? 'up' : 'dn'}">${isUp ? '▲' : '▼'} ${Math.abs(data.change).toFixed(2)}%</span>`;
  }

  async function refreshSimPrices() {
    const tickers = Array.from({length: 5}, (_, i) =>
      (document.getElementById(`simTicker${i}`)?.value || '').toUpperCase().trim()
    );
    tickers.forEach((ticker, i) => {
      if (ticker && !simPriceCache.has(ticker)) {
        const el = document.getElementById(`simLivePrice${i}`);
        if (el) el.innerHTML = '<span class="sim-live-val" style="color:var(--muted);font-style:italic">...</span>';
      }
    });
    await Promise.allSettled(tickers.map(async (ticker, i) => {
      if (!ticker) return;
      const data = await fetchSimStockData(ticker);
      simPriceCache.set(ticker, data || { price: 0, change: 0 });
      updateSimPriceEl(i, data);
    }));
    renderSimulator();
  }

  function startSimPriceRefresh() {
    if (simPriceTimer) return;
    refreshSimPrices();
    simPriceTimer = setInterval(refreshSimPrices, 30000);
  }

  function stopSimPriceRefresh() {
    clearInterval(simPriceTimer);
    simPriceTimer = null;
  }

  // ─── Simulator ───────────────────────────────────────────────────────────────

  // ─── Simulator snapshots ─────────────────────────────────────────────────────

  function readSimInputs() {
    return {
      investRatio: parseInt(document.getElementById('simInvestRatio')?.value) || 0,
      stocks: Array.from({length: 5}, (_, i) => ({
        ticker: document.getElementById(`simTicker${i}`)?.value || '',
        qty:    parseInt(document.getElementById(`simQty${i}`)?.value) || 0,
        growth: parseFloat(document.getElementById(`simGrowth${i}`)?.value) || 0,
      })),
      savingsAmt:  parseInputNum(document.getElementById('simSavingsAmt')?.value) || 0,
      savingsRate: parseFloat(document.getElementById('simSavingsRate')?.value) || 7,
      goldAmt:     parseInputNum(document.getElementById('simGoldAmt')?.value) || 0,
      usdAmt:      parseInputNum(document.getElementById('simUsdAmt')?.value) || 0,
    };
  }

  function applySimSnapshot(snap) {
    const sliderEl = document.getElementById('simInvestRatio');
    if (sliderEl) sliderEl.value = snap.investRatio;
    snap.stocks.forEach((s, i) => {
      const tEl = document.getElementById(`simTicker${i}`);
      const qEl = document.getElementById(`simQty${i}`);
      const gEl = document.getElementById(`simGrowth${i}`);
      if (tEl) { tEl.value = s.ticker; }
      if (qEl) qEl.value = s.qty;
      if (gEl) gEl.value = s.growth;
    });
    const saEl = document.getElementById('simSavingsAmt');
    if (saEl) saEl.value = fmtInputNum(snap.savingsAmt);
    const srEl = document.getElementById('simSavingsRate');
    if (srEl) srEl.value = snap.savingsRate;
    const gaEl = document.getElementById('simGoldAmt');
    if (gaEl) gaEl.value = fmtInputNum(snap.goldAmt);
    const uaEl = document.getElementById('simUsdAmt');
    if (uaEl) uaEl.value = fmtInputNum(snap.usdAmt);
    simPriceCache.clear();
    stopSimPriceRefresh();
    startSimPriceRefresh();
    renderSimulator();
  }

  function renderSimSnapHistory() {
    const el = document.getElementById('simSnapHistory');
    if (!el) return;
    const snaps = DB.getSimSnapshots();
    const keys = Object.keys(snaps).sort().reverse();
    el.innerHTML = keys.length === 0 ? '' :
      '<span class="snap-label">Saved:</span>' +
      keys.map(k => `<span class="snap-chip">
        <span class="snap-chip-name">${monthLabel(k)}</span>
        <button class="snap-load" data-tab="sim" data-key="${k}" title="Load">↩</button>
        <button class="snap-del"  data-tab="sim" data-key="${k}" title="Delete">×</button>
      </span>`).join('');
  }

  function saveSimSnapshot() {
    const month = state.simFilter.month || new Date().toISOString().slice(0, 7);
    DB.setSimSnapshot(month, readSimInputs());
    toast(`Saved ${monthLabel(month)}`);
    renderSimSnapHistory();
  }

  // ─── Allocation snapshots ─────────────────────────────────────────────────────

  function readAllocInputs() {
    const amounts = {};
    ['stocks', 'savings', 'cash', 'gold', 'usd'].forEach(k => {
      amounts[k] = parseInputNum(document.getElementById(`allocAmt_${k}`)?.value) || 0;
    });
    return { amounts };
  }

  function applyAllocSnapshot(snap) {
    ['stocks', 'savings', 'cash', 'gold', 'usd'].forEach(k => {
      const el = document.getElementById(`allocAmt_${k}`);
      if (el) el.value = fmtInputNum(snap.amounts[k] || 0);
    });
    renderAllocation();
  }

  function renderAllocSnapHistory() {
    const el = document.getElementById('allocSnapHistory');
    if (!el) return;
    const snaps = DB.getAllocSnapshots();
    const keys = Object.keys(snaps).sort().reverse();
    el.innerHTML = keys.length === 0 ? '' :
      '<span class="snap-label">Saved:</span>' +
      keys.map(k => `<span class="snap-chip">
        <span class="snap-chip-name">${monthLabel(k)}</span>
        <button class="snap-load" data-tab="alloc" data-key="${k}" title="Load">↩</button>
        <button class="snap-del"  data-tab="alloc" data-key="${k}" title="Delete">×</button>
      </span>`).join('');
  }

  function saveAllocSnapshot() {
    const month = state.allocFilter.month || new Date().toISOString().slice(0, 7);
    DB.setAllocSnapshot(month, readAllocInputs());
    toast(`Saved ${monthLabel(month)}`);
    renderAllocSnapHistory();
  }

  function renderSimulator() {
    // ── Init stock inputs once ────────────────────────────────────────────────
    const stocksEl = document.getElementById('simStocksTable');
    if (stocksEl && !stocksEl.dataset.init) {
      stocksEl.dataset.init = '1';
      const DEFAULT_STOCKS = [
        { ticker: 'MWG', rate: 19.3 },
        { ticker: 'VCB', rate: 13.8 },
        { ticker: 'FPT', rate: 20.0 },
        { ticker: 'HPG', rate: 17.5 },
        { ticker: 'MBB', rate: 17.7 },
      ];
      stocksEl.innerHTML = DEFAULT_STOCKS.map((s, i) =>
        `<div class="sim-stock-row">
          <div class="sim-sc">
            <input type="text" class="sim-input sim-ticker-input" id="simTicker${i}" value="${s.ticker}" maxlength="10" placeholder="VNM" />
          </div>
          <div class="sim-sc sim-live-price" id="simLivePrice${i}">
            <span class="sim-live-val">—</span>
          </div>
          <div class="sim-sc">
            <input type="number" class="sim-input sim-qty-input" id="simQty${i}" value="0" min="0" step="1" placeholder="0" />
          </div>
          <div class="sim-sc">
            <span class="sim-stock-val-txt" id="simStockVal${i}">—</span>
          </div>
          <div class="sim-sc">
            <span class="sim-target-pct">20%</span>
          </div>
          <div class="sim-sc">
            <span class="sim-actual-pct" id="simActual${i}">—</span>
          </div>
          <div class="sim-sc">
            <input type="number" class="sim-input" id="simGrowth${i}" value="${s.rate.toFixed(1)}" min="0" max="100" step="0.1" />
          </div>
        </div>`
      ).join('');

      for (let i = 0; i < 5; i++) {
        document.getElementById(`simGrowth${i}`)?.addEventListener('change', () => renderSimulator());
        document.getElementById(`simQty${i}`)?.addEventListener('input', () => renderSimulator());
        document.getElementById(`simTicker${i}`)?.addEventListener('change', e => {
          const ticker = e.target.value.toUpperCase().trim();
          e.target.value = ticker;
          updateSimPriceEl(i, null);
          fetchSimStockData(ticker).then(data => {
            if (data) { simPriceCache.set(ticker, data); updateSimPriceEl(i, data); renderSimulator(); }
          });
          renderSimulator();
        });
      }
      startSimPriceRefresh();
    } else {
      startSimPriceRefresh();
    }

    // ── Init other-asset amount inputs once ───────────────────────────────────
    const otherEl = document.getElementById('simOtherAssets');
    if (otherEl && !otherEl.dataset.init) {
      otherEl.dataset.init = '1';
      ['simSavingsAmt', 'simGoldAmt', 'simUsdAmt'].forEach(id => {
        const inp = document.getElementById(id);
        if (inp) attachNumFmt(inp, renderSimulator);
      });
    }

    // ── Net cash flow ─────────────────────────────────────────────────────────
    const netIncome = computeAvgNet(state.simFilter.month);
    const niInp = document.getElementById('simNetIncome');
    if (niInp) niInp.value = netIncome > 0 ? fmtInputNum(netIncome) : '0';
    const sf = state.simFilter.month;
    const incLbl2 = document.getElementById('income-label');
    if (incLbl2) incLbl2.textContent = !sf ? 'Avg Net Cash Flow'
      : sf.length === 4 ? `Avg Net CF — ${sf}` : `Net CF — ${monthLabel(sf)}`;

    // ── Stocks slider ─────────────────────────────────────────────────────────
    const sliderEl = document.getElementById('simInvestRatio');
    let ratio = parseInt(sliderEl?.value ?? '0');
    const rLabel = document.getElementById('simRatioLabel');
    if (rLabel) rLabel.textContent = ratio + '%';

    const stocks = Array.from({length: 5}, (_, i) => {
      const ticker = ((document.getElementById(`simTicker${i}`)?.value || `STK${i+1}`).toUpperCase().trim()) || `STK${i+1}`;
      const rate   = parseFloat(document.getElementById(`simGrowth${i}`)?.value) || 0;
      const qty    = Math.max(0, parseInt(document.getElementById(`simQty${i}`)?.value) || 0);
      const cached = simPriceCache.get(ticker);
      const price  = cached?.price || 0;
      return { ticker, rate, qty, price, value: qty * price };
    });

    const totalStockValue = stocks.reduce((s, st) => s + st.value, 0);
    const stockWeights = totalStockValue > 0
      ? stocks.map(st => st.value / totalStockValue)
      : stocks.map(() => 1 / 5);

    stocks.forEach((st, i) => {
      const valEl = document.getElementById(`simStockVal${i}`);
      if (valEl) valEl.textContent = st.value > 0 ? Charts.formatCurrency(st.value) : '—';
      const actualEl = document.getElementById(`simActual${i}`);
      if (actualEl) {
        if (totalStockValue > 0) {
          const pct = Math.round(st.value / totalStockValue * 100);
          actualEl.textContent = pct + '%';
          actualEl.className = 'sim-actual-pct ' + (Math.abs(pct - 20) <= 5 ? 'ok' : pct > 25 ? 'hi' : 'lo');
        } else {
          actualEl.textContent = '—';
          actualEl.className = 'sim-actual-pct';
        }
      }
    });

    const SIM_STOCK_COLORS = ['#4f46e5', '#10b981', '#ff6b35', '#f59e0b', '#8b5cf6'];
    const stocksColored = stocks.map((s, i) => ({ ...s, color: SIM_STOCK_COLORS[i] }));
    const hasAnyValue = stocksColored.some(s => s.value > 0);
    const donutStocks = hasAnyValue ? stocksColored.filter(s => s.value > 0) : stocksColored;
    const _drawDonut = () => Charts.simStockDonut(
      'simAllocDonut',
      donutStocks.map(s => s.ticker),
      donutStocks.map(s => hasAnyValue ? s.value : 1),
      donutStocks.map(s => s.color)
    );
    _drawDonut();
    setTimeout(_drawDonut, 50);

    const legendEl = document.getElementById('simDonutLegend');
    if (legendEl) {
      legendEl.innerHTML = donutStocks.map(s =>
        `<span class="sim-donut-legend-item"><span class="sim-donut-legend-dot" style="background:${s.color}"></span>${s.ticker}</span>`
      ).join('');
    }

    const monthlyInvest = netIncome * ratio / 100;
    state.simMonthlyInvest = monthlyInvest;

    // ── Other assets ──────────────────────────────────────────────────────────
    const savingsAmt  = parseInputNum(document.getElementById('simSavingsAmt')?.value) || 0;
    const savingsRate = parseFloat(document.getElementById('simSavingsRate')?.value) || 7;
    const goldAmt     = parseInputNum(document.getElementById('simGoldAmt')?.value) || 0;
    const usdAmt      = parseInputNum(document.getElementById('simUsdAmt')?.value) || 0;

    const goldRate = 8;
    const usdRate = 3;

    const cashAmt = netIncome;
    const cashEl2 = document.getElementById('simCashDisplay');
    if (cashEl2) cashEl2.textContent = Charts.formatCurrency(cashAmt);

    // ── FV helper (future value of monthly contributions) ─────────────────────
    function fv(pmt, annualRatePct, years) {
      const n = years * 12;
      const r = annualRatePct / 100 / 12;
      if (r <= 0 || pmt <= 0) return pmt * n;
      return pmt * ((Math.pow(1 + r, n) - 1) / r);
    }

    // ── Per-asset FV arrays (Year 1 … 30) ────────────────────────────────────
    const stockYearFV = stocks.map((s, si) =>
      Array.from({length: 30}, (_, y) => fv(monthlyInvest * stockWeights[si], s.rate, y + 1))
    );
    const stocksTotalFV = Array.from({length: 30}, (_, y) =>
      stockYearFV.reduce((sum, sv) => sum + sv[y], 0)
    );
    const savingsFV = Array.from({length: 30}, (_, y) => fv(savingsAmt, savingsRate, y + 1));
    const goldFV    = Array.from({length: 30}, (_, y) => fv(goldAmt,    goldRate,    y + 1));
    const usdFV     = Array.from({length: 30}, (_, y) => fv(usdAmt,     usdRate,     y + 1));
    const cashFV    = Array.from({length: 30}, (_, y) => cashAmt * (y + 1) * 12 * Math.pow(1 - 0.03, y + 1));

    const totalFV       = Array.from({length: 30}, (_, y) => stocksTotalFV[y] + savingsFV[y] + goldFV[y] + usdFV[y] + cashFV[y]);
    const investedFV    = Array.from({length: 30}, (_, y) => stocksTotalFV[y] + savingsFV[y] + goldFV[y] + usdFV[y]);
    const investedMonthly = monthlyInvest + savingsAmt + goldAmt + usdAmt;
    const totalContrib  = Array.from({length: 30}, (_, y) => investedMonthly * (y + 1) * 12);

    const fmtVnd = Charts.formatCurrency;
    const fmtS   = Charts.formatCurrencyShort;

    // ── Milestone cards (Year 10 / 20 / 30) ──────────────────────────────────
    document.getElementById('simMilestoneCards').innerHTML = [10, 20, 30].map(y => {
      const pfv    = totalFV[y - 1];
      const contrib = totalContrib[y - 1];
      const realFV = investedFV[y - 1] / Math.pow(1.03, y);
      const gain   = realFV - contrib;
      const roi    = contrib > 0 ? (gain / contrib * 100) : 0;
      const breakdown = [
        { label: 'Stocks',    val: stocksTotalFV[y-1], color: '#4f46e5' },
        { label: 'Savings',   val: savingsFV[y-1],     color: '#00d4aa' },
        { label: 'Gold',      val: goldFV[y-1],        color: '#fbbf24' },
        { label: 'USD',       val: usdFV[y-1],         color: '#a855f7' },
        { label: 'Cash',      val: cashFV[y-1],        color: '#64748b' },
      ];
      return `<div class="sim-milestone-card">
        <div class="sim-milestone-year">Year ${y}</div>
        <div class="sim-milestone-row">
          <span class="sim-milestone-label">Portfolio Value</span>
          <span class="sim-milestone-val val-total">${fmtVnd(pfv)}</span>
        </div>
        <div class="sim-milestone-row">
          <span class="sim-milestone-label">Total Contributed</span>
          <span class="sim-milestone-val val-invested">${fmtVnd(contrib)}</span>
        </div>
        <div class="sim-milestone-row">
          <span class="sim-milestone-label">Net Gain</span>
          <span class="sim-milestone-val val-gain">${gain >= 0 ? '+' : ''}${fmtVnd(gain)}</span>
        </div>
        <div class="sim-milestone-roi">
          <span class="sim-milestone-roi-label">ROI</span>
          <span class="sim-milestone-roi-val">${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%</span>
        </div>
        <div class="sim-milestone-breakdown">
          ${breakdown.map(b => `<div class="sim-bk-row">
            <span class="alloc-dot" style="background:${b.color}"></span>
            <span class="sim-bk-label">${b.label}</span>
            <span class="sim-bk-val">${fmtS(b.val)}</span>
          </div>`).join('')}
        </div>
      </div>`;
    }).join('');

    // ── Charts ────────────────────────────────────────────────────────────────
    const yearLabels = Array.from({length: 30}, (_, i) => `Y${i + 1}`);

    const hasData = arr => arr.some(v => v > 0);
    const portfolioDatasets = [
      { label: 'Stocks',       data: stocksTotalFV, color: '#4f46e5' },
      { label: 'Bank Savings', data: savingsFV,     color: '#00d4aa' },
      { label: 'Gold',         data: goldFV,        color: '#fbbf24' },
      { label: 'USD Reserve',  data: usdFV,         color: '#a855f7' },
      { label: 'Cash',         data: cashFV,        color: '#64748b' },
    ].filter(d => hasData(d.data));
    Charts.simPortfolioArea('simGrowthChart', yearLabels, portfolioDatasets);

    const stockMilestoneEl = document.getElementById('simStockMilestoneChart');
    const stockCardEl = stockMilestoneEl?.closest('.chart-card');
    if (monthlyInvest > 0) {
      if (stockCardEl) stockCardEl.style.display = '';
      Charts.simStockMilestone('simStockMilestoneChart', ['Year 10', 'Year 20', 'Year 30'],
        stocks.map((s, si) => ({
          label: s.ticker,
          data:  [9, 19, 29].map(y => Math.round(stockYearFV[si][y])),
        }))
      );
    } else {
      if (stockCardEl) stockCardEl.style.display = 'none';
      Charts.destroy('simStockMilestoneChart');
    }

    // ── Save button label + history ───────────────────────────────────────────
    const simSaveBtn = document.getElementById('simSaveBtn');
    if (simSaveBtn) {
      const m = state.simFilter.month;
      simSaveBtn.textContent = m ? `Save ${monthLabel(m)}` : 'Save snapshot';
    }
    renderSimSnapHistory();
  }

  // ─── Allocation Advisor ──────────────────────────────────────────────────────

  const ALLOC_STANDARD = [
    { key: 'stocks',  label: 'Stocks',       pct: 50, color: '#4f46e5', note: 'VN-Index / ETF' },
    { key: 'savings', label: 'Bank Savings',  pct: 10, color: '#00d4aa', note: '~7% p.a.', rate: 0.07 },
    { key: 'cash',    label: 'Cash',          pct: 20, color: '#64748b', note: 'Emergency fund' },
    { key: 'gold',    label: 'Gold',          pct: 10, color: '#fbbf24', note: 'Spot price (intl.)', gp: true },
    { key: 'usd',     label: 'USD Reserve',   pct: 10, color: '#a855f7', note: 'Foreign reserve', fx: true },
  ];
  const STOCK_TICKERS = ['MWG', 'VCB', 'FPT', 'HPG', 'MBB'];

  let _fxCache = null;
  let _fxFetchedAt = 0;
  let _goldCache = null;
  let _goldFetchedAt = 0;

  async function fetchExchangeRates() {
    const textEl = document.getElementById('exchange-rate-text');
    const timeEl = document.getElementById('exchange-rate-time');
    if (!textEl) return;

    const now = Date.now();
    if (_fxCache && now - _fxFetchedAt < 5 * 60 * 1000) {
      textEl.textContent = _fxCache.text;
      if (timeEl) timeEl.textContent = _fxCache.time;
      return;
    }

    textEl.textContent = 'Đang tải...';
    try {
      const res  = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json');
      const data = await res.json();
      const r    = data.usd;
      const rawVnd = Math.round(r.vnd);
      const timeStr = 'Updated: ' + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      _fxCache = { text: `1 USD = ${rawVnd.toLocaleString('en-US')} ₫`, time: timeStr, vnd: rawVnd };
      _fxFetchedAt = now;
      textEl.textContent = _fxCache.text;
      if (timeEl) timeEl.textContent = timeStr;
      const usdRetEl = document.getElementById('allocReturn_usd');
      if (usdRetEl) {
        const usdAmt = parseInputNum(document.getElementById('allocAmt_usd')?.value) || 0;
        usdRetEl.textContent = usdAmt > 0 ? `≈ $${(usdAmt / rawVnd).toFixed(0)}` : '';
      }
    } catch {
      textEl.textContent = 'Không thể tải tỷ giá';
    }
  }

  async function fetchGoldPrice() {
    const textEl = document.getElementById('gold-price-text');
    const timeEl = document.getElementById('gold-price-time');
    const now = Date.now();
    if (_goldCache && now - _goldFetchedAt < 5 * 60 * 1000) {
      if (textEl) textEl.textContent = _goldCache.label;
      if (timeEl) timeEl.textContent = _goldCache.time;
      updateGoldHint();
      return;
    }
    try {
      const res    = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/xau.json');
      const data   = await res.json();
      const xauVnd = data?.xau?.vnd;
      if (!xauVnd) return;
      const vndPerLuong = Math.round(xauVnd * 37.5 / 31.1035);
      const vndPerChi   = Math.round(vndPerLuong / 10);
      const timeStr = 'Updated: ' + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      _goldCache = { buy: vndPerLuong, chi: vndPerChi, label: `1 chỉ ≈ ${vndPerChi.toLocaleString('en-US')} ₫ (International gold price)`, time: timeStr };
      _goldFetchedAt = now;
      if (textEl) textEl.textContent = _goldCache.label;
      if (timeEl) timeEl.textContent = timeStr;
      updateGoldHint();
    } catch {
      if (textEl) textEl.textContent = 'Không thể tải giá vàng';
    }
  }

  function updateGoldHint() {
    const retEl = document.getElementById('allocReturn_gold');
    if (!retEl) return;
    const amt = parseInputNum(document.getElementById('allocAmt_gold')?.value) || 0;
    if (_goldCache?.buy && amt > 0) {
      const luong = (amt / _goldCache.buy).toFixed(2);
      retEl.textContent = `≈ ${luong} lượng`;
    } else {
      retEl.textContent = '';
    }
  }

  function alignRateBoxes() {
    const leftEl  = document.querySelector('.alloc-left');
    const goldRow = document.getElementById('allocAmt_gold')?.closest('.alloc-input-row');
    const usdRow  = document.getElementById('allocAmt_usd')?.closest('.alloc-input-row');
    const goldBox = document.getElementById('gold-price-box');
    const usdBox  = document.getElementById('exchange-rate-box');
    if (!leftEl || !goldRow || !usdRow || !goldBox || !usdBox) return;

    goldBox.style.marginTop = '';
    usdBox.style.marginTop  = '';

    const leftTop    = leftEl.getBoundingClientRect().top;
    const goldRowTop = goldRow.getBoundingClientRect().top - leftTop;
    const goldBoxTop = goldBox.getBoundingClientRect().top - leftTop;
    goldBox.style.marginTop = Math.max(0, goldRowTop - goldBoxTop) + 'px';

    const usdRowTop = usdRow.getBoundingClientRect().top - leftTop;
    const usdBoxTop = usdBox.getBoundingClientRect().top - leftTop;
    usdBox.style.marginTop = Math.max(0, usdRowTop - usdBoxTop) + 'px';
  }

  function renderAllocation() {
    const cashFlow = computeAvgNet(state.allocFilter.month);
    const niEl = document.getElementById('allocNetIncome');
    if (niEl) niEl.value = cashFlow > 0 ? fmtInputNum(cashFlow) : '0';
    renderAllocAdvisor(cashFlow);
    fetchExchangeRates();
    fetchGoldPrice();
  }

  function renderAllocAdvisor(cashFlow) {
    const fmtC = Charts.formatCurrency;
    const fmtS = Charts.formatCurrencyShort;

    const valEl = document.getElementById('allocMonthlyVal');
    if (valEl) valEl.textContent = fmtC(cashFlow);

    // ── Init amount inputs (once) ────────────────────────────────────────────
    const inputsEl = document.getElementById('allocInputs');
    if (inputsEl && !inputsEl.dataset.init) {
      inputsEl.dataset.init = '1';
      inputsEl.innerHTML = ALLOC_STANDARD.map(a => `
        <div class="alloc-input-row">
          <div class="alloc-input-label">
            <span class="alloc-dot" style="background:${a.color}"></span>
            <div class="alloc-input-info">
              <span class="alloc-input-name">${a.label}</span>
              <span class="alloc-input-note">${a.note}</span>
              ${(a.rate || a.fx || a.gp) ? `<span class="alloc-return-hint" id="allocReturn_${a.key}"></span>` : ''}
            </div>
          </div>
          <div class="alloc-jar">
            <div class="jar-lid-cap" style="border-color:${a.color}bb"></div>
            <div class="jar-lid-ring" style="border-color:${a.color}bb"></div>
            <div class="jar-body" style="border-color:${a.color}99">
              <div class="jar-fill" id="jarFill_${a.key}" style="height:0%;background:${a.color}"></div>
              <div class="jar-shine"></div>
            </div>
          </div>
          <div class="alloc-input-controls">
            <input type="text" inputmode="numeric" class="alloc-amt-input" id="allocAmt_${a.key}" placeholder="0" />
            <span class="alloc-auto-pct" id="allocPct_${a.key}">0%</span>
          </div>
        </div>`).join('');

      ALLOC_STANDARD.forEach(a => {
        const inp = document.getElementById(`allocAmt_${a.key}`);
        if (!inp) return;
        if (a.key === 'stocks') {
          inp.value = fmtInputNum(Math.round(state.simMonthlyInvest || 0));
          inp.readOnly = true;
          inp.classList.add('sim-input-readonly');
        } else if (a.key === 'cash') {
          const initStocks = Math.round(state.simMonthlyInvest || 0);
          inp.value = fmtInputNum(Math.max(0, Math.round(cashFlow) - initStocks));
          inp.readOnly = true;
          inp.classList.add('sim-input-readonly');
        } else {
          inp.value = '0';
          attachNumFmt(inp, () => {
            const cf = parseInputNum(document.getElementById('allocNetIncome')?.value) || 0;
            renderAllocAdvisor(cf);
          });
        }
      });
    }

    // Always sync stocks from simulator slider
    const stocksInp = document.getElementById('allocAmt_stocks');
    if (stocksInp) stocksInp.value = fmtInputNum(Math.round(state.simMonthlyInvest || 0));

    // ── Cash remaining = cashFlow − all other buckets ─────────────────────────
    const otherKeys = ALLOC_STANDARD.filter(a => a.key !== 'cash').map(a => a.key);
    const otherTotal = otherKeys.reduce((s, k) => s + (parseInputNum(document.getElementById(`allocAmt_${k}`)?.value) || 0), 0);
    const cashRemaining = Math.max(0, cashFlow - otherTotal);
    const cashInp = document.getElementById('allocAmt_cash');
    if (cashInp) cashInp.value = fmtInputNum(Math.round(cashRemaining));

    // ── Read amounts & compute percentages ───────────────────────────────────
    const userVals = ALLOC_STANDARD.map(a => {
      const amt = a.key === 'cash' ? cashRemaining : (parseInputNum(document.getElementById(`allocAmt_${a.key}`)?.value) || 0);
      const pct = cashFlow > 0 ? Math.round(amt / cashFlow * 100) : 0;
      return { ...a, userAmt: amt, userPct: pct };
    });

    userVals.forEach(a => {
      const pctEl  = document.getElementById(`allocPct_${a.key}`);
      if (pctEl) pctEl.textContent = a.userPct + '%';

      const fillEl = document.getElementById(`jarFill_${a.key}`);
      if (fillEl) {
        const fillPct = cashFlow > 0 ? Math.min(100, Math.round(a.userAmt / cashFlow * 100)) : 0;
        fillEl.style.height = fillPct + '%';
      }

      if (a.rate) {
        const retEl = document.getElementById(`allocReturn_${a.key}`);
        if (retEl) {
          const annualReturn = Math.round(a.userAmt * a.rate);
          retEl.textContent = a.userAmt > 0 ? `+${fmtS(annualReturn)}/yr` : '';
        }
      }
      if (a.fx) {
        const retEl = document.getElementById(`allocReturn_${a.key}`);
        if (retEl) {
          const vndRate = _fxCache?.vnd;
          retEl.textContent = (vndRate && a.userAmt > 0) ? `≈ $${(a.userAmt / vndRate).toFixed(0)}` : '';
        }
      }
      if (a.gp) {
        const retEl = document.getElementById(`allocReturn_${a.key}`);
        if (retEl) {
          const buyPrice = _goldCache?.buy;
          if (buyPrice && a.userAmt > 0) {
            retEl.textContent = `≈ ${(a.userAmt / buyPrice).toFixed(2)} lượng`;
          } else {
            retEl.textContent = '';
          }
        }
      }
    });

    const badge = document.getElementById('allocTotalBadge');
    if (badge) {
      const deployedPct = cashFlow > 0 ? Math.round(otherTotal / cashFlow * 100) : 0;
      badge.textContent = deployedPct + '% allocated';
      badge.className = 'alloc-total-badge ' + (Math.abs(deployedPct - 80) <= 2 ? 'ok' : 'warn');
    }

    // ── Standard benchmark donut + legend ─────────────────────────────────────
    const legendEl = document.getElementById('allocStdLegend');
    if (legendEl) legendEl.innerHTML = ALLOC_STANDARD.map(a => `
      <div class="alloc-legend-row">
        <span class="alloc-dot" style="background:${a.color}"></span>
        <span class="alloc-legend-name">${a.label}</span>
        <span class="alloc-legend-pct">${a.pct}%</span>
        <span class="alloc-legend-amt">${fmtS(cashFlow * a.pct / 100)}</span>
      </div>
    `).join('');

    // ── User allocation donut ─────────────────────────────────────────────────
    Charts.categoryDonut('allocUserDonut',
      userVals.map(a => a.label),
      userVals.map(a => a.userAmt),
      Object.fromEntries(userVals.map(a => [a.label, a.color]))
    );

    // ── Suggestions (before comparison table) ────────────────────────────────
    const suggestEl = document.getElementById('allocSuggestions');
    if (suggestEl) {
      const manualKeys = ALLOC_STANDARD.filter(a => a.key !== 'cash' && a.key !== 'stocks').map(a => a.key);
      const manualTotal = manualKeys.reduce((s, k) => s + (parseInputNum(document.getElementById(`allocAmt_${k}`)?.value) || 0), 0);
      if (manualTotal === 0) {
        suggestEl.innerHTML = `<div class="alloc-warn">Enter your monthly allocation amounts on the right to get personalized rebalancing suggestions.</div>`;
      } else {
        const deviating = userVals.filter(a => Math.abs(a.userPct - a.pct) > 3);
        if (deviating.length === 0) {
          suggestEl.innerHTML = `<div class="alloc-ok">✓ Your allocation aligns with the standard benchmark. Well balanced!</div>`;
        } else {
          suggestEl.innerHTML = `
            <div class="alloc-suggest-title">Rebalancing Suggestions</div>
            ${deviating.map(a => {
              const gap    = a.userPct - a.pct;
              const isOver = gap > 0;
              const dir    = isOver ? 'gap-over' : 'gap-under';
              const actionLabel = isOver ? '↓ Reduce' : '↑ Increase';
              const actionCls   = isOver ? 'action-reduce' : 'action-increase';
              return `<div class="alloc-suggest-row">
                <div class="alloc-suggest-header">
                  <div class="alloc-suggest-asset">
                    <span class="alloc-dot" style="background:${a.color}"></span>
                    <span class="alloc-suggest-name">${a.label}</span>
                    <span class="alloc-suggest-note">${a.note}</span>
                  </div>
                  <span class="alloc-suggest-action ${actionCls}">${actionLabel}</span>
                </div>
                <div class="alloc-suggest-flow">
                  <div class="alloc-suggest-side">
                    <span class="flow-label">Your allocation</span>
                    <span class="flow-amt ${dir}">${fmtC(a.userAmt)}<span class="flow-unit">/mo</span></span>
                    <span class="flow-pct ${dir}">${a.userPct}%</span>
                  </div>
                  <span class="flow-arrow">→</span>
                  <div class="alloc-suggest-side">
                    <span class="flow-label">Target</span>
                    <span class="flow-amt gap-ok">${fmtC(cashFlow * a.pct / 100)}<span class="flow-unit">/mo</span></span>
                    <span class="flow-pct gap-ok">${a.pct}%</span>
                  </div>
                </div>
              </div>`;
            }).join('')}
          `;
        }
      }
    }

    requestAnimationFrame(alignRateBoxes);

    // ── Comparison table ──────────────────────────────────────────────────────
    const cmpEl = document.getElementById('allocCompare');
    if (cmpEl) cmpEl.innerHTML = `
      <div class="alloc-cmp-head">
        <span>Asset</span><span>Benchmark</span><span>Yours</span><span>Gap</span><span>Target / mo</span><span>Yours / mo</span>
      </div>
      ${userVals.map(a => {
        const gap = a.userPct - a.pct;
        const cls = Math.abs(gap) <= 3 ? 'gap-ok' : gap > 0 ? 'gap-over' : 'gap-under';
        const gapStr = gap === 0 ? '—' : (gap > 0 ? '+' : '') + gap + '%';
        return `<div class="alloc-cmp-row">
          <span class="alloc-cmp-asset"><span class="alloc-dot" style="background:${a.color}"></span>${a.label}</span>
          <span>${a.pct}%</span>
          <span>${a.userPct}%</span>
          <span class="${cls}">${gapStr}</span>
          <span>${fmtS(cashFlow * a.pct / 100)}</span>
          <span>${fmtS(a.userAmt)}</span>
        </div>`;
      }).join('')}
    `;

    // ── Save button label + history ───────────────────────────────────────────
    const allocSaveBtn = document.getElementById('allocSaveBtn');
    if (allocSaveBtn) {
      const m = state.allocFilter.month;
      allocSaveBtn.textContent = m ? `Save ${monthLabel(m)}` : 'Save snapshot';
    }
    renderAllocSnapHistory();
  }

  // ─── Settings ────────────────────────────────────────────────────────────────

  function renderSettings() {
    document.getElementById('settingsCurrency').value   = state.settings.currency   || '$';
    document.getElementById('settingsDateFormat').value = state.settings.dateFormat || 'MM/DD/YYYY';
    syncCurrencyDisplay();
    renderCustomCatList();
  }

  function syncCurrencyDisplay() {
    const select = document.getElementById('settingsCurrency');
    const input  = document.getElementById('currencySearchInput');
    if (!select || !input) return;
    const opt = select.options[select.selectedIndex];
    input.value = opt ? opt.textContent.trim() : select.value;
  }

  function initCurrencySearch() {
    const select   = document.getElementById('settingsCurrency');
    const input    = document.getElementById('currencySearchInput');
    const dropdown = document.getElementById('currencyDropdown');
    if (!select || !input || !dropdown) return;

    const options = Array.from(select.options).map(o => ({ value: o.value, label: o.textContent.trim() }));

    function showDropdown(q) {
      const list = q ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase())) : options;
      dropdown.innerHTML = list.map(o =>
        `<div class="currency-option${o.value === select.value ? ' selected' : ''}" data-value="${o.value}">${o.label}</div>`
      ).join('') || '<div class="currency-option" style="opacity:.5;cursor:default">No results</div>';
      dropdown.classList.add('open');
    }

    function hide() { dropdown.classList.remove('open'); syncCurrencyDisplay(); }

    input.addEventListener('focus', () => showDropdown(''));
    input.addEventListener('input', () => showDropdown(input.value));
    input.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });

    dropdown.addEventListener('mousedown', e => {
      const opt = e.target.closest('.currency-option[data-value]');
      if (!opt) return;
      e.preventDefault();
      select.value = opt.dataset.value;
      hide();
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('.currency-search-wrap')) hide();
    });
  }

  function renderCustomCatList() {
    const type  = state.customCatType;
    document.querySelectorAll('.cat-tab').forEach(t => t.classList.toggle('active', t.dataset.type === type));
    const list  = document.getElementById('customCatList');
    if (!list) return;
    const items = DB.getCustomCategories()[type] || [];
    if (items.length === 0) {
      list.innerHTML = '<div class="custom-cat-empty">No custom categories yet</div>';
      return;
    }
    list.innerHTML = items.map(c =>
      `<div class="custom-cat-item">` +
        `<span class="custom-cat-swatch" style="background:${c.color}"></span>` +
        `<span class="custom-cat-name">${c.name}</span>` +
        `<button class="custom-cat-delete" data-type="${type}" data-name="${c.name}" title="Delete">×</button>` +
      `</div>`
    ).join('');
  }

  function handleAddCustomCategory() {
    const nameEl  = document.getElementById('newCatName');
    const colorEl = document.getElementById('newCatColor');
    const type    = state.customCatType;
    const name    = nameEl.value.trim();
    const color   = colorEl.value.toLowerCase();

    if (!name) { toast('Enter a category name', 'error'); return; }

    const existing = type === 'income' ? DB.getAllIncomeCategories() : DB.getAllExpenseCategories();
    if (existing.map(c => c.toLowerCase()).includes(name.toLowerCase())) {
      toast('Category name already exists', 'error'); return;
    }

    const usedColors = Object.values(Charts.CAT_COLORS).map(c => c.toLowerCase());
    if (usedColors.includes(color)) { toast('This color is already used — pick a different one', 'error'); return; }

    DB.addCustomCategory(type, name, color);
    Charts.registerColor(name, color);
    nameEl.value = '';
    renderCustomCatList();
    toast(`"${name}" added to ${type} categories`);
  }

  function saveSettings(e) {
    e.preventDefault();
    const s = { currency: document.getElementById('settingsCurrency').value, dateFormat: document.getElementById('settingsDateFormat').value };
    DB.saveSettings(s);
    state.settings = s;
    Charts.setCurrency(s.currency);
    window.dispatchEvent(new CustomEvent('currencyChanged'));
    ['dashboard', 'income', 'expenses', 'cashflow', 'simulator'].forEach(sec => {
      if (document.getElementById(sec)?.classList.contains('active')) renderSection(sec);
    });
    toast('Settings saved');
  }

  function exportData() {
    const blob = new Blob([JSON.stringify({ transactions: DB.getTransactions(), settings: DB.getSettings() }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `finera-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Data exported');
  }

  function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.transactions) DB.saveTransactions(data.transactions);
        if (data.settings)     DB.saveSettings(data.settings);
        state.transactions = DB.getTransactions();
        state.settings     = DB.getSettings();
        toast('Data imported successfully');
        navigate('#' + state.section);
      } catch { toast('Invalid file format', 'error'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function clearAllData() {
    if (!confirm('Delete ALL data permanently? Demo data will be reloaded.')) return;
    DB.clearAll();
    DB.seedDemoData();
    state.transactions = DB.getTransactions();
    state.settings     = DB.getSettings();
    toast('Data cleared, demo data loaded');
    navigate('#dashboard');
  }

  // ─── Modal ───────────────────────────────────────────────────────────────────

  function openModal(type, id) {
    state.editingId = id || null;
    const tx   = id ? state.transactions.find(t => t.id === id) : null;
    const cats = type === 'income' ? DB.getAllIncomeCategories() : DB.getAllExpenseCategories();
    const today = new Date().toISOString().slice(0, 10);

    document.getElementById('modalTitle').textContent    = (id ? 'Edit ' : 'Add ') + (type === 'income' ? 'Income' : 'Expense');
    document.getElementById('modalType').value           = type;
    document.getElementById('modalDate').value           = tx ? tx.date : today;
    const amountEl = document.getElementById('modalAmount');
    amountEl.value = tx ? fmtInputNum(tx.amount) : '';
    attachNumFmt(amountEl);
    document.getElementById('modalNote').value           = tx ? (tx.note || '') : '';
    document.getElementById('modalCategory').innerHTML   = cats.map(c => `<option value="${c}" ${tx?.category === c ? 'selected' : ''}>${c}</option>`).join('');
    document.getElementById('modal').classList.add('open');
    setTimeout(() => amountEl.focus(), 50);
  }

  function closeModal() {
    document.getElementById('modal').classList.remove('open');
    state.editingId = null;
  }

  function saveTransaction(e) {
    e.preventDefault();
    const type     = document.getElementById('modalType').value;
    const date     = document.getElementById('modalDate').value;
    const category = document.getElementById('modalCategory').value;
    const amount   = parseInputNum(document.getElementById('modalAmount').value);
    const note     = document.getElementById('modalNote').value.trim();

    if (!date || !category || !amount || amount <= 0) { toast('Please fill all required fields', 'error'); return; }

    if (state.editingId) {
      DB.updateTransaction(state.editingId, { type, date, category, amount, note });
      toast('Transaction updated');
    } else {
      DB.addTransaction({ type, date, category, amount, note });
      toast('Transaction added');
    }
    closeModal();
    state.transactions = DB.getTransactions();
    cloudSync();
    renderSection(state.section);
  }

  function confirmDelete(id) {
    if (!confirm('Delete this transaction?')) return;
    DB.deleteTransaction(id);
    state.transactions = DB.getTransactions();
    cloudSync();
    toast('Transaction deleted');
    renderSection(state.section);
  }

  // ─── Init ────────────────────────────────────────────────────────────────────

  function downloadExcelTemplate(type) {
    if (typeof XLSX === 'undefined') { toast('SheetJS not loaded'); return; }
    const cats = type === 'income' ? DB.getAllIncomeCategories() : DB.getAllExpenseCategories();
    const wb = XLSX.utils.book_new();

    const ws = XLSX.utils.aoa_to_sheet([
      ['Date', 'Category', 'Amount', 'Note'],
      ['2026-05-01', cats[0], 15000000, 'Example — delete before importing'],
      ['2026-05-15', cats[1] || cats[0], 5000000, 'Example — delete before importing'],
    ]);
    ws['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 38 }];
    XLSX.utils.book_append_sheet(wb, ws, type === 'income' ? 'Income Data' : 'Expense Data');

    const wsC = XLSX.utils.aoa_to_sheet([['Valid Categories'], ...cats.map(c => [c])]);
    wsC['!cols'] = [{ wch: 22 }];
    XLSX.utils.book_append_sheet(wb, wsC, 'Categories');

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob  = new Blob([wbout], { type: 'application/octet-stream' });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement('a');
    a.href = url; a.download = `finera_${type}_template.xlsx`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  function triggerExcelImport(type) {
    document.getElementById(type === 'income' ? 'importIncomeFile' : 'importExpenseFile')?.click();
  }

  function handleExcelImport(e, type) {
    const file = e.target.files[0];
    if (!file) return;
    const validCats = new Set(type === 'income' ? DB.getAllIncomeCategories() : DB.getAllExpenseCategories());
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
        let imported = 0, skipped = 0;

        for (let i = 1; i < rows.length; i++) {
          const [dateRaw, category, amountRaw, note] = rows[i];
          if (!dateRaw && !category && !amountRaw) continue;

          let dateStr = String(dateRaw || '').trim();
          if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
            const [d, m, y] = dateStr.split('/');
            dateStr = `${y}-${m}-${d}`;
          }
          if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/) || isNaN(new Date(dateStr).getTime())) { skipped++; continue; }

          const cat = String(category || '').trim();
          if (!cat || !validCats.has(cat)) { skipped++; continue; }

          const amount = parseFloat(String(amountRaw || '').replace(/[,\s]/g, ''));
          if (isNaN(amount) || amount <= 0) { skipped++; continue; }

          DB.addTransaction({ type, date: dateStr, category: cat, amount: Math.round(amount), note: String(note || '').trim() });
          imported++;
        }

        state.transactions = DB.getTransactions();
        cloudSync();
        if (type === 'income') renderIncome(); else renderExpenses();
        toast(`Imported ${imported} record${imported !== 1 ? 's' : ''}${skipped ? ` · ${skipped} skipped` : ''}`);
      } catch {
        toast('Failed to read file — please use the Finera Excel template.');
      }
      e.target.value = '';
    };
    reader.readAsBinaryString(file);
  }

  async function manualSyncToCloud() {
    const btn = document.getElementById('syncToSheetBtn');
    if (btn) { btn.disabled = true; btn.textContent = '☁ Syncing…'; }
    try {
      await saveToSheet(DB.getTransactions());
      toast('Synced to cloud successfully');
    } catch {
      toast('Cloud sync failed — check your connection', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '☁ Sync to Cloud'; }
    }
  }

  async function manualLoadFromCloud() {
    if (typeof XLSX === 'undefined') { toast('SheetJS not loaded', 'error'); return; }
    const btn = document.getElementById('loadFromSheetBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⬇ Downloading…'; }
    try {
      const data = await loadFromSheet();
      if (!Array.isArray(data) || data.length === 0) { toast('No data found in cloud', 'error'); return; }

      const MN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const sorted   = [...data].sort((a, b) => a.date.localeCompare(b.date));
      const incomes  = sorted.filter(t => t.type === 'income');
      const expenses = sorted.filter(t => t.type === 'expense');

      const toRows = txs => [
        ['Year', 'Month', 'Date', 'Category', 'Amount', 'Note'],
        ...txs.map(t => {
          const [y, m] = t.date.split('-');
          return [+y, MN[+m - 1], t.date, t.category, t.amount, t.note || ''];
        }),
      ];

      const wb   = XLSX.utils.book_new();
      const wsIn = XLSX.utils.aoa_to_sheet(toRows(incomes));
      const wsEx = XLSX.utils.aoa_to_sheet(toRows(expenses));
      wsIn['!cols'] = wsEx['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 38 }];
      XLSX.utils.book_append_sheet(wb, wsIn, 'Income');
      XLSX.utils.book_append_sheet(wb, wsEx, 'Expense');

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob  = new Blob([wbout], { type: 'application/octet-stream' });
      const url   = URL.createObjectURL(blob);
      const a     = document.createElement('a');
      a.href = url;
      a.download = `finera_backup_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
      toast(`Downloaded ${data.length} records (${incomes.length} income · ${expenses.length} expense)`);
    } catch {
      toast('Failed to download — check your connection', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '⬇ Load from Cloud'; }
    }
  }

  function initMonthPicker(prefix, onChange) {
    const filterKey = prefix === 'income' ? 'incomeFilter' : 'expenseFilter';
    const btn     = document.getElementById(`${prefix}MonthBtn`);
    const pop     = document.getElementById(`${prefix}MonthPop`);
    const yearVal = document.getElementById(`${prefix}YearVal`);
    const wrap    = document.getElementById(`${prefix}GridWrap`);
    const allBtn  = document.getElementById(`${prefix}MonthAll`);
    const prevBtn = document.getElementById(`${prefix}YearPrev`);
    const nextBtn = document.getElementById(`${prefix}YearNext`);
    if (!btn || !pop) return;

    let pickerYear  = new Date().getFullYear();
    let view        = 'month'; // 'month' | 'day'
    let activeMonth = null;    // 1-12

    const filterLabel = val => {
      if (!val)           return 'All ▾';
      if (val.length ===  4) return val + ' ▾';
      if (val.length ===  7) return monthLabel(val) + ' ▾';
      const [y, m, d] = val.split('-');
      return `${+d} ${MONTHS[+m - 1].slice(0,3)} ${y} ▾`;
    };

    const showMonthView = () => {
      view = 'month';
      yearVal.textContent = pickerYear;
      const selected = state[filterKey].month;
      wrap.innerHTML = MONTHS.map((name, i) => {
        const val = `${pickerYear}-${String(i + 1).padStart(2, '0')}`;
        const active = (val === selected || selected?.startsWith(val)) ? 'active' : '';
        return `<button class="mp-month-btn ${active}" data-val="${val}" data-m="${i+1}" type="button">${name.slice(0,3)}</button>`;
      }).join('');
      wrap.querySelectorAll('.mp-month-btn').forEach(b => b.addEventListener('click', e => {
        e.stopPropagation();
        activeMonth = +b.dataset.m;
        showDayView();
      }));
    };

    const showDayView = () => {
      view = 'day';
      yearVal.textContent = pickerYear;
      const mo    = String(activeMonth).padStart(2, '0');
      const label = `${MONTHS[activeMonth - 1]} ${pickerYear}`;
      const days  = new Date(pickerYear, activeMonth, 0).getDate();
      const selected = state[filterKey].month;
      let html = `<div class="mp-day-header">
        <button class="mp-back-btn" id="${prefix}BackBtn" type="button">‹ ${label}</button>
      </div><div class="mp-day-grid">`;
      for (let d = 1; d <= days; d++) {
        const val    = `${pickerYear}-${mo}-${String(d).padStart(2, '0')}`;
        const active = val === selected ? 'active' : '';
        html += `<button class="mp-day-btn ${active}" data-val="${val}" type="button">${d}</button>`;
      }
      html += `</div><button class="mp-month-sel-btn" data-val="${pickerYear}-${mo}" type="button">Select whole month</button>`;
      wrap.innerHTML = html;
      wrap.querySelector(`#${prefix}BackBtn`).addEventListener('click', e => { e.stopPropagation(); showMonthView(); });
      wrap.querySelectorAll('.mp-day-btn').forEach(b => b.addEventListener('click', () => {
        state[filterKey].month = b.dataset.val;
        btn.textContent = filterLabel(b.dataset.val);
        pop.style.display = 'none';
        onChange();
      }));
      wrap.querySelector('.mp-month-sel-btn').addEventListener('click', e => {
        const val = e.target.dataset.val;
        state[filterKey].month = val;
        btn.textContent = filterLabel(val);
        pop.style.display = 'none';
        onChange();
      });
    };

    btn.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = pop.style.display !== 'none';
      document.querySelectorAll('.month-picker-pop').forEach(p => p.style.display = 'none');
      if (!isOpen) { showMonthView(); pop.style.display = 'block'; }
    });
    yearVal.addEventListener('click', () => {
      state[filterKey].month = String(pickerYear);
      btn.textContent = filterLabel(String(pickerYear));
      pop.style.display = 'none';
      onChange();
    });
    prevBtn.addEventListener('click', () => { pickerYear--; view === 'day' ? showDayView() : showMonthView(); });
    nextBtn.addEventListener('click', () => { pickerYear++; view === 'day' ? showDayView() : showMonthView(); });
    allBtn.addEventListener('click', () => {
      state[filterKey].month = '';
      btn.textContent = 'All ▾';
      pop.style.display = 'none';
      onChange();
    });
    document.addEventListener('click', e => {
      if (!document.getElementById(`${prefix}PickerWrap`)?.contains(e.target))
        pop.style.display = 'none';
    });
    btn.textContent = filterLabel(state[filterKey].month);
  }

  function initSimplePicker(prefix, filterKey, onRefresh) {
    const btn     = document.getElementById(`${prefix}MonthBtn`);
    const pop     = document.getElementById(`${prefix}MonthPop`);
    const yearVal = document.getElementById(`${prefix}YearVal`);
    const wrap    = document.getElementById(`${prefix}GridWrap`);
    const allBtn  = document.getElementById(`${prefix}MonthAll`);
    const prevBtn = document.getElementById(`${prefix}YearPrev`);
    const nextBtn = document.getElementById(`${prefix}YearNext`);
    if (!btn || !pop) return;

    let pickerYear = new Date().getFullYear();

    const filterLabel = val => {
      if (!val) return 'All Months ▾';
      if (val.length === 4) return val + ' ▾';
      return monthLabel(val) + ' ▾';
    };

    const showMonthView = () => {
      yearVal.textContent = pickerYear;
      const selected = state[filterKey].month;
      wrap.innerHTML = MONTHS.map((name, i) => {
        const val    = `${pickerYear}-${String(i + 1).padStart(2, '0')}`;
        const active = val === selected ? 'active' : '';
        return `<button class="mp-month-btn ${active}" data-val="${val}" type="button">${name.slice(0, 3)}</button>`;
      }).join('');
      wrap.querySelectorAll('.mp-month-btn').forEach(b => b.addEventListener('click', e => {
        e.stopPropagation();
        state[filterKey].month = b.dataset.val;
        btn.textContent = filterLabel(b.dataset.val);
        pop.style.display = 'none';
        onRefresh();
      }));
    };

    btn.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = pop.style.display !== 'none';
      document.querySelectorAll('.month-picker-pop').forEach(p => p.style.display = 'none');
      if (!isOpen) { showMonthView(); pop.style.display = 'block'; }
    });
    allBtn.addEventListener('click', e => {
      e.stopPropagation();
      state[filterKey].month = String(pickerYear);
      btn.textContent = filterLabel(String(pickerYear));
      pop.style.display = 'none';
      onRefresh();
    });
    prevBtn.addEventListener('click', e => { e.stopPropagation(); pickerYear--; showMonthView(); });
    nextBtn.addEventListener('click', e => { e.stopPropagation(); pickerYear++; showMonthView(); });
    document.addEventListener('click', e => {
      if (!document.getElementById(`${prefix}PickerWrap`)?.contains(e.target))
        pop.style.display = 'none';
    });
    btn.textContent = filterLabel(state[filterKey].month);
  }

  function loadCustomColors() {
    const custom = DB.getCustomCategories();
    [...(custom.income || []), ...(custom.expense || [])].forEach(c => Charts.registerColor(c.name, c.color));
  }

  // ─── Google Auth ─────────────────────────────────────────────────────────────

  function parseJwt(token) {
    try {
      const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(atob(base64).split('').map(c =>
        '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
      ).join(''));
      return JSON.parse(json);
    } catch { return null; }
  }

  function renderAuthUI(user) {
    const container = document.getElementById('topbarAuth');
    if (!container) return;
    container.innerHTML = '';
    if (user) {
      const avatar = document.createElement('img');
      avatar.className = 'auth-avatar';
      avatar.src = user.picture || '';
      avatar.alt = user.name || '';

      const name = document.createElement('span');
      name.className = 'auth-name';
      name.textContent = user.name?.split(' ').pop() || user.email;

      const btn = document.createElement('button');
      btn.className = 'auth-signout';
      btn.textContent = 'Sign Out';
      btn.addEventListener('click', signOut);

      container.append(avatar, name, btn);
    } else {
      const btnWrap = document.createElement('div');
      btnWrap.id = 'googleSignInBtn';
      container.appendChild(btnWrap);
      if (window.google?.accounts?.id) {
        google.accounts.id.renderButton(btnWrap, {
          theme: 'outline', size: 'medium', text: 'signin_with', shape: 'pill',
        });
      }
    }
  }

  function handleGoogleCredential(response) {
    const payload = parseJwt(response.credential);
    if (!payload) return;
    const user = { id: payload.sub, name: payload.name, email: payload.email, picture: payload.picture };
    DB.setUser(user);
    DB.setCurrentUser(user.id);
    DB.seedDemoData();
    renderAuthUI(user);
    reloadUserData();
  }

  function signOut() {
    DB.clearUser();
    DB.setCurrentUser(null);
    if (window.google?.accounts?.id) google.accounts.id.disableAutoSelect();
    renderAuthUI(null);
    reloadUserData();
  }

  function initGoogleAuth() {
    if (!window.google?.accounts?.id) { setTimeout(initGoogleAuth, 150); return; }
    google.accounts.id.initialize({
      client_id: '969054097667-l9o1e34r377i6sbatqm42cs97qekft3u.apps.googleusercontent.com',
      callback: handleGoogleCredential,
      auto_select: false,
    });
    renderAuthUI(DB.getUser());
  }

  function reloadUserData() {
    state.transactions = DB.getTransactions();
    state.settings     = DB.getSettings();
    Charts.setCurrency(state.settings.currency || '₫');
    loadCustomColors();
    renderSection(state.section);
  }

  function init() {
    const savedUser = DB.getUser();
    if (savedUser) DB.setCurrentUser(savedUser.id);

    DB.seedDemoData();
    state.transactions = DB.getTransactions();
    state.settings     = DB.getSettings();
    Charts.setCurrency(state.settings.currency || '₫');
    loadCustomColors();

    const dateEl = document.getElementById('topbarDate');
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });

    document.querySelectorAll('.nav-link').forEach(item =>
      item.addEventListener('click', () => { window.location.hash = item.dataset.section; })
    );

    document.getElementById('menuToggle')?.addEventListener('click', () =>
      document.getElementById('mainNav').classList.toggle('open')
    );

    window.addEventListener('hashchange', () => navigate(window.location.hash));
    window.addEventListener('resize', alignRateBoxes);

    document.getElementById('txForm').addEventListener('submit', saveTransaction);

    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

    initMonthPicker('income',  () => { renderIncome(); });
    initMonthPicker('expense', () => { renderExpenses(); });
    initSimplePicker('cf',    'cfFilter',    renderCashFlow);
    initSimplePicker('sim',   'simFilter',   renderSimulator);
    initSimplePicker('alloc', 'allocFilter', () => {
      const el = document.getElementById('allocInputs');
      if (el) delete el.dataset.init;
      renderAllocation();
    });
    document.getElementById('incomeCatFilter')?.addEventListener('change',  e => { state.incomeFilter.category  = e.target.value; renderIncome(); });
    document.getElementById('expenseCatFilter')?.addEventListener('change', e => { state.expenseFilter.category = e.target.value; renderExpenses(); });

    document.getElementById('simulator')?.addEventListener('input', renderSimulator);

    document.getElementById('simSaveBtn')?.addEventListener('click', saveSimSnapshot);
    document.getElementById('allocSaveBtn')?.addEventListener('click', saveAllocSnapshot);

    document.addEventListener('click', e => {
      const loadBtn = e.target.closest('.snap-load');
      const delBtn  = e.target.closest('.snap-del');
      if (loadBtn) {
        const { tab, key } = loadBtn.dataset;
        if (tab === 'sim')   { applySimSnapshot(DB.getSimSnapshot(key));   toast(`Loaded ${monthLabel(key)}`); }
        if (tab === 'alloc') { applyAllocSnapshot(DB.getAllocSnapshot(key)); toast(`Loaded ${monthLabel(key)}`); }
      }
      if (delBtn) {
        const { tab, key } = delBtn.dataset;
        if (!confirm(`Delete snapshot for ${monthLabel(key)}?`)) return;
        if (tab === 'sim')   { DB.deleteSimSnapshot(key);   renderSimSnapHistory(); }
        if (tab === 'alloc') { DB.deleteAllocSnapshot(key); renderAllocSnapHistory(); }
      }
    });

    document.getElementById('settingsForm')?.addEventListener('submit', saveSettings);
    document.getElementById('exportBtn')?.addEventListener('click', exportData);
    document.getElementById('importFile')?.addEventListener('change', importData);
    document.getElementById('clearBtn')?.addEventListener('click', clearAllData);
    document.getElementById('syncToSheetBtn')?.addEventListener('click', manualSyncToCloud);
    document.getElementById('loadFromSheetBtn')?.addEventListener('click', manualLoadFromCloud);

    initCurrencySearch();
    document.getElementById('importIncomeFile')?.addEventListener('change', e => handleExcelImport(e, 'income'));
    document.getElementById('importExpenseFile')?.addEventListener('change', e => handleExcelImport(e, 'expense'));
    document.getElementById('addCatBtn')?.addEventListener('click', handleAddCustomCategory);
    document.getElementById('catTypeTabs')?.addEventListener('click', e => {
      const tab = e.target.closest('.cat-tab');
      if (!tab) return;
      state.customCatType = tab.dataset.type;
      renderCustomCatList();
    });
    document.getElementById('customCatList')?.addEventListener('click', e => {
      const btn = e.target.closest('.custom-cat-delete');
      if (!btn) return;
      const { type, name } = btn.dataset;
      if (!confirm(`Delete category "${name}"?`)) return;
      DB.deleteCustomCategory(type, name);
      Charts.unregisterColor(name);
      renderCustomCatList();
      toast(`"${name}" removed`);
    });

    // Settings Tab Switching
    document.addEventListener('click', e => {
      const btn = e.target.closest('.settings-tab-btn');
      if (!btn) return;
      document.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const tab = btn.dataset.tab;
      document.querySelectorAll('.settings-content .settings-card').forEach(card => {
        card.classList.remove('active');
      });
      
      if (tab === 'preferences') {
        document.getElementById('preferences-pane')?.classList.add('active');
      } else if (tab === 'data-mgmt') {
        document.getElementById('data-mgmt-pane')?.classList.add('active');
      } else if (tab === 'custom-cats') {
        document.getElementById('custom-cats-pane')?.classList.add('active');
      }
    });

    window.addEventListener('currencyChanged', () => {
      if (state.section === 'simulator') renderSimulator();
      if (state.section === 'allocation') renderAllocation();
    });

    window.addEventListener('storage', e => {
      if (e.key === 'finera_settings') {
        state.settings = DB.getSettings();
        Charts.setCurrency(state.settings.currency || '₫');
        renderSection(state.section);
      }
    });

    const featObs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('fi-visible'); featObs.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('.feat-card, .feat-headline').forEach(el => featObs.observe(el));

    initGoogleAuth();

    navigate(window.location.hash || '#dashboard');

    // Background: load from Google Sheets; refresh if cloud has more recent data
    loadFromSheet().then(data => {
      if (Array.isArray(data) && data.length > 0) {
        DB.saveTransactions(data);
        state.transactions = DB.getTransactions();
        renderSection(state.section);
      }
    }).catch(() => {});
  }

  return { init, navigate, openModal, closeModal, confirmDelete, downloadExcelTemplate, triggerExcelImport, signOut };
})();

const ScrollAnim = (() => {
  const DELAYS  = ['sa-d1','sa-d2','sa-d3','sa-d4','sa-d5'];
  const prepped = new WeakSet();

  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      e.target.classList.toggle('visible', e.isIntersecting);
    });
  }, { threshold: 0.08 });

  function prep(el, delayIdx) {
    if (prepped.has(el)) return;
    prepped.add(el);
    el.classList.add('sa');
    if (delayIdx !== undefined) el.classList.add(DELAYS[Math.min(delayIdx, 4)]);
  }

  function scanSection(section) {
    // Section header (all app sections except dashboard hero)
    section.querySelectorAll('.section-header').forEach(el => prep(el));

    // Dashboard landing elements
    section.querySelectorAll('.hero-content').forEach(el => prep(el));
    section.querySelectorAll('.feature-item').forEach((el, i) => prep(el, i));
    section.querySelectorAll('.premium-visual').forEach(el => prep(el, 0));
    section.querySelectorAll('.premium-text').forEach(el   => prep(el, 1));

    // Chart cards — stagger if multiple siblings share the same parent
    section.querySelectorAll('.chart-card').forEach(card => {
      const sibs = [...card.parentElement.children].filter(c => c.classList.contains('chart-card'));
      prep(card, sibs.length > 1 ? sibs.indexOf(card) : undefined);
    });

    // Table cards
    section.querySelectorAll('.table-card').forEach(el => prep(el));

    // Settings cards stagger
    section.querySelectorAll('.settings-card').forEach((el, i) => prep(el, i));

    // Simulator panels stagger
    section.querySelectorAll('.sim-panel, .sim-results-wrap').forEach((el, i) => prep(el, i));
  }

  // Called on every section switch — resets + re-triggers all .sa in the section
  function enter(section) {
    if (!section) return;
    scanSection(section);
    section.querySelectorAll('.sa').forEach(el => {
      el.classList.remove('visible');
      io.observe(el);
    });
  }

  // Called after dynamically rendered stat-card HTML is set
  function staggerCards(container) {
    if (!container) return;
    [...container.children].forEach((el, i) => {
      DELAYS.forEach(d => el.classList.remove(d));
      el.classList.remove('visible');
      el.classList.add('sa');
      if (i < 5) el.classList.add(DELAYS[i]);
      io.observe(el);
    });
  }

  return { enter, staggerCards };
})();

document.addEventListener('DOMContentLoaded', App.init);

// ─── VN100 Live Stock Module ──────────────────────────────────────────────────

const VN100 = (() => {
  const TICKERS = ['VNM', 'VCB', 'TCB', 'HPG', 'VHM', 'MSN', 'VIC', 'MWG', 'FPT', 'VPB'];
  const spreg   = new Map();
  let   timer   = null;
  let   cache   = null;

  // Seed prices for mock/demo fallback (approximate end-2024 values in VND)
  const SEEDS = {
    VNM: { price: 64800, change:  0.31, vol: 1230000 },
    VCB: { price: 87200, change: -0.23, vol: 2540000 },
    TCB: { price: 24600, change:  1.24, vol: 5870000 },
    HPG: { price: 27400, change: -0.51, vol: 7210000 },
    VHM: { price: 38900, change:  0.77, vol: 3120000 },
    MSN: { price: 52300, change: -0.19, vol: 1830000 },
    VIC: { price: 41200, change:  0.43, vol: 2240000 },
    MWG: { price: 69500, change: -0.83, vol: 4160000 },
    FPT: { price:134500, change:  1.12, vol: 3520000 },
    VPB: { price: 18400, change: -0.47, vol: 8910000 },
  };

  function mockBars(base) {
    const out = [base];
    for (let i = 1; i < 15; i++)
      out.push(Math.round(out[i - 1] * (1 + (Math.random() - 0.48) * 0.014)));
    return out;
  }

  function mockStocks() {
    return TICKERS.map(t => ({ ...SEEDS[t], ticker: t, bars: mockBars(SEEDS[t].price), demo: true }));
  }

  async function yahooFetch(ticker) {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch(`/api/price?ticker=${ticker}`, { signal: ctrl.signal });
      clearTimeout(tid);
      if (r.ok) {
        const j = await r.json();
        if (j?.price) return j;
      }
    } catch {}
    return null;
  }

  function parseStock(ticker, j) {
    if (!j?.price) return null;
    const price     = j.price;
    const prevClose = j.prevClose ?? price;
    const change    = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
    return { ticker, price, change, vol: 0, bars: mockBars(price), demo: false };
  }

  async function fetchAll() {
    const settled = await Promise.allSettled(
      TICKERS.map(async t => { const j = await yahooFetch(t); return parseStock(t, j); })
    );
    const stocks = settled.map((r, i) =>
      r.status === 'fulfilled' && r.value ? r.value : null
    );
    if (stocks.every(s => !s)) return mockStocks();
    return stocks.map((s, i) => s || { ...SEEDS[TICKERS[i]], ticker: TICKERS[i], bars: mockBars(SEEDS[TICKERS[i]].price), demo: true });
  }

  function fmtVol(v) {
    v = Number(v) || 0;
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K';
    return v ? v.toString() : '—';
  }

  function fmtPrice(p) {
    p = Number(p) || 0;
    if (!p) return '—';
    return new Intl.NumberFormat('vi-VN').format(Math.round(p));
  }

  function drawSparkline(id, data, isUp) {
    if (spreg.has(id)) { spreg.get(id).destroy(); spreg.delete(id); }
    const el = document.getElementById(id);
    if (!el || data.length < 2) return;
    spreg.set(id, new Chart(el.getContext('2d'), {
      type: 'line',
      data: {
        labels: data.map((_, i) => i),
        datasets: [{ data,
          borderColor:     '#ff6b35',
          backgroundColor: 'rgba(255,107,53,0.18)',
          borderWidth: 1.5, fill: true, pointRadius: 0, tension: 0.4,
        }],
      },
      options: {
        responsive: false, animation: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
      },
    }));
  }

  function renderRows(stocks) {
    const tbody = document.getElementById('vn100Body');
    if (!tbody) return;

    tbody.innerHTML = stocks.map(s => {
      const isUp = s.change >= 0;
      const cls  = isUp ? 'vn100-up' : 'vn100-dn';
      const arr  = isUp ? '▲' : '▼';
      return `<tr>
        <td class="vn100-sym">${s.ticker}</td>
        <td class="vn100-spark-td"><canvas id="sp-${s.ticker}" width="80" height="28"></canvas></td>
        <td class="vn100-price">${fmtPrice(s.price)}</td>
        <td class="${cls}">${arr} ${Math.abs(s.change).toFixed(2)}%</td>
        <td class="vn100-vol">${fmtVol(s.vol)}</td>
      </tr>`;
    }).join('');

    stocks.forEach(s => drawSparkline(`sp-${s.ticker}`, s.bars, s.change >= 0));

    const isDemo  = stocks.some(s => s.demo);
    const timeEl  = document.getElementById('vn100Time');
    const liveEl  = document.querySelector('.vn100-live');
    if (timeEl) timeEl.textContent = isDemo
      ? 'Dữ liệu demo — API thị trường không khả dụng'
      : `Cập nhật lúc ${new Date().toLocaleTimeString('vi-VN')}`;
    if (liveEl) {
      liveEl.textContent = isDemo ? '● DEMO' : '● LIVE';
      liveEl.style.color  = isDemo ? '#f59e0b' : '';
    }
  }

  async function load() {
    const el = document.getElementById('vn100Time');
    if (el && !cache) el.textContent = 'Đang tải dữ liệu thị trường…';
    cache = await fetchAll();
    renderRows(cache);
  }

  function start() {
    clearInterval(timer);
    load().catch(console.warn);
    timer = setInterval(() => load().catch(console.warn), 30_000);
  }

  function stop() {
    clearInterval(timer);
    timer = null;
  }

  return { start, stop };
})();
