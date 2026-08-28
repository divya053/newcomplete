const BASE="http://localhost:3100"; let cookie="";
async function call(p,o={}){const r=await fetch(BASE+p,{...o,headers:{"content-type":"application/json",origin:BASE,cookie,...(o.headers||{})}});
const sc=r.headers.getSetCookie?.()??[];if(sc.length)cookie=sc.map(c=>c.split(";")[0]).join("; ");
const t=await r.text();let b;try{b=JSON.parse(t)}catch{b=t}return{status:r.status,body:b}}
await call("/api/auth/sign-in/email",{method:"POST",body:JSON.stringify({email:"owner@aigcc.group",password:"preckon-tenant-2026"})});
const ps=(await call("/api/v1/projects")).body; const p=ps.find(x=>x.code==="MBT-2026")??ps[0];
const convos=(await call(`/api/v1/projects/${p.id}/conversations`)).body ?? [];
const cid=(convos.find(c=>c.title==="Copilot")??convos[0])?.id;
for (const q of ["What is this project? One sentence.","List every risk on this project and explain each one in detail."]) {
  const r=await call(`/api/v1/projects/${p.id}/conversations/${cid}/messages`,{method:"POST",body:JSON.stringify({content:q})});
  console.log("posted", r.status, "-", q.slice(0,40));
  await new Promise(s=>setTimeout(s,25000));
}
