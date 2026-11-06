import re
base = 'S:/OneDrive/Desktop/GRID_Hackathon/Claude Code Setup/peak-power/'
def rw(path, fn):
    s = open(base + path, encoding='utf8', newline='').read()
    t = fn(s)
    assert t != s, path
    open(base + path, 'w', encoding='utf8', newline='').write(t)

def js(s):
    a = s.index('const ALTC=new Map();')
    end_marker = 'ALTC.set(key,html);box.innerHTML=html;},30);}'
    b = s.index(end_marker) + len(end_marker)
    s = s[:a] + s[b:]
    # drop the stray blank line pair left behind
    s = s.replace("const ab=$('alt-box');if(ab)ab.hidden=true;", "", 1)
    assert 'drawSummary(c);drawAlt(c);drawGate(c);' in s
    s = s.replace('drawSummary(c);drawAlt(c);drawGate(c);', 'drawSummary(c);drawGate(c);', 1)
    return s
rw('js/prototype.js', js)

def html(s):
    t = re.sub(r'[ \t]*<div class="box" id="alt-box" hidden></div>\r?\n', '', s, count=1)
    return t
rw('prototype.html', html)

def css(s):
    out = []
    for ln in s.split('\n'):
        if ln.startswith('#alt-box ') or ln.startswith('.tbl.alt ') or ln.startswith('.altnote{'):
            continue
        out.append(ln)
    return '\n'.join(out)
rw('css/prototype.css', css)
print('done')
