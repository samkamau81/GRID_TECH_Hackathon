/* Peak Power business-model ASSUMPTIONS. Every number in this file is a proposal made by the team for discussion.
   None is a market measurement, a quote, a customer commitment or a result: Peak Power has no customers, no revenue and no signed partners yet.
   The Appendix "Business model" tab computes all of its tables and charts from this file, so changing a value here changes everything consistently. */
window.PEAKPOWER_BUSINESS = {
  tiers: [
    { id: 'analyst', name: 'Analyst', segment: 'Individual analysts, independent consultants, students', price: 3600, unit: 'per user per year (about $300 a month)',
      includes: ['1 user, up to 3 saved projects', 'Site screening and single-project simulation', 'Standard methodology and data notes', 'Monthly allowance of simulation runs'],
      gm: 0.80, cac: 1200, churn: 0.30, motion: 'Self-serve sign-up, content and referrals' },
    { id: 'pro', name: 'Professional', segment: 'Development teams and engineering or advisory firms', price: 18000, unit: 'per team per year (up to 5 users)',
      includes: ['Unlimited projects, side-by-side scenario comparison', 'Portfolio view and exportable reports', 'Higher simulation allowance, shared workspaces', 'Email support with response targets'],
      gm: 0.78, cac: 15000, churn: 0.20, motion: 'Inside sales after a free pilot project' },
    { id: 'ent', name: 'Enterprise licence', segment: 'Developers, operators and investors with multi-site portfolios', price: 120000, unit: 'per year (proposed range $75,000 to $250,000)',
      includes: ['Portfolio-level planning and collaboration', 'Advanced simulations and custom data loads', 'API access and integrations, single sign-on', 'Named customer-success contact, onboarding'],
      gm: 0.70, cac: 80000, churn: 0.10, motion: 'Direct sales with a paid pilot' }
  ],
  usage: { shareOfSubscriptions: 0.10, note: 'Assumed to add 10% on top of subscription revenue',
    items: [{ name: 'Extra simulation packs', price: '$500 per 1,000 additional runs' }, { name: 'Specialised analytical reports', price: '$2,500 per report' }, { name: 'API consumption', price: '$1,500 per month for 100,000 calls' }] },
  services: { feasibilityPerProject: 25000, onboardingPerNewEnterprise: 15000,
    items: [{ name: 'Custom feasibility analysis', price: 'About $25,000 per project' }, { name: 'Onboarding and implementation', price: 'About $15,000 per new enterprise customer' }, { name: 'Enterprise data integration', price: 'Quoted per engagement' }] },
  /* paying customers at the END of each year (net of churn); revenue uses the average of the start and end of the year */
  scenarios: {
    conservative: { label: 'Conservative', blurb: 'Slow organic adoption; few enterprise deals.', years: [
      { analyst: 20, pro: 3, ent: 0, projects: 2 }, { analyst: 50, pro: 8, ent: 1, projects: 4 }, { analyst: 100, pro: 15, ent: 3, projects: 6 }] },
    base: { label: 'Base', blurb: 'Steady adoption after successful pilots.', years: [
      { analyst: 40, pro: 6, ent: 1, projects: 3 }, { analyst: 120, pro: 18, ent: 3, projects: 7 }, { analyst: 250, pro: 40, ent: 8, projects: 12 }] },
    ambitious: { label: 'Ambitious', blurb: 'Fast adoption and several enterprise wins; needs funded sales capacity.', years: [
      { analyst: 80, pro: 12, ent: 2, projects: 5 }, { analyst: 250, pro: 40, ent: 7, projects: 12 }, { analyst: 600, pro: 100, ent: 18, projects: 22 }] }
  },
  phases: [
    { name: 'Pilot', when: 'Months 0 to 6', goal: 'Run free or discounted pilots with a small number of design partners.', work: ['Recruit 3 to 5 design partners (none signed today)', 'Run their real site questions through the Prototype', 'Record what they decide differently'], gate: 'Evidence: at least some pilots say the output changed a decision.' },
    { name: 'Validation', when: 'Months 6 to 12', goal: 'Check that the numbers are good enough to pay for.', work: ['Compare grades and plan costs with real utility or engineering studies', 'Test the price points with pilot users', 'Add price, reliability and zoning data where gaps hurt'], gate: 'Evidence: documented accuracy checks and a willingness-to-pay signal.' },
    { name: 'Paid adoption', when: 'Months 12 to 24', goal: 'Convert pilots to paid Analyst and Professional subscriptions.', work: ['Hosted accounts, saved projects and report export', 'Self-serve onboarding and support', 'First usage-based and consulting work'], gate: 'Evidence: paying customers and retention after the first renewal.' },
    { name: 'Enterprise expansion', when: 'Months 24 to 36', goal: 'Sell portfolio-level licences with integrations.', work: ['Collaboration, single sign-on, API', 'Paid pilots that lead to annual licences', 'Customer-success function'], gate: 'Evidence: first multi-year enterprise contracts.' },
    { name: 'Partnerships', when: 'Throughout, once credibility exists', goal: 'Reach customers and data through others (potential partners, none established).', work: ['Engineering and advisory firms that could resell or co-deliver', 'Data providers and utilities for better inputs', 'Cloud marketplaces for procurement'], gate: 'Evidence: a signed pilot or data agreement.' }
  ]
};
