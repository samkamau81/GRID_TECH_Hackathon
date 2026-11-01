// PeakPower in-browser engine: rebuilds the 87,600-hour inputs from the packet reference year,
// dispatches a fixed portfolio hour by hour (same rules as team_app/engine.py) and does the
// checker's common accounting. Stress scenarios can add events, harshen caps or delay the grid.
// Unlike the Python sizing engine, this one never throws: load it cannot serve is reported as unserved.
(function (root) {
  const N = 87600, HPM = 730, HPY = 8760;
  const ETA = Math.sqrt(0.85), REMOTE_LOCAL = 12 / 1.05, ARB = 100, HOLD = 72, FLUSH = 96;
  const GAS = ['fuel_cell', 'gas_engine', 'gas_turbine'];
  const REL_PRICE = 1.05 * 70 + 50, INT_PRICE = 1000;
  const RENT_PRICE = 350, RENT_CO2 = 0.74; // extension: rented diesel generator, $/MWh all-in and t CO2/MWh

  function buildInputs(REF, open, sc) {
    sc = sc || {};
    const delay = sc.delay || 0, capFrac = sc.capFrac == null ? 0.6 : sc.capFrac;
    const packetEvents = sc.packetEvents !== false;
    const r = REF;
    const I = { open, n: N, month: new Int16Array(N), year: new Int8Array(N), L: new Float64Array(N), t1: new Float64Array(N), t2: new Float64Array(N),
      G: new Float64Array(N), Gord: new Float64Array(N), st: new Uint8Array(N), price: new Float64Array(N), gasP: new Float64Array(N), co2: new Float64Array(N),
      wcf: new Float64Array(N), scf: new Float64Array(N), refh: new Int16Array(N), evL: new Int16Array(N), nxt: new Int32Array(N) };
    // extra events: array of {startDay (1..365), days, startHour, hours, frac, years:[1..10] or null for all}
    const extra = sc.extra || [];
    for (let h = 0; h < N; h++) {
      const ref = h % HPY, m = Math.floor(h / HPM), y = Math.floor(h / HPY), yrs = h / HPY;
      const k = m - open; let f = k < 0 ? 0 : Math.min(1, 1 / 3 + k / 15);
      // extension (not in packet): demand grows sc.growth per year after full campus, compounded monthly
      if (sc.growth && k >= 10) f *= Math.pow(1 + sc.growth, (k - 10) / 12);
      I.refh[h] = ref; I.month[h] = m; I.year[h] = y;
      I.L[h] = r.load[ref] * f; I.t1[h] = r.t1[ref] * f; I.t2[h] = r.t2[ref] * f;
      let g = 0; if (m >= 18 + delay) g = 25; if (m >= 24 + delay) g = 50; if (m >= 30 + delay) g = 75;
      I.Gord[h] = g;
      let s = packetEvents && r.stress[ref] === 1, fr = s ? capFrac : 1;
      for (const e of extra) {
        if (e.years && !e.years.includes(y + 1)) continue;
        const d = r.day_of_year[ref], hr = r.hour[ref];
        if (d >= e.startDay && d < e.startDay + e.days && hr >= e.startHour && hr < e.startHour + e.hours) { s = true; fr = Math.min(fr, e.frac); }
      }
      I.st[h] = s ? 1 : 0; I.G[h] = g * fr;
      I.price[h] = r.price[ref] * Math.pow(1.05, yrs) + r.grid_adder;
      I.gasP[h] = r.hh[ref] * Math.pow(1.03, yrs) + r.gas_adder;
      I.co2[h] = r.grid_co2 * Math.pow(0.97, yrs);
      I.wcf[h] = Math.min(1, r.wind[ref] * (sc.windScale || 1)); I.scf[h] = Math.min(1, r.solar[ref] * (sc.solarScale || 1)); // weather extension: scale packet profiles
    }
    // operator events (extension): absolute-hour windows for grid cuts and weak wind/solar
    for (const e of (sc.hourEvents || [])) for (let h = Math.max(0, e.from); h < Math.min(N, e.to); h++) { I.st[h] = 1; I.G[h] = Math.min(I.G[h], I.Gord[h] * e.frac); }
    for (const w of (sc.wxWin || [])) for (let h = Math.max(0, w.from); h < Math.min(N, w.to); h++) { I.wcf[h] *= (w.wind == null ? 1 : w.wind); I.scf[h] *= (w.solar == null ? 1 : w.solar); }
    // operator extension: extra load windows (e.g. a chiller drawing more power), added to always-on demand
    for (const e of (sc.loadAdd || [])) for (let h = Math.max(0, e.from); h < Math.min(N, e.to); h++) if (I.L[h] > 0) I.L[h] += e.mw;
    let last = 1e9, run = 0;
    for (let t = N - 1; t >= 0; t--) { if (I.st[t]) { last = t; run++; } else run = 0; I.nxt[t] = last - t; I.evL[t] = run; }
    return I;
  }

  const crf = (r, n) => r / (1 - Math.pow(1 + r, -n));

  function dispatch(I, RES, caps, policy, mode, ival, rental, outages, ctl) {
    // extension: ctl.bat = {from,to}: operator reserves the battery for a window (charge before, no arbitrage, discharge inside)
    const bw = ctl && ctl.bat, resv = t => bw && t >= bw.from - HOLD && t < bw.from, inBW = t => bw && t >= bw.from && t < bw.to;
    // extension: equipment outages [{id, from, to}] take that source fully offline in the window
    const off = (id, t) => { if (!outages) return false; for (const o of outages) if (o.id === id && t >= o.from && t < o.to) return true; return false; };
    ival = ival || 1000;
    const n = I.n, avail = id => Math.max(I.open, RES[id].available_month);
    const W = caps.wind || 0, S = caps.utility_solar || 0, NU = caps.nuclear || 0, B = caps.battery_4h || 0, EMAX = 4 * B;
    const aW = avail('wind'), aS = avail('utility_solar'), aN = avail('nuclear'), aB = avail('battery_4h');
    const gcap = {}; GAS.forEach(g => gcap[g] = { mw: caps[g] || 0, from: avail(g) });
    const varc = g => t => RES[g].payment_usd_per_mwh + RES[g].heat_rate_mmbtu_per_mwh_hhv * I.gasP[t];
    const carbonOrder = GAS.slice().sort((a, b) => RES[a].co2_t_per_mwh - RES[b].co2_t_per_mwh);
    const budget = new Float64Array(10), used = new Float64Array(10);
    for (let y = 0; y < 10; y++) { let hrs = 0; for (let h = y * HPY; h < (y + 1) * HPY; h++) if (I.month[h] >= aB) hrs++; budget[y] = EMAX * 365 * hrs / HPY; }
    const O = {}; ['grid', 'rel', 'cur', 'wind', 'solar', 'nuclear', 'ch', 'di', 'soc', 'unserved', 'fuel_cell', 'gas_engine', 'gas_turbine', 'curtailed', 'rental'].forEach(k => O[k] = new Float64Array(n));
    let soc = 0;
    for (let t = 0; t < n; t++) {
      const m = I.month[t], s = I.st[t] === 1, G = I.G[t], price = I.price[t], y = I.year[t];
      const wa = m >= aW && !off('wind', t) ? W * I.wcf[t] : 0, sa = m >= aS && !off('utility_solar', t) ? S * I.scf[t] : 0, na = m >= aN && !off('nuclear', t) ? NU : 0, ac = wa + sa + na;
      const gc = {}; let gasTot = 0; GAS.forEach(g => { gc[g] = m >= gcap[g].from && !off(g, t) ? gcap[g].mw : 0; gasTot += gc[g]; });
      const gv = {}; GAS.forEach(g => gv[g] = RES[g].payment_usd_per_mwh + RES[g].heat_rate_mmbtu_per_mwh_hhv * I.gasP[t]);
      const t1 = I.t1[t], t2 = I.t2[t];
      const rel = s ? Math.min(t1, REMOTE_LOCAL) : 0;
      let need = I.L[t] - rel, cur = 0;
      if (s && policy === 'when_cheaper' && price > ival) {
        const c0 = Math.min(ac, G, need), r0 = need - c0, must0 = Math.max(r0 - (G - c0), 0), x = Math.min(t2, r0);
        const gmin = Math.min(gv.fuel_cell, gv.gas_engine, gv.gas_turbine);
        if ((price - ival) * Math.max(x - must0, 0) - (ival - gmin) * Math.min(x, must0) > 0) { cur = x; need -= cur; }
      }
      let clean = Math.min(ac, G, need), resid = need - clean;
      let dimax = 0;
      if (B && m >= aB && soc > 1e-9 && !off('battery_4h', t)) dimax = Math.max(0, Math.min(B, soc * ETA, (budget[y] - used[y]) * ETA));
      const shortfall = Math.max(resid - (G - clean), 0);
      let di = 0;
      if (s) {
        const spare = policy === 'never' ? 0 : t2 - cur;
        const mandatory = Math.max(shortfall - gasTot - spare, 0);
        di = Math.min(dimax, Math.max(mandatory, Math.min(shortfall, soc * ETA / Math.max(I.evL[t], 1))));
      } else if (shortfall > 0) di = Math.min(dimax, shortfall);
      if (!s && inBW(t)) di = Math.max(di, Math.min(dimax, resid, soc * ETA / Math.max(bw.to - t, 1)));
      if (t >= n - FLUSH) di = Math.min(soc * ETA, B, need);
      else if (!s && I.nxt[t] > HOLD && !resv(t) && !inBW(t) && price > ARB) di = Math.max(di, Math.min(dimax, resid));
      if (di > resid) { clean = need - di; resid = 0; } else resid -= di;
      const room = G - clean, must = Math.max(resid - room, 0);
      const gas = { fuel_cell: 0, gas_engine: 0, gas_turbine: 0 };
      let grid, left;
      if (mode === 'carbon') {
        grid = Math.min(resid, room); left = must;
        for (const g of carbonOrder) { const x = Math.min(left, gc[g]); gas[g] = x; left -= x; }
      } else {
        left = resid;
        const ord = GAS.slice().sort((a, b) => gv[a] - gv[b]);
        for (const g of ord) { const take = gv[g] < price ? left : Math.max(must - (resid - left), 0); const x = Math.min(take, gc[g], left); gas[g] = x; left -= x; }
        grid = Math.min(left, room); left -= grid;
      }
      // rented backup generator (extension), only inside its window, before pausing work
      if (left > 1e-9 && rental && t >= rental.from && t < rental.to && !(rental.off && t >= rental.off.from && t < rental.off.to)) { const x = Math.min(left, rental.mw); O.rental[t] = x; left -= x; }
      let uns = 0;
      if (left > 1e-9) {
        if (s && policy !== 'never') { const x = Math.min(left, t2 - cur); cur += x; left -= x; }
        if (left > 1e-9 && s && policy === 'never') { const x = Math.min(left, t2 - cur); cur += x; left -= x; uns += 0; O.curtailed[t] = 1; }
        if (left > 1e-9) { uns = left; left = 0; }
      }
      let ch = 0;
      const gasOn = gas.fuel_cell + gas.gas_engine + gas.gas_turbine;
      if (di === 0 && gasOn === 0 && cur === 0 && uns === 0 && B && m >= aB && t < n - FLUSH && !off('battery_4h', t)) {
        const roomE = (EMAX - soc) / ETA;
        ch = Math.max(0, Math.min(B, roomE, ac - clean, G - clean - grid));
        if (ch < Math.min(B, roomE) && (I.nxt[t] <= HOLD || resv(t) || price < ARB / 2)) {
          const red = Math.max(0, Math.min(B - ch, roomE - ch, clean, G - clean - grid - ch)); clean -= red; grid += red; ch += red;
        }
      }
      soc = soc + ETA * ch - di / ETA; if (Math.abs(soc) < 1e-7) soc = 0;
      used[y] += di / ETA;
      const gen = clean + ch;
      O.grid[t] = grid; O.rel[t] = rel; O.cur[t] = cur; O.ch[t] = ch; O.di[t] = di; O.soc[t] = soc; O.unserved[t] = uns;
      if (ac > 0) { O.wind[t] = gen * wa / ac; O.solar[t] = gen * sa / ac; O.nuclear[t] = gen * na / ac; }
      GAS.forEach(g => O[g][t] = gas[g]);
    }
    return O;
  }

  // checker-equivalent accounting; returns totals, per-year and per-hour cost/co2 arrays
  function account(I, RES, caps, O) {
    const n = I.n, cost = new Float64Array(n), co2 = new Float64Array(n), cFix = new Float64Array(n), cCon = new Float64Array(n), cGas = new Float64Array(n), cGrid = new Float64Array(n);
    const lines = {};
    for (const id in RES) {
      const r = RES[id], mw = caps[id] || 0; if (!mw) continue;
      const from = Math.max(I.open, r.available_month), fixedH = mw * 1000 * (r.capex_usd_per_kw * crf(0.08, r.life_years) + r.fom_usd_per_kw_year) / HPY;
      let tot = 0;
      for (let t = 0; t < n; t++) {
        if (I.month[t] < from) continue;
        let c = fixedH; cFix[t] += fixedH;
        if (r.payment_basis === 'available_generation') {
          const prof = id === 'wind' ? I.wcf[t] : id === 'utility_solar' ? I.scf[t] : 1, x = mw * prof * r.payment_usd_per_mwh; c += x; cCon[t] += x;
        } else if (r.kind === 'dispatchable') {
          const g = O[id][t], x = g * (r.payment_usd_per_mwh + r.heat_rate_mmbtu_per_mwh_hhv * I.gasP[t]); c += x; cGas[t] += x; co2[t] += g * r.co2_t_per_mwh;
        }
        cost[t] += c; tot += c;
      }
      lines[id] = tot;
    }
    let merchant = 0, relC = 0, intC = 0, remoteCO2 = 0;
    const relCost = new Float64Array(n), intCost = new Float64Array(n);
    for (let t = 0; t < n; t++) {
      const g = O.grid[t] * I.price[t]; cost[t] += g; cGrid[t] = g; merchant += g; co2[t] += O.grid[t] * I.co2[t];
      relCost[t] = O.rel[t] * REL_PRICE; intCost[t] = O.cur[t] * INT_PRICE; relC += relCost[t]; intC += intCost[t];
      const rc = O.rel[t] * 1.05 * I.co2[t]; remoteCO2 += rc; co2[t] += rc;
    }
    lines.merchant = merchant;
    if (O.rental) for (let t = 0; t < n; t++) if (O.rental[t] > 0) { const c = O.rental[t] * RENT_PRICE; cost[t] += c; cGas[t] += c; co2[t] += O.rental[t] * RENT_CO2; }
    return { cost, co2, relCost, intCost, cFix, cCon, cGas, cGrid, lines, merchant, relC, intC, remoteCO2 };
  }

  function summarize(I, O, A, lo, hi) {
    lo = lo || 0; hi = hi || I.n;
    let req = 0, served = 0, rel = 0, cur = 0, uns = 0, cost = 0, relC = 0, intC = 0, co2 = 0, clean = 0, remote = 0, gas = 0, grid = 0;
    for (let t = lo; t < hi; t++) {
      req += I.L[t]; rel += O.rel[t]; cur += O.cur[t]; uns += O.unserved[t];
      served += I.L[t] - O.rel[t] - O.cur[t] - O.unserved[t];
      cost += A.cost[t]; relC += A.relCost[t]; intC += A.intCost[t]; co2 += A.co2[t]; remote += O.rel[t] * 1.05;
      clean += O.wind[t] + O.solar[t] + O.nuclear[t] - O.ch[t] + O.di[t];
      gas += O.fuel_cell[t] + O.gas_engine[t] + O.gas_turbine[t] + (O.rental ? O.rental[t] : 0); grid += O.grid[t];
    }
    const total = cost + relC + intC;
    return { req, served, rel, cur, uns, localCost: cost, relC, intC, total, co2, clean, gas, grid,
      usdPerMWh: req ? total / req : null, kg: served + remote ? 1000 * co2 / (served + remote) : null, cleanShare: served ? clean / served : null };
  }

  const api = { buildInputs, dispatch, account, summarize, N, HPM, HPY };
  if (typeof module !== 'undefined') module.exports = api; else root.GTEngine = api;
})(this);
