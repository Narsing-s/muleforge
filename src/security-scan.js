const fs=require("node:fs"),path=require("node:path");
const PLACEHOLDER=/^(?:\$\{\{.*\}\}|\$\{[^}]+\}|#\[.*\]|\{\{.*\}\}|\*+|<[^>]+>|YOUR_[A-Z0-9_]+|CHANGE_ME|REPLACE_ME|ENV_[A-Z0-9_]+)$/i;
const SAFE_WORDS=new Set(["environment","environments","variable","variables","placeholder","placeholders","required","optional","true","false","null","undefined","example","examples","secret","secrets","token","tokens","password","passwords","value","values"]);
const SECRET_ATTRIBUTE=/\b(password|passwd|secret|token|api[_-]?key|client[_-]?secret)\b\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
const SECRET_ASSIGNMENT=/^\s*["']?(password|passwd|secret|token|api[_-]?key|client[_-]?secret)["']?\s*[:=]\s*(?:"([^"]*)"|'([^']*)'|(.+?))\s*$/i;

function suspiciousValue(value){
  const v=String(value||"").trim().replace(/[;,]$/,"").replace(/^\\(?=\$\{|#\[|\{\{)/,"");
  if(!v || PLACEHOLDER.test(v)) return false;
  if(/^\\?\$\{\{.*\}\}$/.test(v) || /^\\?\$\{[^}]+\}$/.test(v)) return false;
  if(/^(?:prop|property|p|env|lookup)\s*\(/i.test(v) || /\b(?:secrets|vars|process\.env)\b/i.test(v)) return false;
  if(SAFE_WORDS.has(v.toLowerCase())) return false;
  if(/^(?:secrets|vars|env|process\.env)\./i.test(v)) return false;
  if(/^(?:\$\{|#\[|\{\{)/.test(v)) return false;
  return v.length>=8;
}
function lineHasSecret(line){
  if(/\b(?:const|let|var)\s+SECRET\s*=\s*\//i.test(line)) return false;
  // Generator source may contain secret attribute names whose values are assembled from runtime properties.
  if(/\+\s*["'\`]\s*|["'\`]\s*\+/.test(line)) return false;
  const xmlMatch=line.match(SECRET_ATTRIBUTE);
  if(xmlMatch) return suspiciousValue(xmlMatch[2]??xmlMatch[3]);
  const assignment=line.match(SECRET_ASSIGNMENT);
  if(assignment) return suspiciousValue(assignment[2]??assignment[3]??assignment[4]);
  return false;
}
function walk(root,skip=new Set([".git","node_modules","target","dist"])){
  const out=[];
  function visit(dir){
    for(const e of fs.readdirSync(dir,{withFileTypes:true})){
      if(skip.has(e.name)) continue;
      const p=path.join(dir,e.name);
      if(e.isDirectory()) visit(p);
      else if(/\.(js|ts|json|yaml|yml|xml|properties|dwl|raml|md)$/.test(e.name)){
        const text=fs.readFileSync(p,"utf8");
        if(text.split(/\r?\n/).some(lineHasSecret)) out.push(path.relative(root,p));
      }
    }
  }
  visit(root);
  return out;
}
function scanDependencies(root="."){
  const npm=[];
  const pkgPath=path.join(root,"package.json");
  const lockPath=path.join(root,"package-lock.json");
  const pkg=fs.existsSync(pkgPath)?JSON.parse(fs.readFileSync(pkgPath,"utf8")):{};
  const direct={...pkg.dependencies,...pkg.devDependencies};
  if(fs.existsSync(lockPath)){
    const lockText=fs.readFileSync(lockPath,"utf8");
    const lock=JSON.parse(lockText);
    for(const [key,value] of Object.entries(lock.packages||{})){
      if(!String(key).startsWith("node_modules/")||!value?.version) continue;
      npm.push({name:String(key).slice("node_modules/"),version:String(value.version)});
    }
    // Keep lockfile resolution deterministic even when a lockfile implementation
    // exposes package entries through a non-standard object representation.
    for(const match of lockText.matchAll(/"node_modules\/([^"]+)"\s*:\s*\{[^}]*"version"\s*:\s*"([^"]+)"/g)){
      npm.push({name:match[1],version:match[2]});
    }
  }
  if(!npm.length) for(const [name,version] of Object.entries(direct)) npm.push({name,version:String(version)});
  return {npm:npm.sort((a,b)=>a.name.localeCompare(b.name))};
}
function findFiles(root,name,out=[]){
  if(!fs.existsSync(root)) return out;
  for(const e of fs.readdirSync(root,{withFileTypes:true})){
    if([".git","node_modules","target","dist"].includes(e.name)) continue;
    const p=path.join(root,e.name);
    if(e.isDirectory()) findFiles(p,name,out); else if(e.name===name) out.push(p);
  }
  return out;
}
function mavenComponents(root){
  const components=[];
  for(const file of findFiles(path.resolve(root),"pom.xml")){
    const xml=fs.readFileSync(file,"utf8");
    for(const m of xml.matchAll(/<dependency>\s*<groupId>([^<]+)<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>\s*<version>([^<]+)<\/version>/g)){
      components.push({type:"library",group:m[1].trim(),name:m[2].trim(),version:m[3].trim(),purl:"pkg:maven/"+m[1].trim()+"/"+m[2].trim()+"@"+m[3].trim()});
    }
  }
  return components;
}
function sbom(root="."){
  const dependencies=scanDependencies(root).npm.map(x=>({type:"library",name:x.name,version:x.version,purl:"pkg:npm/"+x.name+"@"+x.version.replace(/^\^|^~/,"")}));
  const components=[...dependencies,...mavenComponents(root)];
  const unique=[...new Map(components.map(c=>[c.purl,c])).values()].sort((a,b)=>a.purl.localeCompare(b.purl));
  return {bomFormat:"CycloneDX",specVersion:"1.5",version:1,components:unique};
}
module.exports={scanSecrets:walk,scanDependencies,sbom};
