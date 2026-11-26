---
id: "run-a-test"
title: "Run a test"
roles: ["tester", "qa_lead"]
order: 14
showMeRoute: "/app/qa/execution"
example: "player"
---

This is the most important part. Go slowly and be honest.

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

**Keys to go faster:** **P** Pass, **F** Fail, **B** Blocked, **N** next case, **Ctrl + Enter** (⌘ + Enter on a Mac) record. The keys don't work while you are typing in a box.
