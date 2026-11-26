---
id: "traceability"
title: "The traceability page"
roles: ["everyone", "qa_lead", "product_owner"]
order: 19
showMeRoute: "/app/qa/traceability"
---

This page follows the strings that tie everything together:

**Request → tests needed → test cases → results → bugs.**

- Each row is one request.
- The chips show each needed test level and its colour. A **gap** chip means no test yet.
- The result chips show each test's latest result.
- The last column gives a verdict: **Coverage gap**, **Failing**, **In progress** or **Verified**.

Press a row to open the request. Press **Export CSV** to share it.
