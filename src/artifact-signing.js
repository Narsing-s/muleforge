const crypto=require("node:crypto"),fs=require("node:fs"),path=require("node:path");
function manifestBytes(root){
  const p=path.join(path.resolve(root),"artifact-manifest.json");
  if(!fs.existsSync(p))throw new Error("Run artifact-manifest first.");
  return {p,data:fs.readFileSync(p)};
}
function keyPair(){return crypto.generateKeyPairSync("ed25519");}
function signManifest(root,privateKeyFile){
  const {p,data}=manifestBytes(root);
  const keyFile=privateKeyFile||process.env.MULEFORGE_SIGNING_PRIVATE_KEY;
  if(!keyFile)throw new Error("Ed25519 private key is required.");
  const key=fs.readFileSync(path.resolve(keyFile));
  const signature=crypto.sign(null,data,key).toString("base64");
  const out=path.join(path.dirname(p),"artifact-manifest.sig.json");
  fs.writeFileSync(out,JSON.stringify({version:"1.0",algorithm:"Ed25519",manifest:"artifact-manifest.json",signature},null,2)+"\n");
  return out;
}
function verifyManifest(root,publicKeyFile){
  const {p,data}=manifestBytes(root);
  const sigPath=path.join(path.dirname(p),"artifact-manifest.sig.json");
  if(!fs.existsSync(sigPath))return {verified:false,reason:"Signature file not found."};
  let sig;
  try{sig=JSON.parse(fs.readFileSync(sigPath,"utf8"));}catch(error){return {verified:false,reason:"Invalid signature file JSON: "+error.message};}
  if(sig.algorithm!=="Ed25519")return {verified:false,reason:"Unsupported signature algorithm: "+sig.algorithm};
  if(typeof sig.signature!=="string"||!sig.signature)return {verified:false,reason:"Signature value is missing."};
  const keyFile=publicKeyFile||process.env.MULEFORGE_SIGNING_PUBLIC_KEY;
  if(!keyFile)throw new Error("Ed25519 public key is required.");
  const key=fs.readFileSync(path.resolve(keyFile));
  let verified=false;
  try{verified=crypto.verify(null,data,key,Buffer.from(sig.signature,"base64"));}catch(error){return {verified:false,algorithm:"Ed25519",manifest:path.basename(p),reason:"Signature verification error: "+error.message};}
  return {verified,algorithm:"Ed25519",manifest:path.basename(p)};
}
function generateSigningKeys(directory="."){
  const dir=path.resolve(directory);fs.mkdirSync(dir,{recursive:true});
  const {publicKey,privateKey}=keyPair();
  const priv=path.join(dir,"muleforge-ed25519-private.pem"),pub=path.join(dir,"muleforge-ed25519-public.pem");
  fs.writeFileSync(priv,privateKey.export({type:"pkcs8",format:"pem"}),{mode:0o600});
  fs.writeFileSync(pub,publicKey.export({type:"spki",format:"pem"}));
  return {privateKey:priv,publicKey:pub};
}
module.exports={signManifest,verifyManifest,generateSigningKeys};