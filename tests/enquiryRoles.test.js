import { describe, it, expect } from 'vitest';
import { isAssignedToAny, isEnquiryApprover, namesForUser } from '../src/pages/projects/enquiry/enquiryRoles.js';

describe('Enquiry approver roles', () => {
  it('managers, admins (incl. HOD) and super admins approve; executives do not', () => {
    for (const role of ['manager', 'Manager', 'admin', 'hod', 'super_admin', 'super_admin_pro']) {
      expect(isEnquiryApprover({ role })).toBe(true);
    }
    for (const role of ['executive', '', null, 'unknown']) {
      expect(isEnquiryApprover({ role })).toBe(false);
    }
  });
});

describe('Overdue alerts go to the assigned person', () => {
  const options = [
    { value: 'Dhaval Shisode', employee_code: '2859' },
    { value: 'Sreenath K', employee_code: '9347' },
  ];

  it('matches by employee code to the Employee Master name', () => {
    const names = namesForUser({ username: 'dhaval', employee_code: '02859' }, options);
    expect(isAssignedToAny('Dhaval Shisode', names)).toBe(true);
    expect(isAssignedToAny('Sreenath K', names)).toBe(false);
  });

  it('matches by the user name, ignoring case and spacing', () => {
    const names = namesForUser({ username: 'Sreenath  K' }, []);
    expect(isAssignedToAny(' sreenath k ', names)).toBe(true);
  });

  it('never matches a blank assignee', () => {
    const names = namesForUser({ username: '' }, options);
    expect(isAssignedToAny('', names)).toBe(false);
  });
});
