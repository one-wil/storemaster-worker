/* ============================================================

STOREMASTER V6.2

SECURE MULTI-STORE CLOUDFLARE WORKER


SECURITY MODEL

============================================================


✓ GITHUB_TOKEN موجود فقط داخل Cloudflare Secret

✓ STORE_ID موجود فقط داخل Cloudflare KV

✓ كلمة مرور المدير = آخر 10 رموز من STORE_ID بدون "-"

✓ STORE_ID لا يعود إلى adm.html

✓ Repository لا يتم تخزينه داخل adm.html

✓ كل متجر له Session مستقلة

✓ كل Session مرتبطة بمتجر واحد

✓ كل متجر يصل فقط إلى Repository الخاص به

✓ لا يمكن استعمال GitHub Token شخصي من المتصفح

✓ جميع طلبات GitHub تمر عبر Cloudflare


REQUIRED BINDINGS

============================================================


KV Namespace Binding:

LICENSES


Variable:

GITHUB_OWNER


Secrets:

GITHUB_TOKEN

MASTER_API_KEY


============================================================ */


const APP_VERSION = "6.2";



/* ============================================================

CORS

============================================================ */


const CORS = {

"Access-Control-Allow-Origin": "*",


"Access-Control-Allow-Methods":

"GET, POST, OPTIONS",


"Access-Control-Allow-Headers":

"Content-Type, Authorization, X-Master-Key"

};



/* ============================================================

JSON RESPONSE

============================================================ */


function json(data, status = 200) {


return new Response(


JSON.stringify(data, null, 2),


{

status,


headers: {


"Content-Type":

"application/json; charset=UTF-8",


...CORS

}

}

);

}



function success(data = {}, status = 200) {


return json(


{

success: true,

...data

},


status

);

}



function error(

message,

status = 400,

details = null

) {


return json(


{

success: false,


error: message,


details

},


status

);

}



/* ============================================================

NORMALIZATION

============================================================ */


function normalizeRepositoryName(value) {


return String(value || "")


.trim()


.toLowerCase()


.replace(

/[^a-z0-9-_]/g,

"-"

)


.replace(

/-+/g,

"-"

)


.replace(

/^-+|-+$/g,

""

);

}



function normalizeStoreName(value) {


return String(value || "")


.trim()


.replace(

/\s+/g,

" "

);

}



function normalizeSiteKey(value) {


return String(value || "")


.trim()


.toLowerCase()


.replace(

/^https?:\/\//,

""

)


.replace(

/^\/+|\/+$/g,

""

);

}



/* ============================================================

KV KEYS

============================================================ */


function licenseKey(storeId) {


return `license:${storeId}`;

}



function siteKey(site) {


return `site:${normalizeSiteKey(site)}`;

}



function sessionKey(token) {


return `session:${token}`;

}



/* ============================================================

RANDOM

============================================================ */


function randomHex(bytes = 32) {


const array =

new Uint8Array(bytes);



crypto.getRandomValues(array);



return Array


.from(array)


.map(


value =>


value

.toString(16)

.padStart(2, "0")


)


.join("");

}



/* ============================================================

HASH

============================================================ */


async function hashValue(value) {


const encoder =

new TextEncoder();



const data =

encoder.encode(

String(value)

);



const hash =


await crypto.subtle.digest(


"SHA-256",


data

);



return Array


.from(

new Uint8Array(hash)

)


.map(


value =>


value

.toString(16)

.padStart(2, "0")


)


.join("");

}



/* ============================================================

ADMIN PASSWORD


Password =

Last 10 characters of STORE_ID

after removing "-"

============================================================ */


function getAdminPassword(storeId) {


const cleanStoreId =


String(storeId || "")


.replace(

/-/g,

""

);



return cleanStoreId.slice(-10);

}



/* ============================================================

DATE / EXPIRATION

============================================================ */


function isExpired(expirationDate) {


if (!expirationDate) {


return false;

}



const expiration =


new Date(


`${expirationDate}T23:59:59.999Z`


);



return new Date() > expiration;

}



/* ============================================================

MASTER AUTH

============================================================ */


function getMasterKey(request) {


return (


request.headers.get(

"X-Master-Key"

)


||


request.headers


.get("Authorization")


?.replace(

/^Bearer\s+/i,

""

)


||


""

);

}



function requireMaster(

request,

env

) {


return (


getMasterKey(request) ===

env.MASTER_API_KEY

);

}



/* ============================================================

LICENSE STORAGE

============================================================ */


async function saveLicense(

env,

license

) {


await env.LICENSES.put(


licenseKey(

license.storeId

),


JSON.stringify(

license

)

);

}



async function getLicense(

env,

storeId

) {


if (!storeId) {


return null;

}



const value =


await env.LICENSES.get(


licenseKey(storeId)

);



if (!value) {


return null;

}



try {


return JSON.parse(value);


}


catch {


return null;

}

}



/* ============================================================

GET LICENSE BY SITE

============================================================ */


async function getLicenseBySite(

env,

site

) {


const storeId =


await env.LICENSES.get(


siteKey(site)

);



if (!storeId) {


return null;

}



return await getLicense(

env,

storeId

);

}



/* ============================================================

VALIDATE LICENSE

============================================================ */


function validateLicense(

license

) {


if (!license) {


return {


valid: false,


reason:

"Boutique introuvable"

};

}



if (


license.status !==

"active"


) {


return {


valid: false,


reason:

"Licence inactive"

};

}



if (


isExpired(

license.expirationDate

)


) {


return {


valid: false,


reason:

"Licence expirée"

};

}



return {


valid: true

};

}



/* ============================================================

GITHUB RAW REQUEST

============================================================ */


async function githubRaw(


env,

url,

options = {}


) {


const response =


await fetch(


url,


{


...options,



headers: {


"Authorization":


`Bearer ${env.GITHUB_TOKEN}`,



"Accept":


"application/vnd.github+json",



"X-GitHub-Api-Version":


"2022-11-28",



"User-Agent":


"StoreMaster-V6.2",



...(options.headers || {})

}

}

);



const body =

await response.text();



return {


ok:

response.ok,



status:

response.status,



body,



contentType:


response.headers.get(

"content-type"

)


||


"application/json"

};

}



/* ============================================================

GITHUB JSON REQUEST

============================================================ */


async function githubJSON(


env,

url,

options = {}


) {


const result =


await githubRaw(


env,

url,

options

);



let data = null;



try {


data =


result.body


?


JSON.parse(

result.body

)


:


null;

}



catch {


data =

result.body;

}



if (!result.ok) {


throw new Error(


`GitHub API ${result.status}: ` +


(


data?.message


||


result.body


||


"Erreur GitHub"

)

);

}



return data;

}



/* ============================================================

CREATE GITHUB REPOSITORY

============================================================ */


async function createRepository(


env,

repository,

description


) {


return await githubJSON(


env,


"https://api.github.com/user/repos",


{


method: "POST",



headers: {


"Content-Type":

"application/json"

},



body:


JSON.stringify({


name:

repository,



description,



private:

false,



auto_init:

false,



has_issues:

false,



has_projects:

false,



has_wiki:

false

})

}

);

}



/* ============================================================

GET TEMPLATE TREE

============================================================ */


async function getTree(


env,

owner,

repository


) {


const branches = [


"main",


"master"

];



for (


const branch

of branches


) {


try {


const data =


await githubJSON(


env,


`https://api.github.com/repos/` +

`${owner}/` +

`${repository}/` +

`git/trees/${branch}` +

`?recursive=1`

);



return {


branch,


tree:


data.tree

||


[]

};


}



catch {


/* Try next branch */


}

}



throw new Error(

"Branche du template introuvable"

);

}



/* ============================================================

GET FILE

============================================================ */


async function getFile(


env,

owner,

repository,

path,

branch = "main"


) {


const safePath =


path


.split("/")


.map(

encodeURIComponent

)


.join("/");



return await githubJSON(


env,


`https://api.github.com/repos/` +

`${owner}/` +

`${repository}/` +

`contents/${safePath}` +

`?ref=${encodeURIComponent(branch)}`

);

}



/* ============================================================

UTF8 TO BASE64

============================================================ */


function utf8ToBase64(content) {


const bytes =


new TextEncoder()


.encode(

String(content)

);



let binary = "";



for (


const byte

of bytes


) {


binary +=


String.fromCharCode(

byte

);

}



return btoa(binary);

}



/* ============================================================

BASE64 TO UTF8

============================================================ */


function base64ToUtf8(base64) {


const binary =


atob(


String(base64)


.replace(

/\n/g,

""

)

);



const bytes =


Uint8Array.from(


binary,


character =>


character.charCodeAt(0)

);



return new TextDecoder()


.decode(bytes);

}



/* ============================================================

PUT FILE

============================================================ */


async function putFile(


env,

owner,

repository,

path,

content,

message


) {


const safePath =


path


.split("/")


.map(

encodeURIComponent

)


.join("/");



const base64 =


utf8ToBase64(

content

);



return await githubJSON(


env,


`https://api.github.com/repos/` +

`${owner}/` +

`${repository}/` +

`contents/${safePath}`,


{


method:

"PUT",



headers: {


"Content-Type":

"application/json"

},



body:


JSON.stringify({


message,



content:

base64,



branch:

"main"

})

}

);

}



/* ============================================================

TEMPLATES

============================================================ */


const TEMPLATES = {



template1: {


id:

"template1",


name:

"batal",


repository:

"batal"

},



template2: {


id:

"template2",


name:

"ShopLive",


repository:

"shoplive"

},



template3: {


id:

"template3",


name:

"Template 3",


repository:

"ghalim"

}

};



/* ============================================================

COPY TEMPLATE

============================================================ */


async function copyTemplate(


env,

templateRepository,

targetRepository,

store


) {


const templateData =


await getTree(


env,


env.GITHUB_OWNER,


templateRepository

);



const templateBranch =

templateData.branch;



const files =


templateData.tree


.filter(


item =>


item.type ===

"blob"

);



let copiedFiles = 0;



for (


const file

of files


) {


const source =


await getFile(


env,


env.GITHUB_OWNER,


templateRepository,


file.path,


templateBranch

);



let content = "";



if (


source.content


) {


content =


base64ToUtf8(

source.content

);

}



/* ========================================================

ADM.HTML


Only Worker URL is injected.


NEVER inject:

- STORE_ID

- GitHub Token

- Repository

======================================================== */


if (


file.path ===

"adm.html"


) {


content =


content.replaceAll(


"{{LICENSE_SERVER}}",


store.workerUrl

);

}



/* ========================================================

STORE CONFIG JSON

======================================================== */


if (


file.path ===

"config/store-config.json"


) {


try {


const config =


JSON.parse(

content

);



config.LICENSE_SERVER =


store.workerUrl;



config.STORE_INFO =


config.STORE_INFO


||


{};



config.STORE_INFO.name =


store.storeName;



delete config.STORE_ID;

delete config.STORE_TOKEN;

delete config.STORE_TOKEN_HINT;

delete config.GITHUB_TOKEN;

delete config.GITHUB_REPOSITORY;



content =


JSON.stringify(


config,


null,


2

);

}



catch {


/* Keep original content */


}

}



/* ========================================================

CONFIG.JS

======================================================== */


if (


file.path ===

"config.js"


) {


content =


content


.replaceAll(


"{{LICENSE_SERVER}}",


store.workerUrl

)


.replaceAll(


"{{STORE_ID}}",


""

)


.replaceAll(


"{{STORE_TOKEN}}",


""

)


.replaceAll(


"{{TOKEN_HINT}}",


""

);

}



await putFile(


env,


env.GITHUB_OWNER,


targetRepository,


file.path,


content,


`StoreMaster V6.2: copie ${file.path}`

);



copiedFiles++;

}



return copiedFiles;

}



/* ============================================================

CREATE SESSION

============================================================ */


async function createSession(


env,

license


) {


const token =


crypto.randomUUID()


+


"-"


+


randomHex(16);



const expiresAt =


Date.now()


+


(


8


*


60


*


60


*


1000

);



await env.LICENSES.put(


sessionKey(token),


JSON.stringify({


storeId:

license.storeId,



expiresAt

}),


{


expirationTtl:


8


*


60


*


60

}

);



return {


token,


expiresAt

};

}



/* ============================================================

GET SESSION

============================================================ */


async function getSession(


env,

token


) {


if (!token) {


return null;

}



const value =


await env.LICENSES.get(


sessionKey(token)

);



if (!value) {


return null;

}



try {


const session =


JSON.parse(

value

);



if (


Date.now() >


session.expiresAt


) {


return null;

}



return session;


}



catch {


return null;

}

}



/* ============================================================

ADMIN LOGIN


Password =

last 10 characters of STORE_ID

============================================================ */


async function handleAdminLogin(


request,

env


) {


const body =


await request.json();



const requestedSite =


normalizeSiteKey(

body.siteKey

);



const password =


String(


body.password

||


""


).trim();



if (


!requestedSite

||


!password


) {


return error(


"Données de connexion manquantes"

);

}



const license =


await getLicenseBySite(


env,


requestedSite

);



const validation =


validateLicense(

license

);



if (!validation.valid) {


return error(


validation.reason,


401

);

}



const expectedPassword =


getAdminPassword(

license.storeId

);



if (


password !==

expectedPassword


) {


return error(


"كلمة المرور غير صحيحة",


401

);

}



const session =


await createSession(


env,


license

);



license.lastVerification =


new Date()

.toISOString();



await saveLicense(


env,


license

);



/* ========================================================

IMPORTANT


STORE_ID is NOT returned.

Repository is NOT returned.

======================================================== */


return success({


session:


session.token,



expiresAt:


new Date(


session.expiresAt

).toISOString(),



storeName:


license.storeName

||


""

});

}



/* ============================================================

GITHUB SECURITY

============================================================ */


function isAllowedGitHubPath(


pathname,

owner,

repository


) {


const prefix =


`/repos/${owner}/${repository}`;



return (


pathname ===

prefix


||


pathname.startsWith(


prefix + "/"

)

);

}



/* ============================================================

SECURE GITHUB PROXY

============================================================ */


async function handleGitHubProxy(


request,

env


) {


const body =


await request.json();



const session =


await getSession(


env,


body.session

);



if (!session) {


return error(


"Session expirée. Connectez-vous à nouveau.",


401

);

}



const license =


await getLicense(


env,


session.storeId

);



const validation =


validateLicense(

license

);



if (!validation.valid) {


return error(


validation.reason,


403

);

}



let target;



try {


target =


new URL(


String(

body.url

||

""

)

);


}



catch {


return error(


"URL GitHub invalide",


400

);

}



if (


target.origin !==

"https://api.github.com"


) {


return error(


"Destination GitHub refusée",


403

);

}



if (


!isAllowedGitHubPath(


target.pathname,


env.GITHUB_OWNER,


license.repository

)


) {


return error(


"Accès refusé à un autre repository",


403

);

}



const method =


String(


body.method

||


"GET"


).toUpperCase();



const headers = {


...(body.headers || {})

};



delete headers.Authorization;

delete headers.authorization;

delete headers.Host;

delete headers.host;



const result =


await githubRaw(


env,


target.toString(),


{


method,



headers,



body:


(


method === "GET"


||


method === "HEAD"


)


?


undefined


:


(


body.body

??


undefined

)

}

);



license.lastSync =


new Date()

.toISOString();



license.updatedAt =


new Date()

.toISOString();



await saveLicense(


env,


license

);



return success(


{


status:


result.status,



body:


result.body,



headers: {


"Content-Type":


result.contentType

}

},



result.ok


?


200


:


result.status

);

}



/* ============================================================

CREATE STORE

============================================================ */


async function handleCreateStore(


request,

env


) {


if (


!requireMaster(


request,

env

)


) {


return error(


"MASTER_API_KEY invalide",


401

);

}



const body =


await request.json();



const client =


String(


body.client

||


""


).trim();



const storeName =


normalizeStoreName(


body.storeName


||


body.nomBoutique

);



const repository =


normalizeRepositoryName(


body.repository


||


body.repositoryName

);



const templateId =


String(


body.template


||


body.templateId


||


""


).trim();



const expirationDate =


body.expirationDate


||


body.dateExpiration


||


null;



if (!storeName) {


return error(


"Nom boutique obligatoire"

);

}



if (!repository) {


return error(


"Nom repository obligatoire"

);

}



if (!templateId) {


return error(


"Template obligatoire"

);

}



const template =


TEMPLATES[

templateId

];



if (!template) {


return error(


"Template introuvable"

);

}



const siteKeyValue =


normalizeSiteKey(


body.siteKey


||


`${env.GITHUB_OWNER}.github.io/${repository}`

);



const existingSite =


await env.LICENSES.get(


siteKey(

siteKeyValue

)

);



if (existingSite) {


return error(


"Ce site est déjà utilisé",


409

);

}



/* ========================================================

STORE_ID


Exists ONLY in Cloudflare KV

======================================================== */


const storeId =


crypto.randomUUID();



/* ========================================================

PASSWORD


Last 10 characters of STORE_ID

after removing "-"

======================================================== */


const adminPassword =


getAdminPassword(

storeId

);



const now =


new Date()

.toISOString();



const workerUrl =


new URL(

request.url

).origin;



const license = {


version:


6.2,



storeId,



client,



storeName,



repository,



siteKey:


siteKeyValue,



template:


template.id,



expirationDate,



status:


"active",



createdAt:


now,



updatedAt:


now,



lastVerification:


null,



lastSync:


null

};



await saveLicense(


env,

license

);



await env.LICENSES.put(


siteKey(

siteKeyValue

),


storeId

);



try {



await createRepository(


env,


repository,


`StoreMaster V6.2 - ${storeName}`

);



const copiedFiles =


await copyTemplate(


env,


template.repository,


repository,


{


storeName,


workerUrl

}

);



return success({


message:


"Boutique créée avec succès",



store: {


client,



name:


storeName,



siteKey:


siteKeyValue,



template:


template.name

},



/* ====================================================

Only password is returned.


STORE_ID is NOT returned.

==================================================== */


identifiers: {


adminPassword

},



license: {


status:


license.status,



expirationDate:


license.expirationDate

},



copiedFiles,



repositoryUrl:


`https://github.com/` +


`${env.GITHUB_OWNER}/` +


`${repository}`

});


}



catch (err) {



license.status =


"disabled";



license.updatedAt =


new Date()

.toISOString();



await saveLicense(


env,


license

);



await env.LICENSES.delete(


siteKey(

siteKeyValue

)

);



throw err;

}

}



/* ============================================================

HEALTH

============================================================ */


function handleHealth() {


return success({


service:


"StoreMaster Worker",



version:


APP_VERSION,



status:


"online",



timestamp:


new Date()

.toISOString()

});

}



/* ============================================================

OPTIONS

============================================================ */


function handleOptions() {


return new Response(


null,


{


status:


204,



headers:


CORS

}

);

}



/* ============================================================

MAIN ROUTER

============================================================ */


export default {



async fetch(


request,

env


) {


try {



const url =


new URL(

request.url

);



const path =

url.pathname;



const method =

request.method;



/* OPTIONS */


if (


method ===

"OPTIONS"


) {


return handleOptions();

}



/* HEALTH */


if (


method ===

"GET"


&&


(


path === "/"


||


path === "/health"

)


) {


return handleHealth();

}



/* ADMIN LOGIN */


if (


method ===

"POST"


&&


path ===

"/api/admin/login"


) {


return await handleAdminLogin(


request,

env

);

}



/* GITHUB PROXY */


if (


method ===

"POST"


&&


path ===

"/api/github/proxy"


) {


return await handleGitHubProxy(


request,

env

);

}



/* CREATE STORE */


if (


method ===

"POST"


&&


path ===

"/api/store/create"


) {


return await handleCreateStore(


request,

env

);

}



return error(


"Route introuvable",


404,


{


method,


path

}

);



}



catch (err) {



return error(


"Erreur interne du Worker",


500,


err?.message


||


String(err)

);

}

}

};


