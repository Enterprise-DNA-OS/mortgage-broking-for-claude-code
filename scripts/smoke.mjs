#!/usr/bin/env node
// End-to-end smoke test on a throwaway embedded database.
// Runs migrate, seed, then every CLI command that matters, and asserts on the JSON.
// Passes on Windows and Linux. No network, no Postgres install.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = mkdtempSync(path.join(tmpdir(), 'mortgage-smoke-'));
const env = { ...process.env, DATA_DIR: dataDir };
delete env.DATABASE_URL; // the smoke test always runs embedded
delete env.MB_ADVISER;

let step = 0;
function run(label, args, { json = true, expectFail = false } = {}) {
  step++;
  const argv = [path.join(root, 'scripts', args[0]), ...args.slice(1), ...(json ? ['--json'] : [])];
  const res = spawnSync(process.execPath, argv, { cwd: root, env, encoding: 'utf8' });
  const ok = expectFail ? res.status !== 0 : res.status === 0;
  if (!ok) {
    console.error(`\nFAIL step ${step} (${label}): exit ${res.status}\n--- stdout\n${res.stdout}\n--- stderr\n${res.stderr}`);
    process.exit(1);
  }
  console.log(`  ok  ${String(step).padStart(2)}  ${label}`);
  if (!json || expectFail) return { stdout: res.stdout, stderr: res.stderr };
  try {
    return JSON.parse(res.stdout);
  } catch {
    console.error(`\nFAIL step ${step} (${label}): output is not JSON\n${res.stdout}\n${res.stderr}`);
    process.exit(1);
  }
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`\nFAIL assertion: ${msg}`);
    process.exit(1);
  }
}

const n = (v) => Number(v ?? 0);
const iso = (v) => String(v ?? '').slice(0, 10);

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
// Local date, the same way the CLI computes "today". Never UTC: New Zealand is a day ahead of it.
const todayIso = (() => {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
})();

console.log(`smoke: data dir ${dataDir}`);
try {
  run('migrate', ['migrate.mjs'], { json: false });
  run('migrate again (idempotent)', ['migrate.mjs'], { json: false });
  run('seed', ['seed.mjs'], { json: false });
  run('seed again (idempotent)', ['seed.mjs'], { json: false });

  // ---- the practice ---------------------------------------------------------

  const clients = run('clients', ['mortgage.mjs', 'clients']);
  assert(clients.length === 26, `twenty six active clients (${clients.length})`);
  assert(clients.some((c) => n(c.book_cents) > 80000000), 'with a big book at the top');
  assert(clients.some((c) => !c.cdd_completed_on), 'and a CDD gap that shows');

  const client = run('client card', ['mortgage.mjs', 'client', 'Whelan']);
  assert(client.client.name === 'Tom & Aria Whelan', 'resolved by partial name');
  assert(client.loans.length === 3, 'with their three loan parts');
  assert(n(client.position.book_cents) === 87100000, 'and the book adds up');

  const noSuch = run('an unknown client exits 1', ['mortgage.mjs', 'client', 'nobody at all'], { json: false, expectFail: true });
  assert(/No client matches/.test(noSuch.stderr), 'and says so plainly');

  const ambiguous = run('an ambiguous name exits 1 and lists candidates', ['mortgage.mjs', 'client', 'a'], { json: false, expectFail: true });
  assert(/matches \d+ client records/.test(ambiguous.stderr), 'with the candidates listed');

  const advisers = run('advisers', ['mortgage.mjs', 'advisers']);
  assert(advisers.length === 3 && advisers.every((a) => a.fsp_number), 'three advisers, all FSP registered');

  const lenders = run('lenders', ['mortgage.mjs', 'lenders']);
  assert(lenders.length === 9, 'nine lenders on the panel');
  assert(lenders.some((l) => n(l.trail_rate_bps) > 0) && lenders.some((l) => n(l.trail_rate_bps) === 0), 'some pay trail, some do not');

  const lender = run('lender card', ['mortgage.mjs', 'lender', 'ASB']);
  assert(lender.lender.name === 'ASB' && lender.book.length >= 3, 'ASB and its book');

  // ---- the pipeline ---------------------------------------------------------

  const pipeline = run('pipeline', ['mortgage.mjs', 'pipeline']);
  assert(pipeline.length === 10, `ten open deals (${pipeline.length})`);
  assert(pipeline.some((d) => n(d.days_to_finance) <= 3 && d.stage === 'application'), 'the finance clause about to bite is in it');
  assert(pipeline.some((d) => d.stage === 'pre-approval' && n(d.days_to_preapproval_expiry) <= 14), 'and the expiring pre-approval');

  const deal = run('deal card', ['mortgage.mjs', 'deal', 'DL-1011']);
  assert(deal.deal.client_name === 'Sam & Jordan Cole', 'resolved by ref');
  assert(deal.advice_file.length === 6, 'six records in the advice file');
  assert(deal.advice_file.some((r) => r.kind === 'record of advice' && r.status === 'missing'), 'and the missing record of advice shows');

  const settlements = run('settlements', ['mortgage.mjs', 'settlements']);
  assert(settlements.filter((s) => !s.settled_on).length === 2, 'two settlements booked');

  // ---- the book, the refix season, the money --------------------------------

  const book = run('book', ['mortgage.mjs', 'book']);
  assert(book.length === 17, `seventeen active loans (${book.length})`);
  assert(book.every((l) => l.status === 'active'), 'discharged loans stay out of it');

  const rollovers = run('rollovers', ['mortgage.mjs', 'rollovers']);
  assert(rollovers.length === 5, 'five fixed rates inside ninety days');
  assert(rollovers.some((r) => n(r.days_to_refix) < 0), 'including the lapsed one');
  assert(rollovers.some((r) => n(r.days_since_contact) > 90), 'and one nobody has rung in three months');

  const clawback = run('clawback', ['mortgage.mjs', 'clawback']);
  assert(clawback.some((c) => c.status === 'discharged'), 'the discharge inside the window shows');
  assert(clawback.filter((c) => c.status === 'active').every((c) => n(c.exposure_cents) <= n(c.upfront_received_cents)), 'exposure never exceeds the upfront');

  const trailBook = run('trail-book', ['mortgage.mjs', 'trail-book']);
  assert(n(trailBook.refix_90d.n) === 5, 'the trail book counts the refix season');

  const commissions = run('commissions', ['mortgage.mjs', 'commissions']);
  assert(commissions.upfronts.some((u) => u.outstanding && n(u.days_since_drawn) >= 30), 'the unpaid upfront shows');
  assert(commissions.upfronts.some((u) => n(u.variance_cents) < 0), 'so does the short payment');
  assert(commissions.clawbacks.length === 1, 'and the clawback raised at discharge');

  const reviews = run('reviews-due', ['mortgage.mjs', 'reviews-due']);
  assert(reviews.filter((r) => !r.completed_on && n(r.days_overdue) > 0).length === 2, 'two reviews overdue');

  // ---- compliance and attention ----------------------------------------------

  const compliance = run('compliance', ['mortgage.mjs', 'compliance']);
  assert(compliance.length === 8, 'eight rules in the book');
  const failed = compliance.filter((r) => r.breaches.length);
  assert(failed.map((r) => r.key).sort().join(',') === 'affordability,cdd,record-of-advice,reviews', `the seeded breaches are exactly the story (${failed.map((r) => r.key).join(',')})`);

  const oneRule = run('one compliance rule', ['mortgage.mjs', 'compliance', 'cdd']);
  assert(oneRule.length === 1 && oneRule[0].breaches.length === 1, 'run one rule on its own');

  const attention = run('attention', ['mortgage.mjs', 'attention']);
  assert(attention.length >= 18, `the attention list is loud (${attention.length})`);
  for (const reason of ['finance_due', 'refix_lapsed', 'cdd_missing', 'clawback', 'upfront_unpaid', 'commission_short', 'review_overdue', 'client_quiet', 'application_quiet', 'preapproval_expiring', 'settlement_week', 'task_overdue']) {
    assert(attention.some((a) => a.reason === reason), `attention carries ${reason}`);
  }

  run('stats', ['mortgage.mjs', 'stats']);

  // ---- a deal, end to end -----------------------------------------------------

  run('add a client', ['mortgage.mjs', 'add', 'client', 'Moana & Pete Fletcher', '--type=couple', '--adviser=Rachel']);
  const opened = run('open a deal', ['mortgage.mjs', 'deal', 'open', 'Fletcher', '--amount=640000', '--purpose=purchase', '--lender=BNZ', '--adviser=Rachel']);
  const ref = opened.ref;
  assert(/^DL-\d+$/.test(ref), `the deal ref is minted (${ref})`);

  const blockedSubmit = run('submitting without CDD is refused', ['mortgage.mjs', 'deal', 'stage', ref, 'application'], { json: false, expectFail: true });
  assert(/AML\/CFT/.test(blockedSubmit.stderr), 'and the refusal cites the Act');

  run('record the CDD', ['mortgage.mjs', 'cdd', 'Fletcher', '--on=today']);
  run('fact find', ['mortgage.mjs', 'deal', 'stage', ref, 'fact-find', '--adviser=Rachel']);
  run('now the submission goes through', ['mortgage.mjs', 'deal', 'stage', ref, 'application', '--finance-due=' + addDays(todayIso, 12), '--adviser=Rachel']);
  run('mark the file', ['mortgage.mjs', 'advice', ref, 'scope', '--on=today']);
  run('mark more of the file', ['mortgage.mjs', 'advice', ref, 'fact find', '--on=today']);
  run('affordability evidence', ['mortgage.mjs', 'advice', ref, 'affordability', '--on=today']);
  run('clawback disclosure', ['mortgage.mjs', 'advice', ref, 'clawback', '--on=today']);
  run('record of advice', ['mortgage.mjs', 'advice', ref, 'record of advice', '--on=today']);
  run('log a lender event', ['mortgage.mjs', 'deal', 'log', ref, 'BNZ asked for the KiwiSaver statement']);
  run('conditional', ['mortgage.mjs', 'deal', 'stage', ref, 'conditional', '--adviser=Rachel']);
  run('unconditional', ['mortgage.mjs', 'deal', 'stage', ref, 'unconditional', '--settlement=' + addDays(todayIso, 15), '--adviser=Rachel']);

  const blockedSettle = run('settled is not a stage move', ['mortgage.mjs', 'deal', 'stage', ref, 'settled'], { json: false, expectFail: true });
  assert(/settle /.test(blockedSettle.stderr), 'it points at the settle command');

  const settled = run('settle it', ['mortgage.mjs', 'settle', ref, '--on=today', '--rate=5.79', '--fixed-until=' + addDays(todayIso, 730), '--amount=560000', '--adviser=Rachel']);
  assert(n(settled.upfront_expected_cents) === Math.round(56000000 * 55 / 10000), 'the upfront is computed off the lender terms');
  const tranche = run('add the second tranche', ['mortgage.mjs', 'loan', 'add', ref, '--amount=80000', '--rate=6.40', '--floating', '--adviser=Rachel']);
  assert(tranche.rate_type === 'floating', 'a floating tranche');

  const dealAfter = run('the deal is settled with a complete file', ['mortgage.mjs', 'deal', ref]);
  assert(dealAfter.deal.stage === 'settled', 'stage says so');
  assert(dealAfter.advice_file.every((r) => r.status !== 'missing'), 'no gaps left on this one');

  const fletcher = run('the client card carries it all', ['mortgage.mjs', 'client', 'Fletcher']);
  assert(fletcher.loans.length === 2, 'two loan parts');
  assert(fletcher.reviews.some((r) => !r.completed_on && iso(r.due_on) === addDays(todayIso, 365)), 'the annual review was scheduled at settlement');

  run('upfront arrives', ['mortgage.mjs', 'commission', 'received', settled.loan.loan_number, '--amount=3080']);
  const shortPay = run('a short payment is called out', ['mortgage.mjs', 'commission', 'received', tranche.loan_number, '--amount=100'], { json: false });
  assert(/SHORT/.test(shortPay.stdout), 'loudly');

  // ---- the refix and the discharge --------------------------------------------

  const refix = run('refix the lapsed loan', ['mortgage.mjs', 'refix', 'LN-2004', '--rate=5.65', '--until=' + addDays(todayIso, 365)]);
  assert(n(refix.rate_bps) === 565, 'rate parsed the way people say it');
  const rolloversAfter = run('it leaves the refix list', ['mortgage.mjs', 'rollovers']);
  assert(!rolloversAfter.some((r) => r.loan_number === 'LN-2004'), 'no longer lapsed');

  const discharge = run('discharge inside the window', ['mortgage.mjs', 'discharge', 'LN-2015', '--reason=sold the house'], { json: false });
  assert(/CLAWBACK/.test(discharge.stdout), 'the clawback is computed as it happens');
  const dischargeClear = run('discharge outside the window', ['mortgage.mjs', 'discharge', 'LN-2012', '--reason=repaid'], { json: false });
  assert(/Nothing owed back/.test(dischargeClear.stdout), 'and a clear one says so');

  run('review done', ['mortgage.mjs', 'review', 'done', 'Miller', '--on=today', '--adviser=Rachel']);
  const reviewsAfter = run('the next review is scheduled', ['mortgage.mjs', 'reviews-due']);
  assert(reviewsAfter.some((r) => r.client === 'Miller Orchard Partnership' && iso(r.due_on) === addDays(todayIso, 365)), 'twelve months out');

  run('log a call', ['mortgage.mjs', 'log', 'Whelan', 'Rang about the November expiry, meeting booked', '--adviser=Mere']);
  run('task add', ['mortgage.mjs', 'task', 'add', 'Send the Fletcher welcome pack', '--client=Fletcher', '--due=' + addDays(todayIso, 3), '--adviser=Rachel']);
  run('task done', ['mortgage.mjs', 'task', 'done', 'welcome pack']);

  // ---- import ------------------------------------------------------------------

  const clientsCsv = path.join(dataDir, 'clients.csv');
  const loansCsv = path.join(dataDir, 'loans.csv');
  const dealsCsv = path.join(dataDir, 'deals.csv');
  writeFileSync(clientsCsv, [
    'Client Name,Email,Phone,Type,City,Lead Source',
    '"Bill & Sue Hartley",hartleys@example.nz,021 700 001,Couple,Tauranga,Referral',
    '"Kauri Earthworks Ltd",office@kauriew.example.nz,07 555 0100,Company,Tauranga,Accountant',
    '"Tom & Aria Whelan",whelans@example.nz,021 400 011,Couple,Auckland,Existing',
  ].join('\n'));
  writeFileSync(loansCsv, [
    'Client,Lender,Loan Number,Loan Amount,Current Balance,Interest Rate,Fixed Rate Expiry,Settlement Date,Repayment',
    '"Bill & Sue Hartley",ANZ,HL-9001,520000,498000,5.89,' + addDays(todayIso, 200) + ',' + addDays(todayIso, -400) + ',Principal and Interest',
    '"Bill & Sue Hartley",ANZ,HL-9002,80000,76000,6.55,,' + addDays(todayIso, -400) + ',Principal and Interest',
    '"Kauri Earthworks Ltd",Prospa,HL-9003,240000,240000,8.95,,' + addDays(todayIso, -100) + ',Interest Only',
  ].join('\n'));
  writeFileSync(dealsCsv, [
    'Client,Stage,Loan Amount,Lender,Purpose',
    '"Bill & Sue Hartley",Pre Approved,150000,ANZ,Top Up',
  ].join('\n'));

  const dry = run('import dry run writes nothing', ['mortgage.mjs', 'import', 'trail', `--clients=${clientsCsv}`, `--loans=${loansCsv}`, `--deals=${dealsCsv}`, '--dry-run', '--adviser=Rachel']);
  assert(n(dry.clients) === 2 && n(dry.clients_updated) === 1 && n(dry.loans) === 3, 'the dry run counts what it would do');

  const imported = run('import for real', ['mortgage.mjs', 'import', 'trail', `--clients=${clientsCsv}`, `--loans=${loansCsv}`, `--deals=${dealsCsv}`, '--adviser=Rachel']);
  assert(n(imported.clients) === 2 && n(imported.loans) === 3 && n(imported.deals) === 1, 'and the real run does it');
  assert(n(imported.lenders_created) === 1, 'the unknown lender was created, with zero terms to fill in');

  const hartley = run('the imported book reads back', ['mortgage.mjs', 'client', 'Hartley']);
  assert(hartley.loans.length === 2 && hartley.client.cdd_completed_on === null, 'loans landed; CDD deliberately unknown');

  const reimport = run('re-importing updates rather than duplicating', ['mortgage.mjs', 'import', 'trail', `--clients=${clientsCsv}`, `--loans=${loansCsv}`, '--adviser=Rachel']);
  assert(n(reimport.clients) === 0 && n(reimport.clients_updated) === 3 && n(reimport.loans) === 0 && n(reimport.loans_updated) === 3, 'the second run creates nothing new');

  const missingFile = run('a missing import file fails loudly', ['mortgage.mjs', 'import', 'csv', `--clients=${path.join(dataDir, 'not-there.csv')}`], { json: false, expectFail: true });
  assert(/No clients file/.test(missingFile.stderr), 'it exits non zero rather than importing nothing quietly');

  // ---- export --------------------------------------------------------------------

  const outFile = path.join(dataDir, 'dump.json');
  const dump = run('export', ['mortgage.mjs', 'export', `--out=${outFile}`]);
  assert(existsSync(outFile), 'the export file is on disk');
  const parsed = JSON.parse(readFileSync(outFile, 'utf8'));
  assert(parsed.loans.length === n(dump.counts.loans), 'the counts match the file');
  assert(!Object.keys(parsed).some((t) => /bank|trust|receipt|disbursement|payment_run/.test(t)), 'there is no client money in the export');

  // ---- the branded HTML -----------------------------------------------------------

  const views = run('npm run view', ['view.mjs'], { json: false });
  assert(/views[\\/]week\.html/.test(views.stdout) && /views[\\/]book\.html/.test(views.stdout), 'both views rendered');
  const weekHtml = readFileSync(path.join(root, 'views', 'week.html'), 'utf8');
  assert(weekHtml.includes('Needs a decision') && weekHtml.includes('The refix book'), 'the week view has its sections');
  assert(weekHtml.includes('The pipeline') && weekHtml.includes('Commission owed'), 'and the rest of the week');
  const bookHtml = readFileSync(path.join(root, 'views', 'book.html'), 'utf8');
  assert(bookHtml.includes('Clawback exposure') && bookHtml.includes('The panel'), 'the book view has its sections');

  const docs = run('npm run docs', ['docs.mjs'], { json: false });
  assert(/refix-letter-draft/.test(docs.stdout), 'the refix letters rendered');
  assert(/annual-review-summary/.test(docs.stdout), 'the review summaries rendered');
  assert(/settlement-summary/.test(docs.stdout), 'the settlement summaries rendered');
  assert(/adviser-week-report/.test(docs.stdout), 'the adviser reports rendered');
  const letter = readFileSync(path.join(root, 'docs-out', 'refix-letter-draft', 'ln-2005-rob-tessa-nguyen.html'), 'utf8');
  assert(letter.includes('draft') && letter.includes('The client'), 'the refix letter is plainly a draft with the whole position attached');

  // ---- the human readable side ------------------------------------------------------

  run('clients (text)', ['mortgage.mjs', 'clients'], { json: false });
  run('client (text)', ['mortgage.mjs', 'client', 'Sunita Kaur'], { json: false });
  run('pipeline (text)', ['mortgage.mjs', 'pipeline'], { json: false });
  run('deal (text)', ['mortgage.mjs', 'deal', 'DL-1016'], { json: false });
  run('settlements (text)', ['mortgage.mjs', 'settlements'], { json: false });
  run('rollovers (text)', ['mortgage.mjs', 'rollovers'], { json: false });
  run('reviews-due (text)', ['mortgage.mjs', 'reviews-due'], { json: false });
  run('book (text)', ['mortgage.mjs', 'book'], { json: false });
  run('loan (text)', ['mortgage.mjs', 'loan', 'LN-2001'], { json: false });
  run('lenders (text)', ['mortgage.mjs', 'lenders'], { json: false });
  run('lender (text)', ['mortgage.mjs', 'lender', 'Kiwibank'], { json: false });
  run('advisers (text)', ['mortgage.mjs', 'advisers'], { json: false });
  run('commissions (text)', ['mortgage.mjs', 'commissions'], { json: false });
  run('trail-book (text)', ['mortgage.mjs', 'trail-book'], { json: false });
  run('clawback (text)', ['mortgage.mjs', 'clawback'], { json: false });
  run('compliance (text)', ['mortgage.mjs', 'compliance'], { json: false });
  run('attention (text)', ['mortgage.mjs', 'attention'], { json: false });
  run('stats (text)', ['mortgage.mjs', 'stats'], { json: false });
  run('tasks (text)', ['mortgage.mjs', 'tasks', '--all'], { json: false });
  run('help', ['mortgage.mjs', 'help'], { json: false });
  run('an unknown command exits 1', ['mortgage.mjs', 'nonsense'], { json: false, expectFail: true });

  console.log(`\n${step} checks, PASS`);
} finally {
  if (existsSync(dataDir)) {
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      // Windows can hold the handle briefly; a leftover temp dir is harmless.
    }
  }
}
