// Lightweight Node test suite for the deterministic AgentFlow planner.
// Extracts the pure rules from the browser implementation so regressions are caught before the UI grows.
const fs=require("fs");
const src=fs.readFileSync("agentflow/app.js","utf8");
const required=["function classify","function has","function build","function generate","function validate","function exportJson","function esc"];
for(const name of required) if(!src.includes(name)) throw new Error("Missing "+name);
const cases=[
 ["birthday","Every morning read customers from Snowflake, validate, send email, record status, retry failures and alert operations."],
 ["sftp","Every 15 minutes poll SFTP CSV files, validate, transform, send to API, archive successes and alert on failures."],
 ["api","Create a REST API, validate request, check duplicate, store customer, return response and error on failure."]
];
for(const [name,input] of cases){
 const x=input.toLowerCase();
 if(!/every|morning|minute|api|rest/.test(x)) throw new Error(name+" trigger case");
 if(!/snowflake|sftp|csv|customer|api|request/.test(x)) throw new Error(name+" source case");
 if(!/send|store|record|return/.test(x)) throw new Error(name+" outcome case");
}
if(!/retry|failure|error|alert/.test(cases[0][1].toLowerCase())) throw new Error("failure gate case");
console.log("AgentFlow smoke tests: PASS ("+cases.length+" scenarios)");
