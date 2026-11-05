/**
 * Probation review form model — ported verbatim from Indus One
 * (`src/indus-one/lib/probationReviewForm.ts`). Field model aligned with
 * PERFORMANCE REVIEW FOR PROBATIONERS.pdf. Keep both copies identical.
 */

export const PROBATION_COMPETENCIES = [
  {
    key: "job_knowledge",
    n: 1,
    title: "Job Knowledge & Skill",
    subtitle: "Fundamental Knowledge and Task Execution Skills",
    levels: [
      {
        bullets: [
          "Has inadequate knowledge and is dependent on others for assistance",
          "Makes completion of assignments difficult or inaccurate.",
        ],
      },
      {
        bullets: [
          "Needs to improve job knowledge",
          "Occasionally needs to be trained on tasks",
          "Needs assistance or supervision for accuracy, is willing to learn",
        ],
      },
      {
        bullets: [
          "Has adequate job knowledge to execute assignments",
          "Is dependable for skills and seeks clarity/ information where needed",
          "Demonstrates zeal to update knowledge and is trainable",
        ],
      },
      {
        bullets: [
          "Has superior understanding of roles and responsibilities",
          "Helps peers and subordinates to understand procedures etc.",
          "Makes efforts to learn new aspects of the job.",
          "Constantly seeks guidance for updating knowledge of self and peers",
          "Is seen as a learner-implementer.",
        ],
      },
      {
        bullets: [
          "Applies exceptional insight and knowledge to process/ equipment/ material",
          "Is able to train others on tasks suggests alternative ways of working",
          "Is able to foresee and overcome process problems and can troubleshoot problems independently",
          "Keeps abreast of changing practices outside the organization.",
        ],
      },
    ],
  },
  {
    key: "drive",
    n: 2,
    title: "Drive",
    subtitle: "Productivity, Initiative, Energy, Dynamism, Decision Making and Result-orientation",
    levels: [
      {
        bullets: [
          "Is significantly below expectations",
          "Makes mistakes and is unreliable.",
          "Requires prompting to carry out assignments.",
          "Lacks need for improvement and is expendable as a team member.",
        ],
      },
      {
        bullets: [
          "Is occasionally not able to accomplish allotted targets.",
          "Keeps work in arrears.",
          "Needs frequent supervision for accuracy, and assistance of peers in completing assignments.",
          "Not dependable to take on additional work in times of need.",
        ],
      },
      {
        bullets: [
          "Usually accepts stretch targets to give maximum output possible.",
          "Is able to usually deliver above average quantity and acceptable quality.",
          "Needs no supervision in documentation or other aspects of job.",
          "Takes on additional responsibilities in times of need willingly.",
          "Suggests alternatives to overcome",
        ],
      },
      {
        // PDF repeats Competency 1 wording for Drive Score 4 — do not invent replacement text.
        placeholder: true,
        bullets: [
          "[Rubric text missing in source PDF: Drive Score 4 repeats Competency 1 wording. Confirm before go-live.]",
        ],
      },
      {
        bullets: [
          "Always takes on challenges of stretch targets, questions, and improves own ways of working and never fails to meet stretch targets with acceptable quality.",
          "Regularly seeks additional responsibilities.",
          "Is a resource person for documentation, highly dependable, and willingly ensures documentation of team is accurate always.",
          "Comes up with suggestions to improve productivity and is seen as a trainer of other colleagues.",
        ],
      },
    ],
  },
  {
    key: "operational_excellence",
    n: 3,
    title: "Operational Excellence",
    subtitle: "Adherence to Systems and SOPs, Customer Service Orientation",
    levels: [
      {
        bullets: [
          "Does not meet basic standards",
          "Does not adhere to systems and documentation",
          "Needs to revisit/ rework always",
        ],
      },
      {
        bullets: [
          "Is occasionally not able to meet standards.",
          "Needs supervision on procedure adherence.",
          "Occasionally needs to revisit and improve / correct assignments handled",
        ],
      },
      {
        bullets: [
          "Normally does not need supervision.",
          "Is dependable for compliance in documentation and other aspects of the job.",
          "Normally does not have to rework.",
          "Keeps superiors informed of deviations.",
        ],
      },
      {
        bullets: [
          "Comes across as a self-starter.",
          "Has foresight to make necessary changes to systems and procedures.",
          "Complies with standard procedures always and is able to assist colleagues as a resource person.",
          "Informs of changes to others on time and proactively.",
        ],
      },
      {
        bullets: [
          "Has exceptional insight into the impact of procedures.",
          "Demonstrates foresight impacting other functions.",
          "Suggests alternatives to own and benchmarks with other functions",
          "Strives to adhere to procedures, costs, etc. for the department as a whole.",
          "Trains colleagues on procedures as a resource person.",
        ],
      },
    ],
  },
  {
    key: "interpersonal",
    n: 4,
    title: "Interpersonal Skills",
    subtitle: "Sensitivity, Flexibility, Cosmopolitan Attitude, Integrity, and Teamwork",
    levels: [
      {
        bullets: [
          "Is uncooperative and frequently enters into conflict situations",
          "Puts self over others",
          "Is political and creates conflicts",
        ],
      },
      {
        bullets: [
          "Occasionally difficult in a team situation",
          "Needs to learn to be accommodative and to establish rapport with others",
          "Sometimes enters into conflicting situations",
        ],
      },
      {
        bullets: [
          "Comes across as a team player within and outside the function",
          "Raises issues timely to superiors",
          "Is accommodating and cosmopolitan",
          "Is willing to compromise and help others",
        ],
      },
      {
        bullets: [
          "Is usually tolerant and accommodative",
          "Helps others accomplish their assignments",
          "Is able to maintain cordial relationships within and outside the function",
          "Raises likely conflicting situations with superiors",
          "Attempts to find common ground",
        ],
      },
      {
        bullets: [
          "Demonstrates exceptional tolerance, is flexible and accommodative",
          "Consistently lends help to team members, focuses on assignments over relationships",
          "Is seen as a problem solver in conflicts",
          "Is able to establish amicable relationships with other functions. Encourages peers to resolve conflicts and work as a team.",
        ],
      },
    ],
  },
  {
    key: "communication",
    n: 5,
    title: "Communication",
    subtitle: "Oral and Written Communication Skills",
    levels: [
      {
        bullets: [
          "Is a poor communicator",
          "Does not communicate important information in a timely and complete manner",
        ],
      },
      {
        bullets: [
          "Needs help in communicating",
          "Needs improvement in timely sharing of information",
          "Lacks written communication skills",
        ],
      },
      {
        bullets: [
          "Can express clearly and does not need assistance",
          "Keeps superiors updated on situations as necessary",
          "Has adequate written communication skills",
        ],
      },
      {
        bullets: [
          "Is able to communicate clearly",
          "Keeps everyone concerned proactively informed",
          "Is an independent, dependable communicator with above-average written communication skills",
        ],
      },
      {
        bullets: [
          "Is able to communicate accurately and in a timely manner",
          "Is proactive in sending out clear communication to assist managerial decisions",
          "Is highly dependable within and outside the function, and is seen as a resource person for written communication skills.",
        ],
      },
    ],
  },
  {
    key: "professional_conduct",
    n: 6,
    title: "Professional Conduct",
    subtitle: "Attendance, Punctuality, Mannerisms, Turnout, Professional Approach, and Attitude",
    levels: [
      {
        bullets: [
          "Lacks positive attitude and is expendable as a team member",
          "Is unprofessional in approach",
        ],
      },
      {
        bullets: [
          "Usually comes across as a dependable executor, needs encouragement to try and learn from mistakes",
          "Usually exhibits professional demeanor.",
        ],
      },
      {
        bullets: [
          "Comes across as a dependable executor",
          "Displays willingness to try and is able to accept mistakes",
          "Has an inclination to look at the positive side of situations",
          "Always acts in a professional manner",
        ],
      },
      {
        bullets: [
          "Is usually dependable and available in critical situations",
          "Displays positive attitude and professionalism",
          "Learns from own and others' mistakes",
          "Always works in the interest of the organization",
          "Accepts high-performance standards",
        ],
      },
      {
        bullets: [
          "Is highly dependable and available in critical situations",
          "Displays a positive attitude, encourages others to learn from experience and to work in the interest of the organization, encourages high-performance standards, has deference for authority, has no record of indiscipline or misconduct.",
        ],
      },
    ],
  },
  {
    key: "supervisory",
    n: 7,
    title: "Supervisory Skills",
    subtitle: "Effective Delegation, Supervisory Control, and Subordinate Development (Work Level 2 only)",
    workLevel2Only: true,
    levels: [
      {
        bullets: [
          "Lacks supervisory skills and is unable to effectively deal with or delegate or develop subordinates",
          "Is unable to resolve problems",
        ],
      },
      {
        bullets: [
          "Occasionally comes across as an effective supervisor",
          "Is unable to exact desired level of performance from subordinates",
          "Is unable to provide negative feedback to drive performance",
        ],
      },
      {
        bullets: [
          "Comes across as an effective supervisor, can exact desired level of performance from subordinates",
          "Clearly communicates company expectations to subordinates",
          "Is able to communicate grievances to management on time",
          "Commands respect, imparts knowledge on departmental procedures effectively, and can provide solutions to day-to-day queries.",
          "Is capable of questioning and differentiating good performers.",
        ],
      },
      {
        bullets: [
          "Takes responsibility for subordinates' performance",
          "Is able to continuously extract maximum work from subordinates willingly",
          "Imparts knowledge on day-to-day assignments, trains and encourages subordinates to take ownership",
          "Clearly communicates company expectations to management",
          "Is able to foresee causes of grievances and highlight them",
          "Is capable of differentiating good performers and delegates additional responsibilities to develop them",
          "Seen as a leader in crises, analyses and suggests preventative action",
        ],
      },
      {
        bullets: [
          "Is able to identify skills in subordinates, and delegates work accordingly",
          "Energizes subordinates and helps see the bigger picture",
          "Is seen as a trainer and encourages knowledge sharing to develop subordinates",
          "Is able to take position and provide timely performance feedback and assists in improving performance",
          "Is able to identify successors/ backup for uninterrupted department performance",
          "Foresees and handles employee grievances independently and effectively",
          "Is able to foresee crises and proactively educates on reasons to avoid them.",
        ],
      },
    ],
  },
];

export const PROBATION_RECOMMENDATIONS = [
  { value: "confirm", label: "Confirm services as per policy" },
  { value: "extend", label: "Extend probation period as per policy" },
  { value: "terminate", label: "Terminate services" },
];

/** Visible workflow chips (MD step removed — HR finalizes). */
export const PROBATION_WORKFLOW_STEPS = [
  "awaiting_l1",
  "in_progress_l1",
  "awaiting_l2",
  "awaiting_hr",
  "finalized",
];

export function activeProbationCompetencies(isWorkLevel2) {
  return PROBATION_COMPETENCIES.filter((c) => !c.workLevel2Only || isWorkLevel2);
}

export function requiredCompetencyKeys(isWorkLevel2) {
  return activeProbationCompetencies(isWorkLevel2).map((c) => c.key);
}

export function scoresComplete(scores, isWorkLevel2) {
  if (!scores) return false;
  return requiredCompetencyKeys(isWorkLevel2).every((k) => {
    const n = Number(scores[k]);
    return Number.isInteger(n) && n >= 1 && n <= 5;
  });
}

export function scoredCompetencyCount(scores, isWorkLevel2) {
  const keys = requiredCompetencyKeys(isWorkLevel2);
  const vals = keys
    .map((k) => Number(scores?.[k]))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 5);
  return {
    scored: vals.length,
    total: keys.length,
    average: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
  };
}

/**
 * True when the signed-in L1/L2 still needs to act on this review.
 * Submitted forms (`awaiting_l2` / `awaiting_hr` / `awaiting_md` / `finalized`)
 * belong in history so managers can track filled forms.
 */
export function needsMyProbationAction(review, myCode, codesMatch) {
  const status = review.status;
  if (status === "finalized" || status === "cancelled") return false;

  if (!String(myCode || "").trim()) {
    // Without caller code, only L1-stage rows look "pending"; submitted forms stay in history.
    return status === "awaiting_l1" || status === "in_progress_l1" || status === "correction_required";
  }

  if (
    (status === "awaiting_l1" || status === "in_progress_l1" || status === "correction_required") &&
    codesMatch(review.l1_code, myCode)
  ) {
    return true;
  }

  if (status === "awaiting_l2" && review.l2_code && codesMatch(review.l2_code, myCode)) {
    return true;
  }

  if (status === "awaiting_hr" && review.hr_code && codesMatch(review.hr_code, myCode)) {
    return true;
  }

  return false;
}
