import { launch, openPage, openMeteoMocks, sleep, BASE } from '../tests/e2e/lib.mjs';
const b = await launch();
try {
  for (const dark of [false, true]) {
    const p = await openPage(b, { url: BASE + 'data-centers.html', width: 1440, height: 1000, dark, mocks: openMeteoMocks() });
    await p.waitFor(`document.getElementById('map-overlay').classList.contains('hidden')`);
    await p.click('#view-us'); await sleep(1500);
    await p.click('#ov-counties'); await p.waitFor(`document.getElementById('ov-counties').getAttribute('aria-pressed')==='true'`, 60000);
    await p.ev(`(window.__maps[0].setView([38.5, -96], 4, {animate:false}),0)`);
    await p.click('#ov-plants'); await sleep(1500);
    await p.ev(`(window.__maps[0].fire('click', { latlng: L.latLng(39.04, -77.49) }), 0)`);
    await p.waitFor(`document.querySelector('#brief .tiles.t5')`, 30000); await sleep(800);
    await p.shotEl('explorer-' + (dark ? 'dark' : 'light'), '#explorer');
    await p.ev(`(document.getElementById('brief').scrollTop = 900, 0)`); await sleep(300);
    await p.shotEl('explorer-' + (dark ? 'dark' : 'light') + '-scrolled', '#explorer');
    await p.close();
  }
} finally { b.close(); }
process.exit(0);
