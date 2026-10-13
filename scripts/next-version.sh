#!/usr/bin/env bash
#
# Opens the next minor version's branch and PR. Run after a release.
#
#   git checkout master && ./scripts/next-version.sh
#
# Must be run from master. Pulls master, bumps the minor version, commits the bump on a new branch named
# after that version (e.g. 1.2.0), pushes it, and opens a PR into master titled with
# the version. The bump is made in the working tree first and committed on the new branch,
# never on master: the branch is named after the version, which is only known after
# the bump.
#
# Requires: git, node, npm, and the GitHub CLI (`gh`) authenticated for this repo.

set -euo pipefail

BASE="master"
REMOTE="${REMOTE:-origin}"

cd "$(git rev-parse --show-toplevel)"

command -v gh >/dev/null || { echo "error: GitHub CLI (gh) is not installed" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "error: gh is not authenticated (run: gh auth login)" >&2; exit 1; }

if [[ -n "$(git status --porcelain)" ]]; then
	echo "error: working tree is not clean; commit or stash your changes first" >&2
	git status --short >&2
	exit 1
fi

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$CURRENT_BRANCH" != "$BASE" ]]; then
	echo "error: must be run from $BASE (current branch: $CURRENT_BRANCH)" >&2
	exit 1
fi

git pull --ff-only "$REMOTE" "$BASE"

CURRENT=$(node -p "require('./package.json').version")
npm version minor --no-git-tag-version >/dev/null
VERSION=$(node -p "require('./package.json').version")

if git show-ref --quiet "refs/heads/$VERSION" || git ls-remote --exit-code --heads "$REMOTE" "$VERSION" >/dev/null 2>&1; then
	git checkout -- package.json
	echo "error: branch $VERSION already exists locally or on $REMOTE" >&2
	exit 1
fi

echo "Bumping $CURRENT -> $VERSION"

git checkout -b "$VERSION"
git commit -am "chore: bump version to $VERSION"
git push --set-upstream "$REMOTE" "$VERSION"

gh pr create \
	--base "$BASE" \
	--head "$VERSION" \
	--title "$VERSION" \
	--body "Version bump to $VERSION. Changes for this release land on this branch."
