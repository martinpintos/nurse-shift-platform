# Escalation: TB test result storage and one-click export

Raised 2026-11-24, day 1 of the build.

## Problem

The founder brief asks for a one-click export of nurses' license documents and TB test results, to hand to the state inspector on request.

License documents are professional records. TB test results are health information about individual nurses. Building storage and bulk export of health records as described would put every nurse's medical data behind a single button, before anyone has decided who may hold it, who may see it, and what the inspector actually needs.

## Root cause

The request describes the output (a file for the inspector) but not the rules around it. Four things are undefined.

1. **What the inspector asks for.** Proof that each nurse was screened and cleared, or the underlying lab documents.
2. **Who is responsible for the records.** The staffing agency, the hospital, or ShiftPatch acting on their behalf.
3. **Which rules apply.** Depending on who holds the data and in what role, health privacy rules (HIPAA, confidentiality requirements for workers' medical information, Florida law) may set requirements for storage, access and disclosure. This needs a legal review, not an engineering guess.
4. **Consent.** Whether nurses agree to their results being shared with an inspector, and how that agreement is recorded.

## Alternatives considered

**A. Build as asked.** Store TB documents next to licenses and bulk export them in one click. Fastest, but one compromised admin account exposes every nurse's health records, and it may not meet whatever rules apply.

**B. Store compliance status, not the medical document.** Record that a TB screening exists, its date, whether the nurse is cleared, and who verified it. Export a compliance report. This covers what an inspector typically needs while keeping almost no medical data in the system.

**C. Store documents with full safeguards.** Encrypted, separate storage, access limited by role, every view and export logged, expiring download links, hosting under a signed Business Associate Agreement where required. The right long-term path if raw documents are mandatory, but it needs legal and vendor decisions first.

**D. Inspector access link instead of a file.** A time-limited, read-only view scoped to one facility and one inspection, so nothing leaves the system as a file.

## Recommended solution

**For this build, option B.** TB screening is tracked as a status (date, cleared, verified by). No TB documents are uploaded or stored. The export covers license documents only (sample data, admin only, every export written to the audit log) plus a credential compliance report.

**Before real nurses use the product**, the founder settles points 1 to 4 with legal counsel. If inspectors require the raw documents, move to C, and consider D so files never leave the system.

## Impact and urgency

- **Does not block** the current build or the demo. The core shift workflow is unaffected.
- **Blocks** storing any real nurse health data, so it needs a decision before a pilot with real users.
- **Cost of skipping it.** Building A now and fixing it later would mean migrating, and possibly having to disclose, sensitive data that should not have been collected in the first place.
