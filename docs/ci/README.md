# CI Quality Gates

MuleForge CI should fail for real product defects, not because of duplicate workflows or transient dependency downloads.

The main workflow is:
CLI tests -> Generated-project quality gate -> Secret hygiene

The repository keeps one authoritative CI workflow. Dependency installation uses retry settings and Node 22.

GitHub Actions standard runners are free for public repositories. GitHub documents a 2,000-minute monthly allowance for GitHub Free accounts, while public repositories remain free on standard hosted runners.
