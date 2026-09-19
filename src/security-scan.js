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
  const pkg=fs.existsSync(path.join(root,"package.json"))?JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8")):{};
  return {npm:Object.keys({...pkg.dependencies,...pkg.devDependencies})};
}
function sbom(root="."){
  const pkg=fs.existsSync(path.join(root,"package.json"))?JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8")):{};
  return {bomFormat:"CycloneDX",specVersion:"1.5",components:Object.entries({...pkg.dependencies,...pkg.devDependencies}).map(([name,version])=>({type:"library",name,version}))};
}
module.exports={scanSecrets:walk,scanDependencies,sbom};
