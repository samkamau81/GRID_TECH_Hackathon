# 5-minute demo script (rehearse with the Prototype tab)

Goal: show how customer answers become a recommendation, and how the recommendation trades cost, carbon and speed.
Open `prototype.html` **one minute early** and leave it on the Portfolio tab. The header status line shows
"Testing opening months: n of 8…" and turns to "✓ Ready" when everything is computed. The Project plan and plant
are pre-computed in the background, so "Start the plant" is fast. If you click a step too early, the click is queued
and opens when ready (the status line says so).

| Time | Do | Say |
|---|---|---|
| 0:00 | Portfolio tab, Williamson County project | "A developer picks a site, states what must hold and what they would like." |
| 0:30 | Click **How it works** (header) | "Hard requirements remove plans; preferences rank what is left; business revenue is kept apart from power cost. Energy, finance and carbon assumptions are listed here." Close it. |
| 1:15 | **Open selected project**. Point at the **Recommended plan and alternatives** table | "This is the recommendation: opening month, full-demand month, portfolio, 10-year power cost, kg CO₂/MWh, clean share." |
| 2:00 | Same table, Cleaner alternative column and note | "The cleaner plan costs about $X more for Y kg/MWh less carbon, roughly $Z per tonne. Choose it if the customer has a carbon target or values CO₂ above that price." (Read X, Y, Z from the screen.) |
| 2:45 | Change an answer: **Limits and conditions → Carbon limit → Below 200 kg/MWh** (not 384 or 250: the default plan, 227 kg/MWh, already passes those, so nothing changes) | "New hard requirement. The 227 kg plan is removed; the plan that was the cleaner alternative becomes the recommendation, at $512M instead of $341M." The table drops to one column and says no cleaner plan fits. Point out the profit-best opening moves to month 24 ("you picked 18"). Takes about 10 s to recompute. |
| 3:30 | **Start the plant** (Run the plant tab), then Live Operations. Pick **Grid stress alert** in the event list, or press **Jump there** at the next stress window | "In a stress event imports drop to 60%. Protected load stays local." Then click the response **Move flexible work off-site (lowest cost)** and read the event cost, moved MWh and revenue at risk. With no response chosen the alert shows a small shortfall (26 MWh in our run) charged at $1,000/MWh. Choose a response before you talk over it. |
| 4:30 | Back to the table. A Faster alternative column appears only when an earlier opening works; at the defaults month 18 is already the earliest, so skip this line | "Speed to power has a price too: this opens N months earlier for this cost." |
| 4:50 | Close | "Screening tool on packet data: Texas only, rule-based dispatch, every plan checker-validated." |

## Numbers to know (so answers do not contradict each other)

- On-screen numbers come from the **browser engine** and **384-plan library** and maximize 10-year profit.
  Example default run (Williamson, month 18): recommended 100 MW wind + 75 MW gas, $341M power cost, 227 kg/MWh;
  cleaner alternative 30 MW gas, $512M, 148 kg/MWh (about $436/t). Numbers change with settings; read them live.
- The **Python/packet path** minimizes cost instead: $283.1M, 62.6% clean, 155 kg/MWh (month 20), and the carbon
  alternative $399.5M, 60.6 kg/MWh (`data/Symposium_Packet/outputs/`). Do not quote one set as if it were the other.
- If asked why the cleaner plan costs more: it replaces onsite gas with merchant grid power and contracts, which are
  dearer; the screen shows that cost explicitly.

## Failure plan

- Status line still says "Testing…": wait; do not reload (reloading restarts the computation).
- Browser tab slow: close other tabs; the page needs about 1 GB for its simulation cache.
- Have `output/pdf/Peak_Power_Mock_Judge_Report.pdf` and this table open as notes, not on screen.
