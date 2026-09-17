---
description: Draft the fixed rate expiry letter for one client, from their whole position, into drafts/. Never sends.
---

The operator names a loan or a client whose fixed rate is coming up.

1. Run `npm run mortgage -- client <name>` and read the whole card: every loan part, the expiring one, the clawback position, the last contact, the review status. The letter is about the client's structure, not one tranche.
2. Write the letter to `drafts/refix-<loan>-<client>.md`, in the business's voice (the operator block in CLAUDE.md):
   - Name the loan, the balance, the current rate and the exact date it ends, and what happens on that date (the lender's floating rate) if nothing is done.
   - Put the decision in their hands: fix again, split, or float, and offer the conversation. Do not quote rates you do not have; rate options come from the lender on the day, and inventing one in a letter is how a record of advice gets contradicted.
   - If their annual review is near, fold it in: one meeting, both jobs.
   - One page. No filler. It should read like the adviser wrote it between calls.
3. If the operator wants the branded version instead, `npm run docs -- refix-letter-draft` renders it as HTML with the full position attached.
4. Say plainly: this is a draft, a person sends it, and the conversation that follows is advice, so the record of advice on any refix deal gets written.

Never send anything from here. Never invent a rate, a balance or a date; every number comes from the database, and if one is missing, say which.
