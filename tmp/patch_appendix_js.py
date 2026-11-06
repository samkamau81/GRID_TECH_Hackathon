base = 'S:/OneDrive/Desktop/GRID_Hackathon/Claude Code Setup/'
p = base + 'peak-power/js/appendix.js'
s = open(p, encoding='utf8', newline='').read()
crlf = '\r\n' in s
s = s.replace('\r\n', '\n')
def rep(a, b):
    global s
    assert a in s, a[:70]
    s = s.replace(a, b, 1)

rep("var SECS = ['model', 'data', 'insights', 'limits'], built = {};", "var SECS = ['model', 'data', 'insights', 'business', 'limits'], built = {};")
rep("    if (sec === 'data' && !built.data) { built.data = true; buildData(); }",
    "    if (sec === 'data' && !built.data) { built.data = true; buildData(); }\n    if (sec === 'business' && !built.business) { built.business = true; buildBusiness(); }")
rep("var n = e.key === 'ArrowRight' ? (i + 1) % 4 : e.key === 'ArrowLeft' ? (i + 3) % 4 : e.key === 'Home' ? 0 : e.key === 'End' ? 3 : -1;",
    "var L = SECS.length, n = e.key === 'ArrowRight' ? (i + 1) % L : e.key === 'ArrowLeft' ? (i + L - 1) % L : e.key === 'Home' ? 0 : e.key === 'End' ? L - 1 : -1;")

biz = r"""
  /* ---------- D. business model (assumptions from js/data/business-model.js, loaded on demand) ---------- */
  var bizPromise = null;
  function loadBiz() {
    if (window.PEAKPOWER_BUSINESS) return Promise.resolve(window.PEAKPOWER_BUSINESS);
    if (!bizPromise) bizPromise = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = 'js/data/business-model.js';
      s.onload = function () { window.PEAKPOWER_BUSINESS ? res(window.PEAKPOWER_BUSINESS) : rej(new Error('assumptions missing')); };
      s.onerror = function () { bizPromise = null; rej(new Error('Could not load js/data/business-model.js')); };
      document.head.appendChild(s);
    });
    return bizPromise;
  }
  var usd = function (n) { return '$' + Math.round(n).toLocaleString('en-US'); };
  var usdK = function (n) { return n >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'M' : '$' + Math.round(n / 1e3) + 'k'; };
  /* revenue for one scenario: subscriptions use the average of start- and end-of-year paying accounts */
  function revenue(B, sc) {
    var prev = { analyst: 0, pro: 0, ent: 0 }, out = [];
    sc.years.forEach(function (y, i) {
      var avg = function (k) { return (prev[k] + y[k]) / 2; };
      var sub = avg('analyst') * B.tiers[0].price + avg('pro') * B.tiers[1].price + avg('ent') * B.tiers[2].price;
      var use = sub * B.usage.shareOfSubscriptions, cons = y.projects * B.services.feasibilityPerProject, onb = Math.max(0, y.ent - prev.ent) * B.services.onboardingPerNewEnterprise;
      out.push({ year: i + 1, sub: sub, use: use, svc: cons + onb, cons: cons, onb: onb, total: sub + use + cons + onb, recurring: sub + use });
      prev = { analyst: y.analyst, pro: y.pro, ent: y.ent };
    });
    return out;
  }
  var bizSel = 'base', BZ = null;
  function buildBusiness() {
    loadBiz().then(function (B) {
      BZ = B;
      $('usage-prices').textContent = B.usage.items.map(function (i) { return i.name + ': ' + i.price; }).join('; ');
      $('svc-prices').textContent = B.services.items.map(function (i) { return i.name + ': ' + i.price; }).join('; ');
      $('tiers').innerHTML = B.tiers.map(function (t) { return '<article class="tier"><span class="badge prop">Proposed</span><h3>' + esc(t.name) + '</h3><p class="price">' + usd(t.price) + '<small> ' + esc(t.unit) + '</small></p><p class="muted sm">' + esc(t.segment) + '</p><ul class="tick">' + t.includes.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul><p class="muted sm">Sales motion: ' + esc(t.motion) + '</p></article>'; }).join('');
      $('unit-table').innerHTML = '<thead><tr><th>Tier</th><th>Annual price</th><th>Gross margin</th><th>Annual churn</th><th>Customer lifetime (years)</th><th>Lifetime value</th><th>Acquisition cost</th><th>LTV ÷ CAC</th><th>Payback (months)</th></tr></thead><tbody>' + B.tiers.map(function (t) {
        var ltv = t.price * t.gm / t.churn, pay = t.cac / (t.price * t.gm / 12);
        return '<tr><td>' + esc(t.name) + '</td><td>' + usd(t.price) + '</td><td>' + Math.round(t.gm * 100) + '%</td><td>' + Math.round(t.churn * 100) + '%</td><td>' + (1 / t.churn).toFixed(1) + '</td><td>' + usd(ltv) + '</td><td>' + usd(t.cac) + '</td><td>' + (ltv / t.cac).toFixed(1) + '×</td><td>' + pay.toFixed(0) + '</td></tr>'; }).join('') + '</tbody>';
      $('scn').innerHTML = Object.keys(B.scenarios).map(function (k) { return '<button type="button" data-k="' + k + '" aria-pressed="' + (k === bizSel) + '">' + esc(B.scenarios[k].label) + '</button>'; }).join('');
      $('scn').addEventListener('click', function (e) { var b = e.target.closest('button[data-k]'); if (!b) return; bizSel = b.dataset.k; $('scn').querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); drawScenario(); });
      $('phases').innerHTML = B.phases.map(function (p, i) { return '<li><span class="ph">' + esc(p.when) + '</span><b>' + (i + 1) + '. ' + esc(p.name) + '.</b> ' + esc(p.goal) + '<ul class="tick">' + p.work.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul><p class="gate">' + esc(p.gate) + '</p></li>'; }).join('');
      drawScenario();
    }, function (e) { failNote($('s-business'), e); });
  }
  var STREAMS = [['sub', 'Subscriptions and licences', '--gold-deep'], ['use', 'Usage-based services', '--gold'], ['svc', 'Consulting and onboarding (one-time)', '--ink-2']];
  function drawScenario() {
    var B = BZ, sc = B.scenarios[bizSel], R = revenue(B, sc);
    $('scn-blurb').textContent = sc.blurb + ' Illustrative only.';
    var W = 520, H = 300, P = { l: 56, r: 12, t: 16, b: 40 }, max = Math.max.apply(0, R.map(function (r) { return r.total; })) * 1.1, bw = (W - P.l - P.r) / R.length * 0.55;
    var Y = function (v) { return H - P.b - v / max * (H - P.t - P.b); }, svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="presentation" focusable="false">';
    var step = Math.pow(10, Math.floor(Math.log10(max / 4))), nice = [1, 2, 5, 10].map(function (k) { return k * step; }).find(function (k) { return max / k <= 6; }) || step;
    for (var v = 0; v <= max; v += nice) svg += '<line x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="var(--rule)" opacity=".6"/><text x="' + (P.l - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end" font-size="11" fill="var(--ink-3)">' + usdK(v) + '</text>';
    R.forEach(function (r, i) {
      var x = P.l + (i + 0.5) * (W - P.l - P.r) / R.length - bw / 2, acc = 0;
      STREAMS.forEach(function (st) { var v2 = r[st[0]], y1 = Y(acc + v2), h = Y(acc) - y1; svg += '<rect x="' + x + '" y="' + y1 + '" width="' + bw + '" height="' + Math.max(h, 0) + '" fill="var(' + st[2] + ')" rx="2"><title>Year ' + r.year + ', ' + st[1] + ': ' + usd(v2) + '</title></rect>'; acc += v2; });
      svg += '<text x="' + (x + bw / 2) + '" y="' + (Y(r.total) - 6) + '" text-anchor="middle" font-size="12" font-weight="600" fill="var(--ink)">' + usdK(r.total) + '</text><text x="' + (x + bw / 2) + '" y="' + (H - P.b + 18) + '" text-anchor="middle" font-size="12" fill="var(--ink-2)">Year ' + r.year + '</text>';
    });
    $('rev-chart').innerHTML = svg + '</svg>';
    $('rev-chart').setAttribute('aria-label', 'Stacked bar chart, ' + sc.label + ' scenario, illustrative annual revenue: ' + R.map(function (r) { return 'year ' + r.year + ' ' + usd(r.total); }).join(', '));
    $('rev-legend').innerHTML = STREAMS.map(function (st) { return '<span><i style="background:var(' + st[2] + ')"></i>' + st[1] + '</span>'; }).join('');
    $('rev-table').innerHTML = '<thead><tr><th></th>' + R.map(function (r) { return '<th>Year ' + r.year + '</th>'; }).join('') + '</tr></thead><tbody>' +
      [['Subscriptions and licences', 'sub'], ['Usage-based services', 'use'], ['Consulting and onboarding', 'svc'], ['Total revenue', 'total'], ['Recurring revenue', 'recurring']].map(function (m) { return '<tr' + (m[1] === 'total' ? ' class="tot"' : '') + '><td>' + m[0] + '</td>' + R.map(function (r) { return '<td>' + usd(r[m[1]]) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '<tr><td>Recurring share</td>' + R.map(function (r) { return '<td>' + Math.round(100 * r.recurring / r.total) + '%</td>'; }).join('') + '</tr></tbody>';
    $('cust-table').innerHTML = '<thead><tr><th>Paying accounts at year end</th>' + sc.years.map(function (y, i) { return '<th>Year ' + (i + 1) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      [['Analyst users', 'analyst'], ['Professional teams', 'pro'], ['Enterprise licences', 'ent'], ['Consulting projects in the year', 'projects']].map(function (m) { return '<tr><td>' + m[0] + '</td>' + sc.years.map(function (y) { return '<td>' + y[m[1]] + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody>';
    $('rev-note').textContent = 'Method: subscription revenue = average paying accounts in the year × tier price; usage = ' + Math.round(B.usage.shareOfSubscriptions * 100) + '% of subscriptions; consulting = projects × ' + usd(B.services.feasibilityPerProject) + '; onboarding = new enterprise accounts × ' + usd(B.services.onboardingPerNewEnterprise) + '. No costs, taxes or sales cycles are modelled. These figures are assumptions, not forecasts.';
  }
"""
marker = "  function redrawCharts()"
rep(marker, biz + "\n" + marker)
if crlf:
    s = s.replace('\n', '\r\n')
open(p, 'w', encoding='utf8', newline='').write(s)
print('ok')
