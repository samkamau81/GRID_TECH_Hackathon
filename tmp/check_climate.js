const W = require('../peak-power/js/climate-weather.js');
const fs = require('fs');
for (const n of ['Ashburn', 'Phoenix', 'Houston', 'Seattle', 'Dallas']) {
  const d = JSON.parse(fs.readFileSync(process.env.TEMP + '/wx_' + n + '.json')).hourly;
  const s = W.summarizeClimate(d.time, d.temperature_2m, d.relative_humidity_2m);
  console.log(n.padEnd(8), 'grade', s.grade, 'CDD', Math.round(s.cdd), 'p95', s.p95, 'p95wb', Math.round(s.p95Wb), 'hot', Math.round(s.hotHours), 'humid', Math.round(s.humidHours), 'free', Math.round(s.free * 100) + '%', '|', s.why.join('; '));
}
