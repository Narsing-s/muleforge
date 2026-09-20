const { inferApiLedArchitecture } = require("./architecture");
const { classifyWorkload } = require("./workload-engine");
const fs=require("node:fs"),path=require("node:path"),YAML=require("yaml");
function walk(d,out=[]){if(!fs.existsSync(d))return out;for(const e of fs.readdirSync(d,{withFileTypes:true})){if([".git","target","node_modules"].includes(e.name))continue;const p=path.join(d,e.name);e.isDirectory()?walk(p,out):out.push(p);}return out;}
function attrs(tag){const a={};for(const m of String(tag).matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g))a[m[1]]=m[2];return a;}
function relative(base,file){return path.relative(base,file).replace(/\\/g,"/");}
function extract(xml,file){const out=[];const re=/<flow(?=[\s>])[^>]*name="([^"]+)"[\s\S]*?<\/flow>/gi;let m;while((m=re.exec(xml))){const body=m[0],lm=body.match(/<http:listener\b([^>]*)\/?>(?:<\/http:listener>)?/i);if(lm){const a=attrs(lm[1]);out.push({name:m[1],method:(a.method||"GET").toUpperCase(),path:a.path||"/",connector:"http",source:file});}}
for(const m2 of xml.matchAll(/<([\w-]+):([\w-]+)\b([^>]*)\/?>(?:<\/\1:\2>)?/g)){const ns=m2[1].toLowerCase(),op=m2[2].toLowerCase();if(["db","snowflake","sftp","kafka","jms","ibm-mq","anypoint-mq","sfdc"].includes(ns))out.push({name:ns+"-"+op,method:"EVENT",path:"/",connector:ns,action:op,source:file});}return out;}
function unique(values){return [...new Set(values.filter(Boolean).map(String))];}
function extractSemantics(xml){
  const flows=[...xml.matchAll(/<(flow|sub-flow|private|template)(?=[\s>])[^>]*\bname="([^"]+)"/gi)].map(m=>({type:m[1].toLowerCase(),name:m[2]}));
  const flowRefs=[...xml.matchAll(/<flow-ref\b[^>]*\bname="([^"]+)"/gi)].map(m=>m[1]);
  const transforms=[...xml.matchAll(/<(ee:transform|transform-message)\b/gi)].map(()=>"transform");
  const errorHandlers=[...xml.matchAll(/<(on-error-(?:continue|propagate)|on-error)\b[^>]*>([\s\S]*?)<\/on-error[^>]*>/gi)].map(m=>{const a=attrs(m[0]);return {type:m[1].toLowerCase(),errorType:a.type||a.errorType||null};});
  const configRefs=[...xml.matchAll(/\bconfig-ref="([^"]+)"/gi)].map(m=>m[1]);
  const globalConfigs=[...xml.matchAll(/<([\w-]+):([\w-]+(?:-config|-connection|config|connection))\b([^>]*)/gi)].map(m=>{const a=attrs(m[0]);return {namespace:m[1].toLowerCase(),element:m[2],name:a.name||null};});
  return {flows,flowRefs:unique(flowRefs),transformCount:transforms.length,errorHandlers,configRefs:unique(configRefs),globalConfigs};
}
function importProject(root="."){
  const base=path.resolve(root),files=walk(base),xml=files.filter(f=>f.endsWith(".xml")),raml=files.filter(f=>f.endsWith(".raml")),dw=files.filter(f=>f.endsWith(".dwl")),munit=files.filter(f=>/munit/i.test(f)&&f.endsWith(".xml")),pom=files.find(f=>path.basename(f)==="pom.xml");
  const operations=[],semantics={flows:[],flowRefs:[],transformCount:0,errorHandlers:[],configRefs:[],globalConfigs:[]};
  for(const f of xml){const source=relative(base,f),content=fs.readFileSync(f,"utf8");operations.push(...extract(content,source));const s=extractSemantics(content);semantics.flows.push(...s.flows.map(v=>({...v,source})));semantics.flowRefs.push(...s.flowRefs.map(name=>({name,source})));semantics.transformCount+=s.transformCount;semantics.errorHandlers.push(...s.errorHandlers.map(v=>({...v,source})));semantics.configRefs.push(...s.configRefs.map(name=>({name,source})));semantics.globalConfigs.push(...s.globalConfigs.map(v=>({...v,source})));}
  const uniqueOps=[...new Map(operations.map(o=>[JSON.stringify([o.name,o.path,o.connector,o.action]),o])).values()];
  const configs=files.filter(f=>/application.*\.(yaml|yml|properties)$/.test(f)).map(f=>relative(base,f));
  const dependencyEvidence = [];
  for (const pomFile of files.filter(f => path.basename(f) === "pom.xml")) {
    const pom = fs.readFileSync(pomFile, "utf8");
    for (const m of pom.matchAll(/<dependency>\s*[\s\S]*?<groupId>([^<]+)<\/groupId>[\s\S]*?<artifactId>([^<]+)<\/artifactId>(?:[\s\S]*?<version>([^<]+)<\/version>)?[\s\S]*?<\/dependency>/g)) {
      dependencyEvidence.push({ groupId: m[1].trim(), artifactId: m[2].trim(), version: m[3] ? m[3].trim() : null, source: relative(base, pomFile), state: "confirmed" });
    }
  }
  const exchangeDependencies = [];
  for (const exchangeFile of files.filter(f => path.basename(f) === "exchange.json")) {
    try {
      const exchange = JSON.parse(fs.readFileSync(exchangeFile, "utf8"));
      const deps = exchange.dependencies || exchange.projectDependencies || [];
      for (const dep of Array.isArray(deps) ? deps : Object.values(deps || {})) {
        exchangeDependencies.push({ dependency: dep, source: relative(base, exchangeFile), state: "confirmed" });
      }
    } catch (_) {}
  }
  const sourceAssets=files.filter(f=>/\.(dwl|xml|raml|yaml|yml|properties)$/i.test(f)).map(f=>relative(base,f));
  const assetInventory = {
    muleXml: xml.map(f=>relative(base,f)),
    raml: raml.map(f=>relative(base,f)),
    dataWeave: dw.map(f=>relative(base,f)),
    munit: munit.map(f=>relative(base,f)),
    configuration: configs,
    source: sourceAssets
  };
  const operationEvidence = uniqueOps.map(op => ({
    operation: [op.method, op.path].filter(Boolean).join(" "),
    connector: op.connector || null,
    action: op.action || null,
    source: op.source || null,
    state: "confirmed"
  }));
  const workload=classifyWorkload({model:{operations:uniqueOps,connectors:uniqueOps.map(o=>o.connector),api:{specification:raml.length?"RAML":""}},imported:{semantics}});
  const architecture=inferApiLedArchitecture({
    text: raml.map(f=>fs.readFileSync(f,"utf8")).join("\n"),
    operations: uniqueOps,
    existingArtifacts: sourceAssets
  });
  return {version:"1.6",architecture,workload,project:{name:path.basename(base),artifactId:path.basename(base),version:"1.0.0"},api:{name:path.basename(base),version:"v1",basePath:"/api/v1"},operations:uniqueOps,operationEvidence,assetInventory,inventory:{files:files.length,muleXml:xml.length,raml:raml.length,dataWeave:dw.length,munit:munit.length,pom:Boolean(pom),environmentConfigs:configs,semantic:{flowCount:semantics.flows.length,flowReferenceCount:semantics.flowRefs.length,transformCount:semantics.transformCount,errorHandlerCount:semantics.errorHandlers.length,configReferenceCount:semantics.configRefs.length,globalConfigCount:semantics.globalConfigs.length}},semantics,dependencyEvidence,exchangeDependencies,import:{reviewRequired:true,preserveSource:true},migration:{reviewRequired:true,preserveSource:true,unmappedAssets:sourceAssets},ramlSources:raml.map(f=>relative(base,f)),dataWeaveSources:dw.map(f=>relative(base,f))};
}
function writeImportedModel(root="."){const model=importProject(root),target=path.join(path.resolve(root),"muleforge-import.yaml");fs.writeFileSync(target,YAML.stringify(model),"utf8");return {target,model};}
module.exports={importProject,writeImportedModel,extractSemantics};