# Sweep Log

Operational log of every sweep from the platform hot wallet to the cold
treasury wallet. Per `SECURITY.md` §4 step 7.

Each entry should include:
- Date (YYYY-MM-DD)
- Amount (DESO)
- Tx hash
- Pre-sweep hot wallet balance
- Post-sweep hot wallet balance
- Notes (smoke test, scheduled, emergency, etc.)

---

| Date | Amount (DESO) | Tx hash | Pre-sweep balance | Post-sweep balance | Notes |
| --- | --- | --- | --- | --- | --- |
| 2026-04-29 | 0.05 | `6f90d6faf315b085aecfa962b45447a9f7b6cee71ad61ab83f606c384bdbfc85` | 7.259215484 DESO | 7.209215484 DESO | Stream 3.3 smoke test — first verified sweep. Block `19bfa587c80e...`. Fee 168 nanos. Verified end-to-end via `verifyDesoTransfer` + treasury dashboard reflected the change correctly. |
