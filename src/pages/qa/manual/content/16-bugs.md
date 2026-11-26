---
id: "bugs"
title: "A bug's journey"
roles: ["tester", "qa_lead", "developer"]
order: 16
showMeRoute: "/app/qa/defects"
---

Bugs also ride a train, with five stations:

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
- **Preventive action:** what will we do so this kind of bug never happens again?
