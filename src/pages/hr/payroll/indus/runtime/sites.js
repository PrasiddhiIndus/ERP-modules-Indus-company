/* Site setups reverse-engineered from the September 2026 salary sheets.
   type: E = earning in gross, X = paid separately (own sheet/bank file), D = deduction, C = working figure (not paid).
   pf / esi = included in PF / ESI wages. */
(function (root) {
  const E = (code, label, formula, o = {}) => Object.assign({ code, label, type: 'E', formula }, o);
  const X = (code, label, formula, group, o = {}) => Object.assign({ code, label, type: 'X', formula, group }, o);
  const D = (code, label, formula, o = {}) => Object.assign({ code, label, type: 'D', formula }, o);
  const C = (code, label, formula) => ({ code, label, type: 'C', formula });
  const PF = (formula, label = 'PF Amount') => D('PF', label, formula);
  const ESI = () => D('ESI', 'ESIC @0.75%', 'ESIW*0.0075');
  const PT = (formula) => D('PT', 'Professional Tax', formula || null);
  const LWF = () => D('LWF', 'LWF', null);
  const IN = (code, label) => D(code, label, code, { input: true });
  const PFCAP = 'MIN(15000,PFW)*0.12';

  // AMNS Hazira (Fire / Safety / Marshal) share one structure: fixed monthly basic, rest split 60/20/20
  const amnsHazira = (opts) => [
    E('BASIC_E', 'Basic Earned', 'BASIC/WD*PD', { pf: true, esi: true }),
    C('FOA', 'Fixed Other Allowance', 'RATE-BASIC'),
    E('HRA', 'House Rent Allow.', 'FOA*0.6*PD/WD', { esi: true }),
    E('WASH', 'Washing Allow.', 'FOA*0.2*PD/WD', { pf: true }),
    E('TPA', 'Transportation Allow.', 'FOA*0.2*PD/WD', { pf: true, esi: true }),
    E('OT', 'PH/NH/OT Hrs Amount', 'RATE/WD/HRS*OTH', { esi: true }),
    PF(opts.pf || PFCAP), ESI(), PT(), LWF(),
    IN('ADV', 'Sal. Adv.'), IN('LOAN', 'Loan'), IN('HELD', 'Held'),
    X('TPT_SEP', 'TPT (separate)', 'TPTRATE', 'TPT'),
  ];

  const SITES = [
    {
      id: 'AMNS-FIRE', name: 'Arcelormittal (Fire), Hazira', client: 'ArcelorMittal Nippon Steel India Ltd.', state: 'GJ', oc: '593', code: 684,
      divisor: { type: 'fixed', days: 26 }, rateType: 'M', rounding: 'component', registerSet: 'CLRA',
      params: { BASIC: 13897, HRS: 12, TPTRATE: 1600 },
      components: amnsHazira({}),
      notes: 'TPT ₹1,600 paid on a separate sheet and not reduced for absent days. OT paid per hour at single gross rate (gross ÷ 26 ÷ 12). ESIC wages = Basic + HRA + TPT + OT.',
    },
    {
      id: 'AMNS-SAFETY', name: 'Arcelormittal (Safety), Hazira', client: 'ArcelorMittal Nippon Steel India Ltd.', state: 'GJ', oc: '593', code: 683,
      divisor: { type: 'fixed', days: 26 }, rateType: 'M', rounding: 'component', registerSet: 'CLRA',
      params: { BASIC: 13897, HRS: 8, TPTRATE: 0 }, components: amnsHazira({}),
      notes: 'Same structure as AMNS Fire with an 8-hour shift.',
    },
    {
      id: 'AMNS-SM', name: 'Arcelormittal (Safety Marshal), Hazira', client: 'ArcelorMittal Nippon Steel India Ltd.', state: 'GJ', oc: 'A22/1632', code: 670,
      divisor: { type: 'fixed', days: 26 }, rateType: 'M', rounding: 'component', registerSet: 'CLRA',
      params: { BASIC: 13897, HRS: 8, TPTRATE: 1600 }, components: amnsHazira({}),
      notes: 'PF on Basic + Washing + TPT, capped at ₹15,000.',
    },
    {
      id: 'AMNS-LSM', name: 'Arcelormittal (Lady Safety Marshal), Hazira', client: 'ArcelorMittal Nippon Steel India Ltd.', state: 'GJ', oc: 'A22/1633', code: 669,
      divisor: { type: 'fixed', days: 26 }, rateType: 'M', rounding: 'component', registerSet: 'CLRA',
      params: { BASIC: 13897, HRS: 8, TPTRATE: 0 }, components: amnsHazira({ pf: 'PFW*0.12' }),
      notes: 'Same as Safety Marshal but PF is NOT capped (12% of Basic + Washing + TPT).',
    },
    {
      id: 'AMNS-FM-PUNE', name: 'Arcelormittal (FM), Pune', client: 'ArcelorMittal Nippon Steel India Ltd.', state: 'MH', oc: 'A21/1555', code: 687,
      divisor: { type: 'calendar', weeklyOff: [] }, rateType: 'M', rounding: 'component', registerSet: 'CLRA',
      params: {},
      components: [
        E('BASIC_E', 'Earned Basic', 'BASIC*PD', { pf: true, esi: true }),
        E('HRA', 'House Rent Allow. @5%', 'BASIC_E*0.05', { esi: true }),
        E('LEAVE', 'Leave Wages @6%', '(BASIC_E+HRA)*0.06', { esi: true }),
        E('OTHER', 'Other Allow. (balance)', 'R(RATE/WD*TD)-BASIC_E-HRA-LEAVE', { pf: true, esi: true }),
        E('PH', 'Amount of PH', 'BASIC*NH', { esi: true }),
        PF(PFCAP), ESI(), PT(), LWF(), IN('HELD', 'Held'),
      ],
      notes: 'Divisor = calendar days in month (30 for September). Total duty = paid days + weekly-off worked + OT days.',
    },
    {
      id: 'AMNS-DCPO-PUNE', name: 'Arcelormittal (DCPO), Pune', client: 'ArcelorMittal Nippon Steel India Ltd.', state: 'MH', oc: 'A21/1555', code: 686,
      divisor: { type: 'fixed', days: 26 }, rateType: 'M', rounding: 'component', registerSet: 'CLRA',
      params: {},
      components: [
        E('BASIC_E', 'Earned Basic', 'BASIC*PD', { pf: true }),
        E('HRA', 'House Rent Allow. @5%', 'BASIC_E*0.05'),
        E('LEAVE', 'Leave Wages @6%', 'BASIC_E*0.06'),
        E('OTHER', 'Other Allow. (balance)', 'R(RATE/WD*TD)-BASIC_E-HRA-LEAVE', { pf: true }),
        E('PH', 'PH (double basic)', 'BASIC*2*NH'),
        PF(PFCAP), PT(), IN('ELEC', 'Electricity'), IN('ADV', 'Sal. Adv.'), LWF(), IN('HELD', 'Held'),
      ],
      notes: 'PH paid at double basic per IOM. Sheet keeps PF wage limit fixed at ₹15,000 — engine uses the lower of ₹15,000 and actual PF wages.',
    },
    {
      id: 'BCA', name: 'Baroda Cricket Association, Kotambi', client: 'Baroda Cricket Association', state: 'GJ', oc: 'B05/2207', code: 592,
      divisor: { type: 'fixed', days: 26 }, rateType: 'M', rounding: 'component', registerSet: 'CLRA',
      params: { WASHFIX: 1000, MEDFIX: 1500 },
      components: [
        E('BASIC_E', 'Earned Basic', 'BASIC*PD', { pf: true, esi: true }),
        E('LEAVE', 'Leave Salary @5%', 'BASIC_E*0.05', { esi: true }),
        E('NHPH', 'NH/PH', 'BASIC*PD*0.666666666666667*2/WD', { esi: true }),
        E('BONUS', 'Bonus @8.33%', 'BASIC_E*0.0833', { esi: true }),
        E('WASH', 'Washing Allow.', 'WASHFIX/WD*PD', { esi: true }),
        E('MED', 'Medical Allow.', 'MEDFIX/WD*PD', { esi: true }),
        E('OTHER', 'Other Allow. (balance)', 'R(RATE/WD*TD)-BASIC_E-LEAVE-NHPH-BONUS-WASH-MED', { esi: true }),
        PF('BASIC_E*0.12'), ESI(), PT(), LWF(), IN('HELD', 'Held'),
      ],
      notes: 'Weekly-off OT days added to total duty and paid at gross rate.',
    },
    {
      id: 'BCA-ADDL', name: 'Baroda Cricket Association, Kotambi — Additional Manpower', client: 'Baroda Cricket Association', state: 'GJ', oc: 'B05', code: 593,
      divisor: { type: 'fixed', days: 26 }, rateType: 'M', rounding: 'component', registerSet: 'CLRA',
      params: { WASHFIX: 1000, MEDFIX: 1500, TPTRATE: 3000 },
      components: [
        E('BASIC_E', 'Earned Basic', 'BASIC*PD', { pf: true, esi: true }),
        E('LEAVE', 'Leave Salary @5%', 'BASIC_E*0.05', { esi: true }),
        E('NHPH', 'NH/PH', 'BASIC*PD*0.666666666666667*2/WD', { esi: true }),
        E('BONUS', 'Bonus @8.33%', 'BASIC_E*0.0833', { esi: true }),
        E('WASH', 'Washing Allow.', 'WASHFIX/WD*PD', { esi: true }),
        E('MED', 'Medical Allow.', 'MEDFIX/WD*PD', { esi: true }),
        E('OTHER', 'Other Allow. (balance)', 'R(RATE/WD*TD)-BASIC_E-LEAVE-NHPH-BONUS-WASH-MED', { esi: true }),
        E('ODI_AMT', 'Special Duty ODI Amount', 'RATE/WD*ODI', { esi: true }),
        PF('BASIC_E*0.12'), ESI(), PT(), LWF(), IN('HELD', 'Held'),
        X('TPT_SEP', 'Transportation (separate)', 'TPTRATE/WD*PD', 'TPT'),
      ],
      notes: 'Special-duty (ODI match) days paid at gross day rate. TPT ₹3,000 prorated, separate sheet.',
    },
    {
      id: 'AURO', name: 'Auro Infra Pvt Ltd, Chandrapur', client: 'Auro Infra Private Limited', state: 'MH', oc: '—', code: 579,
      divisor: { type: 'fixed', days: 26 }, rateType: 'M', rounding: 'component', registerSet: 'CODE', labourCode50: true,
      payPeriod: { startDay: 21 },
      params: {},
      components: [
        E('BASIC_E', 'Earned Basic', 'BASIC*PD', { pf: true }),
        E('BONUS', 'Bonus @8.33%', 'BASIC_E*0.0833'),
        E('SPECIAL', 'Special Allow. (balance)', 'R(RATE/WD*TD)-BASIC_E-BONUS'),
        PF(PFCAP), PT(), LWF(), IN('HELD', 'Held'),
      ],
      notes: 'Pay period 21st to 20th. Working days 26 or 27 per employee. New Labour Code 50% test switched on (as in the Auro summary).',
    },
    {
      id: 'ALEMBIC', name: 'Alembic Research Center, Gorwa', client: 'Alembic Pharmaceuticals Ltd.', state: 'GJ', oc: '2328', code: 622,
      divisor: { type: 'fixed', days: 26 }, rateType: 'M', rounding: 'component', registerSet: 'CLRA',
      params: { NHFIX: 510.5 },
      components: [
        E('BASIC_E', 'Earned Basic', 'BASIC*PD', { pf: true }),
        E('LEAVE', 'Leave Salary @5%', 'BASIC_E*0.05'),
        E('BONUS', 'Bonus @8.33%', 'BASIC_E*0.0833'),
        E('NH', 'NH (3)', 'NHFIX/WD*PD'),
        E('OTHER', 'Other Allow. (balance)', 'R(RATE/WD*TD)-BASIC_E-NH-LEAVE-BONUS', { pf: true }),
        PF('PFW*0.12'), PT(), IN('ADV', 'Sal. Adv'), LWF(), IN('HELD', 'Held'),
      ],
      notes: 'PF on Basic + Other Allowance, no ₹15,000 cap.',
    },
    {
      id: 'BALRAMPUR', name: 'Balrampur Chini Mills Ltd, UP', client: 'Balrampur Chini Mills Limited', state: 'UP', oc: '—', code: 600,
      divisor: { type: 'fixed', days: 26 }, rateType: 'M', rounding: 'component', registerSet: 'CLRA',
      params: { HRAP: 0.30 },
      components: [
        E('BASIC_E', 'Earned Basic', 'BASIC*PD', { pf: true }),
        E('LEAVE', 'Leave Salary @5%', 'BASIC_E*0.05'),
        E('HRA', 'HRA (30% DCPO / 10% FM)', 'BASIC_E*HRAP'),
        E('BONUS', 'Bonus @8.33%', 'BASIC_E*0.0833'),
        E('NHPH', 'NH/PH (10)', 'BASIC*PD*10/12*2/WD'),
        E('SPECIAL', 'Special Allow. (balance)', 'R(RATE/WD*PD)-BASIC_E-LEAVE-HRA-BONUS-NHPH', { pf: true }),
        PF(PFCAP), IN('ADV', 'Sal. Adv.'), IN('HELD', 'Held'),
      ],
      designationParams: { FM: { HRAP: 0.10 } },
      notes: 'Uttar Pradesh — no PT or LWF. HRA 30% for DCPO, 10% for Fireman (set by designation).',
    },
    {
      id: 'CHENNAI-PORT', name: 'Chennai Port Authority (O&M)', client: 'Chennai Port Authority', state: 'TN', oc: '2699', code: 685,
      divisor: { type: 'fixed', days: 26 }, rateType: 'D', rounding: 'component', registerSet: 'CLRA',
      params: { VOUCHRATE: 2000 },
      components: [
        E('BASIC_E', 'Earned Basic', 'BASIC*PD', { pf: true }),
        E('OTHER', 'Other Allow. (balance)', 'R(DRATE*PD)-BASIC_E', { pf: true }),
        E('OT', 'OT Amount', 'DRATE*OTD'),
        E('BONUS', 'Bonus @8.33%', 'BASIC_E*0.0833'),
        E('NH', 'NH (3)', 'DRATE*NH'),
        PF(PFCAP), PT('0'), IN('GATEPASS', 'Gate pass Ded.'), IN('PENALTY', 'Penalty'), IN('HELD', 'Held'),
        X('VOUCHER', 'Voucher Allow. (separate)', 'VOUCHRATE/WD*PD', 'VOUCHER'),
      ],
      notes: 'Daily-rate site. OT days paid at full daily gross. PT switched off (not deducted in the sheet; TN half-yearly PT should be reviewed).',
    },
    {
      id: 'AMNS-SM-PORTS', name: 'AMNS Ports Hazira Ltd.', client: 'AMNS Ports Hazira Ltd.', state: 'GJ', oc: '—', code: 677,
      divisor: { type: 'fixed', days: 26 }, rateType: 'M', rounding: 'component', registerSet: 'CLRA',
      params: { WASHFIX: 500, TPTRATE: 1000, HRAP: 0.40 },
      designationParams: { FM: { HRAP: 0.30 } },
      components: [
        E('BASIC_E', 'Earned Basic', 'BASIC*PD', { pf: true, esi: true }),
        E('LEAVE', 'Leave Wages (1 per 20)', 'BASIC/20*PD', { esi: true }),
        E('HRA', 'HRA (40% DCPO / 30% FM)', 'BASIC_E*HRAP', { esi: true }),
        E('WASH', 'Washing Allow.', 'WASHFIX/WD*PD', { esi: true }),
        E('OTHER', 'Other Allow. (balance)', 'R(RATE/WD*PD)-BASIC_E-LEAVE-HRA-WASH', { esi: true }),
        E('NHPH', 'Amount of NH PH', 'BASIC*2*NH', { esi: true }),
        PF('BASIC_E*0.12'), ESI(), PT(), LWF(), IN('HELD', 'Held'),
        X('OT_SEP', 'OT (separate, single gross)', 'RATE/WD*OTD', 'OT'),
        X('TPT_SEP', 'Conveyance (separate)', 'TPTRATE', 'TPT'),
      ],
      notes: 'OT paid on a separate sheet at single gross day rate. Conveyance ₹1,000 fixed.',
    },
    {
      id: 'BIRLA', name: 'Birla Copper, ABPS Keshrol', client: 'Hindalco Industries (Birla Copper)', state: 'GJ', oc: '23—', code: 646,
      divisor: { type: 'fixed', days: 26 }, rateType: 'D', rounding: 'component', registerSet: 'CLRA',
      params: { TPTRATE: 2000 },
      components: [
        E('BASIC_E', 'Basic Earning', 'BASIC*PD', { pf: true }),
        E('LEAVE', 'Leave Wages @5%', 'BASIC_E*0.05'),
        E('RETAIN', 'Retention Allow. (Extra Hrs)', 'BASIC/2*PD'),
        E('OTHER', 'Other Special Allow. (balance)', 'R(DRATE*PD)-BASIC_E-LEAVE-RETAIN'),
        E('OT', 'O.T. Amount', 'DRATE*OTD'),
        E('BONUS', 'Bonus @8.33%', 'BASIC_E*0.0833'),
        E('NH', 'NH (3)', 'DRATE*NH'),
        PF('BASIC_E*0.12'), PT(), LWF(), IN('HELD', 'Held'),
        X('TPT_SEP', 'TPT (separate)', 'TPTRATE/WD*PD', 'TPT'),
      ],
      notes: 'Daily-rate site (₹1,000/day). PF on full basic, no cap.',
    },
    ...['MOXI', 'DABASA', 'KHARKHADI'].map((k, i) => ({
      id: 'BVC-' + k, name: 'Best Value Chem Pvt. Ltd., ' + { MOXI: 'Moxi Plant', DABASA: 'Dabasa, Padra', KHARKHADI: 'Kharkhadi' }[k],
      client: 'Best Value Chem Pvt. Ltd.', state: 'GJ', oc: '631', code: [641, 639, 640][i],
      divisor: { type: 'fixed', days: 26 }, rateType: 'M', rounding: 'component', registerSet: 'CLRA',
      params: { WASHFIX: 500 },
      components: [
        E('BASIC_E', 'Earned Basic', 'BASIC*PD', { pf: true, esi: true }),
        E('HRA', 'House Rent Allow. @40%', 'BASIC_E*0.40', { esi: true }),
        E('LEAVE', 'Leave Wages @5%', 'BASIC_E*0.05', { esi: true }),
        E('WASH', 'Washing Allow.', 'WASHFIX/WD*PD', { esi: true }),
        E('OTHER', 'Other Allow. (balance)', 'R(RATE/WD*PD)-BASIC_E-HRA-LEAVE-WASH', { esi: true }),
        E('OT', 'O.T. Amount (double basic)', 'BASIC*2*OTD', { esi: true }),
        PF('BASIC_E*0.12'), ESI(), PT(), LWF(), IN('HELD', 'Held'),
      ],
      notes: 'OT at double minimum basic per day.',
    })),
    {
      id: 'COROMANDEL', name: 'Coromandel International Ltd., Dahej', client: 'Coromandel International Ltd.', state: 'GJ', oc: '21—', code: 631,
      divisor: { type: 'fixed', days: 26 }, rateType: 'D', rounding: 'component', registerSet: 'CLRA',
      params: {},
      components: [
        E('BASIC_E', 'Earned Basic', 'BASIC*PD', { pf: true }),
        E('HRA', 'House Rent Allow. @40%', 'BASIC_E*0.40'),
        E('LEAVE', 'Leave Wages @5%', 'BASIC_E*0.05'),
        E('OTHER', 'Other Allow. (balance)', 'R(DRATE*PD)-BASIC_E-HRA-LEAVE'),
        E('OT', 'OT Amount (daily: 1× day rate; monthly: 2× basic)', 'IF(DAILY,DRATE*OTD,BASIC*2*OTD)'),
        E('NHPH', 'Amount of NH PH (double basic)', 'BASIC*2*NH'),
        PF('BASIC_E*0.12'), PT(), LWF(), IN('HELD', 'Held'),
      ],
      notes: 'Firemen on daily rate (₹806.60); supervisors on monthly rate — rate type set per employee.',
    },
    {
      id: 'BPCL-BINA', name: 'Bharat Petroleum Corp. Ltd., Bina (Fire & Safety)', client: 'Bharat Petroleum Corporation Ltd.', state: 'MP', oc: '—', code: 608,
      divisor: { type: 'fixed', days: 26 }, rateType: 'M', rounding: 'component', registerSet: 'CLRA',
      params: { INCRATE: 500 },
      components: [
        E('BASIC_E', 'Earned Basic', 'BASIC*PD', { pf: true, esi: true }),
        E('LEAVE', 'Leave Wages @5%', 'BASIC_E*0.05', { esi: true }),
        E('OTHER', 'Other Allow. (balance)', 'R(RATE/WD*PD)-BASIC_E-LEAVE', { esi: true }),
        E('PH', 'PH (double basic)', 'BASIC*2*NH', { esi: true }),
        PF('BASIC_E*0.12'), ESI(), PT('0'),
        IN('ELEC', 'Electricity'), IN('ADV', 'Sal. Adv.'), IN('LOAN', 'Loan'), IN('HELD', 'Held'),
        X('OT_SEP', 'O.T. (separate, double basic)', 'BASIC*2*OTD', 'OT', { esi: true }),
        X('INC_SEP', 'Performance Incentive (separate)', 'INCRATE/WD*PD', 'INCENTIVE'),
      ],
      notes: 'OT paid on a separate sheet but counted in ESIC wages. PT switched off (not deducted in the sheet; MP PT should be reviewed).',
    },
    {
      id: 'BPCL-VADINAR', name: 'Bharat Petroleum Corp. Ltd., Vadinar', client: 'Bharat Petroleum Corporation Ltd.', state: 'GJ', oc: '—', code: 607,
      divisor: { type: 'fixed', days: 26 }, rateType: 'M', rounding: 'component', registerSet: 'CLRA',
      params: { TPTRATE: 500, INCRATE: 0 },
      components: [
        E('BASIC_E', 'Earned Basic', 'BASIC*PD', { pf: true }),
        E('LEAVE', 'Leave Wages @5%', 'BASIC_E*0.05'),
        E('OTHER', 'Earned Other Allow. (balance)', 'R(RATE/WD*PD)-BASIC_E-LEAVE'),
        E('PH', 'PH (double basic)', 'BASIC*2*NH'),
        PF('BASIC_E*0.12'), PT(), IN('ELEC', 'Electricity'), IN('ADV', 'Salary Adv.'), IN('LOAN', 'Loan'), IN('HELD', 'Held'),
        X('OT_SEP', 'O.T. (separate, double basic)', 'BASIC*2*OTD', 'OT'),
        X('TPT_SEP', 'Transportation (separate)', 'TPTRATE/WD*PD', 'TPT'),
        X('INC_SEP', 'Full-duty Incentive (separate)', 'IF(PD>=WD,INCRATE,0)', 'INCENTIVE'),
      ],
      notes: 'TPT and incentive rates vary by designation (set on the employee).',
    },
  ];

  if (typeof module !== 'undefined') module.exports = SITES; else root.SITES = SITES;
})(this);
