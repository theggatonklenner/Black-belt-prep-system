# Black Belt Preparation Management System

A mobile-friendly system for managing Taekwondo black belt preparation cycles, built on Supabase alongside the AMA ID Cards software, sharing its logins and database. It covers the student register, four-session attendance, readiness, session payments, grading, certificates and ID card printing in one place.

## Core principle

Attendance, readiness, payment, grading eligibility, grading result, certificate status and ID card status are tracked separately. No status is set automatically from another; an authorised person makes the final decision. Starting a new preparation cycle never overwrites historical records.

## Folders

- `docs/` the app (published with GitHub Pages, see [spec/stage-3-app.md](spec/stage-3-app.md))
- `supabase/prep-setup.sql` the database, then `supabase/prep-update-01.sql` (Dan numbers, sign-off, grading date, upfront or per-session fees) `supabase/prep-update-02.sql` (Dan numbers per rank) `supabase/prep-update-03.sql` (paid at each session) `supabase/prep-update-04.sql` (grading fees) `supabase/prep-update-05.sql` (deleting students, upfront payments at sessions) and `supabase/prep-update-06.sql` (linking ID cards)
- `spec/` the specification and stage notes
- `tests/` database and browser tests

## Specification

The full build specification is in [spec/specification.md](spec/specification.md).

Progress:
- Stage 1, existing ID card software: [spec/stage-1-id-card-integration.md](spec/stage-1-id-card-integration.md)
- Stage 2, database (and why it moved from AppSheet to Supabase): [spec/stage-2-database.md](spec/stage-2-database.md)
- Stage 3, student register, cycles and attendance screens: [spec/stage-3-app.md](spec/stage-3-app.md)
- Stage 4, readiness and payments screens: [spec/stage-4-readiness-payments.md](spec/stage-4-readiness-payments.md)
- Stage 6, grading and grading lists: [spec/stage-6-grading.md](spec/stage-6-grading.md)
- Stage 7, certificates and certificate lists: [spec/stage-7-certificates.md](spec/stage-7-certificates.md)
- Stage 8, ID cards linked to the card software: [spec/stage-8-id-cards.md](spec/stage-8-id-cards.md)
- Stage 9, reports and exports: [spec/stage-9-reports.md](spec/stage-9-reports.md)

| # | Section |
|---|---|
| 1 | Project overview |
| 2 | Main navigation |
| 3 | Central student register |
| 4 | Preparation cycle management |
| 5 | Attendance management |
| 6 | Student readiness tracking |
| 7 | Payment management |
| 8 | Main dashboard |
| 9 | Grading management |
| 10 | Certificate management |
| 11 | Integration with existing ID card software |
| 12 | Reports and exports |
| 13 | Google Sheets database structure |
| 14 | Automation and notifications |
| 15 | Security and user permissions |
| 16 | Build and testing requirements |
| 17 | Final deliverable |

## Build stages

1. Inspect the existing ID card software and its integration options (done)
2. Design the database tables and map existing student records (done)
3. Student register, preparation cycles, individual and bulk attendance (done)
4. Readiness tracking and payment management (done)
5. Dashboard, summary cards, filters and follow-up lists
6. Grading management and grading list generator (done)
7. Certificate management and certificate list generator (done)
8. ID card records, printing statuses and print history (done)
9. Reports, exports, permissions and automation (done)
10. Full test with sample data before using real student records

## Data and privacy

This repository holds the app, specification and build files only; member data lives in Supabase behind a login. Never commit real student details, payment records or exported reports. Card numbers and banking credentials are never stored anywhere in the system.
