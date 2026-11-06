p='guide.html'
t=open(p,encoding='utf8').read()
def rep(a,b):
    global t
    assert a in t, a[:60]
    t=t.replace(a,b)
rep(' Then we test a plan against it hour by hour. If the plan can\'t keep the lights on, or can\'t meet a requirement, it\'s thrown out. What\'s left is ranked by what the customer cares about."',
    ' We test each plan hour by hour. If it can\'t keep the lights on or meet a requirement, it\'s thrown out. What\'s left is ranked by what the customer cares about."')
rep(' Read the screen live; never mix the two sets in one sentence.</p>','</p>')
rep('<b>No competitor comparison exists in the materials</b> <span class="tag u">UNVERIFIED</span>; say what Peak Power does, not that it beats other tools.',
    '<b>No competitor comparison exists in the materials</b> <span class="tag u">UNVERIFIED</span>; do not claim it beats other tools.')
rep('<li><b>Limits:</b> rule-based dispatch; no startup, ramping, outage or gas-delivery detail; browser battery plans fixed at 30 MW; energy grade is a team screen; results are screening comparisons, not quotes.</li>',
    '<li><b>Limits:</b> rule-based dispatch; no startup, ramping, outage or gas-delivery detail; battery plans fixed at 30 MW in the browser; results are screening comparisons, not quotes.</li>')
open(p,'w',encoding='utf8').write(t)
print('ok')
