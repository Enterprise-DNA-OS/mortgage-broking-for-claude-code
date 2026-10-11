// The pages of the read-only app. Each widget reads one key of app/data.js (see app/sources.json).
// Add a page or a widget here, or ask Claude Code to: "add a page to the app that shows ...".
(function () {
  const F = () => window.F;
  const m = (c, short) => F().money(c, { short });
  const shortName = (n) => String(n || '').replace(/ Ltd$/, '').replace(/ Partnership$/, '');

  const LABELS = {
    finance_due: 'Finance clause', settlement_week: 'Settles this week', refix_lapsed: 'Fixed rate lapsed',
    cdd_missing: 'No CDD', advice_gap: 'Advice file gap', clawback: 'Clawback', preapproval_expiring: 'Pre-approval expiring',
    application_quiet: 'Gone quiet at lender', upfront_unpaid: 'Upfront not paid', commission_short: 'Paid short',
    refix_due: 'Refix, no call yet', review_overdue: 'Review overdue', client_quiet: 'Client gone quiet', task_overdue: 'Task overdue',
  };
  const RED = ['finance_due', 'refix_lapsed', 'cdd_missing', 'clawback'];
  const AMBER = ['settlement_week', 'advice_gap', 'preapproval_expiring', 'application_quiet', 'upfront_unpaid', 'commission_short', 'refix_due'];
  const STAGES = [
    [['lead', 'fact-find'], 'New'], ['pre-approval', 'Pre-approval'], ['application', 'At the lender'],
    ['conditional', 'Conditional'], [['unconditional', 'instructed'], 'Unconditional'],
  ];
  const passCount = (D) => D.compliance.filter((r) => !r.breaches.length).length;
  const refix90 = (D) => D.rollovers.filter((r) => r.days_to_refix <= 90);
  const refixTone = (r) => (r.days_to_refix < 0 ? 'red' : r.days_to_refix <= 60 && (r.days_since_contact == null || r.days_since_contact > 30) ? 'amber' : '');

  window.APP = {
    product: 'Mortgage Broking for Claude Code',
    demoFirm: 'Harbourline Mortgages',
    customise: [
      'Warn me at ninety days before a fixed expiry, not sixty.',
      'Add the insurance referral to every settled deal and show it on the pipeline.',
      'Add a page to the app that shows each adviser their own week.',
    ],
    pages: [
      {
        id: 'today', title: 'Today', icon: 'home', heading: 'This week',
        sub: (D) => `${D.attention.length} things want a decision. ${D.settlements.filter((s) => !s.settled_on).length} settlements booked, ${refix90(D).length} fixed rates ending in the next 90 days.`,
        count: (D) => ({ n: D.attention.length, tone: 'red' }),
        ask: ['What needs my attention this week?', 'Write the Monday review.', 'Which refixes has nobody rung yet?', 'What is the trail book worth per year, by lender?'],
        widgets: [
          {
            type: 'kpis', bare: true, items: [
              { label: 'Loan book', value: (D) => m(D.stats.book_cents, true), sub: (D) => `${D.stats.loans} loans, ${D.stats.clients} clients` },
              { label: 'Trail a year', value: (D) => m(D.stats.trail_year_cents), sub: () => 'what the book pays while it stays' },
              { label: 'At the lenders', value: (D) => m(D.stats.at_lenders_cents, true), sub: (D) => `${D.stats.open_deals} deals open` },
              { label: 'Refixes, 90 days', value: (D) => m(refix90(D).reduce((a, r) => a + Number(r.balance_cents), 0), true), sub: (D) => `${refix90(D).length} loans, ${refix90(D).filter((r) => r.days_to_refix < 0).length} already lapsed`, tone: (D) => (refix90(D).some((r) => r.days_to_refix < 0) ? 'amber' : '') },
              { label: 'Upfronts owed', value: (D) => m(D.stats.upfront_owed_cents), sub: () => 'settled, not yet paid', tone: (D) => (Number(D.stats.upfront_owed_cents) > 0 ? 'amber' : '') },
              { label: 'Compliance', value: (D) => `${passCount(D)}/${D.compliance.length}`, sub: () => 'rules passing on the file', tone: (D) => (passCount(D) < D.compliance.length ? 'red' : 'green') },
            ],
          },
          { type: 'attention', source: 'attention', title: 'Needs a decision', note: 'Worst first', span: 7, limit: 11, labels: LABELS, red: RED, amber: AMBER, more: (D) => (D.attention.length > 11 ? `+${D.attention.length - 11} more` : '') },
          { type: 'stack', span: 5, widgets: [
          {
            type: 'list', source: 'settlements', title: 'Settling',
            row: (r, f) => ({ client: r.client, title: r.client, sub: `${r.lender} · ${r.security_address || r.stage}${r.file_gaps ? ` · ${r.file_gaps} file gap${r.file_gaps > 1 ? 's' : ''}` : ''}`, right: m(r.amount_cents), rightSub: r.settled_on ? `settled ${f.date(r.settled_on)}` : f.rel(r.days_to_settlement), tone: r.settled_on ? 'green' : r.file_gaps ? 'amber' : '' }),
          },
          {
            type: 'list', source: (D) => D.rollovers.slice(0, 5), title: 'Fixed rates ending',
            row: (r, f) => ({ client: r.client, title: r.client, sub: `${r.loan_number} · ${r.lender} · ${f.pct(r.rate_bps)} · last call ${r.last_contact_on ? f.rel(f.daysFrom(r.last_contact_on)) : 'never'}`, right: m(r.balance_cents), rightSub: r.days_to_refix < 0 ? `lapsed ${-r.days_to_refix}d ago` : f.date(r.fixed_until), tone: refixTone(r) }),
          },
          ] },
        ],
      },
      {
        id: 'pipeline', title: 'Pipeline', icon: 'board', heading: 'Pipeline',
        sub: (D) => `${D.pipeline.length} open deals worth ${m(D.pipeline.reduce((a, r) => a + Number(r.amount_cents), 0), true)}. The clocks on each one are the finance clause and the pre-approval expiry.`,
        count: (D) => ({ n: D.pipeline.length }),
        ask: ['Which deals are at risk this week?', 'Which lender is slowest to approve this year?', 'Move DL-1016 to conditional, finance due 20 October.', 'Which referral sources send deals that settle?'],
        widgets: [
          {
            type: 'kanban', source: 'pipeline', groupBy: 'stage', columns: STAGES.map(([key, label]) => ({ key, label })), sum: (r) => r.amount_cents,
            card: (r, f) => ({
              client: r.client, title: r.client, amount: m(r.amount_cents, true), sub: `${r.purpose} · ${r.lender}${['fact-find', 'instructed'].includes(r.stage) ? ' · ' + r.stage : ''}`,
              chips: [
                r.days_to_finance != null && !['unconditional', 'instructed'].includes(r.stage) && [`Finance ${f.rel(r.days_to_finance)}`, r.days_to_finance <= 5 ? 'red' : 'amber'],
                r.days_to_preapproval_expiry != null && r.days_to_preapproval_expiry <= 30 && [`Pre-approval ends ${f.rel(r.days_to_preapproval_expiry)}`, 'amber'],
                r.settlement_on && [`Settles ${f.date(r.settlement_on)}`, 'green'],
                !r.cdd_completed_on && ['application', 'conditional', 'unconditional', 'instructed'].includes(r.stage) && ['No CDD', 'red'],
                r.file_gaps > 0 && ['application', 'conditional', 'unconditional', 'instructed'].includes(r.stage) && [`${r.file_gaps} file gap${r.file_gaps > 1 ? 's' : ''}`, 'grey'],
              ],
              left: r.adviser, right: `${r.days_in_stage}d in stage`,
            }),
          },
        ],
      },
      {
        id: 'refix', title: 'Refix book', icon: 'calendar', heading: 'The refix book',
        sub: () => 'Every fixed rate reaching its expiry. The date the retention business runs on.',
        count: (D) => ({ n: refix90(D).length, tone: refix90(D).some((r) => r.days_to_refix < 0) ? 'red' : '' }),
        ask: ['Which refixes has nobody rung yet?', 'Draft the refix letter for the Whelans.', 'Which of these are still inside a clawback window?', 'Warn me at ninety days, not sixty.'],
        widgets: [
          {
            type: 'timeline', source: 'rollovers', title: 'Next 150 days', note: 'Bubble size is the balance', from: -21, to: 150, height: 250,
            date: (r) => r.fixed_until, value: (r) => r.balance_cents, label: (r) => shortName(r.client), inner: (r) => m(r.balance_cents, true), client: (r) => r.client, tone: refixTone, pastLabel: 'LAPSED',
            legend: [['red', 'Lapsed: paying the floating rate'], ['amber', 'Within 60 days, no call in a month'], ['', 'On track']],
          },
          {
            type: 'table', source: 'rollovers', title: 'Every loan in the window', client: (r) => r.client,
            columns: [
              { label: 'Loan', value: (r) => r.loan_number, cls: 'dim' },
              { label: 'Client', value: (r) => r.client, cls: 'strong' },
              { label: 'Lender', value: (r) => r.lender },
              { label: 'Balance', value: (r) => m(r.balance_cents), align: 'r' },
              { label: 'Rate', value: (r, f) => f.pct(r.rate_bps), align: 'r' },
              { label: 'Fixed until', value: (r, f) => `<span class="tag ${refixTone(r)}">${f.date(r.fixed_until)} · ${f.rel(r.days_to_refix)}</span>`, html: true },
              { label: 'Last call', value: (r, f) => (r.last_contact_on ? f.rel(f.daysFrom(r.last_contact_on)) : 'never'), cls: 'dim' },
              { label: 'Clawback', value: (r) => (r.in_clawback_window ? `${r.clawback_months_left} months left` : ''), cls: 'dim' },
              { label: 'Adviser', value: (r) => r.adviser, cls: 'dim' },
            ],
          },
        ],
      },
      {
        id: 'book', title: 'Loan book', icon: 'chart', heading: 'The loan book',
        sub: (D) => `${m(D.stats.book_cents, true)} across ${D.stats.loans} loans and ${D.trailbook.by_lender.length} lenders, paying ${m(D.stats.trail_year_cents)} a year in trail.`,
        ask: ['What leaves if ten percent of the book refinances?', 'Which lender eats the most days between submission and approval?', 'If an adviser left tomorrow, what moves with their book?'],
        widgets: [
          { type: 'bars', source: (D) => [...D.trailbook.by_lender].sort((a, b) => b.book_cents - a.book_cents), title: 'Book by lender', span: 7, label: (r) => r.lender, value: (r) => r.book_cents, format: (v) => m(v, true), sub: (r) => `${r.loans} loan${r.loans > 1 ? 's' : ''} · ${m(r.trail_year_cents)}/yr trail` },
          { type: 'bars', source: (D) => D.clawback.filter((r) => r.status === 'active' && Number(r.exposure_cents) > 0), title: 'Clawback exposure', note: 'If the client left today', span: 5, label: (r) => shortName(r.client), client: (r) => r.client, value: (r) => r.exposure_cents, tone: (r) => (r.days_to_refix != null && r.days_to_refix <= 90 ? 'amber' : ''), sub: (r) => `${r.loan_number} · ${r.lender} · ${r.clawback_months_left}mo left` },
          { type: 'people', source: 'advisers', title: 'Advisers', bare: false, card: (r) => ({ name: r.full_name, role: `${r.role} · ${r.fsp_number}`, stats: [['Book', m(r.book_cents, true)], ['In flight', m(r.live_cents, true)], ['Pipeline', `${r.pipeline} deals`], ['Refixes 90d', String(r.refix_90d)]] }) },
          {
            type: 'table', source: 'lenders', title: 'The panel', note: 'Commission terms are data: keep them matching your aggregator agreement',
            columns: [
              { label: 'Lender', value: (r) => r.name, cls: 'strong' },
              { label: 'Upfront', value: (r, f) => f.pct(r.upfront_rate_bps), align: 'r' },
              { label: 'Trail', value: (r, f) => (r.trail_rate_bps ? f.pct(r.trail_rate_bps) : ''), align: 'r' },
              { label: 'Clawback', value: (r) => `${r.clawback_months} months`, align: 'r' },
              { label: 'Turnaround', value: (r) => (r.turnaround_days ? `${r.turnaround_days} days` : ''), align: 'r' },
              { label: 'Book', value: (r) => (Number(r.book_cents) ? m(r.book_cents, true) : ''), align: 'r' },
              { label: 'BDM', value: (r) => r.bdm_name || '', cls: 'dim' },
            ],
          },
        ],
      },
      {
        id: 'money', title: 'Commissions', icon: 'money', heading: 'Commissions',
        sub: () => 'Upfronts owed, trail reconciled against the statement, and clawbacks raised.',
        count: (D) => { const n = D.commissions.upfronts.filter((r) => r.outstanding || (r.received_cents != null && r.variance_cents < 0)).length; return n ? { n, tone: 'red' } : null; },
        ask: ['Which upfronts never arrived, or arrived short?', 'Reconcile this month\'s aggregator statement.', 'What did clawbacks cost us this year, and why did those clients leave?'],
        widgets: [
          {
            type: 'list', source: (D) => D.commissions.upfronts, title: 'Upfronts', span: 6,
            row: (r, f) => ({ client: r.client, title: `${r.client}`, sub: `${r.loan_number} · ${r.lender} · drawn ${f.date(r.drawn_on)}${r.note ? ' · ' + r.note : ''}`, right: m(r.expected_cents), rightSub: r.outstanding ? `not paid · ${r.days_since_drawn}d` : r.variance_cents < 0 ? `short ${m(-r.variance_cents)}` : `paid ${f.date(r.received_on)}`, tone: r.outstanding ? 'red' : r.variance_cents < 0 ? 'amber' : 'green' }),
          },
          {
            type: 'stack', span: 6, widgets: [{
            type: 'list', source: (D) => D.commissions.trail, title: 'Trail, last statement',
            row: (r, f) => ({ client: r.client, title: r.client, sub: `${r.loan_number} · ${r.lender} · ${f.date(r.period_month, true)}`, right: m(r.expected_cents), rightSub: r.received_cents == null ? 'not received' : r.variance_cents ? `off by ${m(Math.abs(r.variance_cents))}` : 'reconciled', tone: r.received_cents == null ? 'amber' : r.variance_cents ? 'amber' : 'green' }),
          },
          {
            type: 'list', source: (D) => D.commissions.clawbacks, title: 'Clawbacks raised',
            row: (r) => ({ client: r.client, title: r.client, sub: `${r.loan_number} · ${r.lender} · ${r.note || ''}`, right: m(r.expected_cents), rightSub: 'owed back', tone: 'red' }),
          }] },
        ],
      },
      {
        id: 'compliance', title: 'Compliance', icon: 'shield', heading: 'Compliance, checked against the records',
        sub: () => 'Each rule cites its source and runs on your own data. Your rule book, pointed at your file. Not legal advice.',
        count: (D) => { const n = D.compliance.length - passCount(D); return n ? { n, tone: 'red' } : null; },
        ask: ['Run the compliance check and tell me where to start.', 'Which settled deals are missing a record of advice or CDD?', 'We are in Australia: rebuild the rules on the NCCP and the Best Interests Duty.'],
        widgets: [{ type: 'rules', source: 'compliance', bare: true, intro: 'Fix the red ones from the top. Every breach names the record, so the fix is one sentence to Claude.' }],
      },
      {
        id: 'clients', title: 'Clients', icon: 'users', heading: 'Clients',
        sub: (D) => `${D.clients.length} relationships. Click one for the whole file.`,
        ask: ['Which clients have nobody spoken to in three months?', 'Show me the Whelans\' whole file.', 'Import our clients from a Trail export.'],
        widgets: [{
          type: 'table', source: 'clients', search: 'Find a client', client: (r) => r.client, sort: (a, b) => Number(b.book_cents) - Number(a.book_cents),
          columns: [
            { label: 'Client', value: (r) => r.client, cls: 'strong' },
            { label: 'Type', value: (r) => r.client_type, cls: 'dim' },
            { label: 'Adviser', value: (r) => r.adviser || '', cls: 'dim' },
            { label: 'Book', value: (r) => (Number(r.book_cents) ? m(r.book_cents) : ''), align: 'r' },
            { label: 'Loans', value: (r) => r.active_loans || '', align: 'r' },
            { label: 'Deals', value: (r) => r.open_deals || '', align: 'r' },
            { label: 'Next refix', value: (r, f) => (r.next_refix_on ? f.date(r.next_refix_on, true) : ''), cls: 'dim' },
            { label: 'Last contact', value: (r, f) => (r.last_contact_on ? `<span class="tag ${r.days_since_contact > 90 ? 'red' : r.days_since_contact > 45 ? 'amber' : 'grey'}">${f.rel(-r.days_since_contact)}</span>` : '<span class="tag grey">never</span>'), html: true },
            { label: 'CDD', value: (r) => (r.cdd_completed_on ? '<span class="tag green">on file</span>' : '<span class="tag red">missing</span>'), html: true },
          ],
        }],
      },
    ],
    clientDetail(name, D, f) {
      const c = D.clients.find((x) => x.client === name);
      if (!c) return null;
      const loans = D.book.filter((l) => l.client === name);
      const deals = D.pipeline.filter((d) => d.client === name);
      const att = D.attention.filter((a) => a.client === name);
      return {
        sub: `${c.client_type} · ${c.adviser || 'no adviser'} · ${c.cdd_completed_on ? 'CDD on file' : 'no CDD on file'}`,
        facts: [['Book', m(c.book_cents)], ['Loans', String(c.active_loans || 0)], ['Last contact', c.last_contact_on ? f.rel(-c.days_since_contact) : 'never'], ['Next review', c.next_review_due ? f.date(c.next_review_due, true) : '']],
        sections: [
          { title: 'Needs a decision', rows: att.map((a) => ({ title: LABELS[a.reason] || a.reason, sub: a.detail, right: Number(a.amount_cents) ? m(a.amount_cents) : '', rightSub: a.label, tone: RED.includes(a.reason) ? 'red' : AMBER.includes(a.reason) ? 'amber' : 'grey' })) },
          { title: 'Loans', rows: loans.map((l) => ({ title: `${l.loan_number} · ${l.lender}`, sub: `${f.pct(l.rate_bps)} ${l.rate_type}${l.fixed_until && l.rate_type === 'fixed' ? ` until ${f.date(l.fixed_until, true)}` : ''} · ${l.repayment}`, right: m(l.balance_cents), rightSub: l.in_clawback_window ? `${l.clawback_months_left}mo clawback` : '', tone: l.rate_type === 'fixed' ? refixTone(l) || 'grey' : 'grey' })) },
          { title: 'Deals in flight', rows: deals.map((d) => ({ title: `${d.ref} · ${d.purpose}`, sub: `${d.stage} · ${d.lender} · ${d.days_in_stage}d in stage`, right: m(d.amount_cents), rightSub: d.adviser })) },
        ],
        ask: [`Show me ${name}'s whole file.`, `Draft the refix letter for ${name}.`, `Log a call with ${name}: rang about the refix, calling back Friday.`],
      };
    },
  };
})();
