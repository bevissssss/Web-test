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

  // Color theme adapted for bright, premium light mode with frosted glass vibe
  const C = {
    orange: '#ff6b35', // vibrant coral
    blue: '#4f46e5',   // futuristic indigo
    teal: '#10b981',   // emerald green
    red: '#ef4444',    // crimson red
    purple: '#8b5cf6', // amethyst purple
    yellow: '#f59e0b', // warm gold
    muted: '#64748b',  // slate grey
    grid: 'rgba(99, 102, 241, 0.08)', // subtle pastel slate grid line
    tooltip: '#ffffff', // clean white
    tooltipBorder: 'rgba(99, 102, 241, 0.15)',
  };

  const CAT_COLORS = {
    // Income
    Salary: '#4f46e5',      // Indigo
    'Pocket Money': '#f59e0b', // Warm Gold
    Bonus: '#10b981',       // Emerald
    'Side Job': '#06b6d4',    // Vibrant Cyan
    Investment: '#8b5cf6',  // Purple
    Extra: '#ec4899',       // Deep Pink
    // Expense
    Food: '#f97316',        // Orange
    Housing: '#ef4444',     // Crimson
    Transport: '#0ea5e9',   // Ocean Blue
    Health: '#a855f7',      // Violet
    Entertainment: '#f43f5e', // Rose
    Savings: '#10b981',     // Emerald
    Clothes: '#fb923c',     // Light Orange
    Cosmetic: '#d946ef',    // Magenta
    Education: '#eab308',   // Yellow
    'Contact Fee': '#64748b', // Slate
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
        legend: { labels: { color: '#334155', font: { family: 'Inter', size: 12, weight: '500' }, boxWidth: 12, padding: 16 } },
        tooltip: {
          backgroundColor: C.tooltip,
          borderColor: C.tooltipBorder,
          borderWidth: 1,
          titleColor: '#0f172a',
          bodyColor: '#475569',
          padding: 12,
          cornerRadius: 10,
          boxPadding: 6,
          usePointStyle: true,
          shadowColor: 'rgba(15, 23, 42, 0.08)',
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
    const colors = total > 0 ? baseColors : baseColors.map(() => 'rgba(0,0,0,0.05)');
    make(id, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: renderData, backgroundColor: colors, borderColor: '#ffffff', borderWidth: 2.5, hoverOffset: total > 0 ? 8 : 0 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 700, easing: 'easeInOutQuart' },
        cutout: '70%',
        plugins: {
          legend: { position: 'right', labels: { color: '#334155', font: { family: 'Inter', size: 12, weight: '500' }, boxWidth: 12, padding: 14 } },
          tooltip: {
            backgroundColor: C.tooltip, borderColor: C.tooltipBorder, borderWidth: 1,
            titleColor: '#0f172a', bodyColor: '#475569', padding: 12, cornerRadius: 10,
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
      data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: '#ffffff', borderWidth: 2.5, hoverOffset: 8 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 700, easing: 'easeInOutQuart' },
        cutout: '70%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: C.tooltip, borderColor: C.tooltipBorder, borderWidth: 1,
            titleColor: '#0f172a', bodyColor: '#475569', padding: 12, cornerRadius: 10,
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
      borderColor: '#ffffff',
      borderWidth: 1.5, borderRadius: 4, stack: 'daily',
    }));

    const opts = baseOpts();
    opts.plugins.tooltip = {
      backgroundColor: C.tooltip, borderColor: C.tooltipBorder, borderWidth: 1,
      titleColor: '#0f172a', bodyColor: '#475569', padding: 12, cornerRadius: 10,
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
      titleColor: '#0f172a', bodyColor: '#475569', padding: 12, cornerRadius: 10,
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
      titleColor: '#0f172a', bodyColor: '#475569', padding: 12, cornerRadius: 10,
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
          { label: 'Capital',    data: contributed, borderColor: '#475569', backgroundColor: grad(ctx, 'rgba(71,85,105,0.20)', 'rgba(71,85,105,0)'), fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2, stack: 'sim' },
        ],
      },
      options: opts,
    });
  }

  function simStockMilestone(id, milestoneLabels, stocksData) {
    const PALETTE = ['#4f46e5', '#10b981', '#ff6b35', '#f59e0b', '#ec4899'];
    const datasets = stocksData.map((s, i) => ({
      label: s.label,
      data:  s.data,
      backgroundColor: PALETTE[i % PALETTE.length] + 'cc',
      borderColor:     PALETTE[i % PALETTE.length],
      borderWidth: 1, borderRadius: 6, borderSkipped: false,
    }));
    const opts = baseOpts();
    opts.scales.y.ticks.callback = fmtCurShort;
    opts.plugins.tooltip = {
      backgroundColor: C.tooltip, borderColor: C.tooltipBorder, borderWidth: 1,
      titleColor: '#0f172a', bodyColor: '#475569', padding: 12, cornerRadius: 10,
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
      titleColor: '#0f172a', bodyColor: '#475569', padding: 12, cornerRadius: 10,
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
