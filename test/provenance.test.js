const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {artifactManifest,writeManifest}=require("../src/provenance");

test("artifact manifest is deterministic and excludes generated manifest/signing files",()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"muleforge-provenance-"));
  try{
    fs.writeFileSync(path.join(root,"b.txt"),"beta\n");
    fs.mkdirSync(path.join(root,"nested"));
    fs.writeFileSync(path.join(root,"nested","a.txt"),"alpha\n");
    fs.writeFileSync(path.join(root,"artifact-manifest.sig.json"),"signature");
    fs.writeFileSync(path.join(root,"muleforge-ed25519-private.pem"),"private");
    fs.writeFileSync(path.join(root,"muleforge-ed25519-public.pem"),"public");
    const first=writeManifest(root);
    const firstManifest=JSON.parse(fs.readFileSync(first,"utf8"));
    assert.deepEqual(firstManifest.files.map(x=>x.path),["b.txt","nested/a.txt"]);
    const second=writeManifest(root);
    const secondManifest=JSON.parse(fs.readFileSync(second,"utf8"));
    assert.deepEqual(secondManifest,firstManifest);
    assert.equal(secondManifest.version,"1.1");
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
