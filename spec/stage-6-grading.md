# Stage 6: Grading

No database update is needed; this uses the grading tables from `prep-setup.sql` and the grading fee from update 04.
Belts are never changed by the app after grading. The "grading to" belt is always worked out from the student's current belt.

## Grading screen (More > Grading)

- Choose a cycle. The grading date and grading fee due date are shown.
- Filters: To decide, Eligible, Put forward, Not eligible, Results, All. Each student shows current belt → belt they are going to, Dan number, attendance, sign-off and readiness.
- Tap a student to see the facts side by side: attendance and whether the requirement (including the sign-off) is met, readiness with its reason, and session and grading fee status for people allowed to see money.

**Eligibility**: Eligible or Not eligible. Not eligible needs a reason. Marking someone eligible who hasn't met attendance or isn't marked ready also needs a reason; the decision records who made it, when, and the attendance and readiness at that time.

**Put forward for grading**: only after an Eligible decision. This charges the grading fee for their next belt, due 3 weeks before the grading date. Taking someone off removes the fee, unless they've paid. (This replaces the tick boxes on the cycle screen.)

**Result**: Passed, Unsuccessful or Deferred, or clear it.

**Select** several to mark eligible (only those who meet the requirements and haven't been decided), put forward (only those eligible), or record as passed.

## Grading list

From the Grading screen, **Grading list**:
- Templates: **Instructor list** (no fees) and **Admin list** (with fees, admins and the payments role only), plus your saved templates.
- Who: put forward, eligible, with a result, or everyone; filter by belt and readiness.
- Columns: Student ID, name, certificate name, current belt, grading to, Dan number, each session and the sign-off, sessions attended, attendance %, requirement met, readiness and reason, eligibility and reason, put forward, grading date, status, result, fees (if allowed), notes. Tick to add or remove, ↑ ↓ to reorder.
- Preview, **Download CSV** (opens in Excel or Google Sheets), **Print**.
- **Save template** by name; a template with fee columns is marked admin-only.
