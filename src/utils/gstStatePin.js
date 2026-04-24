const STATE_CODE_TO_NAME = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
};

const STATE_CODE_TO_PIN = {
  '01': 190001,
  '02': 171001,
  '03': 141001,
  '04': 160017,
  '05': 248001,
  '06': 122001,
  '07': 110001,
  '08': 302001,
  '09': 226001,
  '10': 800001,
  '11': 737101,
  '12': 791001,
  '13': 797001,
  '14': 795001,
  '15': 796001,
  '16': 799001,
  '17': 793001,
  '18': 781001,
  '19': 700001,
  '20': 834001,
  '21': 751001,
  '22': 492001,
  '23': 462001,
  '24': 392001,
  '26': 396230,
  '27': 400001,
  '29': 560001,
  '30': 403001,
  '32': 682001,
  '33': 600001,
  '36': 500001,
  '37': 520001,
};

const STATE_NAME_TO_CODE = Object.fromEntries(
  Object.entries(STATE_CODE_TO_NAME).map(([code, name]) => [name.toLowerCase(), code])
);

function normalizePin(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const pin = Math.trunc(n);
  if (pin < 100000 || pin > 999999) return null;
  return pin;
}

function stateCodeFromGstin(gstin) {
  const s = String(gstin || '').trim().toUpperCase();
  if (!/^[0-9A-Z]{15}$/.test(s)) return '';
  return s.slice(0, 2);
}

function stateCodeFromText(...parts) {
  const text = parts
    .filter(Boolean)
    .map((p) => String(p).toLowerCase())
    .join(' ');
  if (!text) return '';
  for (const [name, code] of Object.entries(STATE_NAME_TO_CODE)) {
    if (text.includes(name)) return code;
  }
  return '';
}

export function resolveBuyerStateAndPin({ gstin, placeOfSupply, billingAddress, existingPin } = {}) {
  const pin = normalizePin(existingPin);
  const gstState = stateCodeFromGstin(gstin);
  const textState = stateCodeFromText(placeOfSupply, billingAddress);
  const stateCode = gstState || textState || '24';
  const fallbackPin = STATE_CODE_TO_PIN[stateCode] || 391740;
  return {
    stateCode,
    stateName: STATE_CODE_TO_NAME[stateCode] || placeOfSupply || '',
    pin: pin || fallbackPin,
  };
}

