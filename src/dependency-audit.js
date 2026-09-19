const {spawnSync}=require("node:child_process"),fs=require("node:fs"),path=require("node:path");
function run(command,args,cwd){const r=spawnSync(command,args,{cwd,encoding:"utf8"});return {code:r.status??1,stdout:r.stdout||"",stderr:r.stderr||""};}
function dependencyAudit(root="."){const base=path.resolve(root),results=[];
if(fs.existsSync(path.join(base,"package-lock.json"))||fs.existsSync(path.join(base,"npm-shrinkwrap.json"))){const r=run(process.platform==="win32"?"npm.cmd":"npm",["audit","--json"],base);results.push({tool:"npm audit",code:r.code,output:r.stdout||r.stderr});}
if(fs.existsSync(path.join(base,"pom.xml"))){const r=run(process.platform==="win32"?"mvn.cmd":"mvn",["org.owasp:dependency-check-maven:check","-DskipTests"],base);results.push({tool:"OWASP Dependency-Check",code:r.code,output:(r.stdout||r.stderr).slice(-12000)});}
return {root:base,results,available:results.length>0,passed:results.every(r=>r.code===0)};}
module.exports={dependencyAudit};