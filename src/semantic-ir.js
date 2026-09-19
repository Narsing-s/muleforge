const CONNECTOR_SET = new Set(["http","database","snowflake","sftp","ibm-mq","anypoint-mq","object-store","file","email","jms","kafka","salesforce"]);
function normalizeField(f){ if(typeof f==="string") return {name:f,type:"string",required:false}; return {name:String(f?.name||f?.field||"field"),type:String(f?.type||"string").toLowerCase(),required:Boolean(f?.required),description:f?.description,enum:Array.isArray(f?.enum)?f.enum.map(String):undefined}; }
function buildIntegrationIR(config={}) {
 return { version:"1.0", project:config.project||{}, api:config.api||{}, operations:(config.operations||[]).map((op,i)=>({id:op.name||`operation-${i+1}`,method:String(op.method||"GET").toUpperCase(),path:op.path||"/",connector:String(op.connector||"http").toLowerCase(),requestFields:(op.requestFields||op.fields||[]).map(normalizeField),responseFields:(op.responseFields||[]).map(normalizeField),validation:op.validation||[],errors:op.errors||[],security:op.security||null,policies:{retry:op.retry||null,pagination:op.pagination||null,idempotency:op.idempotency||false,transaction:op.transaction||false}})),connectors:[...(config.connectors||[])].map(c=>String(c).toLowerCase()).filter(c=>CONNECTOR_SET.has(c)),events:config.events||[],dependencies:config.dependencies||{},nfr:config.nfr||config.nonFunctionalRequirements||{}};
}
function validateIntegrationIR(ir){
 const errors=[];
 for(const op of ir.operations){ if(!/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(op.method)) errors.push(`Unsupported method: ${op.method}`); if(!op.path.startsWith("/")) errors.push(`Invalid path: ${op.path}`); if(!CONNECTOR_SET.has(op.connector)) errors.push(`Unsupported connector: ${op.connector}`); }
 return {valid:errors.length===0,errors};
}
module.exports={buildIntegrationIR,validateIntegrationIR,normalizeField};