#!/usr/bin/env node
// mortgage-broking-for-claude-code: the one CLI. Claude Code slash commands
// call this; so can you.
//
//   node scripts/mortgage.mjs <command> [args] [--flags] [--json]
//
// Run with no arguments (or `help`) for the command list.
//
// This system records the clients, deals, loans, commission, reviews and the
// advice file a mortgage broking business runs every week. It never holds
// money and it never submits anything to a lender. Applications go through
// the lender's own channel; this is the record the business runs on.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { parseCsv, pick } from './lib/csv.mjs';
import { table, money, isoDate, short, truncate, heading } from './lib/format.mjs';

// ---------------------------------------------------------------------------
// Argument parsing

const BOOL_FLAGS = new Set([
  'json', 'help', 'all', 'dry-run', 'force', 'na', 'floating', 'open', 'active',
]);

function parseArgv(argv) {
  const args = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      flags.help = true;
      continue;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      let name;
      let value;
      if (eq > -1) {
        name = a.slice(2, eq);
        value = a.slice(eq + 1);
      } else {
        name = a.slice(2);
        const next = argv[i + 1];
        if (BOOL_FLAGS.has(name) || next === undefined || next.startsWith('--')) value = true;
        else value = argv[++i];
      }
      flags[name] = value;
    } else {
      args.push(a);
    }
  }
  return { args, flags };
}

class CliError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

const num = (v) => Number(v ?? 0);
const str = (v) => (v === true || v === undefined || v === null ? '' : String(v));

// ---------------------------------------------------------------------------
// Dates, money, rates

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDate(v, what = 'date') {
  if (!v || v === true) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const lower = s.toLowerCase();
  if (lower === 'today') return today();
  if (lower === 'yesterday') return addDays(today(), -1);
  if (lower === 'tomorrow') return addDays(today(), 1);
  // New Zealand and Australian exports write DD/MM/YYYY, so the first number
  // is the day unless the second one is too big to be a month.
  const slash = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const [day, month] = b > 12 ? [b, a] : [a, b];
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new CliError(`"${v}" is not a ${what}. Use YYYY-MM-DD.`);
  return isoDate(d);
}

function parseMoney(v) {
  if (v === undefined || v === null || v === '' || v === true) return 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  if (Number.isNaN(n)) throw new CliError(`"${v}" is not an amount.`);
  return Math.round(n * 100);
}

// "5.79" or "5.79%" means 5.79 percent (579 bps). A bare number of 30 or more
// is already basis points, because no home loan rate is 30 percent.
function parseRate(v) {
  if (v === undefined || v === null || v === '' || v === true) return null;
  const n = Number(String(v).replace(/[%\s]/g, ''));
  if (Number.isNaN(n) || n <= 0) throw new CliError(`"${v}" is not an interest rate. Use 5.79 for 5.79%.`);
  return n < 30 ? Math.round(n * 100) : Math.round(n);
}

const rate = (bps) => (bps === null || bps === undefined ? '' : `${(Number(bps) / 100).toFixed(2)}%`);

// ---------------------------------------------------------------------------
// Lookups: full id, first 4+ characters of an id, exact ref, name or number,
// then contains. One hit wins. Several hits list the candidates and exit 1.

const RESOLVERS = {
  client: {
    from: 'clients c left join advisers a on a.id = c.adviser_id',
    cols: 'c.*, a.full_name as adviser_name',
    exact: "lower(c.name) = lower($1) or lower(coalesce(c.email, '')) = lower($1) or lower(coalesce(c.external_ref, '')) = lower($1)",
    fuzzy: 'c.name ilike $1 or c.email ilike $1',
    label: (r) => `${r.name}${r.client_type === 'individual' ? '' : ` (${r.client_type})`}`,
    order: 'c.name',
    listing: 'clients --all',
  },
  adviser: {
    from: 'advisers c',
    cols: 'c.*',
    exact: "lower(c.full_name) = lower($1) or lower(coalesce(c.code, '')) = lower($1) or lower(coalesce(c.email, '')) = lower($1)",
    fuzzy: 'c.full_name ilike $1 or c.code ilike $1',
    label: (r) => `${r.full_name} (${r.role})`,
    order: 'c.full_name',
    listing: 'advisers',
  },
  lender: {
    from: 'lenders c',
    cols: 'c.*',
    exact: "lower(c.name) = lower($1) or lower(coalesce(c.code, '')) = lower($1)",
    fuzzy: 'c.name ilike $1 or c.code ilike $1',
    label: (r) => `${r.name} (${r.kind})`,
    order: 'c.name',
    listing: 'lenders',
  },
  deal: {
    from: 'deals c join clients cl on cl.id = c.client_id left join lenders l on l.id = c.lender_id',
    cols: 'c.*, cl.name as client_name, cl.cdd_completed_on, l.name as lender_name',
    exact: "lower(coalesce(c.ref, '')) = lower($1) or lower(coalesce(c.external_ref, '')) = lower($1)",
    fuzzy: 'c.ref ilike $1 or cl.name ilike $1 or c.security_address ilike $1',
    label: (r) => `${r.ref}  ${r.client_name}: ${r.purpose} ${money(r.amount_cents)} (${r.stage})`,
    order: 'c.opened_on desc',
    listing: 'pipeline --all',
  },
  loan: {
    from: 'loans c join clients cl on cl.id = c.client_id join lenders l on l.id = c.lender_id',
    cols: 'c.*, cl.name as client_name, l.name as lender_name, l.upfront_rate_bps, l.trail_rate_bps, l.refix_fee_cents, l.clawback_months',
    exact: "lower(coalesce(c.loan_number, '')) = lower($1) or lower(coalesce(c.external_ref, '')) = lower($1)",
    fuzzy: 'c.loan_number ilike $1 or cl.name ilike $1 or l.name ilike $1',
    label: (r) => `${r.loan_number || short(r.id)}  ${r.client_name} at ${r.lender_name}, ${money(r.balance_cents)} (${r.status})`,
    order: 'c.drawn_on desc',
    listing: 'book',
  },
  task: {
    from: 'tasks c left join clients cl on cl.id = c.client_id',
    cols: 'c.*, cl.name as client_name',
    exact: 'lower(c.title) = lower($1)',
    fuzzy: 'c.title ilike $1 or cl.name ilike $1',
    label: (r) => `${short(r.id)}  ${truncate(r.title, 50)} (${r.status})`,
    order: 'c.due_on',
    listing: 'tasks --all',
  },
};

const ID_RE = /^[0-9a-f]{4,8}(-[0-9a-f-]*)?$/i;

async function resolve(db, kind, q, { optional = false } = {}) {
  const spec = RESOLVERS[kind];
  q = String(q ?? '').trim();
  if (!q || q === 'true') {
    if (optional) return null;
    throw new CliError(`Give me a ${kind} name, reference or id.`);
  }
  const select = `select ${spec.cols} from ${spec.from}`;
  let rows = [];
  if (ID_RE.test(q)) {
    rows = await db.query(`${select} where c.id::text like $1 order by ${spec.order}`, [q.toLowerCase() + '%']);
    if (rows.length === 1) return rows[0];
  }
  if (!rows.length) rows = await db.query(`${select} where ${spec.exact} order by ${spec.order}`, [q]);
  if (rows.length === 1) return rows[0];
  if (!rows.length) rows = await db.query(`${select} where ${spec.fuzzy} order by ${spec.order}`, [`%${q}%`]);
  if (rows.length === 1) return rows[0];
  if (!rows.length) {
    if (optional) return null;
    throw new CliError(`No ${kind} matches "${q}". Run \`${spec.listing}\` to see what exists.`);
  }
  throw new CliError(
    `"${q}" matches ${rows.length} ${kind} records. Use a reference, an id, or a longer name:\n` +
      rows.map((r) => `  ${short(r.id)}  ${spec.label(r)}`).join('\n'),
  );
}

// The person doing the work: --adviser, MB_ADVISER, or the only active adviser.
async function whoIs(db, flags, { optional = true } = {}) {
  const named = flags.adviser || process.env.MB_ADVISER;
  if (named && named !== true) return resolve(db, 'adviser', named);
  const rows = await db.query('select * from advisers where active order by full_name');
  if (rows.length === 1) return rows[0];
  if (optional) return null;
  if (!rows.length) throw new CliError('No advisers on file. Add one: add adviser "<name>"');
  throw new CliError(
    'Several people work here. Pass --adviser= (or set MB_ADVISER):\n' +
      rows.map((r) => `  ${r.code || short(r.id)}  ${r.full_name}`).join('\n'),
  );
}

// The six records the regulator expects on every advised deal, created as
// "missing" because this system will not call a file complete on no evidence.
const ADVICE_KINDS = [
  ['scope of service disclosure', 'FMC (Regulated Financial Advice Disclosure) Regulations 2020: disclose when the nature and scope of the advice is known'],
  ['fact find and needs analysis', 'Code of Professional Conduct for Financial Advice Services, Standard 3: the advice must be suitable'],
  ['affordability and suitability evidence', 'CCCFA 2003, s 9C: reasonable inquiries into requirements, objectives and affordability'],
  ['AML/CFT customer due diligence', 'AML/CFT Act 2009, ss 11 to 16: CDD before the business relationship is established'],
  ['commission and clawback disclosure', 'Disclosure Regulations 2020: commission, incentives and fees the client may pay, including a clawback fee'],
  ['record of advice', 'FMCA 2013 and FAP standard conditions: a record of the advice given, kept seven years'],
];

async function createAdviceRecords(db, dealId) {
  for (const [kind, standard] of ADVICE_KINDS) {
    await db.query(
      "insert into advice_records (deal_id, kind, standard, status) values ($1, $2, $3, 'missing') on conflict do nothing",
      [dealId, kind, standard],
    );
  }
}

async function nextRef(db, table, column, prefix, start) {
  const [row] = await db.query(
    `select max(cast(substring(${column} from ${prefix.length + 1}) as integer)) as n
     from ${table} where ${column} ~ ('^' || $1 || '[0-9]+$')`,
    [prefix],
  );
  return `${prefix}${Math.max(num(row?.n), start - 1) + 1}`;
}

const STAGES = ['lead', 'fact-find', 'pre-approval', 'application', 'conditional', 'unconditional', 'instructed', 'settled', 'declined', 'withdrawn'];
const OPEN_STAGES = STAGES.slice(0, 7);

// ---------------------------------------------------------------------------
// Reads: the practice

async function cmdClients(db, args, flags) {
  const q = args.join(' ').trim();
  const where = [];
  const params = [];
  if (!flags.all) where.push("p.status = 'active'");
  if (flags.adviser && flags.adviser !== true) {
    const a = await resolve(db, 'adviser', flags.adviser);
    params.push(a.full_name);
    where.push(`p.adviser = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    where.push(`p.client ilike $${params.length}`);
  }
  const rows = await db.query(
    `select * from v_client_position p ${where.length ? 'where ' + where.join(' and ') : ''} order by p.book_cents desc, p.client`,
    params,
  );
  const book = rows.reduce((a, r) => a + num(r.book_cents), 0);
  const text =
    heading(`Clients (${rows.length}, ${money(book)} on the book)`) +
    '\n' +
    table(rows, [
      { key: 'client', label: 'Client', width: 28 },
      { key: 'client_type', label: 'Type' },
      { key: 'adviser', label: 'Adviser', width: 14 },
      { key: 'active_loans', label: 'Loans', align: 'right' },
      { key: 'book_cents', label: 'Book', align: 'right', format: (v) => (num(v) ? money(v) : '') },
      { key: 'next_refix_on', label: 'Next refix', format: isoDate },
      { key: 'open_deals', label: 'Deals', align: 'right', format: (v) => (num(v) ? v : '') },
      { key: 'last_contact_on', label: 'Last contact', format: (v) => isoDate(v) || 'never' },
      { key: 'cdd_completed_on', label: 'CDD', format: (v) => (v ? isoDate(v) : 'MISSING') },
    ]);
  return { text, json: rows };
}

async function cmdClient(db, args) {
  const c = await resolve(db, 'client', args.join(' '));
  const [position] = await db.query('select * from v_client_position where client_id = $1', [c.id]);
  const loans = await db.query(
    `select b.* from v_loan_book b where b.client_id = $1 order by b.status, b.fixed_until nulls last`,
    [c.id],
  );
  const deals = await db.query(
    `select d.ref, d.purpose, d.stage, d.amount_cents, d.opened_on, d.finance_due_on, d.settled_on, coalesce(l.name, '') as lender
     from deals d left join lenders l on l.id = d.lender_id where d.client_id = $1 order by d.opened_on desc`,
    [c.id],
  );
  const reviews = await db.query('select * from reviews where client_id = $1 order by due_on desc limit 6', [c.id]);
  const notes = await db.query(
    `select cn.noted_on, cn.channel, cn.note, coalesce(a.full_name, '') as adviser
     from contact_notes cn left join advisers a on a.id = cn.adviser_id
     where cn.client_id = $1 order by cn.noted_on desc limit 8`,
    [c.id],
  );
  const commissions = await db.query(
    `select p.* from v_commission_position p join loans ln on ln.loan_number = p.loan_number where ln.client_id = $1
     order by p.kind, p.received_on desc nulls first limit 12`,
    [c.id],
  );

  let text = heading(`${c.name} (${c.client_type}, ${c.status})`);
  text += `\n  Adviser: ${c.adviser_name || 'unassigned'}    Referred by: ${c.referred_by || 'not recorded'}    ${c.email || ''} ${c.phone || ''}`;
  text += `\n  CDD: ${c.cdd_completed_on ? `${isoDate(c.cdd_completed_on)} (${c.cdd_type || 'standard'})` : 'MISSING (AML/CFT Act 2009: complete it before anything is submitted)'}`;
  if (position) {
    text += `\n  Book: ${money(position.book_cents)} across ${position.active_loans} active loans.`;
    text += ` Next refix: ${isoDate(position.next_refix_on) || 'none coming'}. Last contact: ${isoDate(position.last_contact_on) || 'never'}.`;
  }
  if (loans.length) {
    text += '\n' + heading('Loans') + '\n' + table(loans, [
      { key: 'loan_number', label: 'Loan' },
      { key: 'lender', label: 'Lender' },
      { key: 'balance_cents', label: 'Balance', align: 'right', format: (v) => money(v) },
      { key: 'rate_bps', label: 'Rate', align: 'right', format: rate },
      { key: 'rate_type', label: 'Type' },
      { key: 'fixed_until', label: 'Fixed until', format: isoDate },
      { key: 'days_to_refix', label: 'Refix in', align: 'right', format: (v, r) => (r.rate_type === 'fixed' ? (num(v) < 0 ? `${-num(v)}d AGO` : `${v}d`) : '') },
      { key: 'status', label: 'Status', format: (v, r) => (v === 'discharged' ? `discharged ${isoDate(r.discharged_on)}` : v) },
    ]);
  }
  if (deals.length) {
    text += '\n' + heading('Deals') + '\n' + table(deals, [
      { key: 'ref', label: 'Ref' },
      { key: 'purpose', label: 'Purpose' },
      { key: 'lender', label: 'Lender' },
      { key: 'amount_cents', label: 'Amount', align: 'right', format: (v) => money(v) },
      { key: 'stage', label: 'Stage' },
      { key: 'opened_on', label: 'Opened', format: isoDate },
      { key: 'finance_due_on', label: 'Finance due', format: isoDate },
    ]);
  }
  if (reviews.length) {
    text += '\n' + heading('Reviews') + '\n' + table(reviews, [
      { key: 'kind', label: 'Review' },
      { key: 'due_on', label: 'Due', format: isoDate },
      { key: 'completed_on', label: 'Completed', format: (v) => isoDate(v) || 'OPEN' },
      { key: 'note', label: 'Note', width: 50 },
    ]);
  }
  if (commissions.length) {
    text += '\n' + heading('Commission') + '\n' + table(commissions, [
      { key: 'loan_number', label: 'Loan' },
      { key: 'kind', label: 'Kind' },
      { key: 'expected_cents', label: 'Expected', align: 'right', format: (v) => money(v) },
      { key: 'received_cents', label: 'Received', align: 'right', format: (v) => (v === null ? 'NOT YET' : money(v)) },
      { key: 'received_on', label: 'On', format: isoDate },
    ]);
  }
  if (notes.length) {
    text += '\n' + heading('Contact log') + '\n' + table(notes, [
      { key: 'noted_on', label: 'Date', format: isoDate },
      { key: 'channel', label: 'How' },
      { key: 'adviser', label: 'Who' },
      { key: 'note', label: 'Note', width: 70 },
    ]);
  }
  return { text, json: { client: c, position, loans, deals, reviews, commissions, notes } };
}

async function cmdAdvisers(db) {
  const rows = await db.query(`
    select a.full_name, a.code, a.role, a.fsp_number, a.active,
      (select count(*) from deals d where d.adviser_id = a.id and d.stage in ('lead','fact-find','pre-approval','application','conditional','unconditional','instructed')) as pipeline,
      (select coalesce(sum(d.amount_cents), 0) from deals d where d.adviser_id = a.id and d.stage in ('application','conditional','unconditional','instructed')) as live_cents,
      (select coalesce(sum(ln.balance_cents), 0) from loans ln where ln.adviser_id = a.id and ln.status = 'active') as book_cents,
      (select count(*) from v_loan_book b where b.adviser = a.full_name and b.status = 'active' and b.rate_type = 'fixed' and b.fixed_until <= current_date + 90) as refix_90d
    from advisers a order by a.active desc, a.full_name`);
  const text =
    heading('Advisers') +
    '\n' +
    table(rows, [
      { key: 'full_name', label: 'Adviser' },
      { key: 'code', label: 'Code' },
      { key: 'role', label: 'Role', width: 30 },
      { key: 'fsp_number', label: 'FSP', format: (v) => v || 'MISSING' },
      { key: 'pipeline', label: 'Pipeline', align: 'right' },
      { key: 'live_cents', label: 'At lenders', align: 'right', format: (v) => (num(v) ? money(v) : '') },
      { key: 'book_cents', label: 'Book', align: 'right', format: (v) => money(v) },
      { key: 'refix_90d', label: 'Refix 90d', align: 'right', format: (v) => (num(v) ? v : '') },
    ]);
  return { text, json: rows };
}

async function cmdLenders(db) {
  const rows = await db.query(`
    select l.name, l.code, l.kind, l.upfront_rate_bps, l.trail_rate_bps, l.refix_fee_cents, l.clawback_months, l.turnaround_days, l.bdm_name,
      (select count(*) from deals d where d.lender_id = l.id and d.stage in ('application','conditional','unconditional','instructed')) as in_flight,
      (select count(*) from loans ln where ln.lender_id = l.id and ln.status = 'active') as loans,
      (select coalesce(sum(ln.balance_cents), 0) from loans ln where ln.lender_id = l.id and ln.status = 'active') as book_cents
    from lenders l where l.active order by book_cents desc`);
  const text =
    heading('The panel') +
    '\n' +
    table(rows, [
      { key: 'name', label: 'Lender' },
      { key: 'kind', label: 'Kind' },
      { key: 'upfront_rate_bps', label: 'Upfront', align: 'right', format: rate },
      { key: 'trail_rate_bps', label: 'Trail', align: 'right', format: (v) => (num(v) ? rate(v) : '') },
      { key: 'refix_fee_cents', label: 'Refix fee', align: 'right', format: (v) => (num(v) ? money(v) : '') },
      { key: 'clawback_months', label: 'Clawback', align: 'right', format: (v) => `${v}mo` },
      { key: 'turnaround_days', label: 'Turnaround', align: 'right', format: (v) => (v ? `${v}d` : '') },
      { key: 'in_flight', label: 'In flight', align: 'right', format: (v) => (num(v) ? v : '') },
      { key: 'loans', label: 'Loans', align: 'right' },
      { key: 'book_cents', label: 'Book', align: 'right', format: (v) => money(v) },
      { key: 'bdm_name', label: 'BDM' },
    ]) +
    '\n\n  Commission terms are data, not gospel: your aggregator agreement governs. Update with:\n' +
    '  add lender "<name>" --upfront=0.85 --trail=0 --refix-fee=150 --clawback-months=27';
  return { text, json: rows };
}

async function cmdLender(db, args) {
  const l = await resolve(db, 'lender', args.join(' '));
  const deals = await db.query(
    `select p.* from v_pipeline p where p.lender = $1 order by p.days_in_stage desc`,
    [l.name],
  );
  const book = await db.query(
    `select b.* from v_loan_book b where b.lender = $1 and b.status = 'active' order by b.fixed_until nulls last`,
    [l.name],
  );
  const total = book.reduce((a, r) => a + num(r.balance_cents), 0);
  let text = heading(`${l.name} (${l.kind})`);
  text += `\n  Upfront ${rate(l.upfront_rate_bps)}${num(l.trail_rate_bps) ? `, trail ${rate(l.trail_rate_bps)} a year` : ', no trail'}` +
    `${num(l.refix_fee_cents) ? `, ${money(l.refix_fee_cents)} per refix` : ''}. Clawback window ${l.clawback_months} months.`;
  if (l.clawback_note) text += `\n  ${l.clawback_note}`;
  text += `\n  Typical turnaround ${l.turnaround_days ? l.turnaround_days + ' days' : 'not recorded'}. BDM: ${l.bdm_name || 'not recorded'}.`;
  text += `\n  Book: ${book.length} loans, ${money(total)}.`;
  if (deals.length) {
    text += '\n' + heading('In flight') + '\n' + table(deals, [
      { key: 'ref', label: 'Ref' },
      { key: 'client', label: 'Client', width: 26 },
      { key: 'stage', label: 'Stage' },
      { key: 'days_in_stage', label: 'Days there', align: 'right' },
      { key: 'amount_cents', label: 'Amount', align: 'right', format: (v) => money(v) },
      { key: 'finance_due_on', label: 'Finance due', format: isoDate },
    ]);
  }
  if (book.length) {
    text += '\n' + heading('The book') + '\n' + table(book, [
      { key: 'loan_number', label: 'Loan' },
      { key: 'client', label: 'Client', width: 26 },
      { key: 'balance_cents', label: 'Balance', align: 'right', format: (v) => money(v) },
      { key: 'rate_bps', label: 'Rate', align: 'right', format: rate },
      { key: 'fixed_until', label: 'Fixed until', format: isoDate },
      { key: 'in_clawback_window', label: 'Clawback', format: (v, r) => (v ? `${r.clawback_months_left}mo left` : '') },
    ]);
  }
  return { text, json: { lender: l, deals, book } };
}

async function cmdPipeline(db, args, flags) {
  const where = [];
  const params = [];
  if (flags.stage && flags.stage !== true) {
    params.push(String(flags.stage).toLowerCase());
    where.push(`p.stage = $${params.length}`);
  }
  if (flags.adviser && flags.adviser !== true) {
    const a = await resolve(db, 'adviser', flags.adviser);
    params.push(a.full_name);
    where.push(`p.adviser = $${params.length}`);
  }
  const rows = await db.query(
    `select * from v_pipeline p ${where.length ? 'where ' + where.join(' and ') : ''}`,
    params,
  );
  const order = Object.fromEntries(OPEN_STAGES.map((s, i) => [s, i]));
  rows.sort((a, b) => (order[a.stage] - order[b.stage]) || (num(b.days_in_stage) - num(a.days_in_stage)));
  const total = rows.reduce((a, r) => a + num(r.amount_cents), 0);
  const live = rows.filter((r) => ['application', 'conditional', 'unconditional', 'instructed'].includes(r.stage));
  let text = heading(`The pipeline (${rows.length} deals, ${money(total)}; ${live.length} at lenders, ${money(live.reduce((a, r) => a + num(r.amount_cents), 0))})`);
  text += '\n' + table(rows, [
    { key: 'ref', label: 'Ref' },
    { key: 'client', label: 'Client', width: 26 },
    { key: 'stage', label: 'Stage' },
    { key: 'days_in_stage', label: 'Days', align: 'right' },
    { key: 'amount_cents', label: 'Amount', align: 'right', format: (v) => money(v) },
    { key: 'lender', label: 'Lender', width: 13 },
    { key: 'purpose', label: 'Purpose' },
    { key: 'adviser', label: 'Adviser', width: 13 },
    { key: 'finance_due_on', label: 'Finance', format: (v, r) => (v && ['application', 'conditional'].includes(r.stage) ? `${isoDate(v)} (${r.days_to_finance}d)` : '') },
    { key: 'preapproval_expires_on', label: 'Pre-appr', format: (v, r) => (v && r.stage === 'pre-approval' ? `${isoDate(v)} (${r.days_to_preapproval_expiry}d)` : '') },
    { key: 'file_gaps', label: 'File', align: 'right', format: (v) => (num(v) ? `gaps: ${v}` : 'ok') },
  ]);
  return { text, json: rows };
}

async function cmdDeal(db, args, flags) {
  const sub = (args[0] || '').toLowerCase();
  if (sub === 'open') return dealOpen(db, args.slice(1), flags);
  if (sub === 'stage') return dealStage(db, args.slice(1), flags);
  if (sub === 'log') return dealLog(db, args.slice(1), flags);

  const d = await resolve(db, 'deal', args.join(' '));
  const events = await db.query('select * from deal_events where deal_id = $1 order by noted_on, created_at', [d.id]);
  const file = await db.query('select * from advice_records where deal_id = $1 order by kind', [d.id]);
  let text = heading(`${d.ref}  ${d.client_name}: ${d.purpose} ${money(d.amount_cents)} (${d.stage})`);
  text += `\n  Lender: ${d.lender_name || 'not chosen yet'}    Security: ${d.security_address || 'none yet'}${d.security_value_cents ? ` (${money(d.security_value_cents)})` : ''}`;
  if (d.amount_cents && d.security_value_cents) text += `    LVR ${Math.round((num(d.amount_cents) / num(d.security_value_cents)) * 100)}%`;
  text += `\n  Opened ${isoDate(d.opened_on)}. In "${d.stage}" since ${isoDate(d.stage_since)}.`;
  const clocks = [];
  if (d.finance_due_on) clocks.push(`finance clause ${isoDate(d.finance_due_on)}`);
  if (d.preapproval_expires_on) clocks.push(`pre-approval expires ${isoDate(d.preapproval_expires_on)}`);
  if (d.settlement_on && !d.settled_on) clocks.push(`settlement booked ${isoDate(d.settlement_on)}`);
  if (d.settled_on) clocks.push(`settled ${isoDate(d.settled_on)}`);
  if (d.declined_on) clocks.push(`declined ${isoDate(d.declined_on)}: ${d.declined_reason || 'no reason recorded'}`);
  if (clocks.length) text += `\n  Clocks: ${clocks.join('; ')}.`;
  if (!d.cdd_completed_on) text += '\n  CDD: MISSING on this client. Complete it before anything is submitted (AML/CFT Act 2009).';
  text += '\n' + heading('The advice file') + '\n' + table(file, [
    { key: 'kind', label: 'Record', width: 42 },
    { key: 'status', label: 'Status', format: (v) => (v === 'missing' ? 'MISSING' : v) },
    { key: 'done_on', label: 'Done', format: isoDate },
  ]);
  if (events.length) {
    text += '\n' + heading('The log') + '\n' + table(events, [
      { key: 'noted_on', label: 'Date', format: isoDate },
      { key: 'event', label: 'Event', width: 32 },
      { key: 'note', label: 'Note', width: 60 },
    ]);
  }
  return { text, json: { deal: d, events, advice_file: file } };
}

// ---------------------------------------------------------------------------
// Writes: the pipeline

async function dealOpen(db, args, flags) {
  const c = await resolve(db, 'client', args.join(' '));
  const amount = parseMoney(flags.amount);
  if (!amount) throw new CliError('A deal needs --amount= (in dollars).');
  const purpose = str(flags.purpose) || 'purchase';
  const adviser = await whoIs(db, flags);
  const lender = flags.lender && flags.lender !== true ? await resolve(db, 'lender', flags.lender) : null;
  const ref = await nextRef(db, 'deals', 'ref', 'DL-', 1001);
  const [d] = await db.query(
    `insert into deals (ref, client_id, adviser_id, lender_id, purpose, amount_cents, security_address, security_value_cents, note)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
    [ref, c.id, adviser?.id ?? null, lender?.id ?? null, purpose, amount, str(flags.security) || null, parseMoney(flags['security-value']) || null, str(flags.note) || null],
  );
  await createAdviceRecords(db, d.id);
  await db.query('insert into deal_events (deal_id, event, note) values ($1, $2, $3)', [d.id, 'opened', str(flags.note) || null]);
  let text = `Opened ${ref}: ${c.name}, ${purpose}, ${money(amount)}${lender ? ` with ${lender.name}` : ''}.`;
  text += '\nThe advice file has been created with all six records missing. That is the to-do list.';
  if (!c.cdd_completed_on) text += `\nCDD is not on file for ${c.name}. Do it early: cdd "${c.name}" --on=today`;
  return { text, json: d };
}

async function dealStage(db, args, flags) {
  const stage = (args[args.length - 1] || '').toLowerCase();
  if (!STAGES.includes(stage)) {
    throw new CliError(`"${stage}" is not a stage. Stages: ${STAGES.join(', ')}.`);
  }
  const d = await resolve(db, 'deal', args.slice(0, -1).join(' '));
  if (stage === 'settled') {
    throw new CliError(`Settling is more than a stage move. Use: settle ${d.ref} --rate= --fixed-until= so the loan, the commission and the review are created with it.`);
  }
  const on = parseDate(flags.on) || today();
  const sets = ['stage = $1', 'stage_since = $2'];
  const params = [stage, on];
  const push = (col, val) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  };
  if (stage === 'fact-find' && !d.fact_find_on) push('fact_find_on', on);
  if (stage === 'application') {
    if (!d.cdd_completed_on && !flags.force) {
      throw new CliError(
        `${d.client_name} has no AML/CFT due diligence on file, and the AML/CFT Act 2009 wants it before the business relationship is established.\n` +
          `Do the CDD first: cdd "${d.client_name}" --on=<date>\n` +
          'If it genuinely exists outside this system, re-run with --force and then record it.',
      );
    }
    push('submitted_on', on);
  }
  if (stage === 'pre-approval') {
    push('submitted_on', d.submitted_on || on);
    if (flags.expires) push('preapproval_expires_on', parseDate(flags.expires, 'expiry date'));
    else if (!d.preapproval_expires_on) push('preapproval_expires_on', addDays(on, 90));
  }
  if (stage === 'conditional' && !d.approved_on) push('approved_on', on);
  if (stage === 'unconditional') push('unconditional_on', on);
  if (flags.settlement) push('settlement_on', parseDate(flags.settlement, 'settlement date'));
  if (flags['finance-due']) push('finance_due_on', parseDate(flags['finance-due'], 'finance date'));
  if (stage === 'declined') {
    push('declined_on', on);
    push('declined_reason', str(flags.reason) || null);
  }
  if (stage === 'withdrawn') push('withdrawn_on', on);
  params.push(d.id);
  await db.query(`update deals set ${sets.join(', ')} where id = $${params.length}`, params);
  await db.query('insert into deal_events (deal_id, noted_on, event, note) values ($1, $2, $3, $4)', [
    d.id, on, `stage: ${d.stage} -> ${stage}`, str(flags.note) || null,
  ]);
  let text = `${d.ref} ${d.client_name}: ${d.stage} -> ${stage} (${on}).`;
  if (stage === 'unconditional') {
    const gaps = await db.query("select kind from advice_records where deal_id = $1 and status = 'missing'", [d.id]);
    if (gaps.length) text += `\nThe advice file still has ${gaps.length} gaps: ${gaps.map((g) => g.kind).join('; ')}. Close them before settlement.`;
  }
  return { text, json: { ref: d.ref, stage, on } };
}

async function dealLog(db, args, flags) {
  const event = args[args.length - 1];
  const d = await resolve(db, 'deal', args.slice(0, -1).join(' '));
  if (!event || event === d.ref) throw new CliError('Give me the event text: deal log <ref> "what happened"');
  const on = parseDate(flags.on) || today();
  await db.query('insert into deal_events (deal_id, noted_on, event, note) values ($1, $2, $3, $4)', [d.id, on, event, str(flags.note) || null]);
  return { text: `Logged on ${d.ref}: ${event}`, json: { ref: d.ref, event, on } };
}

async function cmdSettle(db, args, flags) {
  const d = await resolve(db, 'deal', args.join(' '));
  if (d.stage === 'settled') throw new CliError(`${d.ref} is already settled.`);
  if (!d.lender_id) throw new CliError(`${d.ref} has no lender on it. Set one first: deal stage ${d.ref} application --lender=... or update the deal.`);
  const [lender] = await db.query('select * from lenders where id = $1', [d.lender_id]);
  const on = parseDate(flags.on) || (d.settlement_on ? isoDate(d.settlement_on) : today());
  const amount = parseMoney(flags.amount) || num(d.amount_cents);
  const rateBps = parseRate(flags.rate);
  if (!rateBps) throw new CliError('A settlement needs --rate= (5.79 means 5.79%).');
  const fixedUntil = flags.floating ? null : parseDate(flags['fixed-until'], 'fixed-until date');
  if (!flags.floating && !fixedUntil) throw new CliError('Give me --fixed-until=YYYY-MM-DD, or --floating.');
  const term = flags.term ? Number(flags.term) : 360;
  const loanNumber = str(flags['loan-number']) || (await nextRef(db, 'loans', 'loan_number', 'LN-', 2001));

  const [loan] = await db.query(
    `insert into loans (loan_number, deal_id, client_id, adviser_id, lender_id, drawn_on, amount_cents, balance_cents, rate_bps, rate_type, fixed_until, term_months, repayment)
     values ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, $10, $11, $12) returning *`,
    [loanNumber, d.id, d.client_id, d.adviser_id, d.lender_id, on, amount, rateBps, flags.floating ? 'floating' : 'fixed', fixedUntil, term, str(flags.repayment) || 'principal and interest'],
  );
  const upfront = Math.round((amount * num(lender.upfront_rate_bps)) / 10000);
  await db.query(
    "insert into commission_entries (loan_id, kind, expected_cents, note) values ($1, 'upfront', $2, $3)",
    [loan.id, upfront, `${rate(lender.upfront_rate_bps)} of ${money(amount)} at settlement.`],
  );
  await db.query(
    `update deals set stage = 'settled', stage_since = $2, settled_on = $2, settlement_on = coalesce(settlement_on, $2) where id = $1`,
    [d.id, on],
  );
  await db.query('insert into deal_events (deal_id, noted_on, event) values ($1, $2, $3)', [d.id, on, `settled: ${loanNumber} drawn at ${lender.name}`]);
  const [openReview] = await db.query('select id from reviews where client_id = $1 and completed_on is null', [d.client_id]);
  if (!openReview) {
    await db.query("insert into reviews (client_id, kind, due_on, note) values ($1, 'annual review', $2, 'Scheduled automatically at settlement.')", [d.client_id, addDays(on, 365)]);
  }
  let text = `${d.ref} settled ${on}. ${loanNumber}: ${money(amount)} at ${lender.name}, ${rate(rateBps)} ${flags.floating ? 'floating' : `fixed until ${fixedUntil}`}.`;
  text += `\nUpfront commission expected: ${money(upfront)} (${rate(lender.upfront_rate_bps)}). Record it when the statement lands: commission received ${loanNumber} --amount=${(upfront / 100).toFixed(2)}`;
  text += `\nClawback window: ${lender.clawback_months} months from today. A discharge inside it costs real money.`;
  if (!openReview) text += `\nAnnual review scheduled for ${addDays(on, 365)}.`;
  const gaps = await db.query("select kind from advice_records where deal_id = $1 and status = 'missing'", [d.id]);
  if (gaps.length) text += `\nTHE FILE IS NOT DONE: ${gaps.map((g) => g.kind).join('; ')}. Standard Condition 1 wants these records kept seven years, which requires them to exist.`;
  if (flags['split']) text += `\nAdd the other tranches with: loan add ${d.ref} --amount= --rate= --fixed-until=`;
  return { text, json: { deal: d.ref, loan, upfront_expected_cents: upfront } };
}

async function cmdLoanAdd(db, args, flags) {
  const d = await resolve(db, 'deal', args.join(' '));
  const [lender] = await db.query('select * from lenders where id = $1', [d.lender_id]);
  if (!lender) throw new CliError(`${d.ref} has no lender on it.`);
  const amount = parseMoney(flags.amount);
  const rateBps = parseRate(flags.rate);
  if (!amount || !rateBps) throw new CliError('A tranche needs --amount= and --rate=.');
  const fixedUntil = flags.floating ? null : parseDate(flags['fixed-until'], 'fixed-until date');
  if (!flags.floating && !fixedUntil) throw new CliError('Give me --fixed-until=YYYY-MM-DD, or --floating.');
  const on = parseDate(flags.on) || isoDate(d.settled_on) || today();
  const loanNumber = str(flags['loan-number']) || (await nextRef(db, 'loans', 'loan_number', 'LN-', 2001));
  const [loan] = await db.query(
    `insert into loans (loan_number, deal_id, client_id, adviser_id, lender_id, drawn_on, amount_cents, balance_cents, rate_bps, rate_type, fixed_until, term_months, repayment)
     values ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, $10, $11, $12) returning *`,
    [loanNumber, d.id, d.client_id, d.adviser_id, d.lender_id, on, amount, rateBps, flags.floating ? 'floating' : 'fixed', fixedUntil, flags.term ? Number(flags.term) : 360, str(flags.repayment) || 'principal and interest'],
  );
  const upfront = Math.round((amount * num(lender.upfront_rate_bps)) / 10000);
  await db.query("insert into commission_entries (loan_id, kind, expected_cents, note) values ($1, 'upfront', $2, 'Tranche added after settlement.')", [loan.id, upfront]);
  return {
    text: `${loanNumber}: ${money(amount)} tranche at ${lender.name}, ${rate(rateBps)} ${flags.floating ? 'floating' : `fixed until ${fixedUntil}`}. Upfront expected ${money(upfront)}.`,
    json: loan,
  };
}

async function cmdRefix(db, args, flags) {
  const ln = await resolve(db, 'loan', args.join(' '));
  if (ln.status !== 'active') throw new CliError(`${ln.loan_number} is ${ln.status}.`);
  const rateBps = parseRate(flags.rate);
  if (!rateBps) throw new CliError('A refix needs --rate= (5.65 means 5.65%).');
  const until = flags.floating ? null : parseDate(flags.until || flags['fixed-until'], 'until date');
  if (!flags.floating && !until) throw new CliError('Give me --until=YYYY-MM-DD, or --floating.');
  const on = parseDate(flags.on) || today();
  await db.query(
    `update loans set rate_bps = $2, rate_type = $3, fixed_until = $4${flags.balance ? ', balance_cents = $5' : ''} where id = $1`,
    flags.balance ? [ln.id, rateBps, flags.floating ? 'floating' : 'fixed', until, parseMoney(flags.balance)] : [ln.id, rateBps, flags.floating ? 'floating' : 'fixed', until],
  );
  let feeLine = '';
  if (num(ln.refix_fee_cents) > 0) {
    await db.query(
      "insert into commission_entries (loan_id, kind, expected_cents, note) values ($1, 'refix fee', $2, $3)",
      [ln.id, num(ln.refix_fee_cents), `Refix recorded ${on}.`],
    );
    feeLine = `\n${ln.lender_name} pays ${money(ln.refix_fee_cents)} per refix. Expected entry created; record it when the statement lands.`;
  }
  await db.query(
    "insert into contact_notes (client_id, adviser_id, noted_on, channel, note) values ($1, $2, $3, 'phone', $4)",
    [ln.client_id, ln.adviser_id, on, `Refixed ${ln.loan_number}: ${rate(rateBps)} ${flags.floating ? 'floating' : `until ${until}`}.`],
  );
  return {
    text: `${ln.loan_number} ${ln.client_name}: refixed at ${rate(rateBps)}${flags.floating ? ' floating' : ` until ${until}`}.${feeLine}`,
    json: { loan_number: ln.loan_number, rate_bps: rateBps, fixed_until: until },
  };
}

async function cmdDischarge(db, args, flags) {
  const ln = await resolve(db, 'loan', args.join(' '));
  if (ln.status === 'discharged') throw new CliError(`${ln.loan_number} was discharged ${isoDate(ln.discharged_on)}.`);
  const on = parseDate(flags.on) || today();
  await db.query(
    "update loans set status = 'discharged', discharged_on = $2, discharge_reason = $3, balance_cents = 0 where id = $1",
    [ln.id, on, str(flags.reason) || null],
  );
  const [claw] = await db.query(
    `select months_between(l.drawn_on, $2::date) as months_on, ld.clawback_months,
            (select coalesce(sum(ce.received_cents), 0) from commission_entries ce where ce.loan_id = l.id and ce.kind = 'upfront') as upfront_received
     from loans l join lenders ld on ld.id = l.lender_id where l.id = $1`,
    [ln.id, on],
  );
  let text = `${ln.loan_number} ${ln.client_name}: discharged ${on}.${flags.reason && flags.reason !== true ? ` Reason: ${flags.reason}.` : ''}`;
  if (num(claw.months_on) < num(claw.clawback_months) && num(claw.upfront_received) > 0) {
    const exposure = Math.round((num(claw.upfront_received) * (num(claw.clawback_months) - num(claw.months_on))) / num(claw.clawback_months));
    await db.query(
      "insert into commission_entries (loan_id, kind, expected_cents, note) values ($1, 'clawback', $2, $3)",
      [ln.id, -exposure, `Discharged at month ${claw.months_on} of a ${claw.clawback_months} month window. Straight-line estimate; the lender's schedule figure governs.`],
    );
    text += `\nCLAWBACK: month ${claw.months_on} of a ${claw.clawback_months} month window at ${ln.lender_name}. Straight-line estimate ${money(exposure)} of the ${money(claw.upfront_received)} upfront. Entry created; correct it to the lender's figure when the statement lands.`;
  } else {
    text += '\nOutside the clawback window. Nothing owed back.';
  }
  return { text, json: { loan_number: ln.loan_number, discharged_on: on, ...claw } };
}

async function cmdCommission(db, args, flags) {
  const sub = (args[0] || '').toLowerCase();
  if (sub === 'received') {
    const ln = await resolve(db, 'loan', args.slice(1).join(' '));
    const kind = str(flags.kind) || 'upfront';
    const amount = parseMoney(flags.amount);
    if (!amount) throw new CliError('How much arrived? --amount= (in dollars).');
    const on = parseDate(flags.on) || today();
    const [open] = await db.query(
      'select * from commission_entries where loan_id = $1 and kind = $2 and received_cents is null order by created_at limit 1',
      [ln.id, kind],
    );
    let entry;
    if (open) {
      [entry] = await db.query('update commission_entries set received_cents = $2, received_on = $3 where id = $1 returning *', [open.id, amount, on]);
    } else {
      [entry] = await db.query(
        'insert into commission_entries (loan_id, kind, expected_cents, received_cents, received_on, note) values ($1, $2, $3, $3, $4, $5) returning *',
        [ln.id, kind, amount, on, 'Recorded on receipt; no expected entry existed.'],
      );
    }
    let text = `${ln.loan_number}: ${kind} ${money(amount)} received ${on}.`;
    const variance = amount - num(entry.expected_cents);
    if (variance < 0) text += `\nSHORT by ${money(-variance)} against the expected ${money(entry.expected_cents)}. Query it with the aggregator; the attention list will keep naming it until the numbers match.`;
    if (variance > 0) text += `\nThat is ${money(variance)} more than expected (${money(entry.expected_cents)}). Check which schedule is right and fix the lender terms if they moved.`;
    return { text, json: entry };
  }

  // The read: where the money is.
  const days = flags.days && flags.days !== true ? Number(flags.days) : 90;
  const upfronts = await db.query(
    `select * from v_commission_position where kind in ('upfront', 'refix fee') and (received_on is null or received_on >= current_date - ($1::int))
     order by outstanding desc, drawn_on desc`,
    [days],
  );
  const trail = await db.query(
    `select * from v_commission_position where kind = 'trail' and period_month >= date_trunc('month', current_date - 62)::date
     order by period_month desc, lender, client`,
  );
  const clawbacks = await db.query(
    `select * from v_commission_position where kind = 'clawback' and received_on is null order by drawn_on desc`,
  );
  const owed = upfronts.filter((r) => r.outstanding).reduce((a, r) => a + num(r.expected_cents), 0);
  const short = upfronts.filter((r) => r.received_cents !== null && num(r.variance_cents) < 0);
  let text = heading(`Commission (last ${days} days${owed ? `, ${money(owed)} still owed` : ''})`);
  text += '\n' + heading('Upfronts and refix fees') + '\n' + table(upfronts, [
    { key: 'loan_number', label: 'Loan' },
    { key: 'client', label: 'Client', width: 24 },
    { key: 'lender', label: 'Lender', width: 13 },
    { key: 'kind', label: 'Kind' },
    { key: 'drawn_on', label: 'Drawn', format: isoDate },
    { key: 'expected_cents', label: 'Expected', align: 'right', format: (v) => money(v) },
    { key: 'received_cents', label: 'Received', align: 'right', format: (v, r) => (v === null ? `NOT YET (${r.days_since_drawn}d)` : money(v)) },
    { key: 'variance_cents', label: 'Variance', align: 'right', format: (v, r) => (r.received_cents !== null && num(v) !== 0 ? money(v) : '') },
  ]);
  if (trail.length) {
    text += '\n' + heading('Trail, recent months') + '\n' + table(trail, [
      { key: 'period_month', label: 'Month', format: (v) => isoDate(v).slice(0, 7) },
      { key: 'loan_number', label: 'Loan' },
      { key: 'client', label: 'Client', width: 24 },
      { key: 'lender', label: 'Lender', width: 13 },
      { key: 'expected_cents', label: 'Expected', align: 'right', format: (v) => money(v) },
      { key: 'received_cents', label: 'Received', align: 'right', format: (v) => (v === null ? 'NOT YET' : money(v)) },
    ]);
  }
  if (clawbacks.length) {
    text += '\n' + heading('Clawbacks raised, not yet settled up') + '\n' + table(clawbacks, [
      { key: 'loan_number', label: 'Loan' },
      { key: 'client', label: 'Client', width: 24 },
      { key: 'lender', label: 'Lender', width: 13 },
      { key: 'expected_cents', label: 'Amount', align: 'right', format: (v) => money(v) },
      { key: 'note', label: 'Note', width: 56 },
    ]);
  }
  if (short.length) text += `\n\n  ${short.length} payment(s) arrived short. Query them; nobody else will.`;
  return { text, json: { upfronts, trail, clawbacks } };
}

async function cmdTrailBook(db) {
  const rows = await db.query(`
    select b.lender,
      count(*) as loans,
      sum(b.balance_cents) as book_cents,
      max(l.trail_rate_bps) as trail_rate_bps,
      sum(b.trail_cents_per_year) as trail_year_cents
    from v_loan_book b join lenders l on l.id = b.lender_id
    where b.status = 'active'
    group by b.lender order by trail_year_cents desc, book_cents desc`);
  const refix90 = await db.query(
    "select count(*) as n, coalesce(sum(balance_cents), 0) as cents from v_rollovers where days_to_refix <= 90",
  );
  const total = rows.reduce((a, r) => a + num(r.trail_year_cents), 0);
  const book = rows.reduce((a, r) => a + num(r.book_cents), 0);
  let text = heading(`The trail book (${money(total)} a year on ${money(book)})`);
  text += '\n' + table(rows, [
    { key: 'lender', label: 'Lender' },
    { key: 'loans', label: 'Loans', align: 'right' },
    { key: 'book_cents', label: 'Book', align: 'right', format: (v) => money(v) },
    { key: 'trail_rate_bps', label: 'Trail rate', align: 'right', format: (v) => (num(v) ? rate(v) : 'none') },
    { key: 'trail_year_cents', label: 'Trail / year', align: 'right', format: (v) => (num(v) ? money(v) : '') },
  ]);
  text += `\n\n  ${refix90[0].n} fixed loans (${money(refix90[0].cents)}) reach their expiry inside 90 days. Every one of them is a client conversation, a refix fee where the lender pays one, and a chance for a competitor to take the book. Run: rollovers`;
  return { text, json: { by_lender: rows, refix_90d: refix90[0] } };
}

async function cmdClawback(db) {
  const rows = await db.query('select * from v_clawback order by (status = \'discharged\') desc, clawback_months_left desc');
  const active = rows.filter((r) => r.status === 'active');
  const exposure = active.reduce((a, r) => a + num(r.exposure_cents), 0);
  let text = heading(`Clawback (${active.length} loans in window, ${money(exposure)} straight-line exposure)`);
  text += '\n' + table(rows, [
    { key: 'loan_number', label: 'Loan' },
    { key: 'client', label: 'Client', width: 24 },
    { key: 'lender', label: 'Lender', width: 13 },
    { key: 'drawn_on', label: 'Drawn', format: isoDate },
    { key: 'months_on_book', label: 'Month', align: 'right' },
    { key: 'clawback_months', label: 'Window', align: 'right', format: (v) => `${v}mo` },
    { key: 'upfront_received_cents', label: 'Upfront', align: 'right', format: (v) => money(v) },
    { key: 'exposure_cents', label: 'At risk', align: 'right', format: (v, r) => (r.status === 'active' ? money(v) : '') },
    { key: 'status', label: 'Status', format: (v, r) => (v === 'discharged' ? `DISCHARGED ${isoDate(r.discharged_on)}` : (r.days_to_refix !== null && num(r.days_to_refix) <= 90 ? `refix in ${r.days_to_refix}d` : '')) },
  ]);
  text += '\n\n  The estimate is straight-line across the window. The lender\'s own schedule governs; it lives on each lender card (lender <name>).';
  text += '\n  A refix due INSIDE a clawback window is the dangerous kind: if the client walks to a cashback offer, the upfront walks with them.';
  return { text, json: rows };
}

async function cmdRollovers(db, args, flags) {
  const days = flags.days && flags.days !== true ? Number(flags.days) : 90;
  const rows = await db.query('select * from v_rollovers where days_to_refix <= $1 order by fixed_until', [days]);
  const total = rows.reduce((a, r) => a + num(r.balance_cents), 0);
  const lapsed = rows.filter((r) => num(r.days_to_refix) < 0);
  let text = heading(`The refix book, next ${days} days (${rows.length} loans, ${money(total)})`);
  if (lapsed.length) text += `\n  ${lapsed.length} FIXED RATE(S) HAVE ALREADY LAPSED. Those clients are paying the floating rate right now.`;
  text += '\n' + table(rows, [
    { key: 'loan_number', label: 'Loan' },
    { key: 'client', label: 'Client', width: 26 },
    { key: 'lender', label: 'Lender', width: 13 },
    { key: 'balance_cents', label: 'Balance', align: 'right', format: (v) => money(v) },
    { key: 'rate_bps', label: 'Rate', align: 'right', format: rate },
    { key: 'fixed_until', label: 'Fixed until', format: isoDate },
    { key: 'days_to_refix', label: 'Days', align: 'right', format: (v) => (num(v) < 0 ? `${-num(v)} AGO` : v) },
    { key: 'adviser', label: 'Adviser', width: 13 },
    { key: 'last_contact_on', label: 'Last contact', format: (v, r) => (v ? `${isoDate(v)} (${r.days_since_contact}d)` : 'NEVER') },
    { key: 'in_clawback_window', label: 'Clawback', format: (v, r) => (v ? `${r.clawback_months_left}mo left` : '') },
  ]);
  text += '\n\n  Work it top down: ring, refix (refix <loan> --rate= --until=), and log the call. A refix inside a clawback window protects the upfront too.';
  return { text, json: rows };
}

async function cmdReviewsDue(db) {
  const rows = await db.query(
    `select * from v_reviews_due where completed_on is null order by due_on`,
  );
  const overdue = rows.filter((r) => num(r.days_overdue) > 0);
  let text = heading(`Annual reviews (${rows.length} open, ${overdue.length} overdue)`);
  text += '\n' + table(rows, [
    { key: 'client', label: 'Client', width: 28 },
    { key: 'adviser', label: 'Adviser', width: 14 },
    { key: 'due_on', label: 'Due', format: isoDate },
    { key: 'days_overdue', label: 'Overdue', align: 'right', format: (v) => (num(v) > 0 ? `${v}d` : '') },
    { key: 'book_cents', label: 'Book', align: 'right', format: (v) => (num(v) ? money(v) : '') },
    { key: 'last_contact_on', label: 'Last contact', format: (v) => isoDate(v) || 'never' },
  ]);
  text += '\n\n  The review was the ongoing service the client was promised. Done one? review done <client> --on=today';
  return { text, json: rows };
}

async function cmdReview(db, args, flags) {
  const sub = (args[0] || '').toLowerCase();
  if (sub === 'done') {
    const c = await resolve(db, 'client', args.slice(1).join(' '));
    const on = parseDate(flags.on) || today();
    const adviser = await whoIs(db, flags);
    const [open] = await db.query('select * from reviews where client_id = $1 and completed_on is null order by due_on limit 1', [c.id]);
    if (!open) throw new CliError(`${c.name} has no open review. Schedule one: review schedule "${c.name}" --due=`);
    await db.query('update reviews set completed_on = $2, adviser_id = $3, note = coalesce($4, note) where id = $1', [open.id, on, adviser?.id ?? null, str(flags.note) || null]);
    await db.query("insert into reviews (client_id, kind, due_on, note) values ($1, $2, $3, 'Scheduled automatically at the last review.')", [c.id, open.kind, addDays(on, 365)]);
    return {
      text: `${c.name}: ${open.kind} completed ${on}. The next one is scheduled for ${addDays(on, 365)}.`,
      json: { client: c.name, completed_on: on, next_due: addDays(on, 365) },
    };
  }
  if (sub === 'schedule') {
    const c = await resolve(db, 'client', args.slice(1).join(' '));
    const due = parseDate(flags.due, 'due date');
    if (!due) throw new CliError('When? --due=YYYY-MM-DD');
    const [r] = await db.query(
      "insert into reviews (client_id, kind, due_on, note) values ($1, $2, $3, $4) returning *",
      [c.id, str(flags.kind) || 'annual review', due, str(flags.note) || null],
    );
    return { text: `${c.name}: ${r.kind} scheduled for ${due}.`, json: r };
  }
  throw new CliError('Usage: review done <client> [--on=] [--note=]  |  review schedule <client> --due=');
}

async function cmdAdvice(db, args, flags) {
  const kindQuery = args[args.length - 1];
  const d = await resolve(db, 'deal', args.slice(0, -1).join(' '));
  const matches = ADVICE_KINDS.map(([k]) => k).filter((k) => k.toLowerCase().includes(String(kindQuery).toLowerCase()));
  if (!matches.length) throw new CliError(`No advice record matches "${kindQuery}". The six: ${ADVICE_KINDS.map(([k]) => k).join('; ')}.`);
  if (matches.length > 1) throw new CliError(`"${kindQuery}" matches ${matches.length} records: ${matches.join('; ')}. Be more specific.`);
  const status = flags.na ? 'n/a' : 'on file';
  const on = flags.na ? null : parseDate(flags.on) || today();
  await db.query(
    'update advice_records set status = $3, done_on = $4, note = coalesce($5, note) where deal_id = $1 and kind = $2',
    [d.id, matches[0], status, on, str(flags.note) || null],
  );
  const gaps = await db.query("select kind from advice_records where deal_id = $1 and status = 'missing'", [d.id]);
  let text = `${d.ref}: "${matches[0]}" marked ${status}${on ? ` (${on})` : ''}.`;
  text += gaps.length ? `\nStill missing: ${gaps.map((g) => g.kind).join('; ')}.` : '\nThe advice file is complete.';
  return { text, json: { ref: d.ref, kind: matches[0], status, remaining_gaps: gaps.length } };
}

async function cmdCdd(db, args, flags) {
  const c = await resolve(db, 'client', args.join(' '));
  const on = parseDate(flags.on) || today();
  const type = str(flags.type) || 'standard';
  await db.query('update clients set cdd_completed_on = $2, cdd_type = $3 where id = $1', [c.id, on, type]);
  await db.query(
    `update advice_records ar set status = 'on file', done_on = $2
     from deals d where d.id = ar.deal_id and d.client_id = $1 and ar.kind = 'AML/CFT customer due diligence' and ar.status = 'missing'`,
    [c.id, on],
  );
  return {
    text: `${c.name}: ${type} customer due diligence recorded ${on}. Open deals updated. Keep the identity documents where your AML programme says they live; this records that it happened, and the records themselves must be kept.`,
    json: { client: c.name, cdd_completed_on: on, cdd_type: type },
  };
}

async function cmdLog(db, args, flags) {
  const note = args[args.length - 1];
  const c = await resolve(db, 'client', args.slice(0, -1).join(' '));
  if (!note) throw new CliError('Give me the note: log <client> "what happened"');
  const adviser = await whoIs(db, flags);
  const deal = flags.deal && flags.deal !== true ? await resolve(db, 'deal', flags.deal) : null;
  const on = parseDate(flags.on) || today();
  await db.query(
    'insert into contact_notes (client_id, deal_id, adviser_id, noted_on, channel, note) values ($1, $2, $3, $4, $5, $6)',
    [c.id, deal?.id ?? null, adviser?.id ?? null, on, str(flags.channel) || 'phone', note],
  );
  return { text: `Logged against ${c.name} (${on}): ${note}`, json: { client: c.name, on, note } };
}

async function cmdTask(db, args, flags) {
  const sub = (args[0] || '').toLowerCase();
  if (sub === 'add') {
    const title = args.slice(1).join(' ');
    if (!title) throw new CliError('Give me a title: task add "chase the assessor" [--client=] [--deal=] [--due=]');
    const client = flags.client && flags.client !== true ? await resolve(db, 'client', flags.client) : null;
    const deal = flags.deal && flags.deal !== true ? await resolve(db, 'deal', flags.deal) : null;
    const adviser = await whoIs(db, flags);
    const [t] = await db.query(
      'insert into tasks (title, client_id, deal_id, adviser_id, due_on, note) values ($1, $2, $3, $4, $5, $6) returning *',
      [title, client?.id ?? null, deal?.id ?? null, adviser?.id ?? null, parseDate(flags.due, 'due date'), str(flags.note) || null],
    );
    return { text: `Task: ${title}${t.due_on ? ` (due ${isoDate(t.due_on)})` : ''}`, json: t };
  }
  if (sub === 'done') {
    const t = await resolve(db, 'task', args.slice(1).join(' '));
    await db.query("update tasks set status = 'done', done_on = $2 where id = $1", [t.id, parseDate(flags.on) || today()]);
    return { text: `Done: ${t.title}`, json: { id: t.id, title: t.title } };
  }
  throw new CliError('Usage: task add "<title>" [--client=] [--deal=] [--due=]  |  task done <match>  |  tasks [--all]');
}

async function cmdTasks(db, args, flags) {
  const rows = await db.query(
    `select t.title, t.due_on, t.status, t.done_on, coalesce(c.name, '') as client, coalesce(a.full_name, '') as adviser, coalesce(d.ref, '') as deal
     from tasks t left join clients c on c.id = t.client_id left join advisers a on a.id = t.adviser_id left join deals d on d.id = t.deal_id
     ${flags.all ? '' : "where t.status = 'open'"} order by t.status, t.due_on nulls last`,
  );
  const text =
    heading(`Tasks (${rows.filter((r) => r.status === 'open').length} open)`) +
    '\n' +
    table(rows, [
      { key: 'title', label: 'Task', width: 48 },
      { key: 'client', label: 'Client', width: 24 },
      { key: 'deal', label: 'Deal' },
      { key: 'adviser', label: 'Who', width: 13 },
      { key: 'due_on', label: 'Due', format: (v, r) => (r.status === 'done' ? `done ${isoDate(r.done_on)}` : isoDate(v) || '') },
    ]);
  return { text, json: rows };
}

async function cmdSettlements(db) {
  const rows = await db.query('select * from v_settlements order by settled_on nulls first, settlement_on');
  const booked = rows.filter((r) => !r.settled_on);
  let text = heading(`Settlements (${booked.length} booked, ${rows.length - booked.length} landed in the last 30 days)`);
  text += '\n' + table(rows, [
    { key: 'ref', label: 'Ref' },
    { key: 'client', label: 'Client', width: 26 },
    { key: 'lender', label: 'Lender', width: 13 },
    { key: 'amount_cents', label: 'Amount', align: 'right', format: (v) => money(v) },
    { key: 'settlement_on', label: 'Settles', format: (v, r) => (r.settled_on ? `settled ${isoDate(r.settled_on)}` : `${isoDate(v)} (${r.days_to_settlement}d)`) },
    { key: 'stage', label: 'Stage' },
    { key: 'adviser', label: 'Adviser', width: 13 },
    { key: 'file_gaps', label: 'File', align: 'right', format: (v) => (num(v) ? `gaps: ${v}` : 'ok') },
  ]);
  return { text, json: rows };
}

async function cmdBook(db, args, flags) {
  const where = ["b.status = 'active'"];
  const params = [];
  if (flags.lender && flags.lender !== true) {
    const l = await resolve(db, 'lender', flags.lender);
    params.push(l.name);
    where.push(`b.lender = $${params.length}`);
  }
  if (flags.adviser && flags.adviser !== true) {
    const a = await resolve(db, 'adviser', flags.adviser);
    params.push(a.full_name);
    where.push(`b.adviser = $${params.length}`);
  }
  const rows = await db.query(`select * from v_loan_book b where ${where.join(' and ')} order by b.fixed_until nulls last, b.balance_cents desc`, params);
  const total = rows.reduce((a, r) => a + num(r.balance_cents), 0);
  const wavg = total ? rows.reduce((a, r) => a + num(r.rate_bps) * num(r.balance_cents), 0) / total : 0;
  let text = heading(`The book (${rows.length} loans, ${money(total)}, average rate ${rate(Math.round(wavg))})`);
  text += '\n' + table(rows, [
    { key: 'loan_number', label: 'Loan' },
    { key: 'client', label: 'Client', width: 26 },
    { key: 'lender', label: 'Lender', width: 13 },
    { key: 'balance_cents', label: 'Balance', align: 'right', format: (v) => money(v) },
    { key: 'rate_bps', label: 'Rate', align: 'right', format: rate },
    { key: 'rate_type', label: 'Type' },
    { key: 'fixed_until', label: 'Fixed until', format: isoDate },
    { key: 'repayment', label: 'Repayment', width: 14 },
    { key: 'adviser', label: 'Adviser', width: 13 },
    { key: 'in_clawback_window', label: 'Clawback', format: (v, r) => (v ? `${r.clawback_months_left}mo` : '') },
  ]);
  return { text, json: rows };
}

async function cmdLoan(db, args) {
  const ln = await resolve(db, 'loan', args.join(' '));
  const commissions = await db.query('select * from commission_entries where loan_id = $1 order by created_at', [ln.id]);
  const [book] = await db.query('select * from v_loan_book where loan_id = $1', [ln.id]);
  let text = heading(`${ln.loan_number}  ${ln.client_name} at ${ln.lender_name} (${ln.status})`);
  text += `\n  ${money(ln.balance_cents)} of ${money(ln.amount_cents)} drawn ${isoDate(ln.drawn_on)}. ${rate(ln.rate_bps)} ${ln.rate_type}` +
    `${ln.fixed_until ? ` until ${isoDate(ln.fixed_until)}` : ''}. ${ln.repayment}, ${ln.term_months} months.`;
  if (book) {
    text += `\n  Month ${book.months_on_book} of a ${book.clawback_months} month clawback window${book.in_clawback_window ? ` (${book.clawback_months_left} months left)` : ' (clear)'}.`;
    if (num(book.trail_cents_per_year)) text += ` Trail ${money(book.trail_cents_per_year)} a year at today's balance.`;
  }
  if (ln.status === 'discharged') text += `\n  Discharged ${isoDate(ln.discharged_on)}: ${ln.discharge_reason || 'no reason recorded'}.`;
  if (commissions.length) {
    text += '\n' + heading('Commission ledger') + '\n' + table(commissions, [
      { key: 'kind', label: 'Kind' },
      { key: 'period_month', label: 'Month', format: (v) => (v ? isoDate(v).slice(0, 7) : '') },
      { key: 'expected_cents', label: 'Expected', align: 'right', format: (v) => money(v) },
      { key: 'received_cents', label: 'Received', align: 'right', format: (v) => (v === null ? 'NOT YET' : money(v)) },
      { key: 'received_on', label: 'On', format: isoDate },
      { key: 'note', label: 'Note', width: 48 },
    ]);
  }
  return { text, json: { loan: ln, book, commissions } };
}

// ---------------------------------------------------------------------------
// Compliance: the rules, run against the records.

const COMPLIANCE_RULES = [
  {
    key: 'disclosure',
    name: 'Disclosure given when the scope of advice is known',
    source: 'FMC (Regulated Financial Advice Disclosure) Regulations 2020',
    sql: `select d.ref, c.name as client, d.stage from advice_records ar
          join deals d on d.id = ar.deal_id join clients c on c.id = d.client_id
          where ar.kind = 'scope of service disclosure' and ar.status = 'missing'
            and d.stage in ('application','conditional','unconditional','instructed','settled')`,
    fix: 'advice <deal> "scope" --on=<date it was given>',
  },
  {
    key: 'suitability',
    name: 'Fact find and needs analysis on file before advice',
    source: 'Code of Professional Conduct for Financial Advice Services, Standard 3',
    sql: `select d.ref, c.name as client, d.stage from advice_records ar
          join deals d on d.id = ar.deal_id join clients c on c.id = d.client_id
          where ar.kind = 'fact find and needs analysis' and ar.status = 'missing'
            and d.stage in ('application','conditional','unconditional','instructed','settled')`,
    fix: 'advice <deal> "fact find" --on=',
  },
  {
    key: 'affordability',
    name: 'Affordability and suitability inquiries recorded',
    source: 'Credit Contracts and Consumer Finance Act 2003, s 9C',
    sql: `select d.ref, c.name as client, d.stage from advice_records ar
          join deals d on d.id = ar.deal_id join clients c on c.id = d.client_id
          where ar.kind = 'affordability and suitability evidence' and ar.status = 'missing'
            and d.stage in ('application','conditional','unconditional','instructed','settled')`,
    fix: 'advice <deal> "affordability" --on=',
  },
  {
    key: 'cdd',
    name: 'Customer due diligence before the business relationship',
    source: 'AML/CFT Act 2009, ss 11 to 16',
    sql: `select d.ref, c.name as client, d.stage from deals d join clients c on c.id = d.client_id
          where d.stage in ('application','conditional','unconditional','instructed','settled')
            and c.cdd_completed_on is null`,
    fix: 'cdd <client> --on= --type=standard|enhanced',
  },
  {
    key: 'commission-disclosure',
    name: 'Commission and clawback fee disclosed to the client',
    source: 'FMC (Regulated Financial Advice Disclosure) Regulations 2020',
    sql: `select d.ref, c.name as client, d.stage from advice_records ar
          join deals d on d.id = ar.deal_id join clients c on c.id = d.client_id
          where ar.kind = 'commission and clawback disclosure' and ar.status = 'missing'
            and d.stage in ('application','conditional','unconditional','instructed','settled')`,
    fix: 'advice <deal> "clawback" --on=',
  },
  {
    key: 'record-of-advice',
    name: 'A record of the advice, kept seven years',
    source: 'FMCA 2013 and FAP licence Standard Condition 1 (record keeping)',
    sql: `select d.ref, c.name as client, d.stage from advice_records ar
          join deals d on d.id = ar.deal_id join clients c on c.id = d.client_id
          where ar.kind = 'record of advice' and ar.status = 'missing'
            and d.stage in ('unconditional','instructed','settled')`,
    fix: 'advice <deal> "record of advice" --on=',
  },
  {
    key: 'reviews',
    name: 'The promised ongoing service is actually delivered',
    source: 'FMCA 2013 fair dealing, and the service level in your own disclosure',
    sql: `select r.client, to_char(r.due_on, 'YYYY-MM-DD') as due, r.days_overdue
          from v_reviews_due r where r.completed_on is null and r.due_on < current_date`,
    fix: 'review done <client> --on=  (or ring them and book it)',
  },
  {
    key: 'fsp',
    name: 'Every adviser giving advice holds an FSP registration',
    source: 'Financial Service Providers (Registration and Dispute Resolution) Act 2008',
    sql: `select a.full_name as adviser, a.role from advisers a where a.active and (a.fsp_number is null or a.fsp_number = '')`,
    fix: 'add adviser or update the record with --fsp=',
  },
];

async function cmdCompliance(db, args) {
  const only = (args[0] || '').toLowerCase();
  const rules = only ? COMPLIANCE_RULES.filter((r) => r.key === only) : COMPLIANCE_RULES;
  if (!rules.length) throw new CliError(`No rule "${only}". Rules: ${COMPLIANCE_RULES.map((r) => r.key).join(', ')}.`);
  const results = [];
  let text = heading('Compliance, checked against the records');
  text += '\n  The rule book is docs/compliance.md. Each rule cites its source. None of this is legal advice;\n  it is your own rule book pointed at your own data.\n';
  for (const rule of rules) {
    const rows = await db.query(rule.sql);
    results.push({ key: rule.key, name: rule.name, source: rule.source, breaches: rows });
    if (!rows.length) {
      text += `\n  PASS  ${rule.key.padEnd(22)} ${rule.name}`;
    } else {
      text += `\n  FAIL  ${rule.key.padEnd(22)} ${rule.name} (${rows.length})`;
      text += `\n        ${rule.source}`;
      for (const r of rows.slice(0, 8)) text += `\n        - ${Object.values(r).join('  ')}`;
      if (rows.length > 8) text += `\n        ... and ${rows.length - 8} more`;
      text += `\n        Fix: ${rule.fix}`;
    }
  }
  const failed = results.filter((r) => r.breaches.length);
  text += `\n\n  ${results.length - failed.length} of ${results.length} rules pass.` + (failed.length ? ` Start with ${failed[0].key}.` : ' Keep it that way.');
  return { text, json: results };
}

// ---------------------------------------------------------------------------
// Attention: everything that wants a decision, worst first.

const ATTENTION_ORDER = [
  'finance_due', 'settlement_week', 'refix_lapsed', 'cdd_missing', 'advice_gap', 'clawback',
  'preapproval_expiring', 'application_quiet', 'upfront_unpaid', 'commission_short',
  'refix_due', 'review_overdue', 'client_quiet', 'task_overdue',
];
const ATTENTION_LABELS = {
  finance_due: 'Finance clause about to bite',
  settlement_week: 'Settlement this week',
  refix_lapsed: 'Fixed rate LAPSED',
  cdd_missing: 'No CDD on a submitted deal',
  advice_gap: 'Advice file incomplete',
  clawback: 'Clawback',
  preapproval_expiring: 'Pre-approval expiring',
  application_quiet: 'Application gone quiet',
  upfront_unpaid: 'Upfront not received',
  commission_short: 'Commission arrived short',
  refix_due: 'Refix due, client not contacted',
  review_overdue: 'Annual review overdue',
  client_quiet: 'Client gone quiet',
  task_overdue: 'Task overdue',
};

async function cmdAttention(db) {
  const rows = await db.query('select * from v_attention');
  const order = Object.fromEntries(ATTENTION_ORDER.map((k, i) => [k, i]));
  rows.sort((a, b) => (order[a.reason] ?? 99) - (order[b.reason] ?? 99) || num(b.days) - num(a.days));
  const counts = {};
  for (const r of rows) counts[r.reason] = (counts[r.reason] || 0) + 1;
  let text = heading(`Needs attention (${rows.length})`);
  text += '\n  ' + Object.entries(counts).map(([k, n]) => `${ATTENTION_LABELS[k] || k}: ${n}`).join('  |  ') + '\n';
  text += '\n' + table(rows, [
    { key: 'reason', label: 'What', width: 30, format: (v) => ATTENTION_LABELS[v] || v },
    { key: 'label', label: 'Record', width: 26 },
    { key: 'client', label: 'Client', width: 26 },
    { key: 'adviser', label: 'Adviser', width: 13 },
    { key: 'days', label: 'Days', align: 'right' },
    { key: 'amount_cents', label: 'Value', align: 'right', format: (v) => (num(v) ? money(v) : '') },
    { key: 'detail', label: 'Detail', width: 60 },
  ]);
  return { text, json: rows };
}

async function cmdStats(db) {
  const [row] = await db.query(`
    select (select count(*) from clients where status = 'active') as clients,
           (select count(*) from advisers where active) as advisers,
           (select count(*) from lenders where active) as lenders,
           (select count(*) from deals where stage in ('lead','fact-find','pre-approval','application','conditional','unconditional','instructed')) as open_deals,
           (select coalesce(sum(amount_cents), 0) from deals where stage in ('application','conditional','unconditional','instructed')) as at_lenders_cents,
           (select count(*) from loans where status = 'active') as loans,
           (select coalesce(sum(balance_cents), 0) from loans where status = 'active') as book_cents,
           (select count(*) from v_rollovers where days_to_refix <= 90) as refix_90d,
           (select coalesce(sum(trail_cents_per_year), 0) from v_loan_book where status = 'active') as trail_year_cents,
           (select coalesce(sum(expected_cents), 0) from v_commission_position where kind = 'upfront' and received_cents is null) as upfront_owed_cents,
           (select count(*) from reviews r join clients c on c.id = r.client_id where r.completed_on is null and r.due_on < current_date and c.status = 'active') as reviews_overdue,
           (select count(*) from v_attention) as attention
  `);
  const j = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)]));
  const text =
    heading('The practice in numbers') +
    `\n  ${j.clients} active clients, ${j.advisers} advisers, ${j.lenders} lenders on the panel` +
    `\n  Pipeline: ${j.open_deals} open deals, ${money(j.at_lenders_cents)} sitting at lenders` +
    `\n  Book: ${j.loans} loans, ${money(j.book_cents)}; ${j.refix_90d} refix inside 90 days` +
    `\n  Trail: ${money(j.trail_year_cents)} a year at today's balances` +
    `\n  Owed: ${money(j.upfront_owed_cents)} of upfront commission not yet received` +
    `\n  Reviews overdue: ${j.reviews_overdue}    Attention items: ${j.attention}`;
  return { text, json: j };
}

// ---------------------------------------------------------------------------
// add: clients, lenders, advisers

async function cmdAdd(db, args, flags) {
  const kind = (args[0] || '').toLowerCase();
  const name = args.slice(1).join(' ').trim();
  if (!name) throw new CliError(`Usage: add ${kind || 'client|lender|adviser'} "<name>" [--flags]`);
  if (kind === 'client') {
    const adviser = await whoIs(db, flags);
    const [c] = await db.query(
      `insert into clients (name, client_type, email, phone, city, referred_by, adviser_id, cdd_completed_on, cdd_type)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
      [name, str(flags.type) || 'individual', str(flags.email) || null, str(flags.phone) || null, str(flags.city) || null,
       str(flags['referred-by']) || null, adviser?.id ?? null, parseDate(flags.cdd), flags.cdd ? str(flags['cdd-type']) || 'standard' : null],
    );
    let text = `Client: ${c.name} (${c.client_type}).`;
    if (!c.cdd_completed_on) text += ` No CDD yet; do it before anything is submitted: cdd "${c.name}" --on=`;
    return { text, json: c };
  }
  if (kind === 'lender') {
    const [l] = await db.query(
      `insert into lenders (name, code, kind, upfront_rate_bps, trail_rate_bps, refix_fee_cents, clawback_months, clawback_note, turnaround_days, bdm_name)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning *`,
      [name, str(flags.code) || null, str(flags.kind) || 'bank', parseRate(flags.upfront) ?? 85, parseRate(flags.trail) ?? 0,
       parseMoney(flags['refix-fee']), flags['clawback-months'] ? Number(flags['clawback-months']) : 24,
       str(flags['clawback-note']) || 'Set this to your aggregator agreement wording.', flags.turnaround ? Number(flags.turnaround) : null, str(flags.bdm) || null],
    );
    return { text: `Lender: ${l.name}. Upfront ${rate(l.upfront_rate_bps)}, trail ${rate(l.trail_rate_bps)}, clawback ${l.clawback_months} months.`, json: l };
  }
  if (kind === 'adviser') {
    const [a] = await db.query(
      'insert into advisers (full_name, code, email, phone, fsp_number, role) values ($1, $2, $3, $4, $5, $6) returning *',
      [name, str(flags.code) || null, str(flags.email) || null, str(flags.phone) || null, str(flags.fsp) || null, str(flags.role) || 'mortgage adviser'],
    );
    let text = `Adviser: ${a.full_name}.`;
    if (!a.fsp_number) text += ' No FSP number on file; /compliance will keep saying so until there is.';
    return { text, json: a };
  }
  throw new CliError('add what? client, lender or adviser.');
}

// ---------------------------------------------------------------------------
// Import: bring the book across from Trail, Salestrekker, Mercury or plain CSV.

const STAGE_WORDS = [
  [/settle/i, 'settled'], [/unconditional/i, 'unconditional'], [/instruct|solicitor|document/i, 'instructed'],
  [/conditional|approved/i, 'conditional'], [/submit|application|lodg/i, 'application'],
  [/pre.?approv/i, 'pre-approval'], [/fact.?find|discovery|needs/i, 'fact-find'],
  [/declin/i, 'declined'], [/withdraw|lost|dead/i, 'withdrawn'], [/lead|new|inquiry|enquiry/i, 'lead'],
];

function mapStage(s) {
  for (const [re, stage] of STAGE_WORDS) if (re.test(String(s))) return stage;
  return 'lead';
}

async function cmdImport(db, args, flags) {
  const source = (args[0] || 'csv').toLowerCase();
  if (!['trail', 'salestrekker', 'mercury', 'csv'].includes(source)) {
    throw new CliError('Import sources: trail, salestrekker, mercury, csv. They all read the same columns; the name is for your records.');
  }
  const read = (flagName, required = false) => {
    const p = flags[flagName];
    if (!p || p === true) {
      if (required) throw new CliError(`No ${flagName} file. Pass --${flagName}=path/to/file.csv`);
      return null;
    }
    const file = path.resolve(REPO_ROOT, String(p));
    if (!existsSync(file)) throw new CliError(`No ${flagName} file at ${file}.`);
    return parseCsv(readFileSync(file, 'utf8'));
  };
  const clientRows = read('clients', !flags.loans && !flags.deals);
  const loanRows = read('loans');
  const dealRows = read('deals');
  const dry = Boolean(flags['dry-run']);
  const out = { clients: 0, clients_updated: 0, loans: 0, loans_updated: 0, deals: 0, lenders_created: 0, skipped: [] };
  const adviser = await whoIs(db, flags);

  const findClient = async (name) => {
    const [c] = await db.query('select * from clients where lower(name) = lower($1)', [name]);
    return c || null;
  };
  const getLender = async (name) => {
    if (!name) return null;
    const [l] = await db.query('select * from lenders where lower(name) = lower($1) or lower(coalesce(code, \'\')) = lower($1)', [name]);
    if (l) return l;
    if (dry) {
      out.lenders_created++;
      return { id: null, name };
    }
    const [created] = await db.query(
      "insert into lenders (name, kind, upfront_rate_bps, trail_rate_bps, clawback_months, clawback_note) values ($1, 'bank', 0, 0, 24, 'Created by import with zero commission terms. Set them from your aggregator agreement.') returning *",
      [name],
    );
    out.lenders_created++;
    return created;
  };

  for (const row of clientRows || []) {
    const name = pick(row, 'Name', 'Client', 'Client Name', 'Full Name', 'Contact Name', 'Household');
    if (!name) {
      out.skipped.push('client row with no name column');
      continue;
    }
    const existing = await findClient(name);
    if (existing) {
      out.clients_updated++;
      if (!dry) {
        await db.query('update clients set email = coalesce(nullif($2, \'\'), email), phone = coalesce(nullif($3, \'\'), phone) where id = $1', [
          existing.id, pick(row, 'Email', 'Email Address'), pick(row, 'Phone', 'Mobile', 'Phone Number'),
        ]);
      }
      continue;
    }
    out.clients++;
    if (!dry) {
      const type = (pick(row, 'Type', 'Client Type', 'Entity Type') || 'individual').toLowerCase();
      await db.query(
        'insert into clients (name, client_type, email, phone, city, referred_by, adviser_id, external_ref) values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict do nothing',
        [name, ['individual', 'couple', 'company', 'trust'].includes(type) ? type : 'individual',
         pick(row, 'Email', 'Email Address') || null, pick(row, 'Phone', 'Mobile', 'Phone Number') || null,
         pick(row, 'City', 'Suburb', 'Region') || null, pick(row, 'Referrer', 'Referred By', 'Lead Source', 'Source') || null,
         adviser?.id ?? null, pick(row, 'Client ID', 'Id', 'ID') || null],
      );
    }
  }

  for (const row of loanRows || []) {
    const clientName = pick(row, 'Client', 'Client Name', 'Borrower', 'Name', 'Household');
    const client = clientName ? await findClient(clientName) : null;
    if (!client && !dry) {
      out.skipped.push(`loan for "${clientName || '(no client column)'}": client not found (import clients first, names must match)`);
      continue;
    }
    const lenderName = pick(row, 'Lender', 'Bank', 'Funder');
    if (!lenderName) {
      out.skipped.push(`loan for "${clientName}": no lender column`);
      continue;
    }
    const amount = parseMoney(pick(row, 'Amount', 'Loan Amount', 'Original Amount') || pick(row, 'Balance', 'Current Balance', 'Loan Balance'));
    if (!amount) {
      out.skipped.push(`loan for "${clientName}": no amount or balance`);
      continue;
    }
    const loanNumber = pick(row, 'Loan Number', 'Account Number', 'Loan Account', 'Number') || null;
    const existing = loanNumber ? await db.query('select id from loans where lower(loan_number) = lower($1)', [loanNumber]) : [];
    if (existing.length) {
      out.loans_updated++;
      if (!dry) {
        const bal = parseMoney(pick(row, 'Balance', 'Current Balance', 'Loan Balance'));
        if (bal) await db.query('update loans set balance_cents = $2 where id = $1', [existing[0].id, bal]);
      }
      continue;
    }
    out.loans++;
    if (dry) continue;
    const lender = await getLender(lenderName);
    const rateBps = (() => {
      try {
        return parseRate(pick(row, 'Rate', 'Interest Rate', 'Current Rate')) ?? 0;
      } catch {
        return 0;
      }
    })();
    const fixedUntil = (() => {
      try {
        return parseDate(pick(row, 'Fixed Until', 'Fixed Expiry', 'Fixed Rate Expiry', 'Rollover Date', 'Expiry Date', 'Refix Date'));
      } catch {
        return null;
      }
    })();
    const drawn = (() => {
      try {
        return parseDate(pick(row, 'Drawn', 'Drawdown Date', 'Settled', 'Settlement Date', 'Start Date'));
      } catch {
        return null;
      }
    })();
    await db.query(
      `insert into loans (loan_number, client_id, adviser_id, lender_id, drawn_on, amount_cents, balance_cents, rate_bps, rate_type, fixed_until, term_months, repayment, external_ref)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) on conflict do nothing`,
      [loanNumber, client.id, adviser?.id ?? null, lender.id, drawn || today(),
       parseMoney(pick(row, 'Amount', 'Loan Amount', 'Original Amount')) || amount,
       parseMoney(pick(row, 'Balance', 'Current Balance', 'Loan Balance')) || amount,
       rateBps, fixedUntil ? 'fixed' : (/(float|variable)/i.test(pick(row, 'Rate Type', 'Type')) ? 'floating' : (pick(row, 'Rate Type', 'Type') ? 'fixed' : 'floating')),
       fixedUntil, Number(pick(row, 'Term', 'Term Months', 'Loan Term')) || 360,
       /interest only|io/i.test(pick(row, 'Repayment', 'Repayment Type')) ? 'interest only' : 'principal and interest',
       pick(row, 'Loan ID', 'Id', 'ID') || null],
    );
  }

  for (const row of dealRows || []) {
    const clientName = pick(row, 'Client', 'Client Name', 'Name', 'Household');
    const client = clientName ? await findClient(clientName) : null;
    if (!client && !dry) {
      out.skipped.push(`deal for "${clientName || '(no client column)'}": client not found`);
      continue;
    }
    out.deals++;
    if (dry) continue;
    const lender = await getLender(pick(row, 'Lender', 'Bank', 'Funder') || null);
    const ref = await nextRef(db, 'deals', 'ref', 'DL-', 1001);
    const [d] = await db.query(
      `insert into deals (ref, client_id, adviser_id, lender_id, purpose, stage, amount_cents, opened_on, external_ref)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
      [ref, client.id, adviser?.id ?? null, lender?.id ?? null,
       (pick(row, 'Purpose', 'Deal Type', 'Opportunity Type') || 'purchase').toLowerCase(),
       mapStage(pick(row, 'Stage', 'Status', 'Pipeline Stage')),
       parseMoney(pick(row, 'Amount', 'Loan Amount', 'Value')) || 0,
       (() => { try { return parseDate(pick(row, 'Opened', 'Created', 'Date')) || today(); } catch { return today(); } })(),
       pick(row, 'Deal ID', 'Opportunity ID', 'Id', 'ID') || null],
    );
    await createAdviceRecords(db, d.id);
  }

  let text = dry ? heading('Import dry run: nothing was written') : heading('Imported');
  text += `\n  Clients: ${out.clients} new, ${out.clients_updated} already here`;
  text += `\n  Loans: ${out.loans} new, ${out.loans_updated} updated`;
  if (out.deals) text += `\n  Deals: ${out.deals}`;
  if (out.lenders_created) text += `\n  Lenders created with ZERO commission terms: ${out.lenders_created}. Set each one from your aggregator agreement (lenders shows the gaps).`;
  if (out.skipped.length) {
    text += `\n  Skipped ${out.skipped.length}:`;
    for (const s of out.skipped.slice(0, 12)) text += `\n    - ${s}`;
    if (out.skipped.length > 12) text += `\n    ... and ${out.skipped.length - 12} more`;
  }
  text += '\n\n  Imported clients have no CDD date and imported deals have empty advice files, deliberately:';
  text += '\n  this system will not call a file complete because the old one never said otherwise.';
  text += '\n  The attention list and /compliance now show exactly what to backfill.';
  return { text, json: out };
}

async function cmdExport(db, args, flags) {
  const tables = ['advisers', 'clients', 'lenders', 'deals', 'deal_events', 'advice_records', 'loans', 'commission_entries', 'reviews', 'tasks', 'contact_notes'];
  const dump = {};
  for (const t of tables) dump[t] = await db.query(`select * from ${t}`);
  const outFile = path.resolve(REPO_ROOT, str(flags.out) || `exports/mortgage-broking-${today()}.json`);
  const { mkdirSync } = await import('node:fs');
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(dump, null, 2));
  const counts = Object.fromEntries(tables.map((t) => [t, dump[t].length]));
  return {
    text: `Exported the whole database to ${path.relative(REPO_ROOT, outFile)}:\n  ` + tables.map((t) => `${t}: ${counts[t]}`).join(', '),
    json: { file: outFile, counts },
  };
}

// ---------------------------------------------------------------------------

const HELP = `
mortgage-broking-for-claude-code: the record a mortgage broking business runs on.

  node scripts/mortgage.mjs <command> [args] [--flags]     (or: npm run mortgage -- <command>)

The week
  pipeline [--stage=] [--adviser=]          every open deal with both clocks on it
  attention                                 everything that wants a decision, worst first
  rollovers [--days=90]                     the refix book, soonest first
  settlements                               booked and just landed
  reviews-due                               the promised annual reviews, overdue first
  commissions [--days=90]                   upfronts owed, trail reconciled, shorts, clawbacks
  compliance [rule]                         the rules in docs/compliance.md, run on the records
  stats                                     the practice in numbers

The records
  clients [q] [--all]  client <name>        the relationships
  deal <ref>                                one deal: clocks, log, advice file
  book [--lender=] [--adviser=]             the loan book    loan <number>  one loan
  lenders   lender <name>                   the panel and its terms
  advisers                                  who works here
  trail-book                                trail per year, by lender
  clawback                                  every loan in a window, exposure attached
  tasks [--all]

The work
  deal open <client> --amount= [--purpose=] [--lender=]
  deal stage <ref> <stage> [--on=] [--note=] [--finance-due=] [--settlement=] [--expires=]
  deal log <ref> "what happened"
  settle <ref> --rate=5.79 --fixed-until=YYYY-MM-DD [--floating] [--amount=] [--term=]
  loan add <ref> --amount= --rate= --fixed-until=      a second tranche on a settlement
  refix <loan> --rate= --until=  [--floating]
  discharge <loan> [--on=] [--reason=]                 computes the clawback as it goes
  commission received <loan> --amount= [--kind=upfront|trail|refix fee] [--on=]
  review done <client> [--on=]   review schedule <client> --due=
  advice <deal> "<record>" [--on=] [--na]              mark an advice file record
  cdd <client> [--on=] [--type=standard|enhanced]
  log <client> "note" [--channel=] [--deal=]
  task add "title" [--client= --deal= --due=]   task done <match>
  add client|lender|adviser "<name>" [--flags]
  import trail|salestrekker|mercury|csv --clients= [--loans=] [--deals=] [--dry-run]
  export [--out=file.json]

Money in dollars: --amount=685000 means $685,000. Rates as people say them: --rate=5.79 is 5.79%.
Any command takes --json. Names, refs and loan numbers match case-insensitively; an ambiguous
one lists the candidates rather than guessing.
Client money never touches this system, and nothing here submits to a lender.
`;

const COMMANDS = {
  clients: cmdClients,
  client: cmdClient,
  advisers: cmdAdvisers,
  lenders: cmdLenders,
  lender: cmdLender,
  pipeline: cmdPipeline,
  deal: cmdDeal,
  deals: cmdPipeline,
  settle: cmdSettle,
  settlements: cmdSettlements,
  loan: cmdLoan,
  'loan-add': cmdLoanAdd,
  book: cmdBook,
  refix: cmdRefix,
  discharge: cmdDischarge,
  rollovers: cmdRollovers,
  commission: cmdCommission,
  commissions: cmdCommission,
  'trail-book': cmdTrailBook,
  clawback: cmdClawback,
  'reviews-due': cmdReviewsDue,
  review: cmdReview,
  advice: cmdAdvice,
  cdd: cmdCdd,
  log: cmdLog,
  task: cmdTask,
  tasks: cmdTasks,
  compliance: cmdCompliance,
  attention: cmdAttention,
  stats: cmdStats,
  add: cmdAdd,
  import: cmdImport,
  export: cmdExport,
};

async function main() {
  const { args, flags } = parseArgv(process.argv.slice(2));
  const [command, ...rest] = args;
  if (!command || command === 'help' || flags.help) {
    process.stdout.write(HELP);
    return 0;
  }
  // `loan add DL-1010 ...` reads naturally; route it to loan-add.
  let fn = COMMANDS[command];
  let effectiveRest = rest;
  if (command === 'loan' && rest[0] === 'add') {
    fn = cmdLoanAdd;
    effectiveRest = rest.slice(1);
  }
  if (!fn) {
    process.stderr.write(`Unknown command "${command}".\n\n${HELP}`);
    return 1;
  }
  const db = await getDb();
  try {
    const result = await fn(db, effectiveRest, flags);
    if (flags.json) process.stdout.write(JSON.stringify(result.json, null, 2) + '\n');
    else process.stdout.write(result.text.replace(/^\n/, '') + '\n');
    return 0;
  } catch (e) {
    if (e instanceof CliError) {
      process.stderr.write(`${e.message}\n`);
      return e.code;
    }
    if (/relation "?\w+"? does not exist/.test(e.message)) {
      process.stderr.write('The database has no tables yet. Run: npm run migrate\n');
      return 1;
    }
    throw e;
  } finally {
    await db.close();
  }
}

process.exitCode = await main();
