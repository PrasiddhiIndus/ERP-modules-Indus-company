---
id: "class-and-risk"
title: "Class and risk: how big and how scary"
roles: ["everyone", "qa_lead", "product_owner"]
order: 9
example: "risk-matrix"
---

**Change class** says how big the change is:
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

> **Remember:** For anything to do with pay, tax or money, choose High impact. Mistakes there hurt people.
