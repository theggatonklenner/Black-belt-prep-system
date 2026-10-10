# 14. Student Readiness and Session Payment Tracking

Readiness and payment tracking for the Black Belt Preparation Management System. Both must appear in the student register, attendance screens, dashboard and reports.

## A. Readiness tracking

Readiness is recorded per student, per preparation cycle.

**Statuses:** Not yet assessed · On track · Needs more preparation · Not ready for grading · Ready for grading · Awaiting instructor review

**Record fields:** Student ID, Preparation Cycle ID, readiness status, reason for flagging, instructor notes, date last reviewed, reviewed by, recommended next action.

**Rules**
- Authorised instructors and administrators can update status from a phone.
- Quick action to flag a student as not ready, with a reason (technique, fitness, attendance, instructor recommendation).
- "Needs more preparation" and "Not ready for grading" are highlighted on the dashboard and register.
- Attending all four sessions never marks a student ready automatically.
- History of readiness changes is kept.

## B. Payment tracking

An administrative payment register, not a payment gateway. No card numbers or banking credentials are stored.

**Record fields:** Payment Record ID, Student ID, Preparation Cycle ID, amount due, amount paid, outstanding balance, status, payment date, method (optional), receipt/reference (optional), admin notes.

**Statuses:** Not yet invoiced · Payment due · Partially paid · Paid · Payment overdue · Waived · Refund pending · Refunded

**Rules**
- Fee is configurable per cycle.
- Outstanding balance = amount due − total paid (calculated).
- Each instalment is a separate transaction; earlier transactions are never overwritten.
- Supports full and partial payments, waivers and authorised corrections.
- Status can be set manually for payments received outside the app.
- Recorded attendance never implies payment.
- Payment data is visible to authorised users only.

## C. Dashboard

**Summary cards:** ready for grading, needs more preparation, not ready, awaiting assessment, payment outstanding, partially paid, overdue, fully paid (current cycle).

**Needs Attention list:** name, club, cycle, readiness status, payment status, and the reason or outstanding balance. Filters for readiness status, payment status, club and cycle. Readiness and payment issues are visually distinct.

## D. Student detail screen

Grouped into separate sections for mobile:

- **Cycle and attendance:** current cycle, attendance summary
- **Readiness:** status, notes
- **Grading:** eligibility, result
- **Payment:** amount due, amount paid, balance, status
- **Outputs:** certificate status, ID card printing status

## E. Reports

1. Not ready for grading
2. Needing additional preparation
3. Awaiting readiness assessment
4. Payment outstanding
5. Partially paid
6. Overdue
7. Fully paid
8. Combined follow-up (readiness or payment issues)

Selectable columns; export to Google Sheets, CSV, Excel or PDF where supported. Payment reports include amounts and status; readiness reports include status, notes and next action.

## F. Workflow rules

These statuses are independent. None is set automatically from another:

| Concept | Question it answers |
|---|---|
| Attendance | Did the student attend the sessions? |
| Readiness | Is the student prepared for grading? |
| Payment | Has the student paid the fees? |
| Grading eligibility | Are the administrative requirements met? |
| Grading result | Did the student pass? |
| Certificate status | Approved, produced or issued? |
| ID card status | Prepared, printed or issued? |

Where a decision depends on several factors, show them together and let an authorised person decide.

## Design notes

- Payment status is per cycle, so a student who paid last cycle shows as unpaid for the new one without losing history.
- Readiness is reassessed each cycle; earlier instructor notes remain available.
