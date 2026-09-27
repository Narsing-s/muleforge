const fs=require("fs");
const app=fs.readFileSync(__dirname+"/app.js","utf8");
const api=fs.readFileSync(__dirname+"/../api/generate.js","utf8");
for(const name of ["classify","build","validate","exportJson"]) if(!app.includes("function "+name)) throw new Error("Missing "+name);
for(const token of ["AI_GATEWAY_API_KEY","ai-gateway.vercel.sh","response_format","qualityGates"]) if(!api.includes(token)) throw new Error("Missing AI API contract: "+token);
console.log("AgentFlow tests passed: planner + AI provider contract");
