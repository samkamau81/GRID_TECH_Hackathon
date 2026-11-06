import { launch, openPage, openMeteoMocks, sleep, BASE } from '../tests/e2e/lib.mjs';
const b = await launch();
try {
  for (const dark of [false, true]) {
    const p = await openPage(b, { url: BASE + 'data-centers.html', width: 1440, height: 1000, dark, mocks: openMeteoMocks() });
    await p.waitFor(`document.getElementById('map-overlay').classList.contains('hidden')`);
    await p.ev(`(window.__maps[0].fire('click', { latlng: L.latLng(39.04, -77.49) }), 0)`);
    await p.waitFor(`document.querySelector('#brief .tiles.t5')`, 30000); await sleep(800);
    await p.ev(`(() => { const e = document.getElementById('brief'); e.style.cssText = 'position:static;max-height:none;width:420px;overflow:visible'; document.getElementById('map-stage').style.display = 'block'; })()`);
    await sleep(300);
    await p.shotEl('brief-full-' + (dark ? 'dark' : 'light'), '#brief');
    await p.close();
  }
} finally { b.close(); }
process.exit(0);
