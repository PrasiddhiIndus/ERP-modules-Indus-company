/**
 * Salary subject routing.
 * Employee Master CTC uses the bare employee_master_id ("123").
 * Site employees (public.people) use a prefixed key ("people:123") so they never
 * collide with an office employee of the same numeric id — in the DB or in
 * browser caches keyed by id.
 */

export const PEOPLE_SALARY_PREFIX = "people:";

const EMPLOYEE_TABLES = Object.freeze({
  structures: "admin_salary_structures",
  structure_revisions: "admin_salary_structure_revisions",
  person_components: "admin_salary_person_components",
  person_component_history: "admin_salary_person_component_history",
});

const PEOPLE_TABLES = Object.freeze({
  structures: "people_salary_structures",
  structure_revisions: "people_salary_structure_revisions",
  person_components: "people_salary_person_components",
  person_component_history: "people_salary_person_component_history",
});

export function peopleSalaryKey(personId) {
  return `${PEOPLE_SALARY_PREFIX}${personId}`;
}

export function isPeopleSalaryKey(key) {
  return String(key ?? "").startsWith(PEOPLE_SALARY_PREFIX);
}

/**
 * @returns {{ kind: "employee"|"person", id: number, keyColumn: string, tables: typeof EMPLOYEE_TABLES, uiKey: string } | null}
 */
export function resolveSalarySubject(key) {
  if (isPeopleSalaryKey(key)) {
    const id = Number(String(key).slice(PEOPLE_SALARY_PREFIX.length));
    if (!Number.isFinite(id) || id <= 0) return null;
    return { kind: "person", id, keyColumn: "person_id", tables: PEOPLE_TABLES, uiKey: peopleSalaryKey(id) };
  }
  const id = Number(key);
  if (!Number.isFinite(id)) return null;
  return { kind: "employee", id, keyColumn: "employee_master_id", tables: EMPLOYEE_TABLES, uiKey: String(id) };
}

/** DB row → row carrying the UI key under employee_master_id (shape the CTC UI expects). */
export function withUiKey(row, subject) {
  if (!row || !subject || subject.kind === "employee") return row;
  const { [subject.keyColumn]: _key, ...rest } = row;
  return { ...rest, employee_master_id: subject.uiKey };
}

/** Write columns → replace employee_master_id with the subject's key column. */
export function withDbKey(cols, subject) {
  if (!cols || !subject || subject.kind === "employee") return cols;
  const { employee_master_id: _ui, ...rest } = cols;
  return { ...rest, [subject.keyColumn]: subject.id };
}
