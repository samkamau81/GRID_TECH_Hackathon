base = 'S:/OneDrive/Desktop/GRID_Hackathon/Claude Code Setup/peak-power/'
def sub(path, a, b):
    s = open(base + path, encoding='utf8', newline='').read()
    assert a in s, (path, a[:40])
    open(base + path, 'w', encoding='utf8', newline='').write(s.replace(a, b, 1))
sub('appendix.html',
    '<li><b>The alternatives table</b> shows the recommended plan next to a cleaner plan (same opening month, lowest carbon that passes), a faster plan (earliest credible opening) and, when a carbon limit is set, a cheaper plan without that limit. It states the dollars per tonne of CO₂ the limit costs.</li>',
    '<li><b>Comparing options.</b> Changing the carbon limit, deadline, grid delay or land re-runs every opening month, so a team can compare scenarios by changing one input at a time. The Prototype no longer shows a separate recommended-versus-alternative table.</li>')
sub('appendix.html', 'Start-month chart, recommendation, alternatives table', 'Start-month chart and the best-opening recommendation')
sub('js/appendix.js', 'Start-month chart, recommendation, alternatives table', 'Start-month chart and the best-opening recommendation')
sub('js/prototype.js', 'shown next to a cleaner and a faster alternative with what each costs and when it wins.', 'with the neighbouring opening months shown beside it.')
print('ok')
