#!/usr/bin/env sh
# Install the pre-push hook. Run once after cloning:
#
#   sh scripts/install-hooks.sh
#
# A shell script rather than husky: it is nine lines, it has no dependency, and
# it does not run arbitrary code on every `pnpm install`.
set -e
HOOK_DIR="$(git rev-parse --git-path hooks)"
cat > "$HOOK_DIR/pre-push" <<'HOOK'
#!/usr/bin/env sh
# Fast checks only. The integration suite needs Docker and belongs in CI, not
# in the two seconds between deciding to push and pushing.
echo "pre-push: lint, typecheck, unit tests, palette"
pnpm verify || {
  echo ""
  echo "Push blocked. Fix the above, or use --no-verify if you know why."
  exit 1
}
HOOK
chmod +x "$HOOK_DIR/pre-push"
echo "Installed $HOOK_DIR/pre-push"
