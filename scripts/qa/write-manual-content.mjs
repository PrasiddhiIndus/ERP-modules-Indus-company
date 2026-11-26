/**
 * Writes QA manual markdown sections (source of truth for ManualPage).
 * Run: node scripts/qa/write-manual-content.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../../src/pages/qa/manual/content");
mkdirSync(dir, { recursive: true });

function write(file, fm, body) {
  const lines = ["---"];
  for (const [k, v] of Object.entries(fm)) {
    if (Array.isArray(v)) lines.push(`${k}: [${v.map((x) => JSON.stringify(x)).join(", ")}]`);
    else if (typeof v === "string") lines.push(`${k}: ${JSON.stringify(v)}`);
    else lines.push(`${k}: ${v}`);
  }
  lines.push("---", "", body.trim(), "");
  writeFileSync(resolve(dir, file), lines.join("\n"));
}

write(
  "01-welcome.md",
  { id: "welcome", title: "Welcome", roles: ["everyone"], order: 1 },
  `Hello! This is the QA part of INDUS ERP.

QA means **quality checking**. We check our software before people use it. We want it to work right, every time.

Think of a bakery. Before a cake goes to a customer, someone checks it. Is it baked? Is it the right cake? Does it taste good? This place is where we check our software, the same way.

Here you can:
- ask for something to be checked
- write down how to check it
- check it, and write down what happened
- report problems, and see them get fixed
- decide if the new version is ready to go out

Everything you do here is saved. Nothing gets lost.

> **Remember:** You can't break anything by reading this manual. Take your time.`
);

write(
  "02-words.md",
  { id: "words", title: "Big words made easy", roles: ["everyone"], order: 2 },
  `| Word | What it means |
|---|---|
| **QA** | Quality checking. Making sure things work. |
| **QA request** | A note that says "please check this". Every new feature or fix gets one. |
| **Feature** | Something new the software can do. |
| **Bug fix** | A repair for something that was broken. |
| **Hotfix** | An urgent repair, done fast, because something is broken right now. |
| **Release** | A new version of the ERP that goes out to everyone. Like a new edition of a book. It has a number, like 2.4.0. |
| **Build** | One copy of the software made for testing, like "build-2401". A new build comes after each fix. |
| **Environment** | The place where we test. Like a practice room. QA-01 is for testers. UAT-02 is for business users. PERF-01 is for speed tests. |
| **Test case** | A recipe for checking one thing. It has steps, and what should happen after each step. |
| **Step** | One small thing you do, like "Click Save". |
| **Expected result** | What *should* happen after a step. |
| **Actual result** | What *really* happened. |
| **Test run** | A list of tests to do together, on one build, in one environment. Like a homework sheet. |
| **Attempt** | One try at a test. If you test again, that is attempt 2. |
| **Pass** | It worked. Expected and actual are the same. |
| **Fail** | It did not work. Something was wrong. |
| **Blocked** | You could not finish the test. Something stopped you, like a missing page or no data. |
| **Not run** | Nobody has done this test yet. |
| **Defect (bug)** | A problem we found. Something that does not work the way it should. |
| **Severity** | How bad a bug is. S1 is the worst. S4 is tiny. |
| **Priority** | How soon a bug must be fixed. P1 means right now. |
| **Evidence** | Proof. A screenshot, a file or a log that shows what happened. |
| **Root cause** | The real reason a bug happened. |
| **CAPA** | Corrective and preventive action. "What we did to fix it" and "what we do so it never happens again". |
| **Change class** | How big a change is: A, B, C or D. |
| **Risk** | How likely something is to break, and how much it would hurt if it did. |
| **Test level** | How close-up or how wide we look. Unit is one tiny piece. System is the whole thing. Acceptance is the real users trying it. |
| **Regression** | Checking that old things still work after a change. |
| **Smoke test** | A quick check that the main things turn on and work. |
| **UAT** | User acceptance testing. Real business users try it and say "yes, this is what we need". |
| **Exit criteria** | The rules a release must pass before it can go out. Like a checklist before a plane takes off. |
| **Waiver** | A written "we know this rule isn't met, and we accept it, and here is why". |
| **Sign-off** | Signing your name to say "I approve". |
| **Traceability** | Being able to follow the line from a request, to its tests, to the results, to the bugs. |
| **Audit trail** | A diary of everything anyone did here. Nobody can erase it. |`
);

write(
  "03-roles.md",
  { id: "roles", title: "Who does what", roles: ["everyone"], order: 3 },
  `Everyone has a job here. Your job is shown at the top of the QA screens, next to the release picker.

- **Tester.** You write tests. You run tests. You report bugs. You check fixes.
- **QA Lead.** You are like the teacher. You sort new requests. You check other people's tests. You decide how bad each new bug is. You can write a waiver.
- **Developer.** You fix bugs. When your fix is ready, you say which build has it.
- **Product Owner.** You own what we build. You sign to say "yes, this is right".
- **Business Owner.** You are the real user's voice. You try it and sign to say "yes, this works for us".
- **Viewer.** You can look at everything. You can't change anything.

> **Remember:** Why so many people? Nobody checks their own homework. A second person always looks. This keeps our work honest and safe.`
);

write(
  "04-journey.md",
  { id: "journey", title: "The big journey: five stations", roles: ["everyone"], order: 4, example: "stations" },
  `Every QA request rides a train. The train stops at five stations, always in this order.

1. **Intake.** The request arrives. We decide how big it is and how risky it is.
2. **Plan.** We decide which release it goes in.
3. **Design.** We write the tests and check them.
4. **Execute.** We run the tests, report bugs, and get them fixed. People sign.
5. **Close.** All done. Everything passed.

The train only moves forward when the station's rules are met. If something is missing, the app tells you exactly what. Fix those things, then try again.`
);

write(
  "05-colours.md",
  { id: "colours", title: "Colours and signs", roles: ["everyone"], order: 5, example: "colours" },
  `Colours help you see things fast. Words are always there too.

**Test results**
- Green **Pass**: it worked.
- Red **Fail**: it did not work.
- Yellow **Blocked**: we could not finish.
- Grey **Not run**: not done yet.

**Bug severity**
- **S1 Critical:** very bad. Money or pay is wrong, data is lost, there is a security hole, or the system is down with no way around it.
- **S2 Major:** an important thing is broken. There is a way around it, but it is hard.
- **S3 Minor:** something small is wrong. There is an easy way around it.
- **S4 Trivial:** it only looks wrong, like a word spelt wrong or a box a little out of place.

**Bug priority:** P1 fix now. P2 fix in this release. P3 fix in the next release. P4 fix one day.

**Risk:** Low, Medium, High.

**Test case status:** **Draft** (written, not checked yet), **Changes requested** (the checker wants changes), **Approved** (checked and ready), **Obsolete** (not used any more).

**Coverage chips**
- **pass** (green): tested and passed.
- **open** (blue): test is ready, not passed yet.
- **draft** (yellow): test is written, still waiting to be checked.
- **fail** (red): test failed.
- **gap** (grey): no test yet. This is a gap.

**Release gate lights:** green means the rule is met. Yellow means a waiver was written. Red means not met yet.`
);

write(
  "06-find-your-way.md",
  { id: "find-your-way", title: "Finding your way around", roles: ["everyone"], order: 6 },
  `The QA tabs at the top have all the pages:

- **Dashboard:** the big picture.
- **Requests:** all "please check this" notes. The page title says **QA requests**.
- **Test cases:** all the test recipes.
- **Execution:** where you run tests. The page title says **Test execution**.
- **Defects:** all the bugs.
- **Traceability:** follow the line from request to test to bug.
- **Release gate:** is the release ready to go out?
- **Audit:** the diary of everything. The page title says **Audit trail**.
- **Standards:** the rules we follow. The page title says **Standards & rules**.
- **User manual:** this page.

At the top of QA you will find:
- **The release picker.** It chooses which release you are looking at.
- **Your QA role.** It shows next to the release picker.

On every QA page there is a **?** button. Press it to jump to the right part of this manual.

You can also press **Ctrl + K** (on a Mac, **⌘ + K**) to open the app search and jump to QA pages.`
);

write(
  "07-dashboard.md",
  {
    id: "dashboard",
    title: "The dashboard",
    roles: ["everyone", "tester", "qa_lead", "developer", "product_owner", "business_owner"],
    order: 7,
    showMeRoute: "/app/qa",
  },
  `The dashboard is like a weather report for the release.

- **The big sentence at the top** tells you if the release is ready. For example: "Release 2.4.0 is not ready to ship".
- **Four big numbers:**
  - **Executed:** how many tests are done out of planned.
  - **Pass rate:** out of the tests done, how many passed. We want 95 or more out of 100.
  - **Open defects:** how many bugs are still not closed.
  - **Gate criteria OK:** how many exit rules are met.
  A number with a red border needs attention.
- **Workflow** shows the five stations and how many requests wait at each one. Press a station to open **QA requests** filtered to that stage.
- **Requests by module** shows each part of the ERP.
- **Open S1 / S2 defects** shows the worst bugs. Press a line to open the bug.
- **Exit criteria snapshot** shows each release rule and if it is OK.`
);

write(
  "08-new-request.md",
  {
    id: "new-request",
    title: "Make a new QA request",
    roles: ["tester", "qa_lead", "developer", "product_owner"],
    order: 8,
    showMeRoute: "/app/qa/requests",
    example: "risk-matrix",
  },
  `Do this when something new is built, or something is fixed, and it needs checking.

1. Go to **Requests** (page title **QA requests**).
2. Press **New QA request**.
3. Write a **Title**. Say what is changing, in a few words.
4. Pick the **Type**: Feature, Enhancement, Bug fix, Config / content or Hotfix.
5. Pick the **ERP module**. That is the part of the ERP it belongs to.
6. Check the **Change class**. The app picks one for you from the type. You can change it.
7. Pick **Likelihood** from 1 to 3 (how likely it is to break).
8. Pick **Impact** from 1 to 3 (how much it would hurt if it broke).
9. Pick a **Target release**, if you know it.
10. Write the **Description**. Say what "done and working" looks like. Start with "Accepted when…".
11. Look at the box on the right. It shows the risk, the tests needed and who must sign. Nothing to do there; it just tells you.
12. Press **Create request**.

Your request now waits at the **Intake** station.`
);

write(
  "09-class-and-risk.md",
  {
    id: "class-and-risk",
    title: "Class and risk: how big and how scary",
    roles: ["everyone", "qa_lead", "product_owner"],
    order: 9,
    example: "risk-matrix",
  },
  `**Change class** says how big the change is:
- **A:** a new module or a new feature. Big.
- **B:** a change to something that exists, or a bug fix. Medium.
- **C:** a setting, some text or a report layout. Small.
- **D:** an urgent repair to the live system.

**Risk** is two questions:
- How likely is it to break? (Likelihood)
- How much would it hurt if it broke? (Impact)

Multiply them. Low × Low is small. High × High is big.

| Score | Risk |
|---|---|
| 1 to 2 | Low |
| 3 to 4 | Medium |
| 6 to 9 | High |

**Bigger and riskier means more testing.** The app works out which tests are needed:

| Class | Tests needed | If risk is High, also | Who signs |
|---|---|---|---|
| A | Unit, Integration, System, Regression, Acceptance | Security, Performance | QA Lead, Product Owner, Business Owner |
| B | Unit, System, Regression (plus Integration at Medium risk) | Integration and Acceptance | QA Lead, Product Owner |
| C | System, Smoke | Regression | QA Lead |
| D | Smoke, System, Regression | Nothing more | QA Lead, Product Owner, plus a review within 2 working days |

**Unit tests** are done by the developer. They attach a link under **Evidence link** on the request, then press **Save link**.

> **Remember:** For anything to do with pay, tax or money, choose High impact. Mistakes there hurt people.`
);

write(
  "10-next-station.md",
  {
    id: "next-station",
    title: "Move a request to the next station",
    roles: ["qa_lead", "tester", "product_owner"],
    order: 10,
    showMeRoute: "/app/qa/requests",
  },
  `1. Open the request (press its card or row).
2. Scroll to the top actions.
3. Press **Move to …** (the next station's name, for example **Move to Plan**).

If something is missing, a red box tells you exactly what. Fix each line, then press the button again.

What each station needs before the train can leave:
- **Intake → Plan:** the QA Lead must do this.
- **Plan → Design:** a target release must be chosen.
- **Design → Execute:** every needed test level has a checked (approved) test. If unit tests are needed, the developer's report link is attached (**Evidence link** + **Save link**).
- **Execute → Close:** every test passed, every bug on this request is closed, and everyone who must sign has signed.`
);

write(
  "11-write-a-test.md",
  {
    id: "write-a-test",
    title: "Write a test",
    roles: ["tester", "qa_lead"],
    order: 11,
    showMeRoute: "/app/qa/cases/new",
    example: "steps",
  },
  `A test case is a recipe. Anyone should be able to follow it and get the same answer.

1. Go to **Test cases** and press **New case**.
2. Write a **Title** that says what you check. Example: "Exactly 8.0 hours gives zero overtime".
3. Pick the **Request** it belongs to.
4. Pick the **Test level**: Integration, System or Acceptance.
5. Pick the **Test type**: Functional, Regression, Smoke, Security or Performance.
6. Pick the **Quality characteristic**: what kind of "good" you check. For example, "Functional suitability" means "does it do the right thing?", and "Security" means "is it safe?".
7. Pick the **Design technique**: how you chose this test. For example, "Boundary value analysis" means testing right at the edge, like exactly 8 hours.
8. Pick the **Priority**.
9. Write the **Preconditions**: what must be true before you start.
10. Write the **Test data**: which employee, which date, which file.
11. Add the **Steps**. Each step has an **Action** (what you do) and an **Expected** result (what should happen). Press **Add step** for more.
12. Press **Create case**.

Your test is now a **Draft**. The QA Lead will check it.

> **Tips for a good test:**
> - One test checks one thing.
> - Write steps so a new person could follow them.
> - Expected results must be exact. "Shows ₹825.00" is good. "Shows the right amount" is not.
> - Test the edges. If the rule changes at 8 hours, test 8.0 hours and a bit more.

**Changing a test that is already approved:** open the test and press **New version**. Change it and write a **Change note**. Press **Save new version**. The app saves it as a **new version**. The new version goes back to **Draft**, so it must be checked again. Old versions are kept.`
);

write(
  "12-check-a-test.md",
  {
    id: "check-a-test",
    title: "Check someone's test",
    roles: ["qa_lead"],
    order: 12,
    showMeRoute: "/app/qa/cases",
  },
  `*(For the QA Lead.)*

Like a teacher checking homework.

1. Open the test from **Test cases**. Use the status filter set to **Draft**.
2. Read it carefully:
   - Is the title clear?
   - Can a new person follow the steps?
   - Is every expected result exact?
   - Does it test what the request needs?
3. Then press one of these:
   - **Approve version:** it is good. It can now be run.
   - **Request changes:** it needs fixing. The author will update it.
   - **Mark obsolete:** we don't need it any more.

> **You can't do this, and here is why:** You can't check your own homework. If you wrote the test, someone else must approve it.`
);

write(
  "13-make-a-run.md",
  {
    id: "make-a-run",
    title: "Make a test run",
    roles: ["tester", "qa_lead"],
    order: 13,
    showMeRoute: "/app/qa/execution",
  },
  `A test run is a homework sheet: a list of tests to do on one build, in one place.

1. Go to **Execution** (page title **Test execution**).
2. Press **New test run**.
3. Give it a **Name**. Example: "2.4.0 Regression, cycle 2".
4. Write the **Build**. Example: "build-2402".
5. Pick the **Environment**: QA-01, UAT-02 or PERF-01.
6. Tick the **Approved cases** to include. Only approved tests show up.
7. Press **Create run**.`
);

write(
  "14-run-a-test.md",
  {
    id: "run-a-test",
    title: "Run a test",
    roles: ["tester", "qa_lead"],
    order: 14,
    showMeRoute: "/app/qa/execution",
    example: "player",
  },
  `This is the most important part. Go slowly and be honest.

1. Go to **Execution**.
2. Pick your run in the list at the top.
3. On the left, press a case.
4. Read the **Preconditions** and **Test data**. Get everything ready.
5. Do step 1, exactly as written.
6. Look at what happened. Compare it with the **Expected** line.
   - Same? Press **Pass** (or key **P**).
   - Different? Press **Fail** (or key **F**).
   - Couldn't do it? Press **Blocked** (or key **B**).
7. Go on to the next step. The step you are on is highlighted.
8. If a step fails or is blocked, you can stop there.
9. Write the **Actual result**: what really happened. For a fail, this is a must.
10. Check the **Overall** result the app shows.
11. Press **Record result**.

The result is now **locked**. Nobody can change it. The app can jump to the next case.

> **Be careful:** Press Pass only if you really saw it work. A "pass" means "I saw it with my own eyes".

> **Remember:** Why locked? It's like writing in pen, not pencil. Everyone can trust it. If you need to test again, press **Retest (new attempt)**.

**Keys to go faster:** **P** Pass, **F** Fail, **B** Blocked, **N** next case, **Ctrl + Enter** (⌘ + Enter on a Mac) record. The keys don't work while you are typing in a box.`
);

write(
  "15-report-a-bug.md",
  {
    id: "report-a-bug",
    title: "When a test fails: report a bug",
    roles: ["tester", "qa_lead"],
    order: 15,
    showMeRoute: "/app/qa/defects",
  },
  `When a test fails, go and log the bug.

1. Go to **Defects**.
2. Press **Log defect**.
3. Write a short, clear **Title**. Say what is wrong. Example: "ESI deducted at ₹21,001 gross".
4. Fill **Request id** with the numeric request id (from the request page).
5. Pick the **Severity**: how bad is it? (See "Colours and signs".)
6. Pick the **Priority**: how soon must it be fixed?
7. Pick who it is **Assigned to**.
8. Write the **Steps to reproduce**. Someone else must be able to follow them and see the same problem.
9. Fill **Expected** and **Actual**.
10. Press **Save**.

> **Remember:** A good bug report: one problem per bug, exact steps, exact numbers, and clear actual text.`
);

write(
  "16-bugs.md",
  {
    id: "bugs",
    title: "A bug's journey",
    roles: ["tester", "qa_lead", "developer"],
    order: 16,
    showMeRoute: "/app/qa/defects",
  },
  `Bugs also ride a train, with five stations:

1. **New.** Someone found it.
2. **Triaged.** The QA Lead looked at it and set how bad it is, how urgent it is and who will fix it.
3. **In progress.** The developer is fixing it.
4. **Ready for retest.** The fix is done. The developer wrote which build has the fix.
5. **Closed.** A tester checked the fix and it works.

**How to move a bug:** on the **Defects** page, drag its card to the next column. Or open the bug, change **Status** and press **Save**.

**Who can move it where:**
- New → Triaged: the QA Lead.
- → Ready for retest: the developer or the QA Lead, and **Fixed in build** must be filled in.
- → Closed: a tester or the QA Lead, only from Ready for retest, and only after testing again. A **Resolution** must be chosen (Fixed, Duplicate, Not a defect, Deferred or Cannot reproduce).
- For **S1 and S2** bugs you must also fill in the **Root cause** and the **Corrective action**. Please add the **Preventive action** too.

If a bug comes back after it was closed, move it back. The app counts how many times it was reopened.

**Root cause and CAPA, made easy:**
- **Root cause:** why did it really happen? Pick one: Requirement gap, Design, Coding, Configuration, Data, Environment or Test gap.
- **Corrective action:** what did we do to fix it?
- **Preventive action:** what will we do so this kind of bug never happens again?`
);

write(
  "17-retest.md",
  {
    id: "retest",
    title: "Test again",
    roles: ["tester", "qa_lead"],
    order: 17,
    showMeRoute: "/app/qa/execution",
  },
  `When a bug is **Ready for retest**:

1. Go to **Execution** and open the right run.
2. Open the case that failed before.
3. Press **Retest (new attempt)**.
4. Run the steps again, just like the first time.
5. Press **Record result**.
6. If it passed, go to the bug on **Defects**, set **Status** to **Closed**, fill **Resolution**, and press **Save**.
7. If it failed again, move the bug back to **In progress** and write what you saw.

Old tries are never erased. You can see every attempt in the list.`
);

write(
  "18-sign.md",
  {
    id: "sign",
    title: "Signing your name",
    roles: ["qa_lead", "product_owner", "business_owner"],
    order: 18,
    showMeRoute: "/app/qa/release-gate",
  },
  `Signing means "I checked, and I approve". It is like signing a school form.

**Sign a request** (in the Execute station):
1. Open the request.
2. Find the **Sign-offs** box with your job name.
3. Press **Sign as …** (your job).

**Sign a release:**
1. Go to **Release gate**.
2. Press **Sign as …** on your box. The button only works when every rule is OK or has a waiver.
3. Tick the sentence that says what you approve.
4. Type your full name, exactly as it appears in QA members.
5. Press **Confirm sign-off**.

> **Remember:** You can only sign for your own job. A signature can't be removed.`
);

write(
  "19-traceability.md",
  {
    id: "traceability",
    title: "The traceability page",
    roles: ["everyone", "qa_lead", "product_owner"],
    order: 19,
    showMeRoute: "/app/qa/traceability",
  },
  `This page follows the strings that tie everything together:

**Request → tests needed → test cases → results → bugs.**

- Each row is one request.
- The chips show each needed test level and its colour. A **gap** chip means no test yet.
- The result chips show each test's latest result.
- The last column gives a verdict: **Coverage gap**, **Failing**, **In progress** or **Verified**.

Press a row to open the request. Press **Export CSV** to share it.`
);

write(
  "20-release-gate.md",
  {
    id: "release-gate",
    title: "The release gate",
    roles: ["qa_lead", "product_owner", "business_owner"],
    order: 20,
    showMeRoute: "/app/qa/release-gate",
  },
  `The release gate is like a traffic light at the door. The release can only go out when the light is green.

There are seven rules:

1. **Planned tests executed:** 98 or more out of 100 tests are done.
2. **Pass rate:** 95 or more out of 100 done tests passed.
3. **Open S1 (critical) bugs:** must be zero. **No waiver allowed, ever.**
4. **Open S2 (major) bugs:** must be zero.
5. **Required test levels covered:** every needed level has a checked test.
6. **Test cases approved:** every test in this release was checked.
7. **UAT passed:** every class A request passed its user test.

**Waiver** *(QA Lead only)*: sometimes a rule isn't met, but we decide it is safe to go anyway.
1. Press **Waive** next to the rule.
2. Write why it is safe, and what we do to stay safe (at least 15 characters).
3. Press **Save waiver**.

The waiver shows on the page and in the report, forever.

When all seven lights are OK, the three people sign (see "Signing your name"). Then the release can go out.`
);

write(
  "21-report.md",
  {
    id: "report",
    title: "The test completion report",
    roles: ["qa_lead", "product_owner", "business_owner"],
    order: 21,
    showMeRoute: "/app/qa/release-gate",
  },
  `This is the end-of-term report card for a release.

1. Go to **Release gate**.
2. Press **Copy test completion report**.
3. Paste it into an email or document to share.

The text shows what was tested, the exit rules, any waivers and who signed.`
);

write(
  "22-audit.md",
  {
    id: "audit",
    title: "The audit trail",
    roles: ["everyone", "qa_lead"],
    order: 22,
    showMeRoute: "/app/qa/audit",
  },
  `The audit trail is a diary. It writes down everything anyone does here: who did it, which job they had, when, and what changed.

- **Nobody can change it or erase it.** Not even the boss.
- Use the filter box to find a person, a number (like DEF-503) or an action.
- **Verify chain** checks that the diary was never touched. If something is wrong, it tells you.

> **Remember:** This is why you don't need to worry about "who changed this?". The diary always knows.`
);

write(
  "23-shortcuts.md",
  { id: "shortcuts", title: "Keyboard shortcuts and search", roles: ["everyone", "tester"], order: 23 },
  `| Keys | What they do |
|---|---|
| Ctrl + K (⌘ + K on a Mac) | Search pages in the app |
| P | Pass the current step (in Test execution) |
| F | Fail the current step |
| B | Mark the current step Blocked |
| N | Go to the next case in the run |
| Ctrl + Enter (⌘ + Enter on a Mac) | Record the result |`
);

write(
  "24-your-day.md",
  {
    id: "your-day",
    title: "Your day, role by role",
    roles: ["tester", "qa_lead", "developer", "product_owner", "business_owner"],
    order: 24,
  },
  `**Tester**
1. Open **Dashboard** and check open S1 / S2 defects.
2. Write new tests for requests in **Design**.
3. Run the tests in your test run.
4. Report bugs for every fail from **Defects** → **Log defect**.
5. Retest bugs that are **Ready for retest**, and close them if they pass.

**QA Lead**
1. Sort new requests in **Intake** and move them to **Plan**.
2. Check (approve) Draft tests with **Approve version**.
3. Triage **New** bugs: set severity, priority and owner, then **Save**.
4. Make test runs for each new build.
5. Watch the **Release gate**. Write waivers only when it is truly safe. Sign.

**Developer**
1. Open **Defects** and look for bugs assigned to you.
2. Move a bug to **In progress** when you start.
3. Fix it. Write the **Fixed in build** number. Move it to **Ready for retest**.
4. Fill in the **Root cause** and **Corrective action**.
5. Attach your unit test report link on the request (**Evidence link** → **Save link**).

**Product Owner**
1. Write clear acceptance criteria in your requests.
2. Sign requests in the **Execute** station when everything passed.
3. Read the copied test completion report and sign the release.

**Business Owner**
1. Try the new work in UAT with the tester.
2. Say clearly what is right and what is wrong.
3. Sign requests and the release when you are happy.`
);

write(
  "25-why-cant-i.md",
  { id: "why-cant-i", title: '"Why can\'t I…?"', roles: ["everyone"], order: 25 },
  `When the app stops you, it is protecting the work. Here is why.

| You see | Why | What to do |
|---|---|---|
| "Only the QA Lead triages a request into planning." | One person sorts all new work. | Ask your QA Lead. |
| "Choose a target release." | The request needs a home. | Pick a release in the request. |
| "No test case at the … level." | A needed test is missing. | Write that test. |
| "The … test case is still awaiting review." | The test isn't checked yet. | Ask the QA Lead to check it. |
| "Attach developer unit-test evidence." | Unit tests are needed. | The developer adds the report link. |
| "… latest result is failed / not run." | Not every test passed yet. | Run or fix, then test again. |
| "Sign-off missing: …" | Someone still has to sign. | Ask that person to sign. |
| "Independent review required" / author cannot approve | Nobody checks their own homework. | Another QA Lead must approve it. |
| "Only an approved test case version can be executed." | Unchecked recipes can give wrong answers. | Get the test approved first. |
| "Test results are recorded by a tester or the QA lead." | The person who built it doesn't grade it. | A tester runs the test. |
| Actual result required for a failure | Others need to know what went wrong. | Write what you saw. |
| "Enter the build that contains the fix." | Testers need to know where to check. | Fill in **Fixed in build**. |
| "Only a retested defect can be closed." | A fix must be checked first. | Retest, then close. |
| "S1/S2 defects need a root cause and corrective action" | Big bugs must teach us something. | Fill in the root cause and CAPA boxes. |
| "Choose a resolution." | We need to know how it ended. | Pick Fixed, Duplicate or another resolution. |
| "The QA lead triages new defects." | One person sets severity and owner. | Ask the QA Lead. |
| "Only the QA lead can waive an exit criterion." | Skipping a rule is a big decision. | Talk to the QA Lead. |
| "Criterion … cannot be waived." | Critical bugs can never go out. | Fix the S1 bug. |
| "Release … has unmet exit criteria; sign-off is blocked." | The light is still red. | Meet the rules, or get a waiver. |
| "You can only sign as your own role." | Each person signs only for themselves. | Ask the right person. |
| "Retype your full name exactly…" | A signature must be really you. | Type your full name, the same as shown. |
| "… is append-only" | Saved records can't be changed. | Make a new entry, like a retest. |`
);

write(
  "26-golden-rules.md",
  { id: "golden-rules", title: "The golden rules", roles: ["everyone"], order: 26 },
  `1. **Be honest.** Pass means you saw it work.
2. **Write it down.** If it is not written here, it did not happen.
3. **Show proof.** Add clear actual results and evidence links when you can.
4. **Nobody checks their own homework.**
5. **Pen, not pencil.** Saved results stay. Test again instead of changing.
6. **One bug, one report.**
7. **Pay and money are always high risk.**
8. **Critical bugs never go out.**
9. **When unsure, ask your QA Lead.**`
);

write(
  "27-faq.md",
  { id: "faq", title: "Questions people ask", roles: ["everyone"], order: 27 },
  `**I pressed the wrong button on a step. Can I fix it?**
Yes, before you press **Record result**. Just press the right button. After recording, it is locked. Then press **Retest (new attempt)** and do it again.

**I recorded the wrong result. What now?**
Make a new attempt with the right result. Write in the actual result why you are testing again. Both tries stay in the history. That is OK.

**The test page is missing, or there is no data. Is that a fail?**
No. That is **Blocked**. Write what stopped you.

**I found a bug while testing something else.**
Go to **Defects** and press **Log defect**. Link it to the closest request.

**Can I change a test that is already approved?**
Yes. Press **New version**. It becomes a new version and must be checked again.

**Who can see my work?**
Everyone in the QA team can see it. That way everyone knows what's happening.

**Can I delete something I made by mistake?**
No. Nothing here is deleted. Mark a test **Obsolete**, or close a bug with the resolution **Not a defect** or **Duplicate**.

**Where do I start if I am new?**
Read "Big words made easy", then "The big journey", then the "Your day" part for your job. Then press the **?** button on any page when you need help.`
);

console.log("Wrote", dir);
