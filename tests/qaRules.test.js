import { describe, expect, it } from 'vitest';
import {
  defaultChangeClass,
  overallResultFromSteps,
  requiredLevelsFor,
  riskFromLikelihoodImpact,
  riskScore,
  signoffRolesFor,
} from '../src/pages/qa/qaRules.js';

describe('qaRules', () => {
  it('computes risk score and band', () => {
    expect(riskScore(1, 2)).toBe(2);
    expect(riskFromLikelihoodImpact(1, 2)).toBe('low');
    expect(riskFromLikelihoodImpact(2, 2)).toBe('medium');
    expect(riskFromLikelihoodImpact(3, 3)).toBe('high');
  });

  it('defaults change class from type', () => {
    expect(defaultChangeClass('feature')).toBe('A');
    expect(defaultChangeClass('enhancement')).toBe('B');
    expect(defaultChangeClass('bug_fix')).toBe('B');
    expect(defaultChangeClass('config')).toBe('C');
    expect(defaultChangeClass('hotfix')).toBe('D');
  });

  it('lists required levels and sign-offs', () => {
    expect(requiredLevelsFor('A', 'high')).toContain('security');
    expect(requiredLevelsFor('C', 'low')).toEqual(['system', 'smoke']);
    expect(signoffRolesFor('A')).toContain('business_owner');
    expect(signoffRolesFor('C')).toEqual(['qa_lead']);
  });

  it('derives overall result from steps', () => {
    expect(overallResultFromSteps(['pass', 'pass'])).toBe('pass');
    expect(overallResultFromSteps(['pass', 'fail', 'not_run'])).toBe('fail');
    expect(overallResultFromSteps(['pass', 'blocked'])).toBe('blocked');
    expect(overallResultFromSteps([])).toBeNull();
  });
});
