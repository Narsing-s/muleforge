# Customer API reference implementation

This project is the MuleForge reference implementation for a requirement-driven API backed by Snowflake.

## Requirement

- `POST /api/v1/customers`
- `GET /api/v1/customers/{customerId}`
- Required fields: `name`, `email`, `mobileNumber`
- Email validation
- Snowflake persistence
- Existing email returns `409`
- Missing customer returns `404`
- Successful creation returns `201`

## Flow

```text
POST /customers
    ↓
Validate request
    ↓
Check CUSTOMER by email
    ├── found → 409
    └── not found → INSERT
                    ↓
                   201

GET /customers/{customerId}
    ↓
Snowflake SELECT
    ├── no row → 404
    └── row → 200
```

## Snowflake setup

Run `src/main/resources/db/customer-schema.sql` in the target Snowflake database/schema.

Configure these values through secure environment-specific properties:

- `SNOWFLAKE_ACCOUNT`
- `SNOWFLAKE_WAREHOUSE`
- `SNOWFLAKE_DATABASE`
- `SNOWFLAKE_SCHEMA`
- `SNOWFLAKE_USER`
- `SNOWFLAKE_PASSWORD`

Do not commit credentials.

## Run

```bash
mvn clean test
mvn clean package
```

Run the application using Anypoint Studio or the organization's approved Mule runtime process.

## API examples

Create:

```http
POST /api/v1/customers
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "mobileNumber": "+15551234567"
}
```

Success:

```json
{
  "customerId": "<generated-uuid>",
  "status": "SUCCESS"
}
```

Duplicate:

```json
{
  "status": "FAILED",
  "code": "CUSTOMER_EXISTS",
  "message": "Customer already exists"
}
```

## Verification note

The project demonstrates real Database connector operations and Snowflake JDBC configuration. A full Maven/MUnit verification must be executed in an environment with the required Mule Maven repositories, Java/Mule tooling and valid connector dependencies. MuleForge must not report `READY` merely because files exist.
