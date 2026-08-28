# Testing the production generator

## 1. Test MuleForge itself

From the MuleForge repository:

```bash
npm install
npm test
```

The Node test suite covers connector-flow generation, DataWeave generation, business flows, and MUnit generation.

## 2. Generate the example project

```bash
node src/index.js generate examples/production-multi-connector/muleforge.yaml
```

Expected generated areas:

- `src/main/mule/customer-integration.xml`
- `src/main/resources/dwl/`
- `src/main/resources/api/customer-integration.raml`
- `src/test/munit/customer-integration-test.xml`
- `postman/`
- `src/main/resources/properties/`
- `.github/workflows/`

## 3. Run static verification

```bash
node src/index.js verify examples/production-multi-connector/muleforge.yaml
```

If the generated project is valid, the report should finish successfully.

## 4. Run Maven/MUnit in the generated project

Change into the generated project directory and run:

```bash
mvn clean test
```

MUnit is integrated with Maven, and MuleSoft documents `mvn clean test` as the standard command for running MUnit suites.

To run only a suite:

```bash
mvn clean test -Dmunit.test=.*customer-integration-test.*
```

To run a specific test in a suite:

```bash
mvn clean test -Dmunit.test=.*customer-integration-test.*#.*Create.*
```

## 5. Build the Mule application

```bash
mvn clean package
```

The Mule Maven Plugin packages the application during the Maven `package` lifecycle.

## 6. What requires real infrastructure

The Node generator tests do not require Snowflake, SFTP, IBM MQ, or Anypoint MQ.

The generated Mule application tests should mock external connectors for unit tests. For a real integration test, provide valid environment configuration and credentials through secure environment/property mechanisms.

Never commit passwords, client secrets, private keys, or tokens into `muleforge.yaml` or generated source.
