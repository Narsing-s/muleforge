#!/usr/bin/env node

const { Command } = require("commander");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const readline = require("readline/promises");
const { stdin, stdout } = require("process");
const YAML = require("yaml");
const Handlebars = require("handlebars");

const {
  buildConnectorDependencies,
  resolveConnectors
} = require("./connectors");

const { connectorFlows } = require("./flow-templates");

const {
  buildRequirementModel,
  writeDocumentation
} = require("./requirement-model");

const VERSION = "0.3.0";

const program = new Command();

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

function render(template, data) {
  return Handlebars.compile(template, {
    noEscape: true
  })(data);
}

function loadConfig(configPath = "muleforge.yaml") {
  const full = path.resolve(configPath);

  if (!fs.existsSync(full)) {
    throw new Error(
      `Configuration not found: ${configPath}`
    );
  }

  const config =
    YAML.parse(fs.readFileSync(full, "utf8")) || {};

  if (!config.project?.name) {
    throw new Error(
      "muleforge.yaml must contain project.name"
    );
  }

  return config;
}

function context(config) {
  const project = config.project || {};
  const api = config.api || {};

  const connectors = resolveConnectors(
    config.connectors || []
  );

  const connectorVersions =
    config.connectors?.versions ||
    config.connectorVersions ||
    {};

  return {
    projectName:
      project.name || "mule-api",

    artifactId:
      project.artifactId ||
      project.name ||
      "mule-api",

    groupId:
      project.groupId ||
      "com.example",

    version:
      project.version ||
      "1.0.0",

    muleRuntime:
      project.muleRuntime ||
      "4.9.0",

    java:
      project.java ||
      "17",

    apiName:
      api.name ||
      project.name ||
      "Mule API",

    apiVersion:
      api.version ||
      "v1",

    basePath:
      api.basePath ||
      "/api/v1",

    connectors,

    connectorDependencies:
      buildConnectorDependencies(
        config,
        connectorVersions
      ),

    hasSnowflake:
      connectors.some(
        (connector) =>
          connector.id === "snowflake"
      ),

    hasDatabase:
      connectors.some(
        (connector) =>
          connector.id === "database"
      ),

    hasSftp:
      connectors.some(
        (connector) =>
          connector.id === "sftp"
      )
  };
}

async function ask(question, defaultValue) {
  const rl = readline.createInterface({
    input: stdin,
    output: stdout
  });

  const answer = await rl.question(
    `${question}${
      defaultValue
        ? ` [${defaultValue}]`
        : ""
    }: `
  );

  rl.close();

  return answer.trim() || defaultValue;
}

async function choose(question, values, defaultIndex = 0) {
  console.log(`\n${question}`);

  values.forEach((value, index) => {
    console.log(
      `  ${
        index === defaultIndex ? "❯" : " "
      } ${index + 1}. ${value}`
    );
  });

  const selected =
    Number(
      await ask(
        "Select number",
        String(defaultIndex + 1)
      )
    ) - 1;

  if (
    !Number.isInteger(selected) ||
    selected < 0 ||
    selected >= values.length
  ) {
    throw new Error("Invalid selection");
  }

  return values[selected];
}

function normalizeOperation(operation) {
  const method = String(
    operation.method || "GET"
  ).toUpperCase();

  if (
    ![
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE"
    ].includes(method)
  ) {
    throw new Error(
      `Unsupported HTTP method: ${method}`
    );
  }

  return {
    name:
      operation.name ||
      `${method.toLowerCase()}Operation`,

    method,

    path:
      operation.path || "/"
  };
}

function generateRaml(config, data) {
  const operations = (
    config.operations || []
  ).map(normalizeOperation);

  const grouped = new Map();

  for (const operation of operations) {
    const resourcePath =
      operation.path
        .replace(/\/{[^}]+}/g, "")
        .replace(/\/$/, "") || "/";

    if (!grouped.has(resourcePath)) {
      grouped.set(resourcePath, []);
    }

    grouped
      .get(resourcePath)
      .push(operation);
  }

  let raml =
    `#%RAML 1.0\n` +
    `title: ${data.apiName}\n` +
    `version: ${data.apiVersion}\n` +
    `baseUri: ${data.basePath}\n\n`;

  for (const [
    resourcePath,
    operations
  ] of grouped) {
    raml += `${resourcePath}:\n`;

    for (const operation of operations) {
      raml +=
        `  ${operation.method.toLowerCase()}:\n`;

      raml +=
        `    description: ${operation.name}\n`;

      if (
        ["POST", "PUT", "PATCH"].includes(
          operation.method
        )
      ) {
        raml +=
          `    body:\n` +
          `      application/json:\n` +
          `        type: object\n`;
      }

      const status =
        operation.method === "POST"
          ? 201
          : 200;

      raml +=
        `    responses:\n` +
        `      ${status}:\n` +
        `        body:\n` +
        `          application/json:\n` +
        `            type: object\n`;
    }
  }

  return raml;
}

function generateMuleXml(config, data) {
  const operations = (
    config.operations || []
  ).map(normalizeOperation);

  let xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<mule ` +
    `xmlns="http://www.mulesoft.org/schema/mule/core" ` +
    `xmlns:http="http://www.mulesoft.org/schema/mule/http" ` +
    `xmlns:ee="http://www.mulesoft.org/schema/mule/ee/core" ` +
    `xmlns:doc="http://www.mulesoft.org/schema/mule/documentation" ` +
    `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="` +
    `http://www.mulesoft.org/schema/mule/core ` +
    `http://www.mulesoft.org/schema/mule/core/current/mule.xsd ` +
    `http://www.mulesoft.org/schema/mule/http ` +
    `http://www.mulesoft.org/schema/mule/http/current/mule-http.xsd ` +
    `http://www.mulesoft.org/schema/mule/ee/core ` +
    `http://www.mulesoft.org/schema/mule/ee/core/current/mule-ee.xsd` +
    `">\n\n`;

  xml +=
    `  <http:listener-config ` +
    `name="HTTP_Listener_config" ` +
    `doc:name="HTTP Listener config">\n` +

    `    <http:listener-connection ` +
    `host="0.0.0.0" ` +
    `port="\${http.port}" />\n` +

    `  </http:listener-config>\n\n`;

  for (const operation of operations) {
    const safeName =
      `${data.artifactId}-${operation.name}`
        .replace(
          /[^A-Za-z0-9_-]/g,
          "-"
        );

    const pathValue =
      `${data.basePath.replace(/\/$/, "")}` +
      `${
        operation.path.startsWith("/")
          ? operation.path
          : `/${operation.path}`
      }`;

    xml +=
      `  <flow name="${safeName}-flow">\n`;

    xml +=
      `    <http:listener ` +
      `config-ref="HTTP_Listener_config" ` +
      `path="${pathValue}" ` +
      `allowedMethods="${operation.method}" ` +
      `doc:name="${operation.method} ${operation.path}" />\n`;

    xml +=
      `    <logger ` +
      `level="INFO" ` +
      `message="MuleForge operation: ${operation.name}" ` +
      `doc:name="Logger" />\n`;

    xml +=
      `    <ee:transform doc:name="Response">\n` +
      `      <ee:message>\n` +
      `        <ee:set-payload><![CDATA[\n` +
      `%dw 2.0\n` +
      `output application/json\n` +
      `---\n` +
      `{\n` +
      `  message: "MuleForge generated operation",\n` +
      `  operation: "${operation.name}",\n` +
      `  method: "${operation.method}"\n` +
      `}\n` +
      `        ]]></ee:set-payload>\n` +
      `      </ee:message>\n` +
      `    </ee:transform>\n`;

    xml +=
      `  </flow>\n\n`;
  }

  if (operations.length === 0) {
    xml +=
      `  <flow name="${data.artifactId}-health-flow">\n` +

      `    <http:listener ` +
      `config-ref="HTTP_Listener_config" ` +
      `path="${data.basePath}/health" ` +
      `allowedMethods="GET" ` +
      `doc:name="Health" />\n`;

    xml +=
      `    <ee:transform doc:name="Health Response">\n` +
      `      <ee:message>\n` +
      `        <ee:set-payload><![CDATA[\n` +
      `%dw 2.0\n` +
      `output application/json\n` +
      `---\n` +
      `{ status: "UP", application: "${data.projectName}" }\n` +
      `        ]]></ee:set-payload>\n` +
      `      </ee:message>\n` +
      `    </ee:transform>\n` +

      `  </flow>\n`;
  }

  /*
   * Connector-specific generated flows.
   */
  xml += connectorFlows(
    config.connectors || [],
    data
  );

  xml += `</mule>\n`;

  return xml;
}

function generateProject(configPath = "muleforge.yaml") {
  const config =
    loadConfig(configPath);

  const data =
    context(config);

  const root =
    path.resolve(
      path.dirname(configPath)
    );

  const templates =
    path.resolve(
      __dirname,
      "../templates"
    );

  const pom =
    fs.readFileSync(
      path.join(
        templates,
        "pom.xml.hbs"
      ),
      "utf8"
    );

  const artifact =
    fs.readFileSync(
      path.join(
        templates,
        "mule-artifact.json.hbs"
      ),
      "utf8"
    );

  const application =
    fs.readFileSync(
      path.join(
        templates,
        "connectors",
        "application.yaml.hbs"
      ),
      "utf8"
    );

  const munit =
    fs.readFileSync(
      path.join(
        templates,
        "munit",
        "basic-test.xml.hbs"
      ),
      "utf8"
    );

  write(
    path.join(root, "pom.xml"),
    render(pom, data)
  );

  write(
    path.join(root, "mule-artifact.json"),
    render(artifact, data)
  );

  write(
    path.join(
      root,
      "src/main/resources/application.yaml"
    ),
    render(application, data)
  );

  write(
    path.join(
      root,
      "src/main/resources/api",
      `${data.artifactId}.raml`
    ),
    generateRaml(config, data)
  );

  write(
    path.join(
      root,
      "src/main/mule",
      `${data.artifactId}.xml`
    ),
    generateMuleXml(config, data)
  );

  if (
    (config.testing || {}).munit !== false
  ) {
    write(
      path.join(
        root,
        "src/test/munit",
        `${data.artifactId}-test.xml`
      ),
      render(munit, data)
    );
  }

  if (config.requirement) {
    writeDocumentation(
      root,
      config
    );
  }

  console.log(
    `\n✔ Mule project generated`
  );

  console.log(
    `✔ Connectors: ${
      data.connectors
        .map((connector) => connector.name)
        .join(", ") || "none"
    }`
  );

  console.log(
    `✔ Documentation: ${
      config.requirement
        ? "docs/"
        : "not requested"
    }\n`
  );
}

async function createFromRequirement(
  requirement
) {
  const text =
    requirement ||
    await ask(
      "\nDescribe what you want to build\n> ",
      "Create a Mule API"
    );

  const model =
    buildRequirementModel(text);

  console.log(
    `\nI understood:\n` +
    `  Project: ${model.project.name}\n` +
    `  API: ${model.api.type}\n` +
    `  Connectors: ${model.connectors.join(", ")}\n` +
    `  Endpoints detected: ${
      model.operations.length || "none"
    }\n`
  );

  const confirm =
    await choose(
      "Generate this project?",
      ["Yes", "No"],
      0
    );

  if (confirm !== "Yes") {
    return;
  }

  const root =
    path.resolve(
      process.cwd(),
      model.project.name
    );

  if (fs.existsSync(root)) {
    throw new Error(
      `Project already exists: ${model.project.name}`
    );
  }

  fs.mkdirSync(root, {
    recursive: true
  });

  model.requirement = text;

  write(
    path.join(
      root,
      "muleforge.yaml"
    ),
    YAML.stringify(model)
  );

  [
    "src/main/mule",
    "src/main/resources/api",
    "src/main/resources/dw",
    "src/test/munit",
    "database",
    "docs",
    ".github/workflows"
  ].forEach((directory) => {
    fs.mkdirSync(
      path.join(root, directory),
      { recursive: true }
    );
  });

  write(
    path.join(root, "README.md"),
    `# ${model.project.name}

Generated by MuleForge from a user requirement.

See [docs/README.md](docs/README.md).
`
  );

  generateProject(
    path.join(
      root,
      "muleforge.yaml"
    )
  );
}

function validate(
  configPath = "muleforge.yaml"
) {
  const config =
    loadConfig(configPath);

  const data =
    context(config);

  const root =
    path.resolve(
      path.dirname(configPath)
    );

  const required = [
    "pom.xml",
    "mule-artifact.json",
    "src/main/resources/application.yaml",
    `src/main/resources/api/${data.artifactId}.raml`,
    `src/main/mule/${data.artifactId}.xml`
  ];

  const missing =
    required.filter(
      (file) =>
        !fs.existsSync(
          path.join(root, file)
        )
    );

  if (missing.length) {
    missing.forEach((file) =>
      console.log(`✖ Missing: ${file}`)
    );

    process.exitCode = 1;
    return;
  }

  console.log(
    `✔ Project ${data.projectName || data.artifactId}`
  );

  console.log(
    `✔ Runtime ${data.muleRuntime}`
  );

  console.log(
    `✔ Connectors ${
      data.connectors
        .map((connector) => connector.name)
        .join(", ") || "none"
    }`
  );

  console.log(
    "✔ Project structure valid"
  );
}

function mvn(args) {
  try {
    execFileSync(
      process.platform === "win32"
        ? "mvn.cmd"
        : "mvn",
      args,
      {
        stdio: "inherit"
      }
    );
  } catch (error) {
    process.exitCode =
      error.status || 1;
  }
}

function doctor() {
  for (const command of [
    "node",
    "java",
    "mvn",
    "git"
  ]) {
    try {
      execFileSync(
        process.platform === "win32"
          ? `${command}.cmd`
          : command,
        ["--version"],
        {
          stdio: "inherit"
        }
      );

      console.log(`✔ ${command}`);
    } catch {
      console.log(
        `✖ ${command} not found`
      );
    }
  }
}

program
  .name("muleforge")
  .description(
    "Requirement-driven Mule 4 project generator"
  )
  .version(VERSION);

program
  .command("create [requirement]")
  .description(
    "Create a Mule project from a natural-language requirement"
  )
  .action(createFromRequirement);

program
  .command("init [projectName]")
  .description(
    "Create a MuleForge project"
  )
  .option(
    "--runtime <version>",
    "Mule runtime version",
    "4.9.0"
  )
  .option(
    "--group <groupId>",
    "Maven groupId",
    "com.example"
  )
  .action(
    async (name, options) => {
      const config = name
        ? {
            project: {
              name: name,
              artifactId: name,
              groupId:
                options.group,
              version: "1.0.0",
              muleRuntime:
                options.runtime,
              java: "17"
            },

            api: {
              name: name,
              version: "v1",
              type: "System API",
              specification: "RAML",
              basePath: "/api/v1"
            },

            connectors: ["http"],

            testing: {
              munit: true
            },

            deployment: {
              target: "none"
            },

            operations: []
          }
        : {
            project: {
              name: await ask(
                "Project name",
                "customer-api"
              ),
              artifactId:
                "customer-api",
              groupId:
                "com.example",
              version: "1.0.0",
              muleRuntime: "4.9.0",
              java: "17"
            },

            api: {
              name: "customer-api",
              version: "v1",
              type: "System API",
              specification: "RAML",
              basePath: "/api/v1"
            },

            connectors: ["http"],

            testing: {
              munit: true
            },

            deployment: {
              target: "none"
            },

            operations: []
          };

      const root =
        path.resolve(
          process.cwd(),
          config.project.name
        );

      if (fs.existsSync(root)) {
        throw new Error(
          `Project already exists: ${config.project.name}`
        );
      }

      fs.mkdirSync(root, {
        recursive: true
      });

      write(
        path.join(
          root,
          "muleforge.yaml"
        ),
        YAML.stringify(config)
      );

      generateProject(
        path.join(
          root,
          "muleforge.yaml"
        )
      );
    }
  );

program
  .command("generate [config]")
  .description(
    "Generate files from muleforge.yaml"
  )
  .action(
    (config = "muleforge.yaml") =>
      generateProject(config)
  );

program
  .command("docs [config]")
  .description(
    "Regenerate documentation"
  )
  .action(
    (config = "muleforge.yaml") => {
      const file =
        path.resolve(config);

      const model =
        loadConfig(file);

      if (!model.requirement) {
        throw new Error(
          "No requirement found in muleforge.yaml"
        );
      }

      writeDocumentation(
        path.dirname(file),
        model
      );

      console.log(
        "✔ Documentation regenerated in docs/"
      );
    }
  );

program
  .command("validate [config]")
  .description(
    "Validate generated project"
  )
  .action(
    (config = "muleforge.yaml") =>
      validate(config)
  );

program
  .command("build")
  .description(
    "Build the Mule application"
  )
  .action(() =>
    mvn(["clean", "package"])
  );

program
  .command("test")
  .description(
    "Run Mule tests"
  )
  .action(() =>
    mvn(["test"])
  );

program
  .command("clean")
  .description(
    "Clean Maven target"
  )
  .action(() =>
    mvn(["clean"])
  );

program
  .command("doctor")
  .description(
    "Check local development tools"
  )
  .action(doctor);

program
  .parseAsync()
  .catch((error) => {
    console.error(
      `\n❌ ${error.message}`
    );

    process.exitCode = 1;
  });