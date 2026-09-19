const path=require("node:path"),{spawn}=require("node:child_process"),http=require("node:http");
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const request=url=>new Promise((resolve,reject)=>{const req=http.get(url,res=>{let body="";res.setEncoding("utf8");res.on("data",c=>body+=c);res.on("end",()=>resolve({status:res.statusCode,body}));});req.on("error",reject);req.setTimeout(5000,()=>req.destroy(new Error("timeout")));});
async function runtimeTest(directory=".",options={}){
 const root=path.resolve(directory),result={directory:root,build:false,started:false,ready:false,request:null};
 const mvn=process.platform==="win32"?"mvn.cmd":"mvn";
 const run=args=>new Promise((resolve,reject)=>{const p=spawn(mvn,args,{cwd:root,stdio:"inherit"});p.on("error",reject);p.on("exit",c=>resolve(c??1));});
 result.build=(await run(["-q","test"]))===0;
 if(!result.build||!options.start)return result;
 const child=spawn(mvn,["-q","mule:run"],{cwd:root,stdio:"inherit"}); result.started=true;
 const url=options.url||"http://127.0.0.1:8081/health",deadline=Date.now()+Number(options.timeout||60000);
 while(Date.now()<deadline){try{result.request=await request(url);result.ready=result.request.status>=200&&result.request.status<500;break;}catch{await wait(1000);}}
 try{child.kill("SIGTERM");}catch{} return result;
}
module.exports={runtimeTest};