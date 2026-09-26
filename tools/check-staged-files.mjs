// Validate index bytes, not working-tree bytes. No runtime dependencies.
import { execFileSync } from 'node:child_process';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const maxBytes = 1024 * 1024;
const paths = git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z').split('\0').filter(Boolean);
const errors = [];
for (const path of paths) {
  if (/(^|\/)(screenshots|qa-artifacts|test-results|playwright-report|\.reference|\.tmp|tmp|node_modules|dist)(\/|$)|\.(mp4|webm|zip|tar\.gz|patch|log|tsbuildinfo)$/i.test(path)) {
    errors.push(`${path}: generated/temporary artifact`);
  }
  const size = Number(git('cat-file', '-s', `:${path}`).trim());
  if (size > maxBytes) errors.push(`${path}: ${size} bytes exceeds the 1 MiB commit limit`);
}
if (errors.length) { console.error('Commit blocked:\n' + errors.join('\n')); process.exit(1); }
console.log(`Git index check passed: ${paths.length} files; no generated artifacts or files over 1 MiB.`);
