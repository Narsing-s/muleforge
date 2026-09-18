# Runtime Validation

MuleForge has two levels of generated-project validation:

1. **Always-on static validation** in the normal CI workflow.
2. **Manual Maven/MUnit runtime validation** in `.github/workflows/runtime-validation.yml`.

The manual workflow generates the reference project, runs the contract/verification/audit gates, then optionally runs the generated project's Maven tests and package lifecycle.

## Why is runtime validation manual?

Generated Mule applications can require access to MuleSoft/Anypoint Maven repositories. MuleSoft documents Maven as the mechanism used for Mule application packaging and testing, and MUnit 3.7.4 supports Maven 3.9.0–3.9.15 and Mule runtime 4.3+. citeturn0search0turn0search11

MuleForge therefore does not put enterprise Maven credentials in the repository and does not make every pull request depend on credentials that an open-source contributor may not have.

## Configure the workflow

Create a GitHub Actions repository secret named:

`MAVEN_SETTINGS_XML`

Its value should be the approved `settings.xml` used by your organization to authenticate to the MuleSoft Maven repositories required by the generated application.

Do not commit `settings.xml`, usernames, passwords, client secrets or access tokens.

## Run it

Open **Actions → MuleForge Runtime Validation → Run workflow**.

The default model is:

`customer-api/muleforge.yaml`

You can also select another requirement model that the generator can process.

The **skip_maven** option is useful when you only want to repeat generation and static validation. Leave it disabled when you want the real Maven/MUnit execution.

## What the runtime gate proves

When Maven execution is enabled and succeeds, the workflow verifies:

- the requirement model can be generated;
- the generated project passes contract validation;
- the generated project passes structural verification;
- the quality audit passes;
- MUnit tests execute through Maven;
- the Mule application reaches the Maven package lifecycle;
- MUnit coverage/test artifacts can be collected.

The workflow uploads available Surefire reports, MUnit coverage reports and the generated JAR as workflow artifacts.

## Important limitation

A successful Maven/MUnit run validates the generated project against the configured Maven/runtime environment. It does not prove external systems such as a production Snowflake account, SFTP server, MQ broker or Salesforce org are reachable or correctly configured. Those integrations still require environment-specific integration testing and credentials.

MUnit's `munit.runtimeversion` setting is used by the generated POM; MuleSoft documents it as the current replacement for the deprecated `runtimeVersion` setting. citeturn0search4
