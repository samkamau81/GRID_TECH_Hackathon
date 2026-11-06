// FAQ assistant: retrieval quality, fallbacks, link validity, and that numbers quoted in answers agree with the shipped data.
// Run: node --test tests/unit/chatbot.test.js
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const PP = path.resolve(__dirname, '..', '..', 'peak-power');
const w = {}; vm.runInNewContext(fs.readFileSync(path.join(PP, 'js/data/faq.js'), 'utf8'), { window: w });
const ST = (() => { const x = {}; vm.runInNewContext(fs.readFileSync(path.join(PP, 'js/data/appendix-stats.js'), 'utf8'), { window: x }); return x.PEAKPOWER_APPENDIX_STATS; })();
global.PEAKPOWER_FAQ = w.PEAKPOWER_FAQ;
const { makeAssistant } = require(path.join(PP, 'js/chatbot.js'));
const A = makeAssistant(w.PEAKPOWER_FAQ);
const top = async (q) => { const r = await A.ask(q); return r.kind === 'answer' ? r.entry.id : r.kind; };

test('every FAQ entry has the required fields and unique ids', () => {
  const ids = new Set();
  for (const e of w.PEAKPOWER_FAQ) { assert.ok(e.id && e.topic && e.q && e.a && e.kw.length >= 3 && Array.isArray(e.links), e.id); assert.ok(!ids.has(e.id), 'duplicate ' + e.id); ids.add(e.id); }
  assert.ok(w.PEAKPOWER_FAQ.length >= 25);
  w.PEAKPOWER_FAQ_SUGGESTED.forEach((id) => assert.ok(ids.has(id), 'suggested id ' + id));
});
test('each canonical question retrieves its own answer', async () => {
  for (const e of w.PEAKPOWER_FAQ) assert.equal(await top(e.q), e.id, e.q);
});
test('paraphrases reach the right answer', async () => {
  const cases = { 'how do you score sites?': 'grades', 'what is the pricing': 'pricing', 'do you have any paying customers': 'traction', 'tell me about the gpu and cloud servers': 'hardware',
    'is this machine learning': 'ml', 'where does the data come from': 'data', 'which datasets have missing values': 'missing', 'how is co2 computed': 'carbon', 'can I trust these results': 'limits',
    'who are the competitors': 'market', 'do I need to sign in': 'privacy', 'how does the battery work': 'energy', 'what is the digital twin plan': 'hardware', 'how is the overall grade weighted': 'overall' };
  for (const [q, id] of Object.entries(cases)) assert.equal(await top(q), id, q);
});
test('questions we cannot answer get an honest fallback, not a guess', async () => {
  for (const q of ['what is the weather in paris', 'asdf qwer zxcv', 'who won the world cup', 'how many employees do you have']) assert.equal(await top(q), 'fallback', q);
  const r = await A.ask('what is the weather in paris'); assert.match(r.text, /do not have a verified answer/);
});
test('greetings and empty input are handled', async () => { assert.equal((await A.ask('hello')).kind, 'small'); assert.equal((await A.ask('   ')).kind, 'fallback'); });
test('a custom retriever can replace keyword matching (future RAG hook)', async () => {
  const B = makeAssistant(w.PEAKPOWER_FAQ); B.setRetriever(async () => [{ entry: w.PEAKPOWER_FAQ[0], score: 99 }]);
  assert.equal((await B.ask('anything at all')).entry.id, w.PEAKPOWER_FAQ[0].id);
});
test('links point to real pages and real section anchors', () => {
  const html = { 'index.html': fs.readFileSync(path.join(PP, 'index.html'), 'utf8'), 'appendix.html': fs.readFileSync(path.join(PP, 'appendix.html'), 'utf8') };
  const secs = ['model', 'data', 'insights', 'business', 'limits'];
  for (const e of w.PEAKPOWER_FAQ) for (const l of e.links) {
    const [file, hash] = l.href.split('#'); assert.ok(fs.existsSync(path.join(PP, file)), l.href);
    if (hash && file === 'index.html') assert.match(html['index.html'], new RegExp(`id="${hash}"`), l.href);
    if (hash && file === 'appendix.html') assert.ok(secs.includes(hash) && html['appendix.html'].includes(`id="s-${hash}"`), l.href);
  }
});
test('numbers quoted from the Appendix statistics agree with the data', () => {
  const t = (id) => w.PEAKPOWER_FAQ.find((e) => e.id === id).a, m = ST.matrix, c = ST.completeness;
  const a = t('corr');
  assert.ok(a.includes('3,142') && a.includes(m[0][1].rho.toFixed(2)), 'metro vs network facility rho');
  assert.ok(Math.abs(m[2][3].rho) < 0.01 && a.includes('0.00'), 'water vs hazard');
  assert.ok(a.includes('47 states') && a.includes(ST.stateTest.capacity_vs_dc.rho.toFixed(2)), 'state capacity vs data centers');
  const mi = t('missing'); assert.ok(mi.includes(String(c.arid_water_not_defined + c.water_missing)) && mi.includes(String(c.counties - c.haz)) && mi.includes(String(c.counties - c.queue)), 'missing-data counts');
  assert.ok(t('map').includes(c.counties.toLocaleString('en-US')));
});
test('commercial answers match the assumptions file and say they are unproven', () => {
  const w2 = {}; vm.runInNewContext(fs.readFileSync(path.join(PP, 'js/data/business-model.js'), 'utf8'), { window: w2 }); const B = w2.PEAKPOWER_BUSINESS;
  const pr = w.PEAKPOWER_FAQ.find((e) => e.id === 'pricing').a;
  assert.ok(pr.includes('$' + B.tiers[0].price.toLocaleString('en-US')) && pr.includes('$' + B.tiers[1].price.toLocaleString('en-US')) && pr.includes('$' + B.tiers[2].price.toLocaleString('en-US')));
  const pro = B.tiers[1], ltv = Math.round(pro.price * pro.gm / pro.churn), pay = Math.round(pro.cac / (pro.price * pro.gm / 12));
  const ue = w.PEAKPOWER_FAQ.find((e) => e.id === 'unit').a; assert.ok(ue.includes(ltv.toLocaleString('en-US')) && ue.includes(String(pay)));
  assert.match(w.PEAKPOWER_FAQ.find((e) => e.id === 'traction').a, /^No\. There are no customers, revenue/);
  assert.match(w.PEAKPOWER_FAQ.find((e) => e.id === 'business').a, /not evidence/);
});
