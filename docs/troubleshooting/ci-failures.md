# CI Failure Troubleshooting

## npm integrity failures

If npm ci reports EINTEGRITY or corrupted tarballs, the failure is normally in dependency retrieval rather than MuleForge source code.

The CI workflow now:
- clears the npm cache;
- uses --prefer-online;
- retries package downloads;
- uses Node 22;
- keeps the lockfile synchronized with package.json.

If the registry continues returning a corrupted tarball, rerun the workflow before changing dependency versions. Do not disable integrity verification.

## Why the previous run failed

The latest failed run stopped at npm ci. The log showed corrupted tarball data and an integrity mismatch for yaml@2.9.0; therefore npm test never started. The secret-hygiene job passed.

A separate duplicate workflow was also running the same npm installation. It has been removed so there is one authoritative CI path.
