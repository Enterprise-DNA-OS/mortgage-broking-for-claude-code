# Why there are no edit screens

Trail is a database with a subscription. The tables underneath it are ordinary: a few entities, a few relationships, a handful of workflows you repeat every week. What you pay for is the layer on top that lets people who do not write SQL get at those tables. Screens, filters, dashboards, forms.

That layer used to be the whole product, because talking to a database was hard. It is not hard any more. Open this folder in Claude Code, describe what you want, and it writes the query, runs it, and explains the answer. Ask a question the dashboard never had a chart for and you still get an answer.

## What you gain

- **Better answers.** A dashboard shows what the vendor decided to chart. Here you ask your own question, in your own words, and get it answered against your own data.
- **No seats.** Everyone who needs to look can look. The bill does not grow with headcount.
- **Your data in your Postgres.** Plain tables. Back them up, query them from anything, leave any time. There is no export step because there is nothing to leave.
- **A process that matches you.** When your way of working changes, you add a command. You do not wait for a feature request to clear.

## The screens you do get

`npm run app` opens a read-only app over your data: the week, the board, the dates, the money, compliance and every client, in your brand. It shows; it never edits. Changing a record is a sentence to Claude, which runs the command, checks the rules and logs it. So there is still something to look at all day, and nothing to click that can go wrong.

## What you give up

- **Drag and drop.** The app shows the board; moving a card is a sentence to Claude, not a drag.
- **A phone app.** It runs where Claude Code runs.
- **A vendor help desk.** This is open source. Enterprise DNA supports the installed version for businesses that want someone to call.

## Who this fits

Small teams who already use Claude Code, or who would rather learn to ask than learn another interface. If your team needs forms to click and type into all day, keep Trail. If you need the answers more than the screens, this is cheaper, faster and yours.

Installed and run for you: https://enterprisedna.co/omni/instead-of/trail
