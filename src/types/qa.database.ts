/**
 * Hand-maintained TypeScript types for schema `qa`
 * (source: docs/indus_qa_schema.sql / migration 20261126150000_qa_schema.sql).
 *
 * The ERP app is JS-first; these types are for tooling and optional TS consumers.
 * To regenerate later when `supabase gen types` is wired:
 *   npx supabase gen types typescript --schema qa > src/types/qa.database.ts
 */

export type QaMemberRole =
  | 'tester'
  | 'qa_lead'
  | 'developer'
  | 'product_owner'
  | 'business_owner'
  | 'viewer';

export type QaRequestType = 'feature' | 'enhancement' | 'bug_fix' | 'config' | 'hotfix';
export type QaStage = 'intake' | 'plan' | 'design' | 'execute' | 'close';
export type QaRiskLevel = 'low' | 'medium' | 'high';
export type QaTestLevel = 'unit' | 'integration' | 'system' | 'acceptance';
export type QaTestType = 'functional' | 'regression' | 'smoke' | 'security' | 'performance';
export type QaCaseStatus = 'draft' | 'changes_requested' | 'approved' | 'obsolete';
export type QaResult = 'pass' | 'fail' | 'blocked' | 'not_run';
export type QaSeverity = 'S1' | 'S2' | 'S3' | 'S4';
export type QaPriority = 'P1' | 'P2' | 'P3' | 'P4';
export type QaDefectStatus = 'new' | 'triaged' | 'in_progress' | 'ready_for_retest' | 'closed';
export type QaResolution = 'fixed' | 'duplicate' | 'not_a_defect' | 'deferred' | 'cannot_reproduce';
export type QaRcaCategory =
  | 'requirement_gap'
  | 'design'
  | 'coding'
  | 'configuration'
  | 'data'
  | 'environment'
  | 'test_gap';

export type QaIso25010 =
  | 'functional_suitability'
  | 'performance_efficiency'
  | 'compatibility'
  | 'interaction_capability'
  | 'reliability'
  | 'security'
  | 'maintainability'
  | 'flexibility'
  | 'safety';

export type QaTechnique =
  | 'equivalence_partitioning'
  | 'boundary_value_analysis'
  | 'decision_table'
  | 'state_transition'
  | 'use_case'
  | 'exploratory'
  | 'error_guessing';

export type QaCaseStep = { action: string; expected: string };

export interface QaMember {
  user_id: string;
  full_name: string;
  qa_role: QaMemberRole;
  active: boolean;
  created_at: string;
}

export interface QaRelease {
  id: string;
  target_date: string | null;
  status: 'open' | 'signed_off' | 'shipped' | 'cancelled';
  created_at: string;
}

export interface QaRequest {
  id: number;
  code: string;
  title: string;
  request_type: QaRequestType;
  change_class: 'A' | 'B' | 'C' | 'D';
  module: string;
  likelihood: number;
  impact: number;
  risk_score: number;
  risk: QaRiskLevel;
  stage: QaStage;
  release_id: string | null;
  description: string | null;
  unit_evidence_url: string | null;
  owner_id: string | null;
  created_by: string;
  created_at: string;
}

export interface QaTestCase {
  id: number;
  code: string;
  request_id: number;
  current_version: number;
  status: QaCaseStatus;
  author_id: string;
  reviewer_id: string | null;
  created_at: string;
}

export interface QaTestCaseVersion {
  case_id: number;
  version: number;
  title: string;
  level: QaTestLevel;
  test_type: QaTestType;
  iso_char: QaIso25010;
  technique: QaTechnique;
  priority: 'high' | 'medium' | 'low';
  preconditions: string | null;
  test_data: string | null;
  steps: QaCaseStep[];
  change_note: string | null;
  created_by: string;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
}

export interface QaTestRun {
  id: number;
  code: string;
  name: string;
  release_id: string;
  build: string;
  environment: string;
  created_by: string;
  created_at: string;
}

export interface QaExecution {
  id: number;
  run_id: number;
  case_id: number;
  case_version: number;
  attempt: number;
  result: Exclude<QaResult, 'not_run'>;
  step_results: QaResult[];
  actual_result: string | null;
  executed_by: string;
  executed_at: string;
  witnessed_by: string | null;
}

export interface QaDefect {
  id: number;
  code: string;
  title: string;
  severity: QaSeverity;
  priority: QaPriority;
  status: QaDefectStatus;
  resolution: QaResolution | null;
  request_id: number;
  case_id: number | null;
  execution_id: number | null;
  environment: string | null;
  found_in_build: string | null;
  fixed_in_build: string | null;
  assigned_to: string | null;
  reported_by: string;
  steps_to_reproduce: string | null;
  expected: string | null;
  actual: string | null;
  rca_category: QaRcaCategory | null;
  corrective_action: string | null;
  preventive_action: string | null;
  reopen_count: number;
  created_at: string;
  updated_at: string;
}

export interface QaCoverageRow {
  request_id: number;
  code: string;
  release_id: string | null;
  requirement: string;
  coverage: 'pass' | 'open' | 'draft' | 'fail' | 'gap';
}

export interface QaReleaseGateRow {
  release_id: string;
  key: string;
  description: string;
  target: number;
  actual: number | null;
  met: boolean;
  waived: boolean;
  ok: boolean;
}

export interface QaDatabase {
  public: Record<string, never>;
  qa: {
    Tables: {
      members: { Row: QaMember; Insert: Partial<QaMember> & Pick<QaMember, 'user_id' | 'full_name'>; Update: Partial<QaMember> };
      releases: { Row: QaRelease; Insert: Partial<QaRelease> & Pick<QaRelease, 'id'>; Update: Partial<QaRelease> };
      requests: { Row: QaRequest; Insert: Partial<QaRequest> & Pick<QaRequest, 'title' | 'request_type' | 'change_class' | 'module' | 'likelihood' | 'impact'>; Update: Partial<QaRequest> };
      test_cases: { Row: QaTestCase; Insert: Partial<QaTestCase> & Pick<QaTestCase, 'request_id'>; Update: Partial<QaTestCase> };
      test_case_versions: { Row: QaTestCaseVersion; Insert: Partial<QaTestCaseVersion> & Pick<QaTestCaseVersion, 'case_id' | 'version' | 'title' | 'level' | 'technique' | 'priority' | 'steps'>; Update: Partial<QaTestCaseVersion> };
      test_runs: { Row: QaTestRun; Insert: Partial<QaTestRun> & Pick<QaTestRun, 'name' | 'release_id' | 'build' | 'environment'>; Update: Partial<QaTestRun> };
      executions: { Row: QaExecution; Insert: Partial<QaExecution> & Pick<QaExecution, 'run_id' | 'case_id' | 'case_version' | 'result' | 'step_results'>; Update: never };
      defects: { Row: QaDefect; Insert: Partial<QaDefect> & Pick<QaDefect, 'title' | 'severity' | 'priority' | 'request_id'>; Update: Partial<QaDefect> };
    };
    Views: {
      v_coverage: { Row: QaCoverageRow };
      v_release_gate: { Row: QaReleaseGateRow };
    };
    Functions: {
      my_role: { Args: Record<string, never>; Returns: QaMemberRole | null };
      advance_request: { Args: { p_request: number }; Returns: string[] };
    };
  };
}
