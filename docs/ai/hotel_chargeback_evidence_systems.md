HOTEL CHARGEBACK EVIDENCE GUIDE Essential Systems & Data You Need Access
To

Goal:

Make sure your hotel has access (via CSV/API or staff) to the minimum
set of systems and data that give you the best chance of winning any
chargeback (Visa, Mastercard, Amex).

Legend – How You Access the Data

\- CSV/API = set up exports or integrations so you can pull this
automatically.

\- Staff/manual = front desk, finance, security, reservations or IT need
to pull this when a dispute comes in.

--------------------------------------------------

1\. Property Management System (PMS)
--------------------------------------------------

The PMS is your core evidence hub for stays, payments, and policies.

Main chargeback types it helps with: - Services not received / no-show

\- Cancellation disputes

\- Misrepresentation / not as described (room type, dates, rate) -
Duplicate / “paid by other means”

\- Credit/refund not processed

\- Some fraud claims (proves they stayed and used the room)

A. Get this via CSV/API - Reservations & status

> • Guest name, dates, room type, rate plan
>
> • Status history (booked, modified, cancelled, no-show, checked-in,
> checked-out) • Cancellation codes and timestamps

\- Folio & charges

> • Room charges per night • Taxes & fees
>
> • Incidentals (minibar, parking, spa, etc.) • Payment method per
> charge

\- Payments & refunds

> • Card type, masked card number, auth code (if stored) • Payment and
> refund dates, amounts

\- Audit / activity logs (if available) • Who changed what & when

B. Staff/manual only

\- Signed registration cards and folios

• Guest signature, room and rate confirmation, policies - ID
verification records (if stored)

• Copy of ID checked at check-in - Attached documents

> • Any scanned contracts or special agreements

Why this is essential:

\- Proves the booking existed and what was promised (dates, rate, room
type). - Shows whether the guest cancelled in time or was a no-show.

\- Shows that the guest actually stayed (check-in/out history, folio
activity). - Proves you processed refunds/credits when you say you did.

\- Supports fraud and “I didn’t authorize this” claims with signed docs
and use of the room.

--------------------------------------------------

2\. Point-of-Sale (POS) Systems (Restaurant, Bar, Spa, etc.)
--------------------------------------------------

Used for outlet charges during the stay (food, drinks, spa, shop).

Main chargeback types it helps with:

\- Card-present fraud (“I didn’t authorize this” in a
bar/restaurant/spa) - Incorrect transaction amount

\- Duplicate charges for the same outlet

\- Credit/refund not processed at the outlet

\- Currency conversion disputes (if DCC used)

A. Get this via CSV/API

\- Transaction detail reports

> • Date/time, outlet, staff, itemized spend • Amount, card type, last 4
> digits

\- Void and refund reports

• Which transactions were reversed or refunded - Currency info

> • Currency used, any DCC option chosen (if stored)

B. Staff/manual only

\- Signed card receipts or e-signature capture - DCC consent slips (if
printed at the terminal)

Why this is essential:

\- Proves the cardholder approved the exact amount (signed slip).

\- Shows if two similar charges were really two separate visits or one
duplicate. - Proves a refund/void was already done for a mistaken
charge.

\- Shows the guest chose the currency where relevant.

--------------------------------------------------3. Payment Gateway /
Acquirer Portal --------------------------------------------------

This is the technical transaction record (authorization and settlement).

Main chargeback types it helps with:

\- No authorization / invalid authorization

\- Declined authorization processed anyway - Late presentment

\- Invalid transaction data (wrong expiry, etc.) - Card-not-present
fraud (online bookings)

\- Credit not processed (from card-processing side)

A. Get this via CSV/API - Authorization logs

• Auth code, result, date/time, amount - Settlement/batch records

> • When each charge was settled

\- AVS, CVV and 3-D Secure results

• Address match, CVV match, 3DS authentication status - Refund records

> • Refund transaction IDs, dates, amounts, links to original charge

B. Staff/manual only

\- Full processor screenshots or PDFs of transaction detail

\- Any acquirer emails or letters confirming issues (e.g., system
outages, corrected errors)

Why this is essential:

\- Proves a valid auth was taken for the right amount and on time.

\- Shows you submitted the transaction within card network time limits.

\- Provides strong “compelling evidence” for CNP fraud (AVS/CVV match,
3DS success). - Proves refunds were actually sent back to the card.

--------------------------------------------------

4\. Online Booking Engine / Channel Manager
--------------------------------------------------

Covers direct web bookings and sometimes OTA/channel integrations.

Main chargeback types it helps with: - Services not received / no-show

\- Cancellation disputes

\- Misrepresentation / “not as described” - Card-not-present fraud

\- Paid-by-other-means confusion (if other methods appear in logs)

A. Get this via CSV/API

\- Reservation records (mirrors PMS, but from the booking side) • What
was booked (room, rate, dates)

• Source (website, OTA, promo link, etc.) - Status and change logs

> • Booking created, modified, cancelled, with timestamps

B. Staff/manual only

\- Booking confirmation emails or PDFs

• Show description, price, room type, and full cancellation/refund
policy - Screenshots or archived copies of the booking page

• Show what the guest saw and agreed to - Policy acceptance proof

• Checkboxes or text showing “I accept the terms” with date and time -
IP/device/account details (if available)

> • IP address, browser, device, guest account email

Why this is essential:

\- Proves that policies (no-show, non-refundable, etc.) were clearly
shown. - Proves whether a cancellation was actually requested and when.

\- Shows what exactly was promised (room type, view, facilities) for
“not as described” disputes.

\- Ties the booking to the cardholder’s email, device or IP for fraud
cases.

--------------------------------------------------5. Security & Access
Systems

--------------------------------------------------

Includes CCTV and electronic door lock systems.

Main chargeback types it helps with: - Fraud claims for in-person stays

\- Services-not-received / no-show disputes (proving actual use of the
room)

Staff/manual only (no real API here): - CCTV footage or still images

• Guest arriving, checking in, using the front desk terminal, entering
the room - Electronic keycard logs

> • Room door openings with timestamps and key ID

Why this is essential:

\- Shows the cardholder (or a person using their ID and card) actually
came and used the room.

\- Supports PMS and folio records with strong physical proof of a real
stay.

--------------------------------------------------

6\. Customer Communications & Incident Logs
--------------------------------------------------

Includes email, chat, phone logs and internal notes.

Main chargeback types it helps with:

\- Misrepresentation / not as described

\- Service quality complaints

\- Cancellation disputes (“I called to cancel”) - Recurring charge
disputes

\- Credit/refund not processed (promised refunds)

Staff/manual only:

\- Email threads with the guest

\- Chat logs (web chat, WhatsApp, etc.)

\- Phone call logs and recordings (if available)

• Especially calls about cancellation or complaints - Internal notes in
PMS/CRM

• Complaints, resolutions, promises of refunds, special conditions -
Surveys or feedback where guest said they were happy

Why this is essential:

\- Proves what was actually discussed or promised (or not promised). -
Shows if a guest never raised an issue before the chargeback.

\- Shows if and when a refund or goodwill gesture was agreed.

\- Helps rebut claims that you misled the guest or ignored complaints.

--------------------------------------------------

7\. Housekeeping & Maintenance Records
--------------------------------------------------

Operational proof that the room was used and maintained.

Main chargeback types it helps with:

\- Services not received / no-show (proving room was occupied) - Not as
described / quality complaints

\- Disputes over damage/smoking/cleaning fees

Staff/manual only:

\- Housekeeping logs

• Room cleaned and inspected, occupancy notes, minibar consumption -
Maintenance reports

• Issues reported and fixed, or confirmation no fault found - Damage or
smoking reports (with photos if possible)

Why this is useful (supporting evidence):

\- Backs up that the guest actually stayed and used the room. - Supports
damage/smoking fees with real findings.

\- Shows you responded properly to reported issues where applicable.

--------------------------------------------------Practical Setup
Summary

--------------------------------------------------For best results, make
sure you:

1\) Automate what you can:

> \- PMS exports (reservations, folios, payments, refunds, logs) - POS
> exports (transactions, refunds)
>
> \- Payment gateway exports (auth, settlement, AVS/CVV/3DS, refunds) -
> Booking engine exports (reservations and status changes)

2\) Define who pulls manual evidence:

\- Front Desk / Reservations: signed cards, confirmations, policies,
booking screenshots

> \- Finance: gateway/acquirer screenshots, refund proofs - Security:
> CCTV stills, keycard logs
>
> \- Customer Service: email/chat/phone logs
>
> \- Housekeeping & Maintenance: usage and damage notes, photos

3\) For each dispute, always try to provide:

> \- Proof the booking/service existed and what was promised
>
> \- Proof of guest use/attendance
>
> \- Proof of proper authorization (auth codes, AVS/CVV/3DS) - Proof of
> policy disclosure and acceptance
>
> \- Proof of any refunds or resolutions already given

With these systems and data points in place, your hotel will be in a
strong position to fight almost every type of chargeback across Visa,
Mastercard and Amex.
