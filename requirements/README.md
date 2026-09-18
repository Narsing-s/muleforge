# MuleForge Requirements

Put requirement documents in this folder and push them to GitHub.

Supported formats:
- PDF
- DOCX
- PPTX
- XLSX
- TXT
- Markdown
- CSV
- JSON
- YAML
- HTML

When a supported document is pushed, the **Requirement to Mule Project** GitHub Actions workflow analyzes it and generates a complete Mule project folder in this repository.

The generated project includes:
- `muleforge.yaml`
- `pom.xml`
- `mule-artifact.json`
- RAML
- Mule XML flows
- DataWeave mappings
- MUnit tests
- Postman collection
- DEV/QA/UAT/PROD properties
- GitHub Actions CI/CD assets
- Documentation

The workflow verifies the generated project before committing it. If verification fails, the generated project is not committed by the workflow.

## Manual generation

Run the workflow from **Actions → Requirement to Mule Project → Run workflow** and provide the requirement document path, for example:

`requirements/customer-api.md`

Optionally provide a project name.

## Desktop copy

When MuleForge runs locally with `create` or `analyze`, it also copies the completed project to the user's Desktop when a Desktop folder is available.

A GitHub-hosted workflow cannot directly write to a developer's Windows Desktop because the workflow runs on a GitHub-hosted machine. The repository workflow therefore creates and verifies the project in GitHub; the local MuleForge CLI handles the Desktop copy.
