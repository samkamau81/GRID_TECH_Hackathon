import sys
p = sys.argv[1]
s = open(p, encoding='utf8', newline='').read()
crlf = '\r\n' in s
s = s.replace('\r\n', '\n')
a = s.index('  <!-- Section 1: Hero -->')
b = s.index('  <!-- Section 3: Meet the creators -->')
hero = open(sys.argv[2], encoding='utf8').read()
s = s[:a] + hero + s[b:]
s = s.replace("Created for the GridTech Hackathon, Columbia University Energy Symposium. The campus, offers and scenarios are fictional benchmark assumptions.", "Created for the GridTech Hackathon, Columbia University Energy Symposium. Results are screening estimates built from benchmark assumptions.")
s = s.replace('<link rel="stylesheet" href="css/theme.css">', '<link rel="stylesheet" href="css/theme.css">\n<link rel="stylesheet" href="css/chatbot.css">', 1)
s = s.replace('<script src="js/landing.js"></script>', '<script src="js/landing.js"></script>\n<script src="js/chatbot.js" defer></script>', 1)
s = s.replace('content="Peak Power is an interactive simulator for planning and operating the power supply of a data-center campus."', 'content="Peak Power is a data center planning and operations simulation platform: screen sites, simulate power decisions and compare cost, energy and reliability trade-offs."')
if crlf:
    s = s.replace('\n', '\r\n')
open(p, 'w', encoding='utf8', newline='').write(s)
print('ok')
