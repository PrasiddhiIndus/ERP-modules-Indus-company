---
id: "next-station"
title: "Move a request to the next station"
roles: ["qa_lead", "tester", "product_owner"]
order: 10
showMeRoute: "/app/qa/requests"
---

1. Open the request (press its card or row).
2. Scroll to the top actions.
3. Press **Move to …** (the next station's name, for example **Move to Plan**).

If something is missing, a red box tells you exactly what. Fix each line, then press the button again.

What each station needs before the train can leave:
- **Intake → Plan:** the QA Lead must do this.
- **Plan → Design:** a target release must be chosen.
- **Design → Execute:** every needed test level has a checked (approved) test. If unit tests are needed, the developer's report link is attached (**Evidence link** + **Save link**).
- **Execute → Close:** every test passed, every bug on this request is closed, and everyone who must sign has signed.
