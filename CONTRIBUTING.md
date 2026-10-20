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

PRs targeting `master` build and test the package in Snapshot package. Publish then
publishes that artifact to npm as `@observertc/observer-js@<version>-rc.<number>`,
under the `snapshot` dist-tag. The base version is the next minor after npm's
`latest` release, regardless of the PR's package version. For example, `latest` at
`1.2.0` (or `1.2.9`) produces `1.3.0-rc.1`, then `1.3.0-rc.2`. Once `1.3.0` is
released as `latest`, snapshots target `1.4.0-rc.1`. The counter uses the highest existing rc
number on npm for that base version; simultaneous runs retry version collisions.
Install with `npm install @observertc/observer-js@snapshot` or the exact rc version.
The snapshot version is never committed or tagged, and `latest` is untouched.

No external snapshot app or npm token is needed. The publisher runs separately on
`workflow_run`, so fork PR builds never receive publishing credentials or execute
scripts in the publishing job. Both workflows and the publisher script must be on
the default branch before automatic snapshots can run. Pushes and merges do not
publish packages. The retired Pages workflow has been removed.

To release, merge the changes into `master`, then open Actions → Release → Run workflow,
select `master`, and enter the exact version (for example `1.3.0` or `1.4.0-beta.1`).
Keep release notes under `## Unreleased` in `CHANGELOG.md`. The workflow validates the
version and notes, runs checks, commits the package version and dated changelog section,
creates `v<version>`, publishes to npm, and creates a GitHub release using those same notes.
Stable versions use `latest`; prereleases use `beta`. A fresh Unreleased section is retained.

npm Trusted Publishing must authorize `publish.yaml` for snapshots and `release.yml`
for manual releases in `ObserveRTC/observer-js`. npm checks the calling workflow
for reusable workflows. Both publishers must allow direct `npm publish`. No npm token is needed. Repository rules must allow
`github-actions[bot]` to push the release commit to master and create tags. Manual dispatch
requires the workflow to exist on the default branch; releases run only from master.

If publishing or GitHub release creation fails after the tag is pushed, fix the cause and
use **Re-run failed jobs** on that run. Do not start a fresh release for the same version:
npm versions are immutable and the release preparation rejects existing tags.
