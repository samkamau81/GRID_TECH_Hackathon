/* Peak Power FAQ assistant.
   What it is: a small, offline helper that matches a question against the curated, verified answers in js/data/faq.js (keyword and phrase
   matching with light stemming). Runs entirely in the browser: no network requests, no API keys.
   Structure for the future: the whole thing goes through one function, assistant.retrieve(query) -> ranked [{entry, score}]. To add a
   retrieval-augmented assistant later, call PeakPowerAssistant.setRetriever(async (query, k) => [...ranked entries]) (for example one that
   embeds the query and searches the same FAQ records plus the Appendix text); the chat window, links and fallbacks stay as they are, and the
   answers shown would still come only from retrieved, cited records. */
(function (root) {
  'use strict';
  var STOP = 'a an and are as at be by can do does for from has have how i in is it its me my of on or our so that the their there this to us was we what when where which who why will with you your'.split(' ');
  var STOPSET = {}; STOP.forEach(function (w) { STOPSET[w] = 1; });
  var stem = function (w) { return w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : (w.length > 3 ? w.replace(/s$/, '') : w); };
  var norm = function (s) { return String(s).toLowerCase().replace(/[^a-z0-9.%\s-]/g, ' ').replace(/\s+/g, ' ').trim(); };
  var tokens = function (s) { return norm(s).split(' ').filter(function (w) { return w && !STOPSET[w]; }).map(stem); };

  function makeAssistant(faq) {
    var index = faq.map(function (e) {
      var kwTok = {}; e.kw.forEach(function (k) { tokens(k).forEach(function (t) { kwTok[t] = 1; }); });
      var qTok = {}; tokens(e.q).forEach(function (t) { qTok[t] = 1; });
      return { e: e, kwPhrases: e.kw.map(norm), kwTok: kwTok, qTok: qTok };
    });
    var vocab = {}; faq.forEach(function (e) { tokens(e.q + ' ' + e.kw.join(' ') + ' ' + e.a).forEach(function (t) { vocab[t] = 1; }); });
    var custom = null;
    function score(query) {
      var qn = ' ' + norm(query) + ' ', qt = tokens(query), seen = {}; qt = qt.filter(function (t) { return seen[t] ? false : (seen[t] = 1); });
      return index.map(function (r) {
        var s = 0;
        r.kwPhrases.forEach(function (p) { if (p && qn.indexOf(' ' + p + ' ') >= 0) s += 3 + 0.6 * p.split(' ').length; else if (p.length > 3 && qn.indexOf(p) >= 0) s += 1.5; });
        qt.forEach(function (t) { if (r.kwTok[t]) s += 1; if (r.qTok[t]) s += 1.2; });
        if (norm(query) === norm(r.e.q)) s += 20;
        var matched = qt.filter(function (t) { return r.kwTok[t] || r.qTok[t]; }).length;
        return { entry: r.e, score: s, matched: matched, unknown: qt.filter(function (t) { return !vocab[t]; }).length, n: qt.length };
      }).filter(function (x) { return x.score > 0; }).sort(function (a, b) { return b.score - a.score; });
    }
    function retrieve(query, k) { k = k || 3; return custom ? custom(query, k) : Promise.resolve(score(query).slice(0, k)); }
    var SMALL = [
      { re: /^(hi|hello|hey|good (morning|afternoon|evening))\b/, a: 'Hello. Ask me about Peak Power: what it does, how the simulation and grades work, the data, the business model or the roadmap.' },
      { re: /^(thanks|thank you|cheers)\b/, a: 'You are welcome. Ask another question any time.' }
    ];
    var THRESHOLD = 3.4;
    /* ask(query) -> Promise of {kind:'answer'|'fallback'|'small', entry?, related?, text?} */
    function ask(query) {
      var q = norm(query);
      if (!q) return Promise.resolve({ kind: 'fallback', text: 'Type a question, or pick one of the suggestions.' });
      for (var i = 0; i < SMALL.length; i++) if (SMALL[i].re.test(q)) return Promise.resolve({ kind: 'small', text: SMALL[i].a });
      return retrieve(query, 3).then(function (hits) {
        /* a lone keyword in a question made mostly of words we have never seen is not an answer */
        var h0 = hits[0], weak = h0 && h0.matched != null && h0.matched <= 1 && h0.unknown * 2 >= h0.n && h0.score < 20;
        if (hits.length && hits[0].score >= THRESHOLD && !weak) return { kind: 'answer', entry: hits[0].entry, related: hits.slice(1).filter(function (h) { return h.score >= THRESHOLD * 0.6; }).map(function (h) { return h.entry; }) };
        return { kind: 'fallback', text: 'I do not have a verified answer to that, and I would rather say so than guess. Try one of the suggested questions.', related: hits.slice(0, 2).map(function (h) { return h.entry; }) };
      });
    }
    return { retrieve: retrieve, ask: ask, score: score, setRetriever: function (fn) { custom = fn; }, faq: faq, THRESHOLD: THRESHOLD };
  }

  var faq = root.PEAKPOWER_FAQ || [];
  var api = makeAssistant(faq);
  root.PeakPowerAssistant = api;
  if (typeof module !== 'undefined') module.exports = { makeAssistant: makeAssistant };
  if (typeof document === 'undefined') return;

  /* ---------- UI ---------- */
  var d = document, el = function (tag, cls, txt) { var n = d.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
  var ready = function (fn) { d.readyState === 'loading' ? d.addEventListener('DOMContentLoaded', fn) : fn(); };
  var loadFaq = function () {
    if (root.PEAKPOWER_FAQ) return Promise.resolve();
    return new Promise(function (ok) { var s = d.createElement('script'); s.src = 'js/data/faq.js'; s.onload = ok; s.onerror = ok; d.head.appendChild(s); });
  };
  var loading = null, opened = false;
  function build() {
    var btn = el('button', 'pp-chat-btn'); btn.type = 'button'; btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'pp-chat');
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4V5Z"/></svg><span>Peak Power Assistant</span>';
    var box = el('section', 'pp-chat'); box.id = 'pp-chat'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Peak Power Assistant'); box.hidden = true;
    var head = el('header', 'pp-chat-h'); var ttl = el('div'); ttl.appendChild(el('b', null, 'Peak Power Assistant')); ttl.appendChild(el('small', null, 'Ask about the platform, the model and the data'));
    var close = el('button', 'pp-chat-x', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Close assistant'); head.appendChild(ttl); head.appendChild(close);
    var log = el('div', 'pp-chat-log'); log.setAttribute('role', 'log'); log.setAttribute('aria-live', 'polite');
    var chips = el('div', 'pp-chat-chips');
    var form = el('form', 'pp-chat-f'); form.setAttribute('role', 'search');
    var input = el('input'); input.type = 'text'; input.placeholder = 'Ask a question…'; input.setAttribute('aria-label', 'Your question'); input.autocomplete = 'off'; input.maxLength = 200;
    var send = el('button', null, 'Ask'); send.type = 'submit'; form.appendChild(input); form.appendChild(send);
    box.appendChild(head); box.appendChild(log); box.appendChild(chips); box.appendChild(form);
    d.body.appendChild(btn); d.body.appendChild(box);

    function say(text, who) { var m = el('div', 'pp-msg ' + who); m.appendChild(el('p', null, text)); log.appendChild(m); log.scrollTop = log.scrollHeight; return m; }
    function links(m, entry) { if (!entry.links || !entry.links.length) return; var r = el('div', 'pp-links'); entry.links.forEach(function (l) { var a = el('a', null, l.label); a.href = l.href; r.appendChild(a); }); m.appendChild(r); }
    function ask(q) {
      q = String(q).trim(); if (!q) return; say(q, 'me'); input.value = '';
      api.ask(q).then(function (r) {
        var m = say(r.kind === 'answer' ? r.entry.a : r.text, 'bot'); if (r.kind === 'answer') links(m, r.entry);
        if (r.related && r.related.length) { var rel = el('div', 'pp-related'); rel.appendChild(el('span', null, 'Related: ')); r.related.forEach(function (e) { var b = el('button', null, e.q); b.type = 'button'; b.onclick = function () { ask(e.q); }; rel.appendChild(b); }); m.appendChild(rel); }
        if (r.kind === 'fallback') showChips();
        log.scrollTop = log.scrollHeight;
      });
    }
    function showChips() {
      chips.textContent = ''; var byId = {}; api.faq.forEach(function (e) { byId[e.id] = e; });
      (root.PEAKPOWER_FAQ_SUGGESTED || []).forEach(function (id) { var e = byId[id]; if (!e) return; var b = el('button', null, e.q); b.type = 'button'; b.onclick = function () { ask(e.q); }; chips.appendChild(b); });
    }
    function open() {
      loading = loading || loadFaq().then(function () { api = makeAssistant(root.PEAKPOWER_FAQ || []); root.PeakPowerAssistant = api; });
      loading.then(function () {
        box.hidden = false; btn.setAttribute('aria-expanded', 'true'); btn.hidden = true;
        if (!log.children.length) { say('Hello, I am the Peak Power Assistant. Pick a question below or type your own.', 'bot'); showChips(); }
        input.focus(); opened = true;
      });
    }
    function shut() { box.hidden = true; btn.hidden = false; btn.setAttribute('aria-expanded', 'false'); btn.focus(); }
    btn.onclick = open; close.onclick = shut;
    box.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); shut(); } });
    form.onsubmit = function (e) { e.preventDefault(); ask(input.value); };
    d.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('.pp-links a'); if (a && a.getAttribute('href').charAt(0) === '#') shut(); });
  }
  ready(build);
})(typeof window !== 'undefined' ? window : globalThis);
