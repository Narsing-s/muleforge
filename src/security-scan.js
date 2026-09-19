const fs=require("node:fs"),path=require("node:path");
const SECRET_KEY=/\b(password|passwd|secret|token|api[_-]?key|client[_-]?secret)\b/i;
const PLACEHOLDER=/^(?:\$\{\{.*\}\}|\$\{[^}]+\}|#\[.*\]|\{\{.*\}\}|\*+|<[^>]+>|YOUR_[A-Z0-9_]+|CHANGE_ME|REPLACE_ME|ENV_[A-Z0-9_]+)$/i;
const SAFE_WORDS=new Set(["environment","environments","variable","variables","placeholder","placeholders","required","optional","true","false","null","undefined","example","examples","secret","secrets","token","tokens","password","passwords","value","values"]);
function suspiciousValue(value){
  const v=String(value||"").trim().replace(/[;,]$/,"");
  if(!v || PLACEHOLDER.test(v)) return false;
  if(SAFE_WORDS.has(v.toLowerCase())) return false;
  if(/^(?:secrets|vars|env|process\.env)\./i.test(v)) return false;
  if(/^(?:\$\{|#\[|\{\{)/.test(v)) return false;
  return v.length>=8;
}
function lineHasSecret(line){
  if(/\b(?:const|let|var)\s+SECRET\s*=\s*\//i.test(line)) return false;
  const match=line.match(/\b(password|passwd|secret|token|api[_-]?key|client[_-]?secret)\b\s*[:=]\s*(?:"([^"]*)"|'([^']*)'|([^\s,;]+))/i);
  if(!match) return false;
  return suspiciousValue(match[2]??match[3]??match[4]);
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
  const pkg=fs.existsSync(path.join(root,"package.json"))?JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8")):{};
  return {npm:Object.keys({...pkg.dependencies,...pkg.devDependencies})};
}
function sbom(root="."){
  const pkg=fs.existsSync(path.join(root,"package.json"))?JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8")):{};
  return {bomFormat:"CycloneDX",specVersion:"1.5",components:Object.entries({...pkg.dependencies,...pkg.devDependencies}).map(([name,version])=>({type:"library",name,version}))};
}
module.exports={scanSecrets:walk,scanDependencies,sbom};
