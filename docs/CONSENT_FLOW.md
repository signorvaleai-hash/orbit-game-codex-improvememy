# Consent Flow

## Current implementation

- First-time users must choose privacy settings before starting:
  - Analytics: optional
  - Crash reports: optional
- Consent state is stored locally and synced to backend when available.

## Compliance notes

- Do not pre-check optional tracking for strict opt-in jurisdictions.
- Provide a persistent settings entry point for consent changes.
- Log consent changes server-side with timestamp.
