---
description: Every loan still inside its lender's clawback window with the exposure attached, and every discharge that landed inside one. The money that can leave after it arrived.
---

1. Run `npm run mortgage -- clawback`.
2. Explain what the operator is looking at: an upfront commission is not safe until the loan has been on the book longer than the lender's window. The exposure column is a straight-line estimate; the lender's own schedule (on each `lender <name>` card) is the number that governs.
3. Read it for the two dangerous patterns:
   - **A refix due inside the window.** If that client walks to a cashback offer at the expiry, the upfront walks back too. These clients get the earliest and best refix conversations.
   - **A discharge already inside the window.** The clawback entry was raised at discharge; correct it to the lender's figure when the statement lands (`commission received <loan> --kind=clawback --amount=-...`), and read the discharge reason. "Refinanced to a competitor" on a client with no recent contact is a process failure, not bad luck.
4. When a loan is discharged, always use `discharge <loan> --on= --reason=`. It computes the window position and raises the entry as it goes. The reason field is the retention lesson; write a real one.

If the operator asks "how exposed are we", the answer is the total at the top plus the two or three loans that drive it, each with its refix date and last contact.
