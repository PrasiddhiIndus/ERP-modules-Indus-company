---
id: "retest"
title: "Test again"
roles: ["tester", "qa_lead"]
order: 17
showMeRoute: "/app/qa/execution"
---

When a bug is **Ready for retest**:

1. Go to **Execution** and open the right run.
2. Open the case that failed before.
3. Press **Retest (new attempt)**.
4. Run the steps again, just like the first time.
5. Press **Record result**.
6. If it passed, go to the bug on **Defects**, set **Status** to **Closed**, fill **Resolution**, and press **Save**.
7. If it failed again, move the bug back to **In progress** and write what you saw.

Old tries are never erased. You can see every attempt in the list.
