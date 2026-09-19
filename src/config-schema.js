const YAML=require("yaml");
const SECRET=/password|secret|token|api[_-]?key|client[_-]?secret/i;
function normalizeEntry(key,value){return {key,type:value===null?"string":Array.isArray(value)?"array":typeof value,required:!(value===undefined||value===null),secret:SECRET.test(key),default:value===null?undefined:value,allowedValues:undefined};}
function validateConfigValues(config={}){const errors=[];const vars=config.properties||config.configuration||{};for(const [k,v] of Object.entries(vars)){if(v&&typeof v==="object"&&!Array.isArray(v)&&("type" in v||"required" in v)){if(v.required&&!Object.prototype.hasOwnProperty.call(v,"default")&&!v.value)errors.push(`Missing required configuration: ${k}`);if(v.allowedValues&&v.default!==undefined&&!v.allowedValues.includes(v.default))errors.push(`Invalid default for ${k}`);}}return {valid:errors.length===0,errors};}
function parseConfig(text){return YAML.parse(text)||{};}
module.exports={normalizeEntry,validateConfigValues,parseConfig};