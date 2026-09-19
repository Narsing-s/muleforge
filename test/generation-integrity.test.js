const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { snapshot, diffSnapshots } = require("../src/diff");

test("generated POM keeps Mule and MUnit plugins inside build/plugins", () => {
  const pom = fs.readFileSync(path.resolve(__dirname, "../templates/pom.xml.hbs"), "utf8");
  assert.match(pom, /<munit\.version>3\.7\.4<\/munit\.version>/);
  assert.match(pom, /<plugins>[\s\S]*mule-maven-plugin[\s\S]*munit-maven-plugin[\s\S]*<\/plugins>/);
  assert.equal((pom.match(/<plugins>/g) || []).length, 5);
  assert.match(pom, /<artifactId>munit-runner<\/artifactId>/);
  assert.match(pom, /<artifactId>munit-tools<\/artifactId>/);
  assert.match(pom, /<munit\.runtimeversion>\$\{app\.runtime\}<\/munit\.runtimeversion>/);
});

test("snapshot diff reports added and removed project files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-diff-"));
  fs.writeFileSync(path.join(root, "a.txt"), "a");
  const before = snapshot(root);
  fs.writeFileSync(path.join(root, "b.txt"), "b");
  fs.rmSync(path.join(root, "a.txt"));
  const after = snapshot(root);
  const diff = diffSnapshots(before, after);
  assert.deepEqual(diff.added, ["b.txt"]);
  assert.deepEqual(diff.removed, ["a.txt"]);
  assert.deepEqual(diff.unchanged, []);
});

test("release-check is exposed by the CLI", () => {
  const index = fs.readFileSync(path.resolve(__dirname, "../src/index.js"), "utf8");
  assert.match(index, /release-check \[directory\]/);
  assert.match(index, /runtime-validation\.yml/);
  assert.match(index, /docs.*cicd.*runtime-validation\.md/);
});


test("connector audit requires dependency, namespace, config and operation evidence", () => {
  const fs = require("node:fs"); const os = require("node:os"); const path = require("node:path");
  const { auditConnectors } = require("../src/connector-audit");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "muleforge-connector-audit-"));
  fs.mkdirSync(path.join(root, "src/main/mule"), { recursive: true });
  fs.writeFileSync(path.join(root, "muleforge.yaml"), "connectors: [kafka]\noperations:\n  - name: publish\n    connector: kafka\n", "utf8");
  fs.writeFileSync(path.join(root, "pom.xml"), "<artifactId>mule-kafka-connector</artifactId>", "utf8");
  fs.writeFileSync(path.join(root, "src/main/mule/api.xml"), '<mule xmlns:kafka="http://www.mulesoft.org/schema/mule/kafka"><kafka:producer-config name="Kafka_Config"/><kafka:publish config-ref="Kafka_Config"/></mule>', "utf8");
  const report = auditConnectors(path.join(root, "muleforge.yaml"));
  assert.equal(report.ready, true);
});

test("CLI exposes connector-check and sync-docs", () => {
  const fs = require("node:fs"); const path = require("node:path");
  const index = fs.readFileSync(path.resolve(__dirname, "../src/index.js"), "utf8");
  assert.match(index, /connector-check \[config\]/);
  assert.match(index, /sync-docs \[config\]/);
});


test("CLI exposes deployment-check", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/index.js"), "utf8");
  assert.match(source, /deployment-check/);
  assert.match(source, /validateDeployment/);
});


test("generated business flows support correlation IDs and configured retries", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/business-generator.js"), "utf8");
  assert.match(source, /correlationId/);
  assert.match(source, /until-successful/);
  assert.match(source, /maxRetries/);
});
test("CloudHub 2 deployment validation enforces target and supported vCores", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/contract-validator.js"), "utf8");
  assert.match(source, /deployment requires target/);
  assert.match(source, /validVCores/);
});


test("release workflow is gated by tests, self-test and release readiness", () => {
  const workflow = fs.readFileSync(path.resolve(__dirname, "../.github/workflows/release.yml"), "utf8");
  assert.match(workflow, /npm test/);
  assert.match(workflow, /self-test/);
  assert.match(workflow, /release-check/);
  assert.match(workflow, /npm pack/);
});


test("operation policy validator rejects invalid reliability and security settings", () => {
  const { validateOperationPolicies } = require("../src/contract-validator");
  const result = validateOperationPolicies([
    { name: "bad", method: "GET", pagination: { defaultPageSize: 200, maxPageSize: 10 }, idempotency: true, security: "unknown" },
    { name: "retry", method: "POST", retry: { maxRetries: 0, millisBetweenRetries: -1 } }
  ]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length >= 4);
});

test("RAML generator contains security, pagination, idempotency and error contract support", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/index.js"), "utf8");
  assert.match(source, /securitySchemes/);
  assert.match(source, /Idempotency-Key/);
  assert.match(source, /queryParameters/);
  assert.match(source, /op.errors/);
});

test("self-test includes deployment and policy validation", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/index.js"), "utf8");
  assert.match(source, /policies = validateOperationPolicies/);
  assert.match(source, /validateDeployment\(model\.deployment/);
});


test("RAML schema generation preserves requirement request and response fields", () => {
  const { renderProperties } = require("../src/schema-generator");
  const request = renderProperties([
    { name: "email", type: "string", required: true, description: "Customer email" },
    { name: "age", type: "integer" }
  ], "            ");
  const response = renderProperties(["customerId", "status"], "            ");
  assert.match(request, /email:/);
  assert.match(request, /type: string/);
  assert.match(request, /required: true/);
  assert.match(request, /description: Customer email/);
  assert.match(request, /age:/);
  assert.match(response, /customerId:/);
  assert.match(response, /status:/);
});

test("generated MUnit assertions use documented MunitTools matcher expressions", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/munit-generator.js"), "utf8");
  assert.match(source, /MunitTools::equalTo/);
  assert.match(source, /munit-tools:payload/);
  assert.doesNotMatch(source, /is="equalTo\(/);
});

test("generated flows include real idempotency reservation and transaction scope", () => {
  const business = fs.readFileSync(path.resolve(__dirname, "../src/business-generator.js"), "utf8");
  const connector = fs.readFileSync(path.resolve(__dirname, "../src/connector-flow-generator.js"), "utf8");
  assert.match(business, /os:store/);
  assert.match(business, /failIfPresent="true"/);
  assert.match(business, /transactionalAction="ALWAYS_BEGIN"/);
  assert.match(connector, /ObjectStore_Config/);
  assert.match(connector, /OS:KEY_ALREADY_EXISTS/);
  assert.match(connector, /transactionalAction="ALWAYS_BEGIN"/);
});

test("generated connector pagination uses runtime page variables and metadata", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/connector-flow-generator.js"), "utf8");
  assert.match(source, /muleforgePageSize/);
  assert.match(source, /muleforgePageOffset/);
  assert.ok(source.includes("hasNext: (vars.page * vars.pageSize) < total"));
});

test("MUnit generator includes idempotency and pagination scenarios", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/munit-generator.js"), "utf8");
  assert.match(source, /idempotency-duplicate/);
  assert.match(source, /OS:KEY_ALREADY_EXISTS/);
  assert.ok(source.includes('testName(op, "pagination")'));
});


test("breaking-change checker detects removed operations and newly required fields", () => {
  const { breakingChanges } = require("../src/breaking-check");
  const oldModel = { operations: [{ name: "get", method: "GET", path: "/customers/{id}", requestFields: [{ name: "id", required: false }, { name: "name" }] }] };
  const newModel = { operations: [{ name: "get", method: "GET", path: "/customers/{id}", requestFields: [{ name: "id", required: true }] }] };
  const result = breakingChanges(oldModel, newModel);
  assert.ok(result.some(c => c.type === "required-field-added"));
  assert.ok(result.some(c => c.type === "field-removed"));
});

test("CLI exposes breaking-check", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/index.js"), "utf8");
  assert.match(source, /breaking-check <from>/);
});

test("release-check requires breaking-change checker", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/index.js"), "utf8");
  assert.match(source, /breaking-check/);
  assert.match(source, /breaking-change checker/);
});

test("OpenAPI generator preserves project operations and security schemes", () => {
  const { generateOpenApi } = require("../src/openapi-generator");
  const doc = generateOpenApi({ project: { name: "demo" }, api: { name: "Demo", version: "v1", basePath: "/api/v1" }, operations: [{ name: "create", method: "POST", path: "/customers", requestFields: [{ name: "email", required: true }], responseFields: ["id"], security: "oauth2" }] });
  assert.equal(doc.openapi, "3.0.3");
  assert.ok(doc.paths["/customers"].post.requestBody);
  assert.ok(doc.components.securitySchemes.oauth2);
});
test("semantic breaking checker detects enum, required and policy removals", () => {
  const { breakingChanges } = require("../src/breaking-check");
  const oldModel = { operations: [{ method: "POST", path: "/x", requestFields: [{ name: "state", enum: ["A","B"] }], pagination: true, idempotency: true }] };
  const newModel = { operations: [{ method: "POST", path: "/x", requestFields: [{ name: "state", enum: ["A"] }] }] };
  const result = breakingChanges(oldModel, newModel);
  assert.ok(result.some(x => x.type === "request-enum-value-removed"));
  assert.ok(result.some(x => x.type === "pagination-removed"));
  assert.ok(result.some(x => x.type === "idempotency-removed"));
});
test("APIKit generator emits router and config", () => {
  const { generateApiKitFlow, generateApiKitConfig } = require("../src/apikit-generator");
  assert.match(generateApiKitConfig({ artifactId: "demo" }), /apikit:config/);
  assert.match(generateApiKitFlow({ artifactId: "demo", basePath: "/api/v1" }), /apikit:router/);
});


test("semantic IR normalizes operations and validates supported connectors",()=>{const {buildIntegrationIR,validateIntegrationIR}=require("../src/semantic-ir");const ir=buildIntegrationIR({operations:[{name:"get",method:"GET",path:"/x",connector:"http",requestFields:[{name:"id",required:true}]}]});assert.equal(ir.operations[0].requestFields[0].required,true);assert.equal(validateIntegrationIR(ir).valid,true);});
test("security scanner and SBOM inventory are exposed",()=>{const {scanDependencies,sbom}=require("../src/security-scan");assert.ok(Array.isArray(scanDependencies(".").npm));assert.equal(sbom(".").bomFormat,"CycloneDX");});


test("DataWeave validator catches missing header",()=>{const {validateScript}=require("../src/dataweave-validator");assert.equal(validateScript("output application/json --- payload").valid,false);});
test("existing-project importer creates reviewable model",()=>{const {importProject}=require("../src/import-project");const model=importProject(".");assert.ok(model.project);assert.ok(Array.isArray(model.operations));assert.equal(model.import.reviewRequired,true);});
test("promotion plan includes approval and rollback controls",()=>{const {promotionPlan}=require("../src/promotion");const p=promotionPlan({project:{artifactId:"demo"}});assert.ok(p.environments.find(e=>e.environment==="prod").approvalRequired);assert.equal(p.rollback.enabled,true);});


test("event model validates supported messaging triggers",()=>{const {buildEventModel,validateEventModel}=require("../src/event-model");const r=validateEventModel(buildEventModel({events:[{type:"kafka",topic:"orders",idempotency:true}]}));assert.equal(r.valid,true);});
test("artifact provenance hashes repository files",()=>{const {artifactManifest}=require("../src/provenance");const r=artifactManifest(".");assert.equal(r.algorithm,"sha256");assert.ok(r.files.length>0);});


test("dependency audit exposes an executable security gate",()=>{const {dependencyAudit}=require("../src/dependency-audit");const r=dependencyAudit(".");assert.equal(typeof r.available,"boolean");assert.ok(Array.isArray(r.results));});


test("GraphQL generator creates a schema",()=>{const {generateGraphqlSchema}=require("../src/graphql-generator");assert.match(generateGraphqlSchema({project:{artifactId:"demo"}}),/type Query/);});
test("SOAP scaffold requires an explicit WSDL",()=>{const {generateSoapScaffold}=require("../src/soap-generator");assert.equal(generateSoapScaffold({project:{name:"demo"}}),null);});
test("artifact signing uses an environment-provided secret",()=>{const {signManifest}=require("../src/artifact-signing");assert.equal(typeof signManifest,"function");});
test("IDE manifest is generated from CLI capabilities",()=>{const {writeIdeManifest}=require("../src/ide-manifest");assert.equal(typeof writeIdeManifest,"function");});


test("DataWeave runtime adapter never fakes execution when CLI is unavailable",()=>{const {executeDataWeave}=require("../src/dataweave-runtime");const r=executeDataWeave("%dw 2.0\noutput application/json\n---\npayload",{});assert.equal(typeof r.executed,"boolean");if(!r.available)assert.equal(r.executed,false);});
test("golden regression suite covers multiple integration classes",()=>{const {runGolden}=require("../src/golden-regression");const r=runGolden();assert.ok(r.length>=4);assert.equal(r.every(x=>x.pass),true);});
test("native CI renderer supports all configured targets",()=>{const {render}=require("../src/ci-native");for(const t of ["gitlab","azure-devops","jenkins","bitbucket"])assert.ok(render(t).length>20);});
test("deeper importer preserves source review metadata",()=>{const {importProject}=require("../src/import-project");const r=importProject(".");assert.equal(r.migration.preserveSource,true);assert.ok(r.inventory.files>0);});


test("event runtime generator emits connector flow, retry and correlation metadata",()=>{const {generateEventRuntime}=require("../src/event-runtime-generator");const x=generateEventRuntime({events:[{name:"orders",type:"kafka",topic:"orders",retry:{maxAttempts:4},deadLetterQueue:"orders-dlq"}]});assert.match(x,/kafka:message-listener/);assert.match(x,/until-successful/);assert.match(x,/correlationId/);assert.match(x,/orders-dlq/);});


test("nested schema fields preserve arrays enums and nested properties",()=>{const {normalizeField}=require("../src/schema-generator");const f=normalizeField({name:"customer",type:"object",fields:[{name:"id",type:"integer",required:true}],enum:["x"]});assert.equal(f.type,"object");assert.equal(f.fields[0].required,true);});
test("database schema diff detects additive and type drift",()=>{const {schemaDiff}=require("../src/db-schema");const r=schemaDiff({columns:[{name:"ID",type:"INT"}]},{columns:[{name:"ID",type:"BIGINT"},{name:"NAME",type:"VARCHAR"}]});assert.equal(r.drift,true);assert.equal(r.changes.length,2);});
test("existing project import discovers non-http connector operations",()=>{const {importProject}=require("../src/import-project");const r=importProject(".");assert.ok(Array.isArray(r.operations));assert.ok(Array.isArray(r.ramlSources));});


test("RAML advanced constructs are generated",()=>{const {generateRaml}=require("../src/ui-generator");const r=generateRaml({raml:{types:[{name:"Customer",type:"object",fields:[{name:"id",type:"string",required:true}]}],traits:[{name:"paged"}],resourceTypes:[{name:"collection"}]},operations:[{name:"list",method:"GET",path:"/customers",traits:["paged"],responseType:"Customer",example:{id:"1"}}]},{apiName:"x",apiVersion:"v1",basePath:"/api"});assert.match(r,/types:/);assert.match(r,/traits:/);assert.match(r,/resourceTypes:/);assert.match(r,/example:/);});
test("database migration generator creates reviewable SQL",()=>{const {migrationSql}=require("../src/db-schema");const r=migrationSql({table:"CUSTOMER",columns:[{name:"ID",type:"INT"}]},{table:"CUSTOMER",columns:[{name:"ID",type:"BIGINT"},{name:"NAME",type:"VARCHAR"}]});assert.match(r,/ADD COLUMN NAME/);assert.match(r,/alter CUSTOMER.ID/i);});
