const fs=require("fs");
const path=require("path");
const YAML=require("yaml");
function validateContract(file="muleforge.yaml"){
 const root=path.resolve(path.dirname(file)); const cfg=YAML.parse(fs.readFileSync(path.resolve(file),"utf8"))||{}; const ops=Array.isArray(cfg.operations)?cfg.operations:[]; const errors=[],warnings=[];
 const seen=new Set();
 for(const op of ops){const method=String(op.method||"").toUpperCase(); const p=String(op.path||""); if(!method||!p) errors.push("Operation is missing method/path: "+String(op.name||"unnamed")); const key=method+" "+p;if(seen.has(key))errors.push("Duplicate route: "+key);seen.add(key); if(!/^[A-Za-z0-9_./{}:-]+$/.test(p)) warnings.push("Unusual route characters: "+p); if(op.successStatus && !/^[1-5][0-9][0-9]$/.test(String(op.successStatus)))errors.push("Invalid successStatus for "+(op.name||p));}
 const raml=path.join(root,"src/main/resources/api"); if(!fs.existsSync(raml)) warnings.push("RAML output directory does not exist yet.");
 return {valid:errors.length===0,errors,warnings,operationCount:ops.length};
}
module.exports={validateContract};
