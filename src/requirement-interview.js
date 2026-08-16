const readline = require("readline/promises");
const { stdin, stdout } = require("process");

async function interview(initialRequirement = "") {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const ask = async (q, fallback = "") => {
    const answer = (await rl.question(`${q}${fallback ? ` [${fallback}]` : ""}: `)).trim();
    return answer || fallback;
  };

  console.log("\n🚀 MuleForge Requirement Interview\n");
  const requirement = initialRequirement || await ask("Describe what you want to build");
  const projectName = await ask("Project name", "mule-api");
  const apiType = await ask("API type (System API / Process API / Experience API)", "System API");

  let endpointDetails = await ask("What endpoints/operations are required? (example: POST /customers, GET /customers/{id})", "");
  let requestFields = await ask("What request fields are required?", "");
  let responseFields = await ask("What should the successful response contain?", "");
  let validation = await ask("What validation rules should be enforced?", "");
  let backend = await ask("What systems/data sources should the API call? (or 'none')", "none");
  let errors = await ask("Which business/error cases should be handled?", "validation errors, connector errors, unexpected errors");
  const confirmation = await ask("Proceed with this design? (yes/no)", "yes");
  rl.close();

  if (!/^y(es)?$/i.test(confirmation)) throw new Error("Generation cancelled by user");

  return {
    projectName,
    apiType,
    requirement: [
      requirement,
      `Endpoints: ${endpointDetails || "not specified"}`,
      `Request fields: ${requestFields || "not specified"}`,
      `Response fields: ${responseFields || "not specified"}`,
      `Validation: ${validation || "not specified"}`,
      `Backend/data sources: ${backend}`,
      `Errors: ${errors}`
    ].join("\n")
  };
}

module.exports = { interview };
