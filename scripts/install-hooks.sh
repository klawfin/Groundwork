#!/usr/bin/env sh
# Install the git hooks. Run once after cloning:
#
#   sh scripts/install-hooks.sh
#
# A shell script rather than husky: it has no dependency, and it does not run
# arbitrary code on every `pnpm install`.
#
#   commit-msg  NIST SA-10(d). A commit that changes a configuration item must
#               carry a Security-Impact trailer. Refused here, before it exists -
#               this repository commits straight to main, so once pushed a
#               commit cannot be amended.
#   pre-push    Fast checks only. The integration suite needs Docker and belongs
#               in CI, not in the seconds between deciding to push and pushing.
set -e
HOOK_DIR="$(git rev-parse --git-path hooks)"

cat > "$HOOK_DIR/commit-msg" <<'HOOK'
#!/usr/bin/env sh
exec node scripts/sa10/commit-record.mjs --hook "$1"
HOOK
chmod +x "$HOOK_DIR/commit-msg"
echo "Installed $HOOK_DIR/commit-msg"

cat > "$HOOK_DIR/pre-push" <<'HOOK'
#!/usr/bin/env sh
echo "pre-push: lint, typecheck, unit tests, palette, SA-10"
pnpm verify || {
  echo ""
  echo "Push blocked. Fix the above, or use --no-verify if you know why."
  exit 1
}
HOOK
chmod +x "$HOOK_DIR/pre-push"
echo "Installed $HOOK_DIR/pre-push"
