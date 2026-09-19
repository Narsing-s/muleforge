const path=require("node:path"),{spawn}=require("node:child_process"),http=require("node:http");
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const request=(url,timeout=5000)=>new Promise((resolve,reject)=>{
 const req=http.get(url,res=>{let body="";res.setEncoding("utf8");res.on("data",c=>body+=c);res.on("end",()=>resolve({status:res.statusCode,body,headers:res.headers}));});
 req.on("error",reject);req.setTimeout(timeout,()=>req.destroy(new Error("timeout")));
});
async function runtimeTest(directory=".",options={}){
 const root=path.resolve(directory),expected=Number(options.expectedStatus||200),result={directory:root,build:false,started:false,ready:false,request:null,error:null};
 const mvn=process.platform==="win32"?"mvn.cmd":"mvn";
 const run=args=>new Promise((resolve,reject)=>{const p=spawn(mvn,args,{cwd:root,stdio:"inherit"});p.on("error",reject);p.on("exit",c=>resolve(c??1));});
 try {
  result.build=(await run(["-q","test"]))===0;
  if(!result.build||!options.start)return result;
  const child=spawn(mvn,["-q","mule:run"],{cwd:root,stdio:"inherit"}); result.started=true;
  const url=options.url||"http://127.0.0.1:8081/health",deadline=Date.now()+Number(options.timeout||60000);
  while(Date.now()<deadline){
   try {
    result.request=await request(url,Number(options.requestTimeout||5000));
    result.ready=result.request.status===expected;
    if(!result.ready) result.error=`Readiness endpoint returned HTTP ${result.request.status}; expected ${expected}`;
    break;
   } catch (error) {
    result.error=error.message;
    await wait(1000);
   }
  }
  if(!result.ready && Date.now()>=deadline && !result.error) result.error=`Timed out waiting for ${url}`;
  try{child.kill("SIGTERM");}catch{}
  return result;
 } catch(error) {
  result.error=error.message;
  return result;
 }
}
module.exports={runtimeTest};