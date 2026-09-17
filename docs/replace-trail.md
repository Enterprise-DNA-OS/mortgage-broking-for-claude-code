# Moving off Trail

Trail is the CRM a large share of New Zealand mortgage and insurance advice businesses run on, and
the exclusive platform of one aggregation group. Salestrekker and Mercury Nexus are the ones you
meet in Australia, and the process here is the same for all three. This page is the switch, step by
step: what to export, what one command does with it, what maps, and what does not come across.

Read the last section before you commit to anything. The honest answer is that some of what Trail
holds for you belongs to your aggregation relationship, and leaving a CRM is not the same as
leaving an aggregator.

## Before you start

**Nothing here talks to a lender.** Applications keep going through the lender's own channel or
your aggregator's lodgement path, exactly as they do today. What moves is the record of the
business: the clients, the book, the pipeline, the review rhythm and the commission expectations.

**Take a copy of everything first.** Export every report the old system will give you, not just the
files below. Notes, documents and insurance records especially: once the subscription ends you
cannot go back for the ones you forgot. Trail exports client lists to spreadsheet, and its export
needs organisation admin access, so do this while you still have it.

**Run the two side by side for a month.** The refix book is the test: when this system's
`rollovers` shows the same expiries the old system's fixed rate report shows, you can trust it.

## Step 1: export

Three files matter. Every adviser CRM has them under some name:

| What | Usually called | Save as |
|---|---|---|
| The clients | Contacts export, client list | `clients.csv` |
| The book | Mortgages, loans, lending report, fixed rate report | `loans.csv` |
| The pipeline | Opportunities, deals, pipeline export | `deals.csv` |

If a report only comes out as .xlsx, open it and save as CSV. The importer matches column names
case-insensitively and accepts several names for the same field, so you do not have to rename
anything first.

**Clients.** Name (or Client Name / Contact Name / Household), Email, Phone, Type, City, Lead
Source.

**Loans.** Client (matching the client file's name exactly), Lender, Loan Number (or Account
Number), Loan Amount, Current Balance, Interest Rate, Fixed Rate Expiry (or Rollover Date / Fixed
Until), Settlement Date (or Drawdown / Start Date), Repayment.

**Deals.** Client, Stage (or Status; the importer maps the common wordings to its own stages),
Loan Amount, Lender, Purpose.

The files link on the client name. That is the one thing worth tidying before the import: the same
household spelled two ways becomes two clients.

## Step 2: dry run

```bash
npm run mortgage -- import trail --clients=clients.csv --loans=loans.csv --deals=deals.csv --dry-run
```

Nothing is written. You get a count of what would be created, what is already here, and every row
it would skip with the reason. Read the skip list; the usual cause is a loan whose client name does
not match the client file exactly.

## Step 3: import

```bash
npm run mortgage -- import trail --clients=clients.csv --loans=loans.csv --deals=deals.csv
```

Salestrekker exports (its self-serve Data Export produces Deals, Contacts, Notes and Tasks CSVs) go
through the same command with `salestrekker`; Mercury Nexus raw-data exports with `mercury`;
anything else with `csv`. Re-running an import updates balances rather than duplicating.

Then check it:

```bash
npm run mortgage -- stats
npm run mortgage -- clients
npm run mortgage -- book
npm run mortgage -- rollovers --days=180
```

The loan count and the fixed expiry dates should match the old system exactly. The refix book runs
the retention business, so those dates are the ones to verify one by one.

## Step 4: the deliberate gaps

Three things arrive incomplete on purpose, because this system will not call a record complete just
because the old one never said otherwise:

1. **No CDD dates.** As each client file is verified against your AML programme:
   `cdd <client> --on=<the date it was actually done> --type=standard|enhanced`.
2. **Empty advice files on imported deals.** `npm run mortgage -- compliance` now lists exactly
   which live deals are missing which records. Backfill with `advice <deal> "<record>" --on=`,
   dating each record when the work actually happened.
3. **Unknown lenders with zero commission terms.** Any lender the import met that was not on the
   panel exists with upfront and trail at zero. Fill each one from your aggregator schedule before
   the next settlement computes against it.

## What does not come across

- **Documents and notes.** Export them from Trail (notes and documents export by date range) and
  keep them in your document store. This system records where the file stands; the documents
  themselves live where your document policy says.
- **Insurance business.** This repo is the mortgage side. The insurance book is its own domain with
  its own renewal ladder; run it separately rather than forcing it into loan tables.
- **Lender servicing calculators and lodgement.** Those belong to the lender and the aggregator,
  not the CRM. You lose nothing; you were always going to their portal anyway.
- **Commission history.** The importer builds the book and its expectations from today forward.
  Historic statements stay in your accounting system, which is where the auditor looks for them.
- **The aggregator relationship.** If your CRM comes bundled with aggregation, dropping the CRM is
  a commercial conversation, not a data migration. Read your agreement first.
