'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { js, syntheticClimate } = require('./helpers.js');
const Cooling = js('cooling-model.js');
const A = Cooling.ASSUMPTIONS;

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b} ± ${tol}, got ${a}`);
const IDS = Object.keys(Cooling.SYSTEMS);
// All hours at one outdoor condition, with the driver of `system` placed exactly on the bin centre, so results can be computed by hand.
function exactClimate(system, dbC, wbC) {
  const driverC = Cooling.SYSTEMS[system].driver === 'db' ? dbC : wbC;
  return { hist: { minC: driverC - 0.5, binC: 1, db: [8760], wb: [8760] } };
}
const base = { itMW: 10, baselinePue: 1.4, hoursPerYear: 8760 };

test('assumptions are exposed and the minimum PUE follows from them', () => {
  assert.equal(Cooling.minimumPue(), 1 + A.lossFraction + A.auxFraction);
  near(Cooling.minimumPue(), 1.08, 1e-12);
  assert.ok(IDS.length >= 5, 'several cooling technologies are available');
  IDS.forEach((id) => { const s = Cooling.SYSTEMS[id]; assert.ok(s.label && s.note && (s.driver === 'db' || s.driver === 'wb'), id); });
});

test('free-cooling share: full below, none above, linear between', () => {
  const s = Cooling.SYSTEMS['air-chiller-econ'];            // 5 C .. 15 C
  assert.equal(Cooling.econFraction(s, -10), 1);
  assert.equal(Cooling.econFraction(s, 5), 1);
  assert.equal(Cooling.econFraction(s, 10), 0.5);
  assert.equal(Cooling.econFraction(s, 15), 0);
  assert.equal(Cooling.econFraction(s, 30), 0);
  assert.equal(Cooling.econFraction(Cooling.SYSTEMS['air-chiller'], -30), 0, 'no economizer, no free cooling');
});

test('COP falls as it gets hotter and stays inside its bounds', () => {
  const s = Cooling.SYSTEMS['air-chiller'];
  near(Cooling.cop(s, 25), 3.5, 1e-12, 'reference point');
  assert.ok(Cooling.cop(s, 35) < Cooling.cop(s, 25) && Cooling.cop(s, 25) < Cooling.cop(s, 15));
  assert.equal(Cooling.cop(s, 200), s.copMin);
  assert.equal(Cooling.cop(s, -200), s.copMax);
});

test('hand calculation: air-cooled chiller at 25 C', () => {
  // cooling = fixed + (1 + loss) / COP = 0.05 + 1.06 / 3.5
  near(Cooling.rawCoolingRatio(Cooling.SYSTEMS['air-chiller'], 25, A), 0.05 + 1.06 / 3.5, 1e-12);
});

test('calibration reproduces the baseline PUE at the reference condition, for every system', () => {
  IDS.forEach((id) => {
    [1.15, 1.4, 1.8].forEach((pue) => {
      const r = Cooling.annual({ ...base, system: id, baselinePue: pue }, exactClimate(id, A.referenceDbC, A.referenceWbC));
      near(r.annualPue, pue, 1e-9, `${id} @ ${pue}`);
    });
  });
});

test('energy is conserved: facility = IT + cooling + losses + auxiliary, and PUE = facility / IT', () => {
  const c = syntheticClimate({ mean: 17, annualAmp: 11, dailyAmp: 5, rh: 55 });
  IDS.forEach((id) => {
    const r = Cooling.annual({ ...base, system: id }, c);
    near(r.facilityEnergyMWh, r.itEnergyMWh + r.coolingEnergyMWh + r.electricalLossMWh + r.auxiliaryEnergyMWh, 1e-6, id);
    near(r.annualPue, r.facilityEnergyMWh / r.itEnergyMWh, 1e-12, id);
    near(r.overheadEnergyMWh, r.facilityEnergyMWh - r.itEnergyMWh, 1e-9, id);
    near(r.electricalLossMWh, r.itEnergyMWh * A.lossFraction, 1e-9, id);
    near(r.auxiliaryEnergyMWh, r.itEnergyMWh * A.auxFraction, 1e-9, id);
    const h = r.economizerHours; near(h.full + h.partial + h.mechanical, 8760, 3, 'hours add up');
  });
});

test('energy scales linearly with IT load and with operating hours; PUE does not change', () => {
  const c = syntheticClimate({ mean: 15 });
  const one = Cooling.annual({ ...base }, c), twice = Cooling.annual({ ...base, itMW: 20 }, c), half = Cooling.annual({ ...base, hoursPerYear: 4380 }, c);
  near(twice.facilityEnergyMWh, 2 * one.facilityEnergyMWh, 1e-6);
  near(twice.coolingEnergyMWh, 2 * one.coolingEnergyMWh, 1e-6);
  near(half.facilityEnergyMWh, 0.5 * one.facilityEnergyMWh, 1e-6);
  near(twice.annualPue, one.annualPue, 1e-12);
  near(half.annualPue, one.annualPue, 1e-12);
  near(one.itEnergyMWh, 10 * 8760, 1e-6, '10 MW for a full year');
});

test('cost is energy times price', () => {
  const c = syntheticClimate({ mean: 15 });
  const r = Cooling.annual({ ...base, pricePerMWh: 85 }, c);
  near(r.annualCostUsd, r.facilityEnergyMWh * 85, 1e-6);
  near(r.coolingCostUsd, r.coolingEnergyMWh * 85, 1e-6);
  near(r.overheadCostUsd, (r.facilityEnergyMWh - r.itEnergyMWh) * 85, 1e-6);
  assert.equal(Cooling.annual({ ...base }, c).annualCostUsd, undefined, 'no price, no cost invented');
});

test('hotter climates need more cooling energy (never less) for every system', () => {
  const cold = syntheticClimate({ mean: 6, annualAmp: 12 }), mild = syntheticClimate({ mean: 14, annualAmp: 12 }), hot = syntheticClimate({ mean: 24, annualAmp: 8 });
  IDS.forEach((id) => {
    const e = [cold, mild, hot].map((c) => Cooling.annual({ ...base, system: id }, c).coolingEnergyMWh);
    assert.ok(e[0] <= e[1] + 1e-9 && e[1] <= e[2] + 1e-9, `${id}: ${e.map((x) => x.toFixed(0))}`);
  });
  assert.ok(Cooling.annual({ ...base, system: 'air-chiller' }, hot).coolingEnergyMWh > Cooling.annual({ ...base, system: 'air-chiller' }, cold).coolingEnergyMWh);
});

test('an economizer never costs more than the same plant without one', () => {
  [['air-chiller', 'air-chiller-econ'], ['water-chiller', 'water-chiller-econ']].forEach(([plain, econ]) => {
    [4, 12, 22].forEach((mean) => {
      const c = syntheticClimate({ mean });
      const p = Cooling.annual({ ...base, system: plain }, c), e = Cooling.annual({ ...base, system: econ }, c);
      assert.ok(e.modelCoolingRatio <= p.modelCoolingRatio + 1e-12, `${econ} vs ${plain} at ${mean} C`);
    });
  });
  // in a cold climate the benefit is large; in a very hot one the two converge
  const cold = syntheticClimate({ mean: 4 }), hot = syntheticClimate({ mean: 32, annualAmp: 3 });
  assert.ok(Cooling.annual({ ...base, system: 'air-chiller-econ' }, cold).modelCoolingRatio < 0.8 * Cooling.annual({ ...base, system: 'air-chiller' }, cold).modelCoolingRatio);
  near(Cooling.annual({ ...base, system: 'air-chiller-econ' }, hot).modelCoolingRatio, Cooling.annual({ ...base, system: 'air-chiller' }, hot).modelCoolingRatio, 0.01);
});

test('wet-bulb systems are hurt by humidity, dry-bulb systems are not', () => {
  const dry = syntheticClimate({ mean: 22, annualAmp: 8, rh: 20 }), humid = syntheticClimate({ mean: 22, annualAmp: 8, rh: 85 });
  const wb = (c) => Cooling.annual({ ...base, system: 'free-air-evap' }, c).modelCoolingRatio;
  const db = (c) => Cooling.annual({ ...base, system: 'air-chiller' }, c).modelCoolingRatio;
  assert.ok(wb(humid) > wb(dry), 'evaporative cooling is worse in humid air');
  near(db(humid), db(dry), 1e-12, 'dry-bulb chiller ignores humidity');
});

test('climate scenario offset equals shifting the temperature distribution', () => {
  const c = syntheticClimate({ mean: 14, annualAmp: 10 });
  IDS.forEach((id) => {                          // warming by 3 C is the same as moving every bin centre up by 3 C
    const warmed = Cooling.annual({ ...base, system: id, offsetC: 3 }, c).coolingEnergyMWh;
    const viaHist = Cooling.annual({ ...base, system: id }, { hist: { ...c.hist, minC: c.hist.minC + 3 } }).coolingEnergyMWh;
    near(warmed, viaHist, 1e-6, id);
  });
  IDS.forEach((id) => assert.ok(Cooling.annual({ ...base, system: id, offsetC: 3 }, c).coolingEnergyMWh >= Cooling.annual({ ...base, system: id }, c).coolingEnergyMWh - 1e-9, id));
});

test('liquid cooling with dry coolers is the least climate-sensitive option', () => {
  const cold = syntheticClimate({ mean: 6 }), hot = syntheticClimate({ mean: 21, annualAmp: 8 });
  const spread = (id) => Cooling.annual({ ...base, system: id }, hot).modelCoolingRatio - Cooling.annual({ ...base, system: id }, cold).modelCoolingRatio;
  IDS.filter((id) => id !== 'liquid-dry').forEach((id) => assert.ok(spread('liquid-dry') <= spread(id) + 1e-9, id));
});

test('invalid input fails loudly with a useful message', () => {
  const c = syntheticClimate({ mean: 15 });
  assert.throws(() => Cooling.annual({ ...base, baselinePue: 1.05 }, c), /below the model minimum/);
  assert.throws(() => Cooling.annual({ ...base, itMW: 0 }, c), /greater than 0/);
  assert.throws(() => Cooling.annual({ ...base, hoursPerYear: 0 }, c), /between 1 and 8760/);
  assert.throws(() => Cooling.annual({ ...base, hoursPerYear: 9000 }, c), /between 1 and 8760/);
  assert.throws(() => Cooling.annual({ ...base, system: 'nope' }, c), /Unknown cooling system/);
  const noWb = { hist: { ...c.hist, wb: null } };
  assert.throws(() => Cooling.annual({ ...base, system: 'water-chiller' }, noWb), /wet-bulb/);
  assert.doesNotThrow(() => Cooling.annual({ ...base, system: 'air-chiller' }, noWb), 'dry-bulb systems do not need wet-bulb data');
  assert.throws(() => Cooling.annual({ ...base }, {}), /not available/);
});

test('results are labelled as unvalidated estimates', () => {
  const r = Cooling.annual({ ...base }, syntheticClimate({ mean: 15 }));
  assert.equal(r.kind, 'estimate');
  assert.equal(r.validated, false);
});
