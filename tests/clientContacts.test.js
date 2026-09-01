import { describe, it, expect } from 'vitest';
import {
  emptyContactPerson,
  parseContactPersons,
  flattenContactPersons,
  formatPersonsSummary,
  leadToClientForm,
} from '../src/pages/marketing/lib/clientContacts';

describe('clientContacts', () => {
  it('loads legacy single person + shared number lists', () => {
    const persons = parseContactPersons({
      primary_contact_person: 'Rahul Sharma',
      contact_numbers: JSON.stringify(['9876543210', '02212345678']),
      contact_emails: JSON.stringify(['rahul@acme.com']),
    });
    expect(persons).toHaveLength(1);
    expect(persons[0].name).toBe('Rahul Sharma');
    expect(persons[0].numbers).toEqual(['9876543210', '02212345678']);
    expect(persons[0].emails).toEqual(['rahul@acme.com']);
  });

  it('keeps each person with their own numbers when grouped', () => {
    const flat = flattenContactPersons([
      { name: 'Rahul', numbers: ['111', '222'], emails: ['r@a.com'] },
      { name: 'Priya', numbers: ['333'], emails: [''] },
      emptyContactPerson(),
    ]);
    expect(flat.primary_contact_person).toBe('Rahul');
    expect(flat.contact_numbers).toEqual(['111', '222', '333']);
    expect(flat.contact_email).toBe('r@a.com');
    expect(flat.contact_persons).toEqual([
      { name: 'Rahul', numbers: ['111', '222'], emails: ['r@a.com'] },
      { name: 'Priya', numbers: ['333'], emails: [] },
    ]);
  });

  it('summarizes grouped people for the list', () => {
    const summary = formatPersonsSummary({
      contact_persons: JSON.stringify([
        { name: 'Rahul', numbers: ['111'], emails: [] },
        { name: 'Priya', numbers: ['333'], emails: ['p@a.com'] },
      ]),
    });
    expect(summary.map((p) => p.name)).toEqual(['Rahul', 'Priya']);
    expect(summary[1].emails).toEqual(['p@a.com']);
  });

  it('fills client form from a lead, with person 1 name, email, and phone', () => {
    const form = leadToClientForm({
      company: 'ITC Hotels Ltd',
      project: 'New hotel, Bengaluru',
      industry: 'Hospitality',
      location: 'Whitefield',
      district: 'Bengaluru Urban',
      project_state: 'Karnataka',
      telephone: '08012345678',
      email: 'sanjay@itc.example',
      contact_person: 'Mr. Sanjay',
      contact_person_2: 'Ms. Priya',
    });
    expect(form.client_name).toBe('ITC Hotels Ltd');
    expect(form.industry).toBe('New hotel, Bengaluru');
    expect(form.city).toBe('Bengaluru Urban');
    expect(form.state).toBe('Karnataka');
    expect(form.street_address).toBe('Whitefield');
    expect(form.contact_persons[0]).toEqual({
      name: 'Mr. Sanjay',
      numbers: ['08012345678'],
      emails: ['sanjay@itc.example'],
    });
    expect(form.contact_persons[1].name).toBe('Ms. Priya');
  });
});
