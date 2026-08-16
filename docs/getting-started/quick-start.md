# Quick Start

## 1. Install

```bash
npm install -g muleforge
```

## 2. Create from a requirement

```bash
muleforge create
```

Describe the application you want to build. Example:

```text
Create a customer API with POST /customers.
Accept name, email and mobile number.
Validate the request and store the customer in Snowflake.
Return the generated customer ID.
```

MuleForge should identify known information, ask only for missing decisions, present a solution design, and wait for confirmation before generation.

## 3. Review the generated project

```bash
cd customer-api
```

Review `muleforge.yaml`, the API contract, Mule flows, configuration and `docs/`.

## 4. Validate, test and build

```bash
muleforge validate
muleforge test
muleforge build
```

## 5. Refresh documentation

```bash
muleforge docs
```

The generated project's `docs/` directory should remain synchronized with the confirmed project design.
