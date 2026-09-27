const $=s=>document.querySelector(s);
const templates={
 birthday:"Every morning at 9 AM, read customers from Snowflake, find customers whose birthday is today, send a birthday email, record the notification status, retry failed emails twice, and alert the operations team if a notification still fails.",
 sftp:"Every 15 minutes, poll an SFTP folder for new customer files, validate the CSV structure, transform the records, send valid records to the customer API, move successful files to archive, and move failed files to an error folder with an alert.",
 api:"Create a customer REST API. Accept name, email and mobile number, validate the request, check whether the customer already exists, store new customers, return customerId and status, return 409 for duplicates, and return a structured error response for validation or server failures."
};
let current=null;
document.querySelectorAll("[data-template]").forEach(b=>b.addEventListener("click",()=>{$("#requirement").value=templates[b.dataset.template];generate()}));
$("#sampleBtn").onclick=()=>{$("#requirement").value=templates.birthday;generate()};
$("#generateBtn").onclick=generate;$("#validateBtn").onclick=validate;$("#exportBtn").onclick=exportJson;
$("#copyBtn").onclick=()=>{if(!current)return;navigator.clipboard?.writeText(JSON.stringify(current,null,2));$("#status").textContent="Copied"};

function classify(t){const x=t.toLowerCase();if(/sftp|file|csv|ftp/.test(x))return"File automation";if(/rest|api|endpoint|http/.test(x))return"API workflow";return"Scheduled automation"}
function has(x,arr){return arr.some(k=>x.includes(k))}
function build(t){
 const x=t.toLowerCase(),steps=[];const add=(title,detail,kind)=>steps.push({title,detail,kind});
 if(/every|schedule|morning|hour|minute|daily|weekly|cron/.test(x))add("Trigger","Scheduled execution","Scheduler");else if(/api|rest|http|endpoint/.test(x))add("Trigger","HTTP request","HTTP");else add("Trigger","Event or manual execution","Trigger");
 if(/snowflake|database|sql|customer data|read customers|poll|source/.test(x))add("Read source","Retrieve source records","Source");else if(/sftp|file|csv/.test(x))add("Read source","Poll input files","SFTP");
 if(/validate|validation|schema|structure|required fields/.test(x))add("Validate","Reject malformed or incomplete input","Quality");
 if(/transform|map|convert|format|dataweave/.test(x))add("Transform","Normalize data for the destination","DataWeave");
 if(/check whether|already exists|duplicate|idempot/.test(x))add("Idempotency","Prevent duplicate processing","Reliability");
 if(/send|email|notify|deliver/.test(x))add("Deliver","Send the business outcome","Destination");
 if(/store|database|snowflake|persist|record|save/.test(x))add("Persist","Write processing/audit status","Persistence");
 if(/retry|failure|error|unavailable|dead letter/.test(x))add("Resilience","Retry transient failures and route permanent failures","Reliability");
 if(/alert|notify the operations|ops|monitor/.test(x))add("Observability","Alert after unrecovered failures","Monitoring");
 add("Verify","Run contract, workflow and failure-path checks","Test");add("Deploy","Package with environment-specific configuration","Deployment");return steps
}
async function generate(){
 const t=$("#requirement").value.trim();if(!t){$("#status").textContent="Add a requirement";return}
 $("#status").textContent="Generating…";
 let workflow=null;
 try{
   const r=await fetch("/api/generate",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({requirement:t})});
   if(r.ok){const data=await r.json();workflow=data.workflow;workflow._source="AI Gateway"}
 }catch(_){}
 const steps=workflow?.steps?.length?workflow.steps:build(t);
 current=workflow||{name:"AgentFlow workflow",type:classify(t),sourceRequirement:t,generatedAt:new Date().toISOString(),steps,qualityGates:[]};
 current.qualityGates=current.qualityGates||[];
 $("#empty").classList.add("hidden");$("#result").classList.remove("hidden");$("#planType").textContent=current.type;
 $("#steps").innerHTML=steps.map((s,i)=>'<div class="step"><div class="num">'+String(i+1).padStart(2,"0")+'</div><div><strong>'+esc(s.title)+'</strong><span>'+esc(s.detail)+'</span></div><em>'+esc(s.kind)+'</em></div>').join("");
 validate();$("#status").textContent=current._source||"Local planner"
}
function validate(){
 if(!current)return;const t=current.sourceRequirement.toLowerCase();
 const gates=[
  ["Trigger defined",has(t,["every","daily","weekly","hour","minute","api","http","event","schedule","cron"])],
  ["Source or input defined",has(t,["snowflake","database","sql","customer","sftp","file","api","request","source"])],
  ["Business outcome defined",has(t,["send","store","return","deliver","record","notify","process","save"])],
  ["Failure handling",has(t,["retry","failure","error","unavailable","alert","dead letter"])],
  ["Validation",has(t,["validate","validation","schema","required"])],
  ["Test path",true]
 ];
 current.qualityGates=gates.map(g=>({name:g[0],pass:g[1]}));const passed=gates.filter(g=>g[1]).length;const score=Math.round(passed/gates.length*100);
 $("#score").textContent=score+"%";$("#gates").innerHTML=gates.map(g=>'<div class="gate"><span>'+g[0]+'</span><strong class="'+(g[1]?"pass":"warn")+'">'+(g[1]?"PASS":"REVIEW")+'</strong></div>').join("");
 $("#status").textContent=score===100?"Validated":"Review"
}
function exportJson(){
 if(!current)return;const blob=new Blob([JSON.stringify(current,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="agentflow-workflow.json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),0)
}
function esc(s){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}