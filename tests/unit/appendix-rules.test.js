// Checks that the rules the Appendix states (and the Prototype implements) agree with the shipped data, and that the Appendix statistics
// can be reproduced from the raw county data. Run: node --test tests/unit/appendix-rules.test.js
const test = require('node:test'), assert = require('node:assert'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const PP = path.resolve(__dirname, '..', '..', 'peak-power');
const load = (f) => { const w = {}; vm.runInNewContext(fs.readFileSync(path.join(PP, f), 'utf8'), { window: w }); return w; };
const MAP = load('js/data/site-counties.js').PEAKPOWER_SITE_MAP, GR = load('js/data/site-grades.js').PEAKPOWER_SITE_GRADES, ST = load('js/data/appendix-stats.js').PEAKPOWER_APPENDIX_STATS;
const J = { loc: 1, en: 2, pol: 3, fib: 4, water: 5, haz: 6, zon: 7, pwr: 8 };   // digit positions in site-grades g[fips]; 0 is Overall

test('3,142 counties, unique FIPS, every county has nine grade digits', () => {
  assert.equal(MAP.c.length, 3142); assert.equal(new Set(MAP.c.map((c) => c.f)).size, 3142);
  MAP.c.forEach((c) => { assert.match(GR.g[c.f], /^[0-4]{9}$/, c.f); assert.match(c.f, /^\d{5}$/); });
});
test('Fiber grade follows 50 / 150 miles to a network facility (hub distance 100 / 250 when none)', () => {
  for (const c of MAP.c) { const e = c.fd == null ? (c.dh <= 100 ? 0 : c.dh <= 250 ? 1 : 2) : (c.fd <= 50 ? 0 : c.fd <= 150 ? 1 : 2); assert.equal(+GR.g[c.f][J.fib], e, c.f); }
});
test('Hazard grade follows the 60th / 85th national percentile of FEMA expected annual loss', () => {
  for (const c of MAP.c) { const e = c.h == null ? 3 : c.h[0] < 60 ? 0 : c.h[0] <= 85 ? 1 : 2; assert.equal(+GR.g[c.f][J.haz], e, c.f); }
});
test('Water grade follows the baseline stress class (Edwards Aquifer counties in Texas are Bad)', () => {
  let edwards = 0;
  for (const c of MAP.c) { const base = c.w == null ? 3 : c.w <= 1 ? 0 : c.w === 2 ? 1 : c.w >= 3 ? 2 : 1; const e = (c.f.startsWith('48') && c.e) ? 2 : base; if (c.f.startsWith('48') && c.e) edwards++; assert.equal(+GR.g[c.f][J.water], e, c.f); }
  assert.ok(edwards > 0);
});
test('Time to power follows the regional median queue wait: under 4 Good, 4 to 6 Moderate, over 6 Bad, fewer than 15 plants not graded', () => {
  for (const c of MAP.c) { const g = c.q == null ? null : MAP.qreg[c.q]; const e = !g || g.med == null || g.n < 15 ? 3 : g.med < 4 ? 0 : g.med <= 6 ? 1 : 2; assert.equal(+GR.g[c.f][J.pwr], e, c.f); }
});
test('Appendix statistics: completeness and a Spearman recomputation from the raw county arrays', () => {
  assert.equal(ST.completeness.counties, 3142);
  const rank = (a) => { const o = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = []; for (let i = 0; i < o.length;) { let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++; for (let k = i; k <= j; k++) r[o[k][1]] = (i + j) / 2 + 1; i = j + 1; } return r; };
  const pear = (x, y) => { const n = x.length, mx = x.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n; let s = 0, a = 0, b = 0; for (let i = 0; i < n; i++) { s += (x[i] - mx) * (y[i] - my); a += (x[i] - mx) ** 2; b += (y[i] - my) ** 2; } return s / Math.sqrt(a * b); };
  const keys = ST.vars.map((v) => v.k);
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const x = [], y = []; ST.county[keys[i]].forEach((v, t) => { const w = ST.county[keys[j]][t]; if (v != null && w != null) { x.push(v); y.push(w); } });
    const rho = pear(rank(x), rank(y)), cell = ST.matrix[i][j];
    assert.equal(cell.n, x.length, keys[i] + ' x ' + keys[j] + ' n'); assert.ok(Math.abs(rho - cell.rho) < 0.0015, `${keys[i]} x ${keys[j]} ${rho} vs ${cell.rho}`);
  }
});
test('Appendix grade distribution matches the county grade digits', () => {
  ST.gradeOrder.forEach((k, j) => { const cnt = [0, 0, 0, 0, 0]; MAP.c.forEach((c) => cnt[+GR.g[c.f][j]]++); assert.deepEqual(ST.gradeDist[j].cnt, cnt, k); });
});
