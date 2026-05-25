const Charts = (() => {
  const registry = new Map();
  let curSym = '₫';
  let fmtCur = v => new Intl.NumberFormat('vi-VN').format(Math.round(v)) + ' ₫';
  let fmtCurShort = v => {
    v = Number(v) || 0;
    if (v >= 1e12) return (v / 1e12).toFixed(1) + ' T';
    if (v >= 1e9)  return (v / 1e9).toFixed(1)  + ' B';
    if (v >= 1e6)  return (v / 1e6).toFixed(0)  + ' M';
    return new Intl.NumberFormat('vi-VN').format(Math.round(v));
  };

  // Color theme adapted for premium dark forest green mode
  const C = {
    orange: '#ff6b35', // vibrant coral
    blue: '#16A34A',   // Primary Green
    teal: '#22C55E',   // Secondary Green
    red: '#ef4444',    // crimson red
    purple: '#86EFAC', // Accent Mint
    yellow: '#f59e0b', // warm gold
    muted: '#9CA3AF',  // light grey for dark background
    grid: 'rgba(134, 239, 172, 0.06)', // subtle pastel mint grid line
    tooltip: '#102019', // Card Background
    tooltipBorder: 'rgba(134, 239, 172, 0.25)',
  };

  const CAT_COLORS = {
    // Income
    Salary: '#16A34A',      // Primary Green
    'Pocket Money': '#f59e0b', // Warm Gold
    Bonus: '#22C55E',       // Secondary Green
    'Side Job': '#86EFAC',    // Accent Mint
    Investment: '#34D399',  // Mint-teal
    Extra: '#a7f3d0',       // Light Mint
    // Expense
    Food: '#f97316',        // Orange
    Housing: '#ef4444',     // Crimson
    Transport: '#0ea5e9',   // Ocean Blue
    Health: '#a855f7',      // Violet
    Entertainment: '#f43f5e', // Rose
    Savings: '#22C55E',     // Secondary Green
    Clothes: '#fb923c',     // Light Orange
    Cosmetic: '#d946ef',    // Magenta
    Education: '#eab308',   // Yellow
    'Contact Fee': '#9ca3af', // Slate
  };

  function setCurrency(s) {
    curSym = s || '₫';
    if (curSym === '₫') {
      fmtCur = v => new Intl.NumberFormat('vi-VN').format(Math.round(v)) + ' ₫';
      fmtCurShort = v => {
        v = Number(v) || 0;
        if (v >= 1e12) return (v / 1e12).toFixed(1) + ' T';
        if (v >= 1e9)  return (v / 1e9).toFixed(1)  + ' B';
        if (v >= 1e6)  return (v / 1e6).toFixed(0)  + ' M';
        return new Intl.NumberFormat('vi-VN').format(Math.round(v));
      };
    } else {
      fmtCur = v => curSym + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v);
      fmtCurShort = v => {
        v = Number(v) || 0;
        if (v >= 1e9) return curSym + (v / 1e9).toFixed(1) + 'B';
        if (v >= 1e6) return curSym + (v / 1e6).toFixed(0) + 'M';
        if (v >= 1e3) return curSym + (v / 1e3).toFixed(0) + 'K';
        return curSym + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v);
      };
    }
  }

  function destroy(id) {
    if (registry.has(id)) { registry.get(id).destroy(); registry.delete(id); }
  }

  function grad(ctx, c1, c2) {
    const g = ctx.createLinearGradient(0, 0, 0, 300);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    return g;
  }

  function baseOpts() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 700, easing: 'easeInOutQuart' },
      layout: { padding: { left: 10 } },
      plugins: {
        legend: { labels: { color: '#D1D5DB', font: { family: 'Inter', size: 12, weight: '500' }, boxWidth: 12, padding: 16 } },
        tooltip: {
          backgroundColor: C.tooltip,
          borderColor: C.tooltipBorder,
          borderWidth: 1,
          titleColor: '#F3F4F6',
          bodyColor: '#D1D5DB',
          padding: 12,
          cornerRadius: 10,
          boxPadding: 6,
          usePointStyle: true,
          shadowColor: 'rgba(0, 0, 0, 0.3)',
          shadowBlur: 10,
          callbacks: { label: ctx => ` ${fmtCur(ctx.parsed.y ?? ctx.parsed)}` },
        },
      },
      scales: {
        x: { grid: { color: C.grid, drawBorder: false }, ticks: { color: C.muted, font: { family: 'Inter', size: 11 } } },
        y: { grid: { color: C.grid, drawBorder: false }, ticks: { color: C.muted, font: { family: 'Inter', size: 11 }, maxTicksLimit: 6, callback: v => fmtCur(v) } },
      },
    };
  }

  function make(id, config) {
    destroy(id);
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const chart = new Chart(canvas.getContext('2d'), config);
    registry.set(id, chart);
    return chart;
  }

  function dashboardOverview(id, labels, incomeData, expenseData) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    make(id, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Income',   data: incomeData,  borderColor: '#10b981', backgroundColor: grad(ctx, 'rgba(16,185,129,0.15)', 'rgba(16,185,129,0)'), fill: true, tension: 0.4, pointBackgroundColor: '#10b981', pointBorderColor: '#fff', pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 7, borderWidth: 2.5 },
          { label: 'Expenses', data: expenseData, borderColor: C.orange, backgroundColor: grad(ctx, 'rgba(255,107,53,0.15)', 'rgba(255,107,53,0)'), fill: true, tension: 0.4, pointBackgroundColor: C.orange, pointBorderColor: '#fff', pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 7, borderWidth: 2.5 },
        ],
      },
      options: baseOpts(),
    });
  }

  function monthlyBar(id, labels, data, color, label, bgColor) {
    make(id, {
      type: 'bar',
      data: { labels, datasets: [{ label, data, backgroundColor: bgColor || color + 'bb', borderColor: color, borderWidth: 1, borderRadius: 6, borderSkipped: false }] },
      options: baseOpts(),
    });
  }

  function categoryDonut(id, labels, data, colorMap) {
    const total = data.reduce((a, b) => a + b, 0);
    const renderData = total > 0 ? data : data.map(() => 1);
    const baseColors = labels.map(l => (colorMap && colorMap[l]) || CAT_COLORS[l] || C.muted);
    const colors = total > 0 ? baseColors : baseColors.map(() => 'rgba(255,255,255,0.05)');
    make(id, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: renderData, backgroundColor: colors, borderColor: '#102019', borderWidth: 2.5, hoverOffset: total > 0 ? 8 : 0 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 700, easing: 'easeInOutQuart' },
        cutout: '70%',
        plugins: {
          legend: { position: 'right', labels: { color: '#D1D5DB', font: { family: 'Inter', size: 12, weight: '500' }, boxWidth: 12, padding: 14 } },
          tooltip: {
            backgroundColor: C.tooltip, borderColor: C.tooltipBorder, borderWidth: 1,
            titleColor: '#F3F4F6', bodyColor: '#D1D5DB', padding: 12, cornerRadius: 10,
            callbacks: {
              label: ctx => {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct   = total > 0 ? Math.round(ctx.parsed / total * 100) : 0;
                return ` ${fmtCur(ctx.parsed)} (${pct}%)`;
              },
            },
          },
        },
      },
    });
  }

  function simStockDonut(id, labels, data, colors) {
    make(id, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: '#102019', borderWidth: 2.5, hoverOffset: 8 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 700, easing: 'easeInOutQuart' },
        cutout: '70%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: C.tooltip, borderColor: C.tooltipBorder, borderWidth: 1,
            titleColor: '#F3F4F6', bodyColor: '#D1D5DB', padding: 12, cornerRadius: 10,
            callbacks: {
              label: ctx => {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct   = total > 0 ? Math.round(ctx.parsed / total * 100) : 0;
                return ` ${fmtCur(ctx.parsed)} (${pct}%)`;
              },
            },
          },
        },
      },
    });
  }

  function cashFlowBar(id, labels, data) {
    make(id, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Net Cash Flow',
          data,
          backgroundColor: data.map(v => v >= 0 ? 'rgba(16,185,129,0.75)' : 'rgba(239,68,68,0.75)'),
          borderColor:     data.map(v => v >= 0 ? '#10b981' : '#ef4444'),
          borderWidth: 1, borderRadius: 6, borderSkipped: false,
        }],
      },
      options: baseOpts(),
    });
  }

  function cumulativeArea(id, labels, data) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    make(id, {
      type: 'line',
      data: { labels, datasets: [{ label: 'Cumulative Balance', data, borderColor: '#10b981', backgroundColor: grad(ctx, 'rgba(16,185,129,0.18)', 'rgba(16,185,129,0)'), fill: true, tension: 0.4, pointBackgroundColor: '#10b981', pointBorderColor: '#fff', pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 7, borderWidth: 2.5 }] },
      options: baseOpts(),
    });
  }

  function dailyStackedBar(id, dayLabels, days, dayMap, catColors) {
    const allCats = [...new Set(days.flatMap(d => (dayMap[d] || []).map(t => t.category)))].sort();
    const dayTotals = days.map(d => (dayMap[d] || []).reduce((s, t) => s + t.amount, 0));

    const datasets = allCats.map(cat => ({
      label: cat,
      data: days.map(d => (dayMap[d] || []).filter(t => t.category === cat).reduce((s, t) => s + t.amount, 0)),
      backgroundColor: (catColors[cat] || C.muted) + 'dd',
      borderColor: '#102019',
      borderWidth: 1.5, borderRadius: 4, stack: 'daily',
    }));

    const opts = baseOpts();
    opts.plugins.tooltip = {
      backgroundColor: C.tooltip, borderColor: C.tooltipBorder, borderWidth: 1,
      titleColor: '#F3F4F6', bodyColor: '#D1D5DB', padding: 12, cornerRadius: 10,
      filter: (item) => item.parsed.y !== 0,
      callbacks: {
        label: (ctx) => `  ${ctx.dataset.label}: ${fmtCur(ctx.parsed.y)}`,
        footer: (items) => `Total: ${fmtCur(dayTotals[items[0].dataIndex])}`,
      },
    };
    opts.scales.x.stacked = true;
    opts.scales.y.stacked = true;

    make(id, {
      type: 'bar',
      data: { labels: dayLabels, datasets },
      options: opts,
    });
  }

  function dailyBar(id, labels, data, color, perDayTxs) {
    const opts = baseOpts();
    opts.plugins.legend = { display: false };
    opts.plugins.tooltip = {
      backgroundColor: C.tooltip, borderColor: color, borderWidth: 1,
      titleColor: '#F3F4F6', bodyColor: '#D1D5DB', padding: 12, cornerRadius: 10,
      callbacks: {
        label: (ctx) => {
          const txs = perDayTxs[ctx.dataIndex] || [];
          return txs.map(t => `  ${t.category}${t.note ? ' · ' + t.note : ''}: ${fmtCur(t.amount)}`);
        },
        footer: (items) => `Total: ${fmtCur(data[items[0].dataIndex])}`,
      },
    };
    make(id, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: '', data,
          backgroundColor: color + 'bb', borderColor: color,
          borderWidth: 1, borderRadius: 6, borderSkipped: false,
        }],
      },
      options: opts,
    });
  }

  function simulatorGrowth(id, labels, contributed, gains) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const opts = baseOpts();
    opts.scales.y.stacked = true;
    make(id, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Investment Gains',     data: gains,       borderColor: C.orange, backgroundColor: grad(ctx, 'rgba(255,107,53,0.3)',   'rgba(255,107,53,0)'),   fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2, stack: 'portfolio' },
          { label: 'Contributed Capital',  data: contributed, borderColor: C.blue,   backgroundColor: grad(ctx, 'rgba(79,70,229,0.3)', 'rgba(79,70,229,0)'), fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2, stack: 'portfolio' },
        ],
      },
      options: opts,
    });
  }

  function simGrowthLine(id, labels, contributed, gains) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const opts = baseOpts();
    opts.scales.y.ticks.callback = fmtCurShort;
    opts.scales.y.stacked = true;
    opts.plugins.tooltip = {
      backgroundColor: C.tooltip, borderColor: C.tooltipBorder, borderWidth: 1,
      titleColor: '#F3F4F6', bodyColor: '#D1D5DB', padding: 12, cornerRadius: 10,
      callbacks: {
        label: ctx => ` ${ctx.dataset.label}: ${fmtCur(ctx.parsed.y)}`,
        footer: items => `Total: ${fmtCur(items.reduce((s, it) => s + it.parsed.y, 0))}`,
      },
    };
    make(id, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Gains',      data: gains,       borderColor: C.orange, backgroundColor: grad(ctx, 'rgba(255,107,53,0.30)',   'rgba(255,107,53,0)'),   fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2, stack: 'sim' },
          { label: 'Capital',    data: contributed, borderColor: '#6B7280', backgroundColor: grad(ctx, 'rgba(107,114,128,0.20)', 'rgba(107,114,128,0)'), fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2, stack: 'sim' },
        ],
      },
      options: opts,
    });
  }

  function simStockMilestone(id, milestoneLabels, stocksData) {
    const PALETTE = ['#16A34A', '#22C55E', '#86EFAC', '#10B981', '#34D399'];
    const datasets = stocksData.map((s, i) => ({
      label: s.label,
      data:  s.data,
      backgroundColor: PALETTE[i % PALETTE.length] + 'cc',
      borderColor:     '#102019',
      borderWidth: 1, borderRadius: 6, borderSkipped: false,
    }));
    const opts = baseOpts();
    opts.scales.y.ticks.callback = fmtCurShort;
    opts.plugins.tooltip = {
      backgroundColor: C.tooltip, borderColor: C.tooltipBorder, borderWidth: 1,
      titleColor: '#F3F4F6', bodyColor: '#D1D5DB', padding: 12, cornerRadius: 10,
      callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmtCur(ctx.parsed.y)}` },
    };
    make(id, { type: 'bar', data: { labels: milestoneLabels, datasets }, options: opts });
  }

  function simPortfolioArea(id, labels, datasets) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    function hexRgba(hex, a) {
      const h = hex.replace('#', '');
      return `rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${a})`;
    }
    const opts = baseOpts();
    opts.scales.y.ticks.callback = fmtCurShort;
    opts.plugins.tooltip = {
      mode: 'index',
      backgroundColor: C.tooltip, borderColor: C.tooltipBorder, borderWidth: 1,
      titleColor: '#F3F4F6', bodyColor: '#D1D5DB', padding: 12, cornerRadius: 10,
      callbacks: {
        label: ctx => ` ${ctx.dataset.label}: ${fmtCurShort(ctx.parsed.y)}`,
      },
    };
    make(id, {
      type: 'line',
      data: {
        labels,
        datasets: datasets.map(d => ({
          label: d.label,
          data:  d.data,
          borderColor: d.color,
          backgroundColor: hexRgba(d.color, 0.08),
          fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2,
        })),
      },
      options: opts,
    });
  }

  function registerColor(name, color) { CAT_COLORS[name] = color; }
  function unregisterColor(name) { delete CAT_COLORS[name]; }

  return { dashboardOverview, monthlyBar, dailyBar, dailyStackedBar, categoryDonut, simStockDonut, cashFlowBar, cumulativeArea, simulatorGrowth, simGrowthLine, simStockMilestone, simPortfolioArea, destroy, CAT_COLORS, setCurrency, registerColor, unregisterColor, formatCurrency: v => fmtCur(v), formatCurrencyShort: v => fmtCurShort(v) };
})();
