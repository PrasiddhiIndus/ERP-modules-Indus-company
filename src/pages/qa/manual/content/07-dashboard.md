---
id: "dashboard"
title: "The dashboard"
roles: ["everyone", "tester", "qa_lead", "developer", "product_owner", "business_owner"]
order: 7
showMeRoute: "/app/qa"
---

The dashboard is like a weather report for the release.

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
- **Exit criteria snapshot** shows each release rule and if it is OK.
