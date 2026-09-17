---
description: Everything that wants a decision this week, worst first. Finance clauses, lapsed fixed rates, missing CDD, advice file gaps, commission owed, clients gone quiet.
---

1. Run `npm run mortgage -- attention`.
2. The list is already ordered by how much each item can cost. Read it in that order and do not reorder it by ease:
   - **Finance clauses and settlements** are deals that die this week if untouched.
   - **A lapsed fixed rate** is a client paying floating right now.
   - **Missing CDD on a submitted deal** is a legal problem, not an admin one (AML/CFT Act 2009). It gets fixed before anything else moves on that file.
   - **Advice file gaps** at or past submission: the record either exists or it does not, and Standard Condition 1 assumes it does.
   - **Clawback** rows are money leaving.
   - **Unpaid and short commission** is money that arrived wrong and will stay wrong until someone queries the aggregator statement.
   - **Refix due, reviews overdue, clients quiet** are the book slowly walking out the door.
3. For each item, say the one action: the command to run, the call to make, or the record to fix. Name the adviser who owns it.
4. Anything that needs a letter or an email is drafted, never sent: `npm run docs`, or write to `drafts/`.

If the operator asks "what should I do today", pick the top three and say why those three.
