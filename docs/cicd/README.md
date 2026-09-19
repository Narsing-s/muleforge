# MuleForge CI/CD

MuleForge treats CI/CD as an extension of the generated project, not as a replacement for GitHub Actions, GitLab CI, Azure DevOps or Jenkins.

## Available now

- GitHub Actions CI workflow
- CLI test execution
- Generated-project verification
- Secret-hygiene gate
- CI artifact collection
- Portable pipeline model (`github-actions`, `gitlab`, `azure-devops`, `jenkins`, `bitbucket`)
- Environment promotion/rollback planning
- SHA-256 artifact provenance manifests

## Still planned

- Native first-class templates for GitLab CI, Azure DevOps, Jenkins and Bitbucket
- `muleforge cicd init` interactive configuration

See [GitHub Actions](github-actions.md) for setup and security guidance.
