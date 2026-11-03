/* Cooling and facility energy model: how outdoor temperature changes a data center's electricity use.

   STATUS: an illustrative engineering estimate. It has NOT been validated against measured data from real facilities, and the
   parameters below are round-number assumptions in the usual range for each technology, not manufacturer data. Treat results as a
   way to compare locations under stated assumptions, not as a forecast of any facility's bills. Every assumption is exposed
   (see ASSUMPTIONS and SYSTEMS) and is shown on the page.

   Structure (all per unit of IT power, hour by hour over a typical year):
     P_total   = P_IT x PUE
     overhead  = P_total - P_IT  (everything that is not IT load)
   and the overhead is split instead of being called "cooling":
     electrical losses  = lossFraction x P_IT          (UPS, transformers, power distribution)
     auxiliary          = auxFraction  x P_IT          (lighting, security, building controls)
     cooling            = scale x ( fixed + Q x (e x econOverhead + (1-e) / COP(driver)) ) x P_IT
   where Q = 1 + lossFraction is the heat to remove per unit of IT power, `driver` is the outdoor dry-bulb or wet-bulb temperature
   the technology depends on, e (0..1) is the share of the heat that "free cooling" can carry at that temperature, and COP of the
   mechanical plant falls as the driver temperature rises. `scale` is chosen so the model reproduces the user's baseline PUE at a
   fixed reference outdoor condition (20 C dry-bulb / 14 C wet-bulb); hotter or colder climates then move PUE up or down from it.

   Not modelled: water use, part-load behaviour, humidity control, altitude/pressure, heat reuse, and any change in IT load over time.
   Pure functions, no dependencies. Temperatures are degrees C. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PeakPowerCooling = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ASSUMPTIONS = {
    lossFraction: 0.06,     // electrical conversion/distribution losses as a share of IT power; they also become heat to remove
    auxFraction: 0.02,      // lighting, security, controls as a share of IT power
    referenceDbC: 20,       // baseline PUE is defined at this outdoor dry-bulb temperature...
    referenceWbC: 14,       // ...and this wet-bulb temperature (a mild day, about 55 % relative humidity)
    defaultBaselinePue: 1.4,
    defaultHoursPerYear: 8760,
    hoursInYear: 8760,
    note: 'Illustrative assumptions in the usual range for each technology; not validated against operating data.'
  };

  /* One entry per cooling technology. copRef is the mechanical plant's coefficient of performance at tRef; it changes by
     `slope` (fraction per degree) as the driver temperature moves away from tRef, bounded by copMin..copMax. Free cooling carries
     everything at or below econFull, nothing at or above econOff, and a linear share in between; it costs econOverhead (fans,
     pumps) per unit of heat moved. `fixed` is always-on fan/pump power as a share of IT power. */
  var SYSTEMS = {
    'air-chiller': { label: 'Air-cooled chillers', driver: 'db', copRef: 3.5, tRef: 25, slope: 0.025, copMin: 1.8, copMax: 6.0, econFull: null, econOff: null, econOverhead: 0, fixed: 0.05,
      note: 'Dry-bulb driven; no free cooling. COP falls about 2.5 % per degree of ambient rise.' },
    'air-chiller-econ': { label: 'Air-cooled chillers + free-cooling economizer', driver: 'db', copRef: 3.5, tRef: 25, slope: 0.025, copMin: 1.8, copMax: 6.0, econFull: 5, econOff: 15, econOverhead: 0.06, fixed: 0.05,
      note: 'Free cooling fully carries the load at or below 5 C dry-bulb and fades out by 15 C.' },
    'water-chiller': { label: 'Water-cooled chillers + cooling towers', driver: 'wb', copRef: 6.0, tRef: 18, slope: 0.03, copMin: 3.0, copMax: 9.0, econFull: null, econOff: null, econOverhead: 0, fixed: 0.04,
      note: 'Wet-bulb driven, so humid climates cost more than dry ones at the same temperature; no economizer. Tower water use is not modelled.' },
    'water-chiller-econ': { label: 'Water-cooled chillers + towers with water-side economizer', driver: 'wb', copRef: 6.0, tRef: 18, slope: 0.03, copMin: 3.0, copMax: 9.0, econFull: 8, econOff: 16, econOverhead: 0.05, fixed: 0.04,
      note: 'Free cooling fully carries the load at or below 8 C wet-bulb and fades out by 16 C.' },
    'free-air-evap': { label: 'Evaporative free-air cooling + mechanical trim', driver: 'wb', copRef: 4.0, tRef: 20, slope: 0.03, copMin: 2.2, copMax: 6.0, econFull: 16, econOff: 22, econOverhead: 0.07, fixed: 0.03,
      note: 'Outside air plus evaporation carries the load up to 16 C wet-bulb, fading out by 22 C; mechanical trim above. Humid heat defeats it. Assumes supply conditions stay inside the ASHRAE recommended envelope.' },
    'liquid-dry': { label: 'Direct-to-chip liquid cooling + dry coolers', driver: 'db', copRef: 4.0, tRef: 30, slope: 0.02, copMin: 2.5, copMax: 7.0, econFull: 28, econOff: 40, econOverhead: 0.05, fixed: 0.03,
      note: 'Warm supply water lets dry coolers carry the load up to 28 C dry-bulb, fading out by 40 C. The least climate-sensitive option here.' }
  };
  var DEFAULT_SYSTEM = 'water-chiller-econ';

  var clamp = function (x, lo, hi) { return Math.min(hi, Math.max(lo, x)); };

  function system(id) {
    var s = SYSTEMS[id];
    if (!s) throw new Error('Unknown cooling system: ' + id);
    return s;
  }

  /* Share of the heat that free cooling carries at driver temperature d (0 for systems without an economizer). */
  function econFraction(sys, d) {
    if (sys.econFull === null) return 0;
    if (d <= sys.econFull) return 1;
    if (d >= sys.econOff) return 0;
    return (sys.econOff - d) / (sys.econOff - sys.econFull);
  }

  /* Coefficient of performance of the mechanical plant at driver temperature d. */
  function cop(sys, d) {
    return clamp(sys.copRef * (1 - sys.slope * (d - sys.tRef)), sys.copMin, sys.copMax);
  }

  /* Cooling electricity per unit of IT power, before calibration, at driver temperature d. */
  function rawCoolingRatio(sys, d, a) {
    var q = 1 + a.lossFraction;                       // heat to remove per unit of IT power
    var e = econFraction(sys, d);
    return sys.fixed + q * (e * sys.econOverhead + (1 - e) / cop(sys, d));
  }

  function resolve(opts) {
    var a = {}; Object.keys(ASSUMPTIONS).forEach(function (k) { a[k] = ASSUMPTIONS[k]; });
    if (opts) Object.keys(opts).forEach(function (k) { if (k in a && typeof opts[k] === 'number') a[k] = opts[k]; });
    return a;
  }

  /* Smallest PUE the model can represent: electrical losses and auxiliary load alone. */
  function minimumPue(opts) { var a = resolve(opts); return 1 + a.lossFraction + a.auxFraction; }

  /* Factor that scales the cooling term so PUE equals `baselinePue` at the reference outdoor condition. */
  function calibrate(systemId, baselinePue, opts) {
    var a = resolve(opts), sys = system(systemId);
    var budget = baselinePue - 1 - a.lossFraction - a.auxFraction;   // what is left for cooling at the reference condition
    if (!(budget > 0)) throw new Error('Baseline PUE ' + baselinePue + ' is below the model minimum of ' + (1 + a.lossFraction + a.auxFraction).toFixed(2) + ' (electrical losses and auxiliary load alone).');
    var d = sys.driver === 'db' ? a.referenceDbC : a.referenceWbC;
    return { scale: budget / rawCoolingRatio(sys, d, a), referenceDriverC: d, referenceCoolingRatio: budget };
  }

  /* Annual result for one location.
       params:  itMW, baselinePue, system, hoursPerYear, offsetC (uniform warming applied to dry-bulb and wet-bulb),
                pricePerMWh (optional, $/MWh), assumptions (optional overrides of ASSUMPTIONS)
       climate: the summarize() result from climate-stats.js (needs hist.db, and hist.wb for wet-bulb systems) */
  function annual(params, climate) {
    var p = params || {};
    var itMW = p.itMW === undefined ? 10 : p.itMW;
    var baselinePue = p.baselinePue === undefined ? ASSUMPTIONS.defaultBaselinePue : p.baselinePue;
    var systemId = p.system || DEFAULT_SYSTEM;
    var hours = p.hoursPerYear === undefined ? ASSUMPTIONS.defaultHoursPerYear : p.hoursPerYear;
    var offset = p.offsetC || 0;
    if (!(itMW > 0)) throw new Error('IT load must be greater than 0 MW');
    if (!(hours > 0 && hours <= 8760)) throw new Error('Operating hours must be between 1 and 8760');
    var a = resolve(p.assumptions), sys = system(systemId);
    var hist = climate && climate.hist;
    var counts = hist && (sys.driver === 'db' ? hist.db : hist.wb);
    if (!counts) throw new Error(sys.driver === 'wb' ? 'This cooling system needs wet-bulb temperature data, which is not available for this location.' : 'Temperature data is not available for this location.');

    var cal = calibrate(systemId, baselinePue, p.assumptions);
    var total = 0, sumRatio = 0, full = 0, partial = 0, mech = 0;
    for (var i = 0; i < counts.length; i++) {
      var h = counts[i];
      if (!h) continue;
      var d = hist.minC + (i + 0.5) * hist.binC + offset;      // bin centre, shifted by the climate scenario
      var e = econFraction(sys, d);
      total += h; sumRatio += h * rawCoolingRatio(sys, d, a);
      if (e >= 0.999) full += h; else if (e > 0) partial += h; else mech += h;
    }
    var meanRaw = sumRatio / total;                            // cooling per unit IT power, uncalibrated, averaged over the year
    var coolingRatio = cal.scale * meanRaw;                     // calibrated cooling energy per unit of IT energy
    var itMWh = itMW * hours;
    var coolingMWh = itMWh * coolingRatio, lossMWh = itMWh * a.lossFraction, auxMWh = itMWh * a.auxFraction;
    var facilityMWh = itMWh + coolingMWh + lossMWh + auxMWh;
    var scaleHours = hours / total;                              // economizer hours expressed per operating year
    var out = {
      kind: 'estimate', validated: false,
      inputs: { itMW: itMW, baselinePue: baselinePue, system: systemId, systemLabel: sys.label, driver: sys.driver, hoursPerYear: hours, offsetC: offset },
      itEnergyMWh: itMWh, coolingEnergyMWh: coolingMWh, electricalLossMWh: lossMWh, auxiliaryEnergyMWh: auxMWh,
      facilityEnergyMWh: facilityMWh, overheadEnergyMWh: facilityMWh - itMWh,
      annualPue: facilityMWh / itMWh,
      coolingToItRatio: coolingRatio,
      // physical model output before the baseline-PUE calibration: cooling kWh per kWh of IT, comparable across systems and
      // independent of the user's baseline PUE. This is what the suitability score uses.
      modelCoolingRatio: meanRaw,
      // how much cooling energy this climate needs relative to the reference condition: below 1 is milder than the reference
      coolingIndex: meanRaw / rawCoolingRatio(sys, cal.referenceDriverC, a),
      economizerHours: { full: Math.round(full * scaleHours), partial: Math.round(partial * scaleHours), mechanical: Math.round(mech * scaleHours) },
      calibration: { scale: cal.scale, referenceDriverC: cal.referenceDriverC }
    };
    if (p.pricePerMWh !== undefined && p.pricePerMWh !== null) {
      out.pricePerMWh = p.pricePerMWh;
      out.annualCostUsd = facilityMWh * p.pricePerMWh;
      out.coolingCostUsd = coolingMWh * p.pricePerMWh;
      out.overheadCostUsd = (facilityMWh - itMWh) * p.pricePerMWh;
    }
    return out;
  }

  return { ASSUMPTIONS: ASSUMPTIONS, SYSTEMS: SYSTEMS, DEFAULT_SYSTEM: DEFAULT_SYSTEM, econFraction: econFraction, cop: cop, rawCoolingRatio: rawCoolingRatio,
           calibrate: calibrate, minimumPue: minimumPue, annual: annual };
});
