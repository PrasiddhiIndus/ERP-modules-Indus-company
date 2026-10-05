import React from 'react';
import { Send, UsersRound } from 'lucide-react';
import { CollapsibleHelp, PageTaskHeader } from '../../adminOperations/components/AdminUi';
import EmployeePicker from './EmployeePicker';
import { useInHouseOutreach } from './InHouseOutreachContext';

export default function InHouseEmployees() {
  const {
    employees,
    employeeStats,
    selectedEmployeeIds,
    setSelectedEmployeeIds,
    openCompose,
    openGroupEditor,
  } = useInHouseOutreach();

  const hiddenCount =
    (employeeStats?.missingEmail || 0) +
    (employeeStats?.invalidEmail || 0) +
    (employeeStats?.duplicateEmail || 0) +
    (employeeStats?.inactive || 0) +
    (employeeStats?.left || 0) +
    (employeeStats?.notEmployee || 0);

  return (
    <div className="space-y-4">
      <PageTaskHeader
        title="Employees"
        subtitle="Pick employees to mail directly, or save them as a reusable group"
      >
        <button
          type="button"
          className="erp-btn-secondary h-8 px-3 text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
          disabled={selectedEmployeeIds.size === 0}
          onClick={() => openGroupEditor(null, [...selectedEmployeeIds])}
        >
          <UsersRound className="w-3.5 h-3.5" />
          Save as group
        </button>
        <button
          type="button"
          className="erp-btn-primary h-8 px-3 text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
          disabled={selectedEmployeeIds.size === 0}
          onClick={() => openCompose([])}
        >
          <Send className="w-3.5 h-3.5" />
          Compose mail{selectedEmployeeIds.size ? ` (${selectedEmployeeIds.size})` : ''}
        </button>
      </PageTaskHeader>

      <div className="bg-surface rounded-card shadow-card border border-border p-4">
        <EmployeePicker
          employees={employees}
          selectedIds={selectedEmployeeIds}
          onChange={setSelectedEmployeeIds}
          emptyText={employees.length ? 'No employees match your search.' : 'No employees with an email address yet.'}
        />
        {hiddenCount > 0 ? (
          <CollapsibleHelp label={`why ${hiddenCount} people are not listed`}>
            Only active employees (Active in Employee Master, not left, login enabled) with a valid, unique
            email address can receive mail.
            {employeeStats?.inactive ? ` ${employeeStats.inactive} are inactive.` : ''}
            {employeeStats?.left ? ` ${employeeStats.left} have left the company.` : ''}
            {employeeStats?.notEmployee ? ` ${employeeStats.notEmployee} logins are not linked to an employee record.` : ''}
            {employeeStats?.missingEmail ? ` ${employeeStats.missingEmail} have no email.` : ''}
            {employeeStats?.invalidEmail ? ` ${employeeStats.invalidEmail} have an invalid email.` : ''}
            {employeeStats?.duplicateEmail ? ` ${employeeStats.duplicateEmail} share an email with another employee (listed once).` : ''}
            {' '}Update status in Employee Master and emails in User Management.
          </CollapsibleHelp>
        ) : null}
      </div>
    </div>
  );
}
