const crypto=require("node:crypto"),fs=require("node:fs"),path=require("node:path");
const EXCLUDED_FILES=new Set(["artifact-manifest.json","artifact-manifest.sig.json","muleforge-ed25519-private.pem","muleforge-ed25519-public.pem"]);
function artifactManifest(root="."){
  const base=path.resolve(root),files=[];
  function walk(d){
    if(!fs.existsSync(d))return;
    for(const e of fs.readdirSync(d,{withFileTypes:true})){
      if([".git","node_modules","target"].includes(e.name))continue;
      const p=path.join(d,e.name);
      if(e.isDirectory())walk(p);
      else{
        const relativePath=path.relative(base,p).replace(/\\/g,"/");
        if(EXCLUDED_FILES.has(relativePath)||EXCLUDED_FILES.has(e.name))continue;
        const h=crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
        files.push({path:relativePath,sha256:h});
      }
    }
  }
  walk(base);
  files.sort((a,b)=>a.path.localeCompare(b.path));
  return {version:"1.1",algorithm:"sha256",files};
}
function writeManifest(root="."){
  const out=path.join(path.resolve(root),"artifact-manifest.json");
  fs.writeFileSync(out,JSON.stringify(artifactManifest(root),null,2)+"\n","utf8");
  return out;
}
module.exports={artifactManifest,writeManifest};