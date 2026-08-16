# Requirement-Driven Generation

MuleForge should generate business flows from the user's confirmed requirement, not from a collection of hard-coded example business flows.

## Lifecycle

1. User describes the desired application.
2. MuleForge extracts explicit requirements.
3. MuleForge identifies missing decisions.
4. MuleForge asks targeted questions.
5. MuleForge presents the proposed solution design.
6. User confirms or modifies the design.
7. MuleForge writes the project model.
8. Generators create the application and documentation.
9. Validation and tests are run.

## Example

A user may request:

```text
Create POST /customers. Accept name and email. Validate the email and save the customer in Snowflake.
```

MuleForge should recognize the endpoint, fields, validation intent and Snowflake dependency. It should ask only for decisions that materially affect implementation, such as duplicate handling, response status or required lookup operations.

## No silent business assumptions

If a decision changes business behavior, the user should confirm it. Examples include duplicate handling, retry policy, authorization behavior, idempotency and data retention.
