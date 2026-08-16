#!/usr/bin/env node

const { Command } = require("commander");
const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

const program = new Command();

program
  .name("muleforge")
  .description("Open-source Mule 4 API project generator")
  .version("0.1.0");

/**
 * ============================================================
 * Utility Functions
 * ============================================================
 */

function createFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function loadYaml(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Configuration file not found: ${filePath}`);
  }

  const content = readFile(filePath);
  return YAML.parse(content);
}

function validateConfig(config) {
  const errors = [];

  if (!config) {
    errors.push("Configuration is empty");
    return errors;
  }

  if (!config.project) {
    errors.push("Missing required section: project");
  } else {
    if (!config.project.name) {
      errors.push("Missing required property: project.name");
    }

    if (!config.project.version) {
      errors.push("Missing required property: project.version");
    }
  }

  if (!config.api) {
    errors.push("Missing required section: api");
  } else {
    if (!config.api.name) {
      errors.push("Missing required property: api.name");
    }

    if (!config.api.version) {
      errors.push("Missing required property: api.version");
    }

    if (!config.api.basePath) {
      errors.push("Missing required property: api.basePath");
    }
  }

  if (config.operations && !Array.isArray(config.operations)) {
    errors.push("operations must be an array");
  }

  if (Array.isArray(config.operations)) {
    config.operations.forEach((operation, index) => {
      if (!operation.name) {
        errors.push(`operations[${index}].name is required`);
      }

      if (!operation.method) {
        errors.push(`operations[${index}].method is required`);
      }

      if (!operation.path) {
        errors.push(`operations[${index}].path is required`);
      }

      if (
        operation.method &&
        !["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"].includes(
          String(operation.method).toUpperCase()
        )
      ) {
        errors.push(
          `operations[${index}].method has unsupported HTTP method: ${operation.method}`
        );
      }
    });
  }

  return errors;
}

/**
 * ============================================================
 * Generate Mule Artifact
 * ============================================================
 */

function generateMuleArtifact(projectPath) {
  createFile(
    path.join(projectPath, "mule-artifact.json"),
    `{
  "minMuleVersion": "4.9.0"
}
`
  );
}

/**
 * ============================================================
 * Generate Maven POM
 * ============================================================
 */

function generatePom(projectPath, projectName) {
  createFile(
    path.join(projectPath, "pom.xml"),
    `<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="
           http://maven.apache.org/POM/4.0.0
           https://maven.apache.org/xsd/maven-4.0.0.xsd">

  <modelVersion>4.0.0</modelVersion>

  <groupId>com.muleforge</groupId>
  <artifactId>${projectName}</artifactId>
  <version>1.0.0</version>
  <packaging>mule-application</packaging>

  <name>${projectName}</name>

  <properties>
    <app.runtime>4.9.0</app.runtime>
    <mule.maven.plugin.version>4.3.0</mule.maven.plugin.version>
  </properties>

  <dependencies>

    <dependency>
      <groupId>org.mule.connectors</groupId>
      <artifactId>mule-http-connector</artifactId>
      <version>1.10.3</version>
      <classifier>mule-plugin</classifier>
    </dependency>

    <dependency>
      <groupId>org.mule.modules</groupId>
      <artifactId>mule-ee-module</artifactId>
      <version>1.3.0</version>
      <classifier>mule-plugin</classifier>
    </dependency>

  </dependencies>

  <build>

    <plugins>

      <plugin>
        <groupId>org.mule.tools.maven</groupId>
        <artifactId>mule-maven-plugin</artifactId>
        <version>\${mule.maven.plugin.version}</version>

        <extensions>true</extensions>

        <configuration>
          <runtimeVersion>\${app.runtime}</runtimeVersion>
        </configuration>

      </plugin>

    </plugins>

  </build>

</project>
`
  );
}

/**
 * ============================================================
 * Generate .gitignore
 * ============================================================
 */

function generateGitignore(projectPath) {
  createFile(
    path.join(projectPath, ".gitignore"),
    `target/
*.log
.DS_Store
.idea/
.vscode/
*.iml
`
  );
}

/**
 * ============================================================
 * Generate RAML
 * ============================================================
 */

function generateRaml(projectPath, config) {
  const projectName = config.project.name;
  const apiVersion = config.api.version;
  const basePath = config.api.basePath;

  const operations = config.operations || [];

  const grouped = {};

  operations.forEach((operation) => {
    const operationPath = operation.path;
    const method = String(operation.method).toLowerCase();

    if (!grouped[operationPath]) {
      grouped[operationPath] = [];
    }

    grouped[operationPath].push({
      ...operation,
      method
    });
  });

  let raml = `#%RAML 1.0

title: ${projectName}
version: ${apiVersion}
baseUri: ${basePath}

`;

  Object.entries(grouped).forEach(([resourcePath, resourceOperations]) => {
    raml += `${resourcePath}:\n`;

    resourceOperations.forEach((operation) => {
      raml += `\n  ${operation.method}:\n`;
      raml += `    description: ${operation.name}\n`;
      raml += `    responses:\n`;
      raml += `      200:\n`;
      raml += `        body:\n`;
      raml += `          application/json:\n`;
      raml += `            type: object\n`;
    });

    raml += `\n`;
  });

  createFile(
    path.join(
      projectPath,
      "src/main/resources/api",
      `${projectName}.raml`
    ),
    raml
  );
}

/**
 * ============================================================
 * Generate Mule XML
 * ============================================================
 */

function generateMuleXml(projectPath, config) {
  const projectName = config.project.name;
  const basePath = config.api.basePath;

  const operations = config.operations || [];

  let flows = "";

  operations.forEach((operation) => {
    const flowName = `${projectName}-${operation.name}-flow`;
    const method = String(operation.method).toUpperCase();

    flows += `
    <flow name="${flowName}">

        <http:listener
            config-ref="HTTP_Listener_config"
            path="${basePath}${operation.path}"
            allowedMethods="${method}"
            doc:name="${operation.name}" />

        <logger
            level="INFO"
            message="MuleForge operation: ${operation.name}"
            doc:name="Logger" />

        <ee:transform doc:name="Transform Response">

            <ee:message>

                <ee:set-payload><![CDATA[
%dw 2.0
output application/json
---
{
    message: "MuleForge generated API operation",
    operation: "${operation.name}",
    method: "${method}",
    path: "${basePath}${operation.path}"
}
                ]]></ee:set-payload>

            </ee:message>

        </ee:transform>

    </flow>
`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>

<mule xmlns="http://www.mulesoft.org/schema/mule/core"
      xmlns:http="http://www.mulesoft.org/schema/mule/http"
      xmlns:doc="http://www.mulesoft.org/schema/mule/documentation"
      xmlns:ee="http://www.mulesoft.org/schema/mule/ee/core"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="
        http://www.mulesoft.org/schema/mule/core
        http://www.mulesoft.org/schema/mule/core/current/mule.xsd
        http://www.mulesoft.org/schema/mule/http
        http://www.mulesoft.org/schema/mule/http/current/mule-http.xsd
        http://www.mulesoft.org/schema/mule/ee/core
        http://www.mulesoft.org/schema/mule/ee/core/current/mule-ee.xsd">

    <http:listener-config
        name="HTTP_Listener_config"
        doc:name="HTTP Listener config">

        <http:listener-connection
            host="0.0.0.0"
            port="\${http.port}" />

    </http:listener-config>

${flows}
</mule>
`;

  createFile(
    path.join(
      projectPath,
      "src/main/mule",
      `${projectName}.xml`
    ),
    xml
  );
}

/**
 * ============================================================
 * Generate Application Properties
 * ============================================================
 */

function generateApplicationProperties(projectPath, config) {
  const projectName = config.project.name;

  createFile(
    path.join(
      projectPath,
      "src/main/resources",
      "application.yaml"
    ),
    `http:
  port: 8081

api:
  name: ${projectName}
  version: ${config.api.version}
`
  );
}

/**
 * ============================================================
 * Generate README
 * ============================================================
 */

function generateReadme(projectPath, config) {
  const projectName = config.project.name;
  const apiVersion = config.api.version;
  const basePath = config.api.basePath;

  let operations = "";

  (config.operations || []).forEach((operation) => {
    operations += `- \`${operation.method} ${basePath}${operation.path}\` — ${operation.name}\n`;
  });

  createFile(
    path.join(projectPath, "README.md"),
    `# ${projectName}

Generated by **MuleForge**.

MuleForge is an open-source Mule 4 API project generator.

## API

**Name:** ${config.api.name}

**Version:** ${apiVersion}

**Base Path:** \`${basePath}\`

## Operations

${operations}

## Generate

\`\`\`bash
muleforge generate
\`\`\`

## Build

\`\`\`bash
mvn clean package
\`\`\`

## Test

\`\`\`bash
mvn test
\`\`\`

## Run

Import the generated project into Anypoint Studio.

## Project Structure

\`\`\`
${projectName}/
├── muleforge.yaml
├── mule-artifact.json
├── pom.xml
├── README.md
├── src/
│   ├── main/
│   │   ├── mule/
│   │   └── resources/
│   │       ├── api/
│   │       └── application.yaml
│   └── test/
└── .github/
    └── workflows/
\`\`\`

---

Generated with MuleForge.
`
  );
}

/**
 * ============================================================
 * GitHub Actions
 * ============================================================
 */

function generateGithubWorkflow(projectPath) {
  createFile(
    path.join(
      projectPath,
      ".github/workflows",
      "build.yml"
    ),
    `name: MuleForge Build

on:
  push:
    branches:
      - main

  pull_request:

jobs:

  build:

    runs-on: ubuntu-latest

    steps:

      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "17"

      - name: Verify Java
        run: java -version

      - name: Verify Maven
        run: mvn -version

      - name: Build Mule Application
        run: mvn clean package
`
  );
}

/**
 * ============================================================
 * INIT COMMAND
 * ============================================================
 */

program
  .command("init <projectName>")
  .description("Initialize a new MuleForge project")
  .action((projectName) => {
    console.log("");
    console.log("🚀 MuleForge");
    console.log("");

    const projectPath = path.resolve(process.cwd(), projectName);

    if (fs.existsSync(projectPath)) {
      console.error(`❌ Project already exists: ${projectName}`);
      process.exit(1);
    }

    console.log(`Creating project: ${projectName}`);
    console.log("");

    /**
     * Directories
     */

    const directories = [
      "src/main/mule",
      "src/main/resources/api",
      "src/main/resources/dw",
      "src/test/munit",
      "database",
      ".github/workflows"
    ];

    directories.forEach((dir) => {
      fs.mkdirSync(path.join(projectPath, dir), {
        recursive: true
      });
    });

    /**
     * Default configuration
     */

    const config = {
      project: {
        name: projectName,
        version: "1.0.0"
      },

      api: {
        name: projectName,
        version: "v1",
        specification: "RAML",
        basePath: "/api/v1"
      },

      operations: [
        {
          name: "getCustomer",
          method: "GET",
          path: "/customers/{customerId}"
        },

        {
          name: "createCustomer",
          method: "POST",
          path: "/customers"
        }
      ],

      database: {
        type: "snowflake",
        table: "CUSTOMER"
      },

      testing: {
        munit: true
      },

      deployment: {
        target: "none"
      }
    };

    /**
     * muleforge.yaml
     */

    createFile(
      path.join(projectPath, "muleforge.yaml"),
      `project:
  name: ${projectName}
  version: 1.0.0

api:
  name: ${projectName}
  version: v1
  specification: RAML
  basePath: /api/v1

operations:
  - name: getCustomer
    method: GET
    path: /customers/{customerId}

  - name: createCustomer
    method: POST
    path: /customers

database:
  type: snowflake
  table: CUSTOMER

testing:
  munit: true

deployment:
  target: none
`
    );

    /**
     * Generate project files
     */

    generateMuleArtifact(projectPath);

    generatePom(
      projectPath,
      projectName
    );

    generateGitignore(projectPath);

    generateRaml(
      projectPath,
      config
    );

    generateMuleXml(
      projectPath,
      config
    );

    generateApplicationProperties(
      projectPath,
      config
    );

    generateReadme(
      projectPath,
      config
    );

    generateGithubWorkflow(
      projectPath
    );

    /**
     * Success
     */

    console.log("✔ Project directory created");
    console.log("✔ MuleForge configuration created");
    console.log("✔ Mule artifact configuration created");
    console.log("✔ RAML specification created");
    console.log("✔ Mule flows created");
    console.log("✔ Application properties created");
    console.log("✔ Maven POM created");
    console.log("✔ Git ignore created");
    console.log("✔ GitHub Actions workflow created");
    console.log("✔ README created");

    console.log("");
    console.log("🎉 MuleForge project created successfully!");
    console.log("");

    console.log("Next steps:");
    console.log(`  cd ${projectName}`);
    console.log(`  muleforge generate`);
    console.log(`  mvn clean package`);

    console.log("");
  });

/**
 * ============================================================
 * GENERATE COMMAND
 * ============================================================
 */

program
  .command("generate [config]")
  .description("Generate a MuleSoft project from muleforge.yaml")
  .action((config) => {
    console.log("");
    console.log("🚀 MuleForge Generator");
    console.log("");

    const configFile = config || "muleforge.yaml";

    const configPath = path.resolve(
      process.cwd(),
      configFile
    );

    console.log(`Configuration: ${configFile}`);
    console.log("");

    try {
      /**
       * Load YAML
       */

      const loadedConfig = loadYaml(configPath);

      console.log("✔ Configuration loaded");

      /**
       * Validate
       */

      const errors = validateConfig(
        loadedConfig
      );

      if (errors.length > 0) {
        console.error("");
        console.error("❌ Configuration validation failed:");
        console.error("");

        errors.forEach((error) => {
          console.error(`  • ${error}`);
        });

        console.error("");

        process.exit(1);
      }

      console.log("✔ Configuration validated");

      /**
       * Project path
       */

      const projectPath =
        path.dirname(configPath);

      /**
       * Generate files
       */

      generateMuleArtifact(
        projectPath
      );

      generatePom(
        projectPath,
        loadedConfig.project.name
      );

      generateGitignore(
        projectPath
      );

      generateRaml(
        projectPath,
        loadedConfig
      );

      generateMuleXml(
        projectPath,
        loadedConfig
      );

      generateApplicationProperties(
        projectPath,
        loadedConfig
      );

      generateReadme(
        projectPath,
        loadedConfig
      );

      generateGithubWorkflow(
        projectPath
      );

      console.log("✔ Mule artifact generated");
      console.log("✔ Maven POM generated");
      console.log("✔ RAML generated");
      console.log("✔ Mule flows generated");
      console.log("✔ Application properties generated");
      console.log("✔ README generated");
      console.log("✔ GitHub Actions workflow generated");

      console.log("");
      console.log("🎉 Generation completed successfully!");
      console.log("");

      console.log("Generated project:");
      console.log(`  ${projectPath}`);

      console.log("");
      console.log("Next step:");
      console.log("  mvn clean package");
      console.log("");
    } catch (error) {
      console.error("");
      console.error("❌ Generation failed");
      console.error("");
      console.error(error.message);
      console.error("");

      process.exit(1);
    }
  });

/**
 * ============================================================
 * Parse CLI
 * ============================================================
 */

program.parse();
