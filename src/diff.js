const fs=require("fs");
const path=require("path");
function snapshot(root="."){const base=path.resolve(root);const walk=(d,a=[])=>{if(!fs.existsSync(d))return a;for(const e of fs.readdirSync(d,{withFileTypes:true})){if([".git","target","node_modules"].includes(e.name))continue;const f=path.join(d,e.name);e.isDirectory()?walk(f,a):a.push(path.relative(base,f).replace(/\\\\/g,"/"));}return a};return walk(base).sort();}
function diffSnapshots(before=[],after=[]){const b=new Set(before),a=new Set(after);return {added:after.filter(x=>!b.has(x)),removed:before.filter(x=>!a.has(x)),unchanged:after.filter(x=>b.has(x))};}
module.exports={snapshot,diffSnapshots};
