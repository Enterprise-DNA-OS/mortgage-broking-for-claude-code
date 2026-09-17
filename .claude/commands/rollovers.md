---
description: The refix book. Every fixed rate reaching its expiry, soonest first, with the last contact date beside it. This list is the retention business.
---

The operator wants the fixed rate expiries. An argument might be a number of days ("120"), default is 90.

1. Run `npm run mortgage -- rollovers [--days=]`.
2. Lead with the lapsed ones. A lapsed fixed rate means the client is paying the lender's floating rate today and nobody told them. That is the worst thing on this list and it is a same-day call.
3. Then work forward by expiry date. For each loan, read the two columns that matter together:
   - **Days to expiry** against **last contact.** A rate ending in three weeks for a client last spoken to in July is a competitor's cashback offer waiting to happen.
   - **The clawback column.** A refix due inside the clawback window is doubly urgent: lose the client and the lender takes the upfront back too.
4. The conversation is a review, not a rate quote. Before ringing anyone, run `client <name>` and read their whole position; the biggest tranche is rarely the whole story.
5. When a refix is agreed: `refix <loan> --rate= --until=`. It updates the loan, logs the contact, and creates the refix fee entry where the lender pays one.
6. `npm run docs -- refix-letter-draft` renders a draft letter per expiring loan into `docs-out/`, in the business's brand, with the client's whole position attached. A person sends it.

End with the three calls to make this week, in order, and what each client's book is worth.
