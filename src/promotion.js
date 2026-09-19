const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");

function manifestChecksum(root){
  const file=path.join(path.resolve(root),"artifact-manifest.json");
  if(!fs.existsSync(file)) return null;
  try{return crypto.createHash("sha256").update(JSON.stringify(JSON.parse(fs.readFileSync(file,"utf8")))).digest("hex");}
  catch{return null;}
}
function promotionPlan(config={}, options={}){
  const envs=(config.deployment?.promotionEnvironments||["dev","qa","uat","prod"]).map(String);
  const rollbackArtifacts=config.deployment?.rollbackArtifacts||{};
  const checksum=options.artifactChecksum||null;
  return {
    version:"1.1",
    artifact:config.project?.artifactId||config.project?.name||"mule-api",
    artifactChecksum:checksum,
    environments:envs.map((environment,index)=>({
      environment,order:index+1,approvalRequired:["uat","prod"].includes(environment),
      immutableArtifact:true,rollbackArtifact:rollbackArtifacts[environment]||null
    })),
    rollback:{enabled:true,requiresArtifactChecksum:true,execution:"external-deployment-system"}
  };
}
function writePromotionPlan(root,config){
  const resolved=path.resolve(root);
  const file=path.join(resolved,"deployment-promotion.json");
  const checksum=manifestChecksum(resolved);
  fs.writeFileSync(file,JSON.stringify(promotionPlan(config,{artifactChecksum:checksum}),null,2)+"\n","utf8");
  return file;
}
module.exports={promotionPlan,writePromotionPlan,manifestChecksum};