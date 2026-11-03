import { describe, expect, it } from 'vitest';
import {
  aggregateSurveyResponses,
  formatAnswer,
  normalizeSurveyInput,
  summarizeAssignments,
  surveyKindLabel,
  todayIsoIst,
  validateSurvey,
} from '../shared/surveyModel.mjs';

const today = '2026-11-03';

describe('normalizeSurveyInput', () => {
  it('cleans questions, dedupes options and ids, and drops codes for "all" audience', () => {
    const s = normalizeSurveyInput({
      title: '  Pulse  ',
      kind: 'bogus',
      audience_type: 'all',
      audience_employee_codes: ['A1'],
      questions: [
        { id: 'q1', type: 'single_choice', label: ' Mood ', options: ['Good', 'good', '', 'Bad'] },
        { id: 'q1', type: 'rating', label: 'Score', required: 1 },
        { type: 'nope', label: 'Free' },
      ],
    });
    expect(s.title).toBe('Pulse');
    expect(s.kind).toBe('pulse');
    expect(s.audience_employee_codes).toEqual([]);
    expect(s.questions[0].options).toEqual(['Good', 'Bad']);
    expect(s.questions[1].id).not.toBe('q1');
    expect(s.questions[1].required).toBe(true);
    expect(s.questions[2].type).toBe('short_text');
  });

  it('keeps unique selected employee codes (case-insensitive)', () => {
    const s = normalizeSurveyInput({ audience_type: 'selected', audience_employee_codes: ['v-001', 'V-001', ' V-002 '] });
    expect(s.audience_employee_codes).toEqual(['v-001', 'V-002']);
  });
});

describe('validateSurvey', () => {
  const base = () =>
    normalizeSurveyInput({ title: 'T', questions: [{ id: 'a', type: 'rating', label: 'Rate' }] });

  it('accepts a minimal survey', () => {
    expect(validateSurvey(base(), { today })).toEqual({});
  });

  it('requires custom text when kind is Other', () => {
    const other = normalizeSurveyInput({
      title: 'T',
      kind: 'other',
      kind_other: '',
      questions: [{ id: 'a', type: 'rating', label: 'Rate' }],
    });
    expect(other.kind).toBe('other');
    expect(other.kind_other).toBeNull();
    expect(validateSurvey(other, { today }).kind_other).toMatch(/kind/i);
    const named = normalizeSurveyInput({
      title: 'T',
      kind: 'other',
      kind_other: '  Onboarding  ',
      questions: [{ id: 'a', type: 'rating', label: 'Rate' }],
    });
    expect(named.kind_other).toBe('Onboarding');
    expect(validateSurvey(named, { today })).toEqual({});
    expect(surveyKindLabel(named)).toBe('Onboarding');
    expect(normalizeSurveyInput({ ...named, kind: 'pulse' }).kind_other).toBeNull();
  });

  it('requires a question, choice options, selected employees and a future due date', () => {
    expect(validateSurvey({ ...base(), questions: [] }, { today }).questions).toBeTruthy();
    const choice = normalizeSurveyInput({ title: 'T', questions: [{ type: 'multi_choice', label: 'Pick', options: ['x'] }] });
    expect(validateSurvey(choice, { today }).question_0).toMatch(/two options/);
    expect(validateSurvey({ ...base(), audience_type: 'selected', audience_employee_codes: [] }, { today }).audience).toBeTruthy();
    expect(validateSurvey({ ...base(), due_date: '2026-11-02' }, { today }).due_date).toBeTruthy();
    expect(validateSurvey({ ...base(), due_date: '2026-11-03' }, { today }).due_date).toBeUndefined();
    expect(validateSurvey({ ...base(), due_date: '2026-11-02' }, { today, checkDueDate: false })).toEqual({});
  });
});

describe('aggregates', () => {
  const questions = [
    { id: 'r', type: 'rating', label: 'Rate' },
    { id: 'c', type: 'multi_choice', label: 'Pick', options: ['A', 'B'] },
    { id: 't', type: 'long_text', label: 'Why' },
  ];
  const responses = [
    { answers: { r: 5, c: ['A', 'B'], t: 'ok' } },
    { answers: { r: 3, c: ['A'] } },
    { answers: { r: '', c: [] } },
  ];

  it('averages ratings and counts choices', () => {
    const [rating, choice, text] = aggregateSurveyResponses(questions, responses);
    expect(rating.average).toBe(4);
    expect(rating.answered).toBe(2);
    expect(rating.distribution[5]).toBe(1);
    expect(choice.counts).toEqual({ A: 2, B: 1 });
    expect(text.answered).toBe(1);
  });

  it('formats answers for export', () => {
    expect(formatAnswer(questions[0], 4)).toBe('4/5');
    expect(formatAnswer(questions[1], ['A', 'B'])).toBe('A; B');
    expect(formatAnswer(questions[2], null)).toBe('');
  });

  it('summarizes assignments excluding revoked rows', () => {
    expect(
      summarizeAssignments([
        { status: 'completed' },
        { status: 'in_progress' },
        { status: 'pending' },
        { status: 'revoked' },
      ])
    ).toEqual({ assigned: 3, started: 1, completed: 1, pending: 2, completion_pct: 33 });
  });
});

describe('todayIsoIst', () => {
  it('rolls over at IST midnight', () => {
    expect(todayIsoIst(new Date('2026-11-02T18:29:00Z'))).toBe('2026-11-02');
    expect(todayIsoIst(new Date('2026-11-02T18:31:00Z'))).toBe('2026-11-03');
  });
});
