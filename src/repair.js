const fs=require("fs"),path=require("path");
const { verifyProject } = require("./verify");

function repairProject(root="."){
  const base=path.resolve(root),changes=[];
  const ensure=(f,c)=>{
    const p=path.join(base,f);
    if(!fs.existsSync(p)){
      fs.mkdirSync(path.dirname(p),{recursive:true});
      fs.writeFileSync(p,c,"utf8");
      changes.push("Created "+f);
    }
  };
  ensure(".gitignore","target/\n*.log\n.idea/\n.vscode/\n.env\n");
  for(const env of ["dev","qa","uat","prod"]) ensure(`src/main/resources/properties/application-${env}.yaml`,"# Environment-specific values\n");
  if(fs.existsSync(path.join(base,"muleforge.yaml"))){
    ensure("docs/11-traceability.md","# MuleForge Traceability\n\nRun `muleforge trace` to generate requirement-to-asset evidence.\n");
    ensure("postman/README.md","# Postman\n\nRun `muleforge postman` to generate the collection.\n");
    ensure(".github/workflows/README.md","# CI/CD\n\nRun `muleforge cicd` to regenerate pipeline assets.\n");
  }
  return {changed:changes.length>0,changes};
}

function repairAndVerify(root=".", options={}){
  const base=path.resolve(root);
  const maxPasses=Math.max(1,Math.min(Number(options.maxPasses)||2,3));
  const passes=[];
  for(let pass=1;pass<=maxPasses;pass++){
    let verification;
    try { verification=verifyProject(path.join(base,"muleforge.yaml"),{build:Boolean(options.build)}); }
    catch(error){
      return {ready:false,passes:[{pass,verification:null,repair:{changed:false,changes:[]},error:error.message}],reason:"Verification could not start."};
    }
    if(verification.ready){
      return {ready:true,passes:[...passes,{pass,verification,repair:{changed:false,changes:[]}}],reason:"Verification passed before repair; no files changed."};
    }
    const repair=repairProject(base);
    passes.push({pass,verification,repair});
    if(!repair.changed) break;
  }
  let finalVerification=null;
  try { finalVerification=verifyProject(path.join(base,"muleforge.yaml"),{build:Boolean(options.build)}); }
  catch(error){ return {ready:false,passes,error:error.message,reason:"Final verification could not run."}; }
  return {
    ready:finalVerification.ready,
    passes,
    finalVerification,
    reason:finalVerification.ready
      ? "Repair completed and final verification passed."
      : "Repair completed only non-destructive scaffolding; unresolved verification failures remain."
  };
}

module.exports={repairProject,repairAndVerify};
