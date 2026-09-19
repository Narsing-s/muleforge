const fs=require("node:fs"),path=require("node:path"),{generateDataWeaveFiles}=require("./dataweave-generator");
const cases=[
  ["rest-http",{operations:[{name:"getCustomer",method:"GET",path:"/customers/{id}",connector:"http",responseFields:["id","status"]}]}],
  ["database",{connectors:["database"],operations:[{name:"create",method:"POST",path:"/customers",connector:"database"}]}],
  ["messaging",{connectors:["ibm-mq","kafka"],events:[{name:"orders",type:"kafka",topic:"orders"}]}],
  ["policies",{operations:[{name:"submit",method:"POST",path:"/submit",retry:{maxRetries:3},pagination:{defaultPageSize:20},idempotency:true,transaction:true}]}]
];
function runGolden(){
  return cases.map(([name,model])=>{
    const dw=generateDataWeaveFiles(model);
    const artifacts=Array.isArray(dw) ? dw : [];
    return {name,pass:Array.isArray(dw)&&artifacts.length===(model.operations||[]).length,artifacts:artifacts.map(x=>x.name)};
  });
}
function writeGoldenReport(root="."){
  const report=runGolden(),out=path.join(path.resolve(root),"golden-regression.json");
  fs.writeFileSync(out,JSON.stringify({version:"1.0",results:report,passed:report.every(x=>x.pass)},null,2)+"\n");
  return {out,passed:report.every(x=>x.pass),results:report};
}
module.exports={runGolden,writeGoldenReport};
