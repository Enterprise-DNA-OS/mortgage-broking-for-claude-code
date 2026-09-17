---
description: One client's whole file. Loans, deals, reviews, commission, the contact log and the CDD position, on one card.
---

The operator names a client, possibly partially ("Whelan", "the Patels"). Run `npm run mortgage -- client <name>`; the CLI matches case-insensitively and lists candidates when ambiguous rather than guessing.

Present the card top down:

1. **Who they are.** Type, adviser, referrer, and the CDD line. If CDD is missing, that is the first thing said, because nothing can be submitted for them until it is done.
2. **The book.** Total lending, the loan parts with rates and fixed-until dates, and the next refix. The next refix date is the next conversation.
3. **Deals in flight** with their stage and clocks.
4. **Reviews.** When the last one happened, when the next is due, whether it is overdue.
5. **Commission** on their loans, with anything unpaid or short called out.
6. **The contact log.** The gap since the last entry matters more than the entries.

Before drafting anything for or about a client, read this whole card. A refix letter written off one tranche when the client holds three is how trust is lost.

Small writes that keep the record true:
- `log <client> "rang about the expiry" [--channel=phone]`
- `cdd <client> --on= [--type=enhanced]`
- `review done <client>` / `review schedule <client> --due=`
- `task add "..." --client=<name> --due=`
