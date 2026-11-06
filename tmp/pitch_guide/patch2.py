p='guide.html'
t=open(p,encoding='utf8').read()
def rep(a,b):
    global t
    assert a in t, a[:60]
    t=t.replace(a,b)

# tag artifact: solid borders in the tag colour; legend rule must not hit nested tags
rep('.legend span{margin-right:9pt;font-size:8.6pt}','.legend>span{margin-right:9pt;font-size:8.6pt}')
rep('.tag.v{background:#1b7f4b}.tag.p{background:#1f6fb5}.tag.a{background:#b07400}.tag.f{background:#6b4fa3}.tag.u{background:#b3261e}',
    '.tag.v{background:#1b7f4b;border:1px solid #1b7f4b}.tag.p{background:#1f6fb5;border:1px solid #1f6fb5}.tag.a{background:#b07400;border:1px solid #b07400}.tag.f{background:#6b4fa3;border:1px solid #6b4fa3}.tag.u{background:#b3261e;border:1px solid #b3261e}')

# Section 5: make it fit one page
rep('''<tr><td>CAIDA IXP / PeeringDB</td><td>Fiber (facility distance)</td><td>Oct 2026. Shows where networks meet, not where fiber runs.</td></tr>
<tr><td>Moratorium tracker; state policy research</td><td>Policy (state level)</td><td>Nov 2026. Local zoning not loaded.</td></tr>''',
'''<tr><td>CAIDA IXP / PeeringDB; moratorium tracker and state policy research</td><td>Fiber; Policy (state level)</td><td>Oct 2026 / Nov 2026. Fiber shows where networks meet, not where fiber runs. Local zoning not loaded.</td></tr>''')
rep('<tr><td>Land</td><td>2.75 acres</td><td>7.25 acres</td><td></td></tr>','')
rep('Tier 0 unserved: 0 MWh in both. The $/tonne figure is <b>my arithmetic from the two output files</b> ($116.4M &divide; 460,122 t); confirm it before quoting. The <b>browser</b> screen uses a different engine that maximizes 10-year profit and shows different numbers (default example: $341M, 227 kg/MWh; cleaner alternative $512M, 148 kg/MWh, from DEMO_SCRIPT). Read the screen live; never mix the two sets in one sentence.',
    'Tier 0 unserved: 0 MWh in both; land 2.75 vs 7.25 acres. The $/tonne figure is <b>derived by this guide</b> from the two files ($116.4M &divide; 460,122 t); confirm before quoting. The <b>browser</b> screen uses a different engine (maximizes 10-year profit) and shows different numbers, for example $341M and 227 kg/MWh, with a cleaner alternative at $512M and 148 kg/MWh (DEMO_SCRIPT). Read the screen live; never mix the two sets in one sentence.')
rep('<li><b>Limits:</b> rule-based dispatch; no startup, ramping, outage or gas-delivery detail; the browser battery plans use a fixed 30 MW; energy grade is a team screen; results are screening comparisons, not forecasts or quotes.</li>',
    '<li><b>Limits:</b> rule-based dispatch; no startup, ramping, outage or gas-delivery detail; browser battery plans fixed at 30 MW; energy grade is a team screen; results are screening comparisons, not quotes.</li>')
rep('<li><b>Differentiation the evidence supports:</b> site screening and a checker-validated 10-year plan in one offline tool, with visible assumptions. <b>No competitor comparison exists in the materials</b> <span class="tag u">UNVERIFIED</span>, so do not claim you are better than existing tools; say what Peak Power does.</li>',
    '<li><b>Differentiation the evidence supports:</b> site screening plus a checker-validated 10-year plan in one offline tool with visible assumptions. <b>No competitor comparison exists in the materials</b> <span class="tag u">UNVERIFIED</span>; say what Peak Power does, not that it beats other tools.</li>')

# script opening: no name placeholder
rep("I'm [name], and with my teammates Aleya, Md Joy, Mridul and Samwel, we built <b>Peak Power</b>.",
    "Our team of four, from business, mechanical engineering, sustainability and AI at Columbia, built <b>Peak Power</b> to answer both.")
open(p,'w',encoding='utf8').write(t)
print('ok')
