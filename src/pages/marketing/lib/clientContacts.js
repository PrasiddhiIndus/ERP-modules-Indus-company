/** One contact person on a marketing client (name + their phones/emails). */
export function emptyContactPerson() {
  return { name: '', numbers: [''], emails: [''] };
}

export function emptyClientForm() {
  return {
    client_name: '',
    industry: '',
    street_address: '',
    city: '',
    state: '',
    country: 'India',
    zip_code: '',
    contact_persons: [emptyContactPerson()],
  };
}

function text(value) {
  return String(value ?? '').trim();
}

/**
 * Map a Lead Master row onto the Client Master form.
 * Person 1 gets the lead's first contact (name, phone, email). Extra people can be added on the form.
 */
export function leadToClientForm(lead) {
  const person1 = {
    name: text(lead?.contact_person),
    numbers: [text(lead?.telephone) || ''],
    emails: [text(lead?.email) || ''],
  };
  const persons = [person1];
  const person2Name = text(lead?.contact_person_2);
  if (person2Name) {
    persons.push({ name: person2Name, numbers: [''], emails: [''] });
  }

  return {
    client_name: text(lead?.company),
    industry: text(lead?.project) || text(lead?.industry),
    street_address: text(lead?.location),
    city: text(lead?.district),
    state: text(lead?.project_state) || text(lead?.address_state),
    country: 'India',
    zip_code: '',
    contact_persons: persons,
  };
}

const LEAD_PAGE_SIZE = 1000;
const LEAD_CLIENT_COLUMNS =
  'id, company, project, industry, location, district, project_state, address_state, telephone, email, contact_person, contact_person_2';

/** Load every Lead Master company (paged past the 1,000-row default). */
export async function fetchAllLeadCompanies(client) {
  if (!client?.from) return [];
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await client
      .from('marketing_leads')
      .select(LEAD_CLIENT_COLUMNS)
      .order('company', { ascending: true })
      .range(from, from + LEAD_PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < LEAD_PAGE_SIZE) break;
    from += LEAD_PAGE_SIZE;
  }
  return rows.filter((row) => text(row?.company));
}

export function normalizeLeadSearch(value) {
  return String(value || '')
    .replace(/[\u00a0]/g, ' ')
    .trim()
    .toLowerCase();
}

function leadSearchHaystack(lead) {
  return [
    lead?.company,
    lead?.project,
    lead?.industry,
    lead?.district,
    lead?.project_state,
    lead?.location,
  ]
    .map(normalizeLeadSearch)
    .join(' ');
}

function companyWordStartsWith(company, query) {
  return normalizeLeadSearch(company)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .some((word) => word.startsWith(query));
}

/**
 * Filter leads and put company names that start with the typed letters first.
 * Example: typing "c" lists Cadila, Cipla, Cummins before names that only contain C later.
 */
export function rankLeadCompanies(leads, query) {
  const list = Array.isArray(leads) ? leads : [];
  const q = normalizeLeadSearch(query);
  if (!q) {
    return [...list].sort((a, b) =>
      normalizeLeadSearch(a?.company).localeCompare(normalizeLeadSearch(b?.company))
    );
  }

  const scored = [];
  for (const lead of list) {
    const company = normalizeLeadSearch(lead?.company);
    if (company.startsWith(q)) {
      scored.push({ lead, rank: 0, company });
      continue;
    }
    if (companyWordStartsWith(lead?.company, q)) {
      scored.push({ lead, rank: 1, company });
      continue;
    }
    if (company.includes(q)) {
      scored.push({ lead, rank: 2, company });
      continue;
    }
    if (leadSearchHaystack(lead).includes(q)) {
      scored.push({ lead, rank: 3, company });
    }
  }

  scored.sort((a, b) => a.rank - b.rank || a.company.localeCompare(b.company));
  return scored.map((item) => item.lead);
}

function parseJsonValue(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function parseStringList(value) {
  const parsed = parseJsonValue(value);
  if (Array.isArray(parsed)) {
    return parsed.map((item) => String(item ?? '').trim()).filter(Boolean);
  }
  if (typeof parsed === 'string' && parsed.trim()) return [parsed.trim()];
  return [];
}

function normalizePerson(raw) {
  const numbers = Array.isArray(raw?.numbers)
    ? raw.numbers.map((n) => String(n ?? ''))
    : raw?.number
      ? [String(raw.number)]
      : [''];
  const emails = Array.isArray(raw?.emails)
    ? raw.emails.map((e) => String(e ?? ''))
    : raw?.email
      ? [String(raw.email)]
      : [''];
  return {
    name: String(raw?.name ?? '').trim() ? String(raw.name) : '',
    numbers: numbers.length ? numbers : [''],
    emails: emails.length ? emails : [''],
  };
}

function personHasContent(person) {
  return Boolean(
    String(person?.name || '').trim() ||
      (person?.numbers || []).some((n) => String(n || '').trim()) ||
      (person?.emails || []).some((e) => String(e || '').trim())
  );
}

/** Load grouped contacts; fall back to the old single-person + shared lists. */
export function parseContactPersons(client) {
  const stored = parseJsonValue(client?.contact_persons);
  if (Array.isArray(stored) && stored.some(personHasContent)) {
    const persons = stored.map(normalizePerson).filter(personHasContent);
    return persons.length ? persons : [emptyContactPerson()];
  }

  const numbers = parseStringList(client?.contact_numbers);
  if (!numbers.length && client?.contact_number) numbers.push(String(client.contact_number));
  const emails = parseStringList(client?.contact_emails);
  if (!emails.length && client?.contact_email) emails.push(String(client.contact_email));

  return [
    {
      name: client?.primary_contact_person || '',
      numbers: numbers.length ? numbers : [''],
      emails: emails.length ? emails : [''],
    },
  ];
}

/** Flatten for existing columns so enquiry auto-fill and reports keep working. */
export function flattenContactPersons(persons) {
  const filled = (persons || []).map(normalizePerson).filter(personHasContent);
  const numbers = filled.flatMap((p) => p.numbers.map((n) => String(n).trim()).filter(Boolean));
  const emails = filled.flatMap((p) => p.emails.map((e) => String(e).trim()).filter(Boolean));
  const payload = filled.map((p) => ({
    name: String(p.name || '').trim(),
    numbers: p.numbers.map((n) => String(n).trim()).filter(Boolean),
    emails: p.emails.map((e) => String(e).trim()).filter(Boolean),
  }));
  const primaryName = payload.find((p) => p.name)?.name || null;

  return {
    contact_persons: payload,
    primary_contact_person: primaryName,
    contact_numbers: numbers,
    contact_emails: emails,
    contact_number: numbers[0] || null,
    contact_email: emails[0] || null,
  };
}

export function formatPersonsSummary(client) {
  return parseContactPersons(client)
    .filter(personHasContent)
    .map((p) => {
      const nums = (p.numbers || []).map((n) => String(n).trim()).filter(Boolean);
      if (p.name && nums.length) return { name: p.name, numbers: nums, emails: (p.emails || []).filter(Boolean) };
      if (p.name) return { name: p.name, numbers: [], emails: (p.emails || []).filter(Boolean) };
      return { name: '', numbers: nums, emails: (p.emails || []).filter(Boolean) };
    });
}
