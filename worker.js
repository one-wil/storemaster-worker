/**
 * STOREMASTER V4.4 — Automated Store Provisioning
 *
 * V4.4 adds:
 * - automatic license creation during /create-store
 * - automatic STORE_ID + STORE_TOKEN injection
 * - safe marker-based configuration
 *
 * REQUIRED TEMPLATE MARKERS:
 *   __STOREMASTER_STORE_ID__
 *   __STOREMASTER_TOKEN__
 *
 * Example in config.js:
 *   const STOREMASTER_LICENSE = {
 *     storeId: "__STOREMASTER_STORE_ID__",
 *     token: "__STOREMASTER_TOKEN__"
 *   };
 */

const REQUIRED_PATHS = [
  { key:"index", path:"index.html", type:"file" },
  { key:"adm", path:"adm.html", type:"file" },
  { key:"configjs", path:"config.js", type:"file" },
  { key:"configjson", path:"config/store-config.json", type:"file" },
  { key:"images", path:"images", type:"dir" }
];

const MARKERS = {
  storeId:"__STOREMASTER_STORE_ID__",
  token:"__STOREMASTER_TOKEN__"
};

export default {
  async fetch(request, env) {
    const cors={
      "Access-Control-Allow-Origin":"*",
      "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
      "Access-Control-Allow-Headers":"Content-Type,X-Master-Key"
    };
    if(request.method==="OPTIONS") return new Response(null,{headers:cors});
    try{
      const url=new URL(request.url);
      if(url.pathname==="/"||url.pathname==="/health")
        return json({ok:true,service:"StoreMaster V4.4",version:"4.4"},200,cors);

      if(!authorized(request,env))
        return json({ok:false,error:"Unauthorized"},401,cors);

      if(url.pathname==="/create-store"&&request.method==="POST")
        return json(await createStore(await request.json(),env),201,cors);

      if(url.pathname==="/verify-store"&&request.method==="POST"){
        const data=await request.json();
        return json({ok:true,verification:await verifyStore(data.repository,env)},200,cors);
      }

      if(url.pathname==="/public-license-check"&&request.method==="POST")
        return json(await publicLicenseCheck(await request.json(),env),200,cors);

      return json({ok:false,error:"Route not found"},404,cors);
    }catch(e){
      return json({ok:false,error:e.message||"Internal error"},500,cors);
    }
  }
};

function authorized(req,env){
  return !!env.MASTER_API_KEY &&
    req.headers.get("X-Master-Key")===env.MASTER_API_KEY;
}
function enc(v){return encodeURIComponent(v)}
function encodePath(p){return String(p).split("/").map(enc).join("/")}
function repoName(v){
  const n=String(v||"").trim().toLowerCase()
    .replace(/[^a-z0-9._-]/g,"-").replace(/-+/g,"-")
    .replace(/^-|-$/g,"");
  if(!n)throw new Error("Nom de repository invalide.");
  return n;
}
function ghHeaders(env){
  return {
    Authorization:`Bearer ${env.GITHUB_TOKEN}`,
    Accept:"application/vnd.github+json",
    "Content-Type":"application/json",
    "X-GitHub-Api-Version":"2022-11-28"
  };
}
async function gh(path,options={},env){
  const r=await fetch("https://api.github.com"+path,{
    ...options,headers:{...ghHeaders(env),...(options.headers||{})}
  });
  const text=await r.text(); let body={};
  try{body=text?JSON.parse(text):{}}catch{body={message:text}}
  if(!r.ok){const e=new Error(body.message||`GitHub error ${r.status}`);e.status=r.status;throw e}
  return body;
}
async function getRepo(repo,env){
  return gh(`/repos/${enc(env.GITHUB_OWNER)}/${enc(repo)}`,{method:"GET"},env);
}
async function exists(repo,env){
  try{await getRepo(repo,env);return true}
  catch(e){if(e.status===404)return false;throw e}
}
async function createRepo(repo,name,env){
  const body={name:repo,description:`StoreMaster — ${name}`,private:true,auto_init:false};
  try{
    return await gh(`/orgs/${enc(env.GITHUB_OWNER)}/repos`,{method:"POST",body:JSON.stringify(body)},env);
  }catch(e){
    if(e.status!==404&&e.status!==422)throw e;
    return gh("/user/repos",{method:"POST",body:JSON.stringify(body)},env);
  }
}
async function filesOf(repo,env){
  const r=await getRepo(repo,env);
  const tree=await gh(`/repos/${enc(env.GITHUB_OWNER)}/${enc(repo)}/git/trees/${enc(r.default_branch)}?recursive=1`,{method:"GET"},env);
  return (tree.tree||[]).filter(x=>x.type==="blob").map(x=>x.path);
}
async function readFile(repo,path,env){
  return gh(`/repos/${enc(env.GITHUB_OWNER)}/${enc(repo)}/contents/${encodePath(path)}`,{method:"GET"},env);
}
async function putFile(repo,path,content,message,env){
  return gh(`/repos/${enc(env.GITHUB_OWNER)}/${enc(repo)}/contents/${encodePath(path)}`,{
    method:"PUT",
    body:JSON.stringify({message,content:btoa(unescape(encodeURIComponent(content)))})
  },env);
}
function decodeBase64Utf8(s){
  return decodeURIComponent(escape(atob(s.replace(/\n/g,""))));
}
async function copyTemplate(source, target, storeId, token, env) {

  const files = await filesOf(source, env);

  let injected = 0;

  for (const path of files) {

    const f = await readFile(source, path, env);

    const isTextFile =
      /\.(html|js|json|css|txt)$/i.test(path);

    // =====================================================
    // 📄 FICHIERS TEXTE
    // =====================================================

    if (isTextFile) {

      let content =
        decodeBase64Utf8(f.content || "");

      let changed = false;

      // STORE ID

      if (content.includes(MARKERS.storeId)) {

        content =
          content
            .split(MARKERS.storeId)
            .join(storeId);

        changed = true;
      }


      // TOKEN

      if (content.includes(MARKERS.token)) {

        content =
          content
            .split(MARKERS.token)
            .join(token);

        changed = true;
      }


      if (changed) {

        injected++;

      }


      await putFile(

        target,

        path,

        content,

        `StoreMaster V4.4: copie ${path}`,

        env

      );


    }


    // =====================================================
    // 🖼️ FICHIERS BINAIRES
    // Images JPG PNG WEBP etc.
    // =====================================================

    else {

      await gh(

        `/repos/${enc(env.GITHUB_OWNER)}/${enc(target)}/contents/${encodePath(path)}`,

        {

          method: "PUT",

          body: JSON.stringify({

            message:
              `StoreMaster V4.4: copie ${path}`,

            content:
              f.content

          })

        },

        env

      );

    }

  }


  return {

    count: files.length,

    injected

  };

}
  const files=await filesOf(source,env);
  let injected=0;
  for(const path of files){
    const f=await readFile(source,path,env);
    let content=decodeBase64Utf8(f.content||"");
    let changed=false;

    // Only text files are safely inspected/replaced.
    if(/\.(html|js|json|css|txt)$/i.test(path)){
      if(content.includes(MARKERS.storeId)){
        content=content.split(MARKERS.storeId).join(storeId);changed=true;
      }
      if(content.includes(MARKERS.token)){
        content=content.split(MARKERS.token).join(token);changed=true;
      }
      if(changed)injected++;
      await putFile(target,path,content,`StoreMaster V4.4: copie ${path}`,env);
    }else{
      // Preserve binary files exactly using GitHub's original base64.
      await gh(`/repos/${enc(env.GITHUB_OWNER)}/${enc(target)}/contents/${encodePath(path)}`,{
        method:"PUT",
        body:JSON.stringify({message:`StoreMaster V4.4: copie ${path}`,content:f.content})
      },env);
    }
  }
  return {count:files.length,injected};
}
function generateToken(){
  const a=new Uint8Array(24);crypto.getRandomValues(a);
  return Array.from(a,b=>b.toString(16).padStart(2,"0")).join("");
}
async function createLicense(data,env){
  if(!env.LICENSES)throw new Error("Cloudflare KV LICENSES non configuré.");
  const storeId=crypto.randomUUID(),token=generateToken(),now=new Date().toISOString();
  const license={
    storeId,token,storeName:data.storeName,repository:data.repository,
    clientId:data.clientId||"",clientName:data.clientName||"",
    status:"ACTIVE",expiresAt:data.expiresAt||null,
    createdAt:now,updatedAt:now
  };
  await env.LICENSES.put(`license:${storeId}`,JSON.stringify(license));
  return license;
}
async function publicLicenseCheck(data,env){
  try{
    if(!env.LICENSES)throw new Error("LICENSES unavailable.");
    const raw=await env.LICENSES.get(`license:${data.storeId}`);
    if(!raw)throw new Error("Licence introuvable.");
    const l=JSON.parse(raw);
    if(l.token!==data.token)throw new Error("Token invalide.");
    if(l.status!=="ACTIVE")throw new Error("Boutique désactivée.");
    if(l.expiresAt&&new Date(l.expiresAt)<new Date())throw new Error("Licence expirée.");
    return {ok:true,active:true,storeId:l.storeId,expiresAt:l.expiresAt};
  }catch(e){return {ok:false,active:false,error:e.message}}
}
async function verifyStore(repo,env){
  const out=[];
  for(const item of REQUIRED_PATHS){
    try{
      const d=await readFile(repo,item.path,env);
      out.push({key:item.key,path:item.path,exists:item.type==="dir"?Array.isArray(d):d.type==="file"});
    }catch(e){out.push({key:item.key,path:item.path,exists:false})}
  }
  return out;
}
function step(id,label,success,detail=""){
  return {id,label,success,detail,at:new Date().toISOString()};
}
async function createStore(data,env){
  const steps=[];
  try{
    if(!env.GITHUB_TOKEN||!env.GITHUB_OWNER)throw new Error("GitHub configuration missing.");
    if(!data?.storeName||!data?.repository||!data?.templateRepo)
      throw new Error("storeName, repository et templateRepo sont obligatoires.");

    const repository=repoName(data.repository);
    const templateRepo=repoName(data.templateRepo);

    steps.push(step("validation","Validation",true));
    await getRepo(templateRepo,env);
    steps.push(step("template","Template trouvé",true,templateRepo));
    if(await exists(repository,env))throw new Error(`Repository "${repository}" existe déjà.`);

    const license=await createLicense({...data,repository},env);
    steps.push(step("license","Licence créée",true,license.storeId));

    await createRepo(repository,data.storeName,env);
    steps.push(step("repository","Repository créé",true,repository));

    const copy=await copyTemplate(templateRepo,repository,license.storeId,license.token,env);
    steps.push(step("copy","Template copié",true,`${copy.count} fichier(s)`));
    steps.push(step("injection","STORE_ID + TOKEN injectés",copy.injected>0,`${copy.injected} fichier(s)`));

    const verification=await verifyStore(repository,env);
    const complete=verification.every(x=>x.exists);
    steps.push(step("verification","Structure vérifiée",complete));

    return {
      ok:complete,
      store:{storeName:data.storeName,repository,templateRepo,createdAt:new Date().toISOString()},
      license:{storeId:license.storeId,status:license.status,expiresAt:license.expiresAt},
      // Token is returned only once to the authenticated master dashboard.
      credentials:{storeId:license.storeId,token:license.token},
      verification,steps
    };
  }catch(e){
    steps.push(step("error","Erreur",false,e.message));
    return {ok:false,error:e.message,steps};
  }
}
function json(data,status,headers){
  return new Response(JSON.stringify(data,null,2),{
    status,headers:{"Content-Type":"application/json; charset=UTF-8",...headers}
  });
}
