const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const semver = require('semver');

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (process.argv.includes('--notes')) {
  const heading = `## ${pkg.version} — `;
  const start = changelog.indexOf(heading);
  if (start < 0) throw new Error('Release section not found');
  const body = changelog.slice(changelog.indexOf('\n', start) + 1);
  fs.writeFileSync('release-notes.md', body.split(/^## /m)[0].trim() + '\n');
} else {
  const version = process.env.RELEASE_VERSION;
  if (!version || semver.valid(version) !== version) throw new Error('Provide an exact SemVer without a v prefix');
  if (semver.lt(version, pkg.version)) throw new Error('Version must not go backwards');
  const tags = execFileSync('git', ['tag', '--list', `v${version}`], { encoding: 'utf8' }).trim();
  if (tags) throw new Error(`Tag v${version} already exists`);
  const match = /^## Unreleased\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(changelog);
  if (!match || !match[1].trim()) throw new Error('Unreleased changelog must contain release notes');
  if (changelog.includes(`## ${version} — `)) throw new Error('Changelog already contains this version');
  const date = new Date().toISOString().slice(0, 10);
  fs.writeFileSync('CHANGELOG.md', changelog.replace(match[0], `## Unreleased\n\n## ${version} — ${date}\n\n${match[1].trim()}\n\n`));
  pkg.version = version;
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
}
