p = 'S:/OneDrive/Desktop/GRID_Hackathon/Claude Code Setup/tests/e2e/demo-readiness.e2e.mjs'
s = open(p, encoding='utf8', newline='').read()
nl = '\r\n' if '\r\n' in s else '\n'
s = s.replace('\r\n', '\n')
a = s.index('  // 2. comparison box on the project plan')
b = s.index('  // 3. How it works page')
s = s[:a] + """  // 2. the Recommended plan / Alternative box is gone; the Project plan still shows its finance and energy tabs and the best opening month
  await p.ev(`document.getElementById('tab-1').click()`);
  ok(await p.waitFor(`/Open at month/.test(document.getElementById('rec').innerText)`, 120000), 'project plan still recommends an opening month');
  ok(await p.ev(`!document.getElementById('alt-box')`), 'no Recommended plan / Alternative box in the page');
  ok(await p.ev(`!/Recommended plan and alternatives|Cleaner alternative|Faster alternative/.test(document.getElementById('v-1').innerText)`), 'no recommended-plan or alternative text on Project plan');
  ok(await p.ev(`[...document.querySelectorAll('#ptabs [data-ptab]')].map(b=>b.textContent).join()==='Finance,Energy'`), 'Project plan sub-tabs are Finance and Energy only');

""" + s[b:]
a = s.index('  // 4. changing an answer updates the comparison')
b = s.index("ok(p.errors.length === 0, 'no JavaScript errors")
s = s[:a] + """  // 4. changing an answer still re-runs the start-month analysis
  await p.ev(`(() => { const s = document.getElementById('s-cap'); s.value = '200'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await sleep(500);
  ok(await p.waitFor(`/Open at month/.test(document.getElementById('rec').innerText)`, 180000), 'start-month recommendation redraws after a carbon limit is set');
""" + s[b:]
s = s.replace("  await p.shotEl('alt-box', '#alt-box', 8).catch(() => {});\n", '')
open(p, 'w', encoding='utf8', newline='').write(s.replace('\n', nl))
print('ok')
