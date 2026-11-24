# ShiftPatch product brief

## The product

Healthcare facilities post open nursing shifts when they need someone on short notice. Nurses browse those openings and pick up the ones that work for them. An administrator watches everything as it happens, tracking which shifts are still open and which have been filled.

## The founder

Juan runs operations for a large, fast-growing hospital network in Florida. Nurse staffing is his biggest headache. When they're short-staffed, filling shifts is manual and slow. He wants a platform where available shifts are posted to a real-time dashboard, so his team always knows which shifts are covered and by whom.

ShiftPatch is pre-launch. Before investing further, Juan wants to validate demand with other hospital operations managers and healthcare staffing directors, his target customers. The product should work as a credible demo for those conversations.

## Founder's full wish list

- Three roles with real permissions (agency, nurse, admin)
- Authentication
- Credential upload with expiry dates
- Shift matching that blocks nurses with lapsed credentials
- Cancellation and no-show handling
- Email notifications
- Timesheets
- Admin dashboard with reporting
- Audit log
- One-click export of nurses' license documents and TB test results for the state inspector
- PostHog analytics
- Deployed to a real URL
  Not every item should be built exactly as asked. See ESCALATION.md.

## Committed scope (agreed with the client)

- Deployed app with all three roles and their permissions, the required API routes and test IDs from spec.md, and passing CI
- Agencies post shifts, nurses with valid credentials claim them
- Cancellations and no-shows reopen the shift and appear in a live admin dashboard and the audit log
- Credential uploads with expiry dates
- Basic timesheet flow, nurses submit actual hours and agencies approve them
- Demo outbox for claim and cancellation notifications
- A few workflow events in PostHog, with no personal or health data
- Stretch goal, admin-only export of sample license documents
- TB test results are not stored. ESCALATION.md documents what must be decided first
  Pending client answer on cancel permissions. Current plan is nurses cancel their own claims in advance, agencies report no-shows on their own shifts. Admins can cancel for both reasons.

## Fixed constraints

- TypeScript
- Load the sample data in spec.md exactly as given
- Required API routes, request and response formats exactly as in spec.md
- Required `data-testid`s exactly as in spec.md, on the element that performs the action
- Fictional, neutral branding. No real company names or assets

## Our call

- Code organization and frameworks
- All UI beyond the required test IDs
- Any API route or data beyond the required ones
- What to build first and what to leave out

## Definition of done

- Deployed at a real URL, loaded with the sample data, working
- Repo with passing CI, type checks, lint and our own tests green, no secrets in git history
- Holds up to misuse attempts and static analysis (OWASP rules, dependency audit, type check)
- Clean, healthy codebase
- Better something small that works than something big and incomplete

## Escalation format

When something genuinely warrants it, add or update ESCALATION.md with Problem, Root cause, Alternative solutions considered, Recommended solution, and Impact/urgency. Commit it as soon as it comes up, not at the end.
