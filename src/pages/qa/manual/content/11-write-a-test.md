---
id: "write-a-test"
title: "Write a test"
roles: ["tester", "qa_lead"]
order: 11
showMeRoute: "/app/qa/cases/new"
example: "steps"
---

A test case is a recipe. Anyone should be able to follow it and get the same answer.

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

**Changing a test that is already approved:** open the test and press **New version**. Change it and write a **Change note**. Press **Save new version**. The app saves it as a **new version**. The new version goes back to **Draft**, so it must be checked again. Old versions are kept.
