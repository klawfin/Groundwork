#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# The SA-10 controls that live in repository SETTINGS rather than in files.
#
# MUST BE RUN BY A REPOSITORY ADMIN - the `klawfin` account. Write access is
# not enough: GitHub answers every one of these calls from a non-admin with a
# 404, which is indistinguishable from "does not exist". The script checks
# first and says so.
#
#   sh scripts/sa10/apply-repo-settings.sh
#
# Idempotent. Re-run it after changing anything below.
#
# THIS REPOSITORY COMMITS STRAIGHT TO MAIN - no branches, no pull requests.
# So main is NOT set to require pull requests (that would make every commit
# impossible). What it protects instead, and why:
#
#   (b)(5)  main's history cannot be rewritten or deleted - no force-push, no
#           branch deletion, admins included. The commit a deploy was verified
#           against, and the Security-Impact record on it, stay exactly as
#           they were. Rewritten history is the one thing that would make the
#           SA-10 change log meaningless.
#   (c)     No branch other than main can be created on GitHub. "Always commit
#           on main" becomes a rule the server enforces, not a habit. It also
#           stops anything - a bot, a stray `git push origin feature` - from
#           reopening the branch-and-PR sprawl that was cleaned up.
#   (e)     Dependabot security updates and alerts OFF. Flaws are tracked by
#           .github/workflows/security-flaws.yml instead: one issue, assigned
#           to the named personnel, closed when resolved.
# ---------------------------------------------------------------------------
set -euo pipefail

REPO="${REPO:-klawfin/Groundwork}"

if [ "$(gh api "repos/$REPO" -q .permissions.admin 2>/dev/null)" != "true" ]; then
  echo "You are signed in as '$(gh api user -q .login)', which is not an admin of $REPO." >&2
  echo "Run this as the repository owner. Write access cannot change these settings." >&2
  exit 1
fi

upgrade_hint() {
  echo "     GitHub refused. On a PRIVATE repository owned by a personal account," >&2
  echo "     branch protection and rulesets need GitHub Pro (or moving the repo to" >&2
  echo "     an organization on Team). Without them this part of SA-10 is a" >&2
  echo "     convention, not an enforced rule." >&2
}

echo "1/4  Protect main: no force-push, no deletion, admins included"
# Direct pushes stay allowed - that is the workflow. Required status checks are
# deliberately absent: GitHub enforces them by refusing any push whose commit
# has not ALREADY passed, which a direct push never has. Verification is
# enforced at deploy instead (the gate in deploy.yml).
if ! gh api -X PUT "repos/$REPO/branches/main/protection" --input - >/dev/null <<'JSON'
{
  "required_status_checks": null,
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
then upgrade_hint; exit 1; fi

echo "2/4  Only main may exist: block creating any other branch"
RULESET_NAME='main-only'
RULESET_BODY=$(cat <<'JSON'
{
  "name": "main-only",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~ALL"], "exclude": ["~DEFAULT_BRANCH"] } },
  "rules": [ { "type": "creation" } ],
  "bypass_actors": []
}
JSON
)
EXISTING=$(gh api "repos/$REPO/rulesets" -q ".[] | select(.name == \"$RULESET_NAME\") | .id" 2>/dev/null || true)
if [ -n "$EXISTING" ]; then
  echo "$RULESET_BODY" | gh api -X PUT "repos/$REPO/rulesets/$EXISTING" --input - >/dev/null || { upgrade_hint; exit 1; }
else
  echo "$RULESET_BODY" | gh api -X POST "repos/$REPO/rulesets" --input - >/dev/null || { upgrade_hint; exit 1; }
fi

echo "3/4  Dependabot security updates off"
gh api -X DELETE "repos/$REPO/automated-security-fixes" >/dev/null

echo "4/4  Dependabot alerts off (replaced by the SA-10 flaw tracker)"
gh api -X DELETE "repos/$REPO/vulnerability-alerts" >/dev/null

echo
echo "Done. Verify:"
echo "  gh api repos/$REPO/branches/main/protection -q '{force: .allow_force_pushes.enabled, delete: .allow_deletions.enabled, admins: .enforce_admins.enabled}'"
echo "  gh api repos/$REPO/rulesets -q '.[].name'          # expect main-only"
echo "  git push origin HEAD:refs/heads/probe               # expect: refused"
