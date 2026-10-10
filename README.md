# Black Belt Preparation Management System

A mobile-friendly system for managing Taekwondo black belt preparation cycles, built with Google AppSheet and Google Sheets. It covers the student register, four-session attendance, readiness, session payments, grading, certificates and ID card printing in one place.

## Core principle

Attendance, readiness, payment, grading eligibility, grading result, certificate status and ID card status are tracked separately. No status is set automatically from another; an authorised person makes the final decision. Starting a new preparation cycle never overwrites historical records.

## Specification

The full build specification is in [docs/specification.md](docs/specification.md).

Stage 1 findings on the existing ID card software: [docs/stage-1-id-card-integration.md](docs/stage-1-id-card-integration.md).

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

1. Inspect the existing ID card software and its integration options
2. Design the Google Sheets tables and map existing student records
3. Student register, preparation cycles, individual and bulk attendance
4. Readiness tracking and payment management
5. Dashboard, summary cards, filters and follow-up lists
6. Grading management and grading list generator
7. Certificate management and certificate list generator
8. ID card records, printing statuses and print history
9. Reports, exports, permissions and automation
10. Full test with sample data before using real student records

## Data and privacy

This repository holds the specification and build files only. Never commit real student details, payment records or exported reports. Card numbers and banking credentials are never stored anywhere in the system.
