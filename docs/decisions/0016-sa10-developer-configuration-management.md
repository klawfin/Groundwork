# 0016 — NIST SA-10: Developer Configuration Management

**Status:** accepted. Repository side implemented; settings side needs an admin (see below).
**Date:** 2026-09-24

## Context

Three decisions arrived together.

1. **Dependabot was removed.** In one week it opened eight branches and eight
   pull requests, and every one of them failed CI. The failure was a CI bug
   that would have failed *every* pull request: the secret scan lacked
   `pull-requests: read`. It was hidden because `main` never ran the failing
   code path.
2. **The repository commits straight to `main`.** There are no feature
   branches and no pull requests, locally or on GitHub. Only `main` exists.
3. **An SA-10 layer was asked for.** NIST SP 800-53 Rev. 5 SA-10, *Developer
   Configuration Management*, requires the developer to:

   > a. perform configuration management during design, development,
   >    implementation, operation;
   > b. document, manage and control the integrity of changes to
   >    *[organization-defined configuration items]*;
   > c. implement only organization-approved changes;
   > d. document approved changes and their potential security and privacy
   >    impacts;
   > e. track security flaws and flaw resolution and report findings to
   >    *[organization-defined personnel]*.

(2) rules out the usual implementation of (c), (d) and (7), which rest on pull
requests: CODEOWNERS approvals, PR templates and required status checks before
merge. (1) removes the only thing tracking dependency flaws, which (e)
requires. So this record defines a pull-request-free version of the control.
That is what SA-10(2) calls an *alternative configuration management
process*, chosen deliberately.

## Decision

The organization-defined parameters are filled in by **one file,
`scripts/sa10/config.mjs`**. Every other part reads from it.

| Requirement | Implemented by | Verified by |
|---|---|---|
| **(a)** CM throughout | Every commit lands on `main`, and every push runs CI and SA-10. Vercel builds every push, and a build is released automatically only once its checks pass. Database migrations are released by hand, through the Release workflow. | Both workflows on every push |
| **(b)** Configuration items defined and controlled | `CONFIG_ITEMS`: 21 paths where a one-line diff can be a breach. That covers migrations, auth, the service-role client, secrets handling, API routes, what goes to the model, fixed legal text, the lockfile and CI. `main`'s history can't be force-pushed or deleted. | `check.mjs` fails if a configuration item no longer exists, so a renamed file can't silently leave the controlled set |
| **(c)** Only approved changes | With no PR to approve, "approved" means: **on `main`, CI passed, SA-10 passed**. The **app** is built by Vercel on every push, but **Vercel Deployment Checks** keep a build off `groundwork.klawfin.com` until those GitHub jobs pass for its commit. The **database** is changed only by the Release workflow (`deploy.yml`), whose gate checks the same three conditions. No branch other than `main` can be created on GitHub. | Deployment Checks (Vercel settings) and the Release gate; `check.mjs` requires every clause of the gate |
| **(d)** Changes and their impacts documented | A commit touching a configuration item carries a **`Security-Impact:` trailer** in its message. The **commit-msg hook** refuses the commit locally without one, before it exists; "N/A" is refused too. **CI re-checks every pushed commit** in case the hook was skipped. `git log --grep '^Security-Impact:'` gives the full history of security-relevant change. | Hook and CI both tested, including a `--no-verify` bypass, which CI catches |
| **(e)** Flaws tracked, resolution tracked, personnel told | `security-flaws.yml` runs weekly and on every lockfile change. It keeps **one** issue, assigned to the named personnel, rewritten as findings change, **closed with a dated comment when resolved** and reopened if they return. CI **blocks** high and critical advisories in production dependencies. A failed scan is never read as a clean one. | Unit tests; `check.mjs` requires the schedule |
| **(1)** Software integrity | Every GitHub Action is pinned to a 40-character commit SHA, not a tag that can be moved (the March 2025 tj-actions compromise spread through retargeted tags). Every install uses `--frozen-lockfile`. | `check.mjs` on every push and in `pnpm verify` |
| **(2)** Alternative CM process | This record. No second-person approval, by the team's choice; the author's written assessment and CI verification replace it. | — |
| **(4)** Trusted generation | Schema drift check after migrations (CI). `supabase db push --dry-run` shown before the real push (Release workflow). | Existing CI steps |
| **(5)** Mapping integrity | The build records its commit (`BUILD_COMMIT_SHA`, from Vercel's `VERCEL_GIT_COMMIT_SHA`), and `/api/health` reports it. `main`'s history can't be rewritten, so the mapping stays valid. | Release workflow: the live version must equal the approved commit |
| **(6)** Trusted distribution | Vercel builds from the GitHub commit itself, with no artifact passing through hands. Only commits that passed the checks reach the domain, and the Release workflow proves the live build is the approved one. | Same verify step |
| **(7)** Security representatives in change control | **Not enforced before a change lands.** The trade-off is stated plainly: straight-to-`main` means no reviewer sees a change before it is on `main`. The named personnel review after the fact through `git log --grep '^Security-Impact:'`. | — |

**Not applicable:** (3) hardware integrity. There is no hardware.

**Commits made before SA-10 are not held to it.** The change-record check
applies only to commits whose own tree contains the check. Otherwise the first
push after adopting SA-10 would fail on history nobody could have annotated,
and the deploy gate would refuse it forever.

## What needs an admin

`gh` is signed in with **write** access to `klawfin/Groundwork`, and write
access can't change repository settings. The owner runs:

```bash
sh scripts/sa10/apply-repo-settings.sh
```

It does four things:
- protects `main` against force-push and deletion, with admins included;
- adds a ruleset so that **no branch other than `main` can be created**;
- turns off Dependabot security updates;
- turns off Dependabot alerts.

It deliberately doesn't require pull requests or pre-push status checks, since
either would block the straight-to-`main` workflow. **On a private repository
owned by a personal account, branch protection and rulesets need GitHub Pro.**
The script says so if GitHub refuses.

## Consequences

- Each developer runs `sh scripts/install-hooks.sh` once per clone. Without
  the hook, a missing trailer is caught only after the push, when the commit
  can no longer be amended.
- A commit that fails CI or SA-10 stays on `main` but can never be deployed.
  The fix is a new commit.
- Dependency upgrades become a human decision, prompted by an issue rather
  than a bot's branch.

## Assumptions to confirm

- **Flaw reports go to `klawfin` and `NikzRN01`.** Correct them in
  `config.mjs`.
- **Tracking from `moderate`, blocking from `high` in production only.**
  Tighten once the noise level is known.

## Related

- [[0015-first-live-run]]: why "verified by" means an executed check, never a
  document saying a check exists.
