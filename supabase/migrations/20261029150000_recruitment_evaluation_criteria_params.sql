-- Standard interview evaluation parameters (Parameter · Rating 1–5 · Comments).

ALTER TABLE public.admin_recruitment_settings
  ALTER COLUMN evaluation_criteria
  SET DEFAULT '[
    "Technical / Functional Knowledge",
    "Relevant Work Experience",
    "Problem-Solving & Analytical Ability",
    "Communication Skills",
    "Confidence & Body Language",
    "Cultural / Team Fit",
    "Leadership Potential (if applicable)",
    "Career Stability & Growth Trajectory"
  ]'::jsonb;

UPDATE public.admin_recruitment_settings
SET evaluation_criteria = '[
  "Technical / Functional Knowledge",
  "Relevant Work Experience",
  "Problem-Solving & Analytical Ability",
  "Communication Skills",
  "Confidence & Body Language",
  "Cultural / Team Fit",
  "Leadership Potential (if applicable)",
  "Career Stability & Growth Trajectory"
]'::jsonb;
