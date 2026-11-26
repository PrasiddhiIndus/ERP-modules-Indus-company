---
id: "your-day"
title: "Your day, role by role"
roles: ["tester", "qa_lead", "developer", "product_owner", "business_owner"]
order: 24
---

**Tester**
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
3. Sign requests and the release when you are happy.
