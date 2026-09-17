---
description: The advice file on one deal, or the gaps across every live deal. The six records the regulator expects, created missing, closed by evidence.
---

Every deal carries six records, created as "missing" the day it opens: scope of service disclosure, fact find and needs analysis, affordability and suitability evidence, AML/CFT customer due diligence, commission and clawback disclosure, and the record of advice. Each cites its source.

**One deal:** run `npm run mortgage -- deal <ref>` and read the advice file table. Say what is missing and what closing each gap looks like.

**The whole book:** run `npm run mortgage -- compliance`. The rules that read this table (disclosure, suitability, affordability, cdd, commission-disclosure, record-of-advice) list every deal at or past submission with a gap.

Closing a gap records that the work happened, it does not do the work:
- `advice <ref> "scope" --on=<date the disclosure was given>`
- `advice <ref> "fact find" --on=`
- `advice <ref> "affordability" --on=`
- `advice <ref> "clawback" --on=`
- `advice <ref> "record of advice" --on=`
- `cdd <client> --on= --type=standard|enhanced` closes the AML record on every open deal for that client
- `--na` marks a record genuinely not applicable, and it should be rare

Never mark a record on file that does not exist somewhere real: the document store, the aggregator CRM, the email chain. Standard Condition 1 wants these records kept seven years; this table is the index that says where the file stands, and it is only worth anything if it is honest.
