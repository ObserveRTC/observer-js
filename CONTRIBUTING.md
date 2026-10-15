# Contribution Guideline

## Finding Issues to Work on

If you are interested in contributing to ObserveRTC 
and are looking for issues to work on, take a look at the issues  
tagged with [help wanted](https://github.com/ObserveRTC/observer-js/labels/help%20wanted).

## Running Tests

To run the tests use `yarn test`.

## Working on the code base

The source is written in typescript. 

## Creating a pull request

Once you are ready with your changes:

- Commit your changes in your local branch
- Push your changes to your remote branch on GitHub
- Send us a [pull request](https://help.github.com/articles/creating-a-pull-request)



## Snapshots and releases

PRs targeting `master` run Publish and upload an installable snapshot to pkg.pr.new.
Install the [pkg.pr.new GitHub app](https://github.com/apps/pkg-pr-new) on this repository
once; snapshot install URLs appear on the PR. These snapshots do not consume npm versions.
Pushes and merges do not publish packages. The retired Pages workflow has been removed.

To release, merge the changes into `master`, then open Actions → Release → Run workflow,
select `master`, and enter the exact version (for example `1.3.0` or `1.4.0-beta.1`).
Keep release notes under `## Unreleased` in `CHANGELOG.md`. The workflow validates the
version and notes, runs checks, commits the package version and dated changelog section,
creates `v<version>`, publishes to npm, and creates a GitHub release using those same notes.
Stable versions use `latest`; prereleases use `beta`. A fresh Unreleased section is retained.

npm Trusted Publishing must authorize `publish.yaml` in this repository (the reusable
workflow that actually publishes). No npm token is needed. Repository rules must allow
`github-actions[bot]` to push the release commit to master and create tags. Manual dispatch
requires the workflow to exist on the default branch; releases run only from master.

If publishing or GitHub release creation fails after the tag is pushed, fix the cause and
use **Re-run failed jobs** on that run. Do not start a fresh release for the same version:
npm versions are immutable and the release preparation rejects existing tags.
