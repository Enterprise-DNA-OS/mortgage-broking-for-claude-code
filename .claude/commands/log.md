---
description: A call, an email, a meeting, a task. The small entries that keep the record true, and the ones every "gone quiet" alarm reads.
---

The operator says what happened in their own words: "rang the Whelans about the November expiry", "met the Ferris trustees", "chase the ASB assessor tomorrow".

Map it to the right write:

- **Contact with a client:** `log <client> "what was said" [--channel=phone|email|meeting|text] [--deal=]`. Date defaults to today; `--on=` backdates honestly.
- **Something on a deal:** `deal log <ref> "what the lender said"`. This is the log the quiet-application alarm reads.
- **Something to do later:** `task add "chase the assessor" --client= --deal= --due=`. Done: `task done <match>`.
- **An arrears of contact being fixed:** just log the call. The client-quiet and refix-due alarms clear themselves off the contact log.

Two rules:
1. Log it when it happens, in the words it happened in. A contact log written at month end is fiction with dates.
2. Never log a contact that did not happen to clear an alarm. The alarms exist to make the calls happen, not the records.
