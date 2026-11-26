---
id: "release-gate"
title: "The release gate"
roles: ["qa_lead", "product_owner", "business_owner"]
order: 20
showMeRoute: "/app/qa/release-gate"
---

The release gate is like a traffic light at the door. The release can only go out when the light is green.

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

When all seven lights are OK, the three people sign (see "Signing your name"). Then the release can go out.
