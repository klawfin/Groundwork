# Security

Groundwork holds client financial data: revenue figures, cap tables, and
fundraising plans for companies that have not announced them. Treat every
report accordingly.

## Reporting a vulnerability

**Do not open a public issue, and do not include real client data in any
report.** Describe the problem with fabricated values.

Email the repository owner, or message `@klawfin` or `@NikzRN01` directly.
They are the *organization-defined personnel* for NIST SA-10(e), set in
`scripts/sa10/config.mjs`.

Include what an attacker could read, change or spend, and the steps to
reproduce. You will get an acknowledgement within two working days.

## How changes are controlled

This repository commits straight to `main`; no other branch exists. It
implements **NIST SP 800-53 SA-10, Developer Configuration Management**. The
full mapping is in
[docs/decisions/0016](docs/decisions/0016-sa10-developer-configuration-management.md).

**Once per clone, run:**

```bash
sh scripts/install-hooks.sh
```

- **Configuration items** are 21 security-relevant paths, listed in
  `scripts/sa10/config.mjs`. A commit that changes one needs a trailer:

  ```
  Security-Impact: <who can read or write client data, what is logged or sent
    to a third party, or how the code is built and shipped - or why none of that
    changes>
  ```

  The commit hook refuses the commit without it, and CI re-checks every push.
- **Only verified commits ship.** A deploy must be a commit on `main` whose
  CI and SA-10 runs passed. Production must then report that exact commit.
- **Integrity.** Every GitHub Action is pinned to a commit SHA, installs use
  the frozen lockfile, and `main`'s history can't be rewritten.
- **Flaws are tracked.** A weekly scan keeps one issue labelled
  `security-flaw` and closes it when the findings are resolved. CI blocks
  high and critical advisories in production dependencies.

`pnpm check:sa10` verifies the repository side locally.

## Secrets

`SUPABASE_SERVICE_ROLE_KEY` bypasses row-level security and is the most
valuable secret in the system. It is server-only, guarded by `server-only`, and
never prefixed `NEXT_PUBLIC_`. The app refuses to start if a public variable
holds the same value as a secret. If you suspect a leak, rotate first and
investigate second.
