import re
p='guide.html'
t=open(p,encoding='utf8').read()

def between(a,b,new):
    global t
    i=t.index(a); j=t.index(b)
    t=t[:i]+new+t[j:]

# ---------- CSS ----------
t=t.replace('body{font:10pt/1.42','body{font:9.6pt/1.38')
t=t.replace('table{border-collapse:collapse;width:100%;margin:4pt 0 8pt;font-size:8.6pt;line-height:1.32}','table{border-collapse:collapse;width:100%;margin:4pt 0 7pt;font-size:8.3pt;line-height:1.3}')
t=t.replace('font-size:10.4pt;line-height:1.5}','font-size:9.9pt;line-height:1.46}')
t=t.replace('.tag{display:inline-block;font-size:7pt;font-weight:700;border-radius:3pt;padding:0.5pt 4pt;margin-right:3pt;vertical-align:1pt;color:#fff;white-space:nowrap}',
            '.tag{display:inline-block;font-size:6.8pt;font-weight:700;border-radius:0;padding:0.5pt 4pt;margin:0 3pt 0 1pt;vertical-align:1pt;color:#fff;white-space:nowrap;line-height:1.3}')
t=t.replace('ul,ol{margin:0 0 6pt;padding-left:16pt}','ul,ol{margin:0 0 5pt;padding-left:16pt}ul{list-style:none;padding-left:13pt}ul>li{position:relative}ul>li::before{content:"\\2022";position:absolute;left:-11pt;color:#0d3b5c}')
t=t.replace('.cheat{font-size:9.3pt;line-height:1.36}','.cheat{font-size:9pt;line-height:1.34}')
t=t.replace('.cheat ul,.cheat ol{margin-bottom:3pt}','.cheat ul,.cheat ol{margin-bottom:3pt}.cheat ul{padding-left:12pt}')

# ---------- FRONT (2 pages) ----------
front=open('front.html',encoding='utf8').read()
between('<!-- ============ FRONT','<!-- ============ PAGE 1: PROBLEM',front)

for a,b in [('Page 1</p><h2>The problem','Section 1</p><h2>The problem'),
            ('Page 2</p><h2>Our solution','Section 2</p><h2>Our solution'),
            ('Page 3</p><h2>How the prototype','Section 3</p><h2>How the prototype'),
            ('Page 4</p><h2>Why Peak','Section 4</p><h2>Why Peak'),
            ('Page 5</p><h2>Technical','Section 5</p><h2>Technical'),
            ('Page 6</p><h2>Full presentation','Section 6</p><h2>Full presentation'),
            ('Pages 7&ndash;8</p><h2>Investor and judge','Section 7</p><h2>Investor and judge'),
            ('Page 9 · Read five','Section 8 · Read five')]:
    assert a in t,a
    t=t.replace(a,b)

# ---------- SOLUTION trims ----------
t=t.replace('<p><b>Why this is useful:</b> every grade and plan comes with its reason and source, and missing data is shown as "Not graded" or "Data needed" instead of guessed. A developer can see <i>why</i> a result moved.</p>',
 '<p><b>Why it is useful:</b> every grade and plan shows its reason, and missing data is shown as "Not graded" instead of guessed.</p>')
t=t.replace('<li><b>Audience:</b> a data-center developer, and the advisers and finance teams around them. <span class="tag a">ASSUMPTION</span> The files name "a data-center developer" as the customer; no real customer has been interviewed <span class="tag u">UNVERIFIED</span>.</li>',
 '<li><b>Audience:</b> a data-center developer and the advisers around them <span class="tag a">ASSUMPTION</span>. The files name the developer as the customer; no real customer has been interviewed <span class="tag u">UNVERIFIED</span>.</li>')

# ---------- DEMO section rewrite ----------
demo=open('demo.html',encoding='utf8').read()
between('<!-- ============ PAGE 3: PROTOTYPE','<!-- ============ PAGE 4: INVESTORS',demo)

# ---------- TECHNICAL trims ----------
old='''<tr><td>FEMA National Risk Index</td><td>Hazard</td><td>Dec 2025. Missing for 9 counties (all 8 Connecticut, 1 Alaska).</td></tr>
<tr><td>WRI Aqueduct 4.0</td><td>Water stress</td><td>No value for 62 counties.</td></tr>
<tr><td>CAIDA IXP / PeeringDB</td><td>Fiber (facility distance)</td><td>Oct 2026. Shows where networks meet, not where fiber runs.</td></tr>'''
assert old in t
t=t.replace(old,'''<tr><td>FEMA National Risk Index; WRI Aqueduct 4.0</td><td>Hazard; water stress</td><td>Dec 2025 / baseline. Hazard missing for 9 counties; water missing for 62.</td></tr>
<tr><td>CAIDA IXP / PeeringDB</td><td>Fiber (facility distance)</td><td>Oct 2026. Shows where networks meet, not where fiber runs.</td></tr>''')
t=t.replace('<p class="small">County source files are <b>not</b> in the repository, so the county join cannot be re-run from source here (DATA_GAPS.md).</p>\n','')
t=t.replace('Alaska (29) and Connecticut (8) use older geometry. Weather is point-based, current only.','Alaska (29) and Connecticut (8) use older geometry. County source files are not in the repository. Weather is point-based, current only.')

# ---------- Accuracy fixes ----------
t=t.replace('"Nine variables. Energy counts double because power is the binding constraint."','"Nine variables; energy counts double, policy one and a half times."')
old='Under the V2 rules a 4-hour battery up to 53 MW may charge from any source, but only charging from clean supply earns clean credit.'
assert old in t
t=t.replace(old,'Under the V2 rules a 4-hour battery up to 53 MW may charge from any source, and its clean credit is proportional to how clean that charging was, so grid-charged energy earns none.')

# ---------- Script header/timing ----------
t=t.replace('Full presentation script (about 4 minutes 40 seconds)','Full presentation script (about 4&frac12; minutes)')
old='This script is about 640 words (around 4:40 at a normal pace). If you run long, cut section 3 and the first sentence of section 6. Rehearse with a timer.'
assert old in t
t=t.replace(old,'The script is about 465 spoken words: roughly 3 min 20 s of talking at 140 words a minute, plus about a minute of clicking and pauses in the demo. If you run long, cut section 3 and the first sentence of section 6. Time yourself.')
t=t.replace('Total words are about 640; speak at roughly 140 words a minute.','Speak at roughly 140 words a minute.')
open(p,'w',encoding='utf8').write(t)
print('ok')
