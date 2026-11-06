base = 'S:/OneDrive/Desktop/GRID_Hackathon/Claude Code Setup/'
def sub(path, a, b):
    s = open(base + path, encoding='utf8', newline='').read()
    assert a in s, (path, a[:50])
    open(base + path, 'w', encoding='utf8', newline='').write(s.replace(a, b, 1))

sub('peak-power/README.md',
    '| Appendix | `appendix.html` | Four sections: model and methodology, data inventory and integrity, correlations and insights (statistics from `js/data/appendix-stats.js`, built by `../scripts/build_appendix_stats.mjs`), limitations. |',
    '| Appendix | `appendix.html` | Five sections: model and methodology, data inventory and integrity, correlations and insights (statistics from `js/data/appendix-stats.js`, built by `../scripts/build_appendix_stats.mjs`), business model (all assumptions in `js/data/business-model.js`, labelled as proposals), and limitations with a hardware and infrastructure roadmap. |\n| FAQ assistant | `js/chatbot.js`, `js/data/faq.js`, `css/chatbot.css` | A floating "Ask Peak Power" helper on all three pages. It matches questions against curated, verified answers (keyword and phrase matching, no network, no AI model). `PeakPowerAssistant.setRetriever()` is the hook for a future retrieval-augmented assistant. The FAQ file loads on first open. |')
sub('tests/README.md',
    '**Moved:**',
    '**Added with the business positioning work:** `unit/chatbot.test.js` (every FAQ question retrieves its own answer, paraphrases, honest fallbacks, link validity, numbers quoted in answers equal the Appendix statistics and the business assumptions) and `e2e/business-chat.e2e.mjs` (landing page content, assistant behaviour and no external requests, Business model revenue table checked against an independent calculation, hardware roadmap, mobile layout). `e2e/map-lazy.e2e.mjs` covers the lazy county shapes.\n\n**Moved:**')
print('ok')
