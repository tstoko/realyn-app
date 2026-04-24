# Nimax Theatres demo — screenshot captions for stakeholders

**Disclaimer (include in any external email):** These images use **synthetic demo data only** (fictional shows, venues, and card activity). They are not real customers or live transactions.

Suggested one-line intro for the CFO or ticketing lead: “Here is how the Realyn dispute workspace looks for a theatre-style ticketing org, using our Nimax demo account.”

---

### nimax-01-disputes-list.png

- Chargeback queue for **Nimax Theatres** in one view: status, timeline, amount, and reason.
- Rows span the lifecycle from **needs review** through **submitted**, **won**, and **lost**, so finance and box office can see how cases progress in one place.

### nimax-02-dispute-harry-potter-new.png

- **New / needs review** example: customer claim about **e-tickets not received** (Palace Theatre / *Harry Potter*).
- **Dispute Details** shows amount, respond-by date, and the **customer’s claim** text the team would work from.

### nimax-03-dispute-producers-plan-ready.png

- **Plan ready** stage: refund not processed (*The Producers* / Garrick).
- Illustrates an early workflow state after an evidence or response plan exists, before the team has finished gathering everything.

### nimax-04-dispute-hadestown-evidence.png

- **Gathering evidence** stage: premium seat upgrade dispute (*Hadestown* / Lyric).
- Good for explaining how the product supports **evidence progress** against a structured plan before submission.

### nimax-05-dispute-six-argument-ready.png

- **Argument ready** example: alleged **duplicate charge** for a group booking (*SIX* / Vaudeville).
- Shows a dispute where drafted argument / response material is prepared and the case is closer to submission.

### nimax-06-dispute-resolved-won.png

- **Resolved in merchant favour (won)** with theatre-specific narrative (*Who’s Afraid of Virginia Woolf?*).
- Useful to show what a **closed favourable outcome** looks like in the same UI the team uses day to day.

---

**Regenerating locally:** Start emulators + dashboard (`localhost:3001`), run `npm run seed:nimax:emulator`, install Puppeteer somewhere (e.g. `mkdir -p /tmp/pup && cd /tmp/pup && npm install puppeteer@23 --no-save`), then from repo root:

`NODE_PATH=/tmp/pup/node_modules NIMAX_SCREENSHOT_OUT_DIR="$PWD/docs/nimax-stakeholder-screenshots" node scripts/capture-nimax-stakeholder-screenshots.cjs`

See [scripts/capture-nimax-stakeholder-screenshots.cjs](../../scripts/capture-nimax-stakeholder-screenshots.cjs) for optional `NIMAX_SCREENSHOT_BASE_URL` if the app is not on port 3001.
