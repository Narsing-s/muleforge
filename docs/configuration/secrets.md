# Secrets and Environment Configuration

Never put passwords, API keys, tokens or private certificates directly into generated source code or `muleforge.yaml`.

Use environment variables, Maven settings, secure properties or the secret-management mechanism required by the target MuleSoft runtime.

Generated configuration should use placeholders such as:

```yaml
snowflake:
  account: ${snowflake.account}
  user: ${snowflake.user}
  password: ${snowflake.password}
```

Before deployment, provide the corresponding values through the organization's approved secure configuration mechanism.
