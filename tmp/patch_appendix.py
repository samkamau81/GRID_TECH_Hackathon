base = 'S:/OneDrive/Desktop/GRID_Hackathon/Claude Code Setup/'
p = base + 'peak-power/appendix.html'
s = open(p, encoding='utf8', newline='').read()
crlf = '\r\n' in s
s = s.replace('\r\n', '\n')
biz = open(base + 'tmp/business_section.html', encoding='utf8').read()
hw = open(base + 'tmp/hardware_section.html', encoding='utf8').read()
hw = hw.replace('Today\'s datasets total about 3 MB of data files.', 'The shipped data files are a few megabytes.').replace('about 205 MB of JavaScript memory after load', 'roughly 200 to 250 MB of JavaScript memory after load')

def rep(a, b):
    global s
    assert a in s, a[:60]
    s = s.replace(a, b, 1)

rep('''    <button role="tab" id="t-limits" aria-controls="s-limits" aria-selected="false" data-sec="limits" tabindex="-1"><span class="k">D</span>Limitations and next steps</button>''',
    '''    <button role="tab" id="t-business" aria-controls="s-business" aria-selected="false" data-sec="business" tabindex="-1"><span class="k">D</span>Business model</button>
    <button role="tab" id="t-limits" aria-controls="s-limits" aria-selected="false" data-sec="limits" tabindex="-1"><span class="k">E</span>Limitations, roadmap and hardware</button>''')
rep('  <!-- ============ D. LIMITS ============ -->', biz + '  <!-- ============ E. LIMITS, ROADMAP, HARDWARE ============ -->')
# hardware card goes at the end of the limits section
marker = '''    </div>
  </section>

  <footer class="afoot">'''
rep(marker, '''    </div>
''' + hw + '''  </section>

  <footer class="afoot">''')
rep('<h2>Areas for additional research and future improvements</h2>', '<h2>Areas for additional research and data improvements</h2>')
rep('<link rel="stylesheet" href="css/theme.css">', '<link rel="stylesheet" href="css/theme.css">\n<link rel="stylesheet" href="css/chatbot.css">')
rep('<script src="js/appendix.js"></script>', '<script src="js/appendix.js"></script>\n<script src="js/chatbot.js" defer></script>')
if crlf:
    s = s.replace('\n', '\r\n')
open(p, 'w', encoding='utf8', newline='').write(s)
print('ok')
