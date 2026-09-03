/**
 * ============================================================
 * STOREMASTER V4.4 — Automated Store Provisioning
 * ============================================================
 *
 * Features:
 * - Automatic license creation
 * - Automatic STORE_ID creation
 * - Automatic TOKEN creation
 * - GitHub Repository creation
 * - Template recursive copy
 * - Safe UTF-8 handling
 * - Binary image copy
 * - STORE_ID + TOKEN injection
 * - Structure verification
 * - Public license verification
 *
 * ============================================================
 * REQUIRED TEMPLATE MARKERS
 * ============================================================
 *
 * __STOREMASTER_STORE_ID__
 * __STOREMASTER_TOKEN__
 *
 * Example in config.js:
 *
 * const STOREMASTER_LICENSE = {
 *   storeId: "__STOREMASTER_STORE_ID__",
 *   token: "__STOREMASTER_TOKEN__"
 * };
 *
 * ============================================================
 */


/* ============================================================
   REQUIRED STORE STRUCTURE
============================================================ */

const REQUIRED_PATHS = [

  {
    key: "index",
    path: "index.html",
    type: "file"
  },

  {
    key: "adm",
    path: "adm.html",
    type: "file"
  },

  {
    key: "configjs",
    path: "config.js",
    type: "file"
  },

  {
    key: "configjson",
    path: "config/store-config.json",
    type: "file"
  },

  {
    key: "images",
    path: "images",
    type: "dir"
  }

];


/* ============================================================
   MARKERS
============================================================ */

const MARKERS = {

  storeId: "__STOREMASTER_STORE_ID__",

  token: "__STOREMASTER_TOKEN__"

};


/* ============================================================
   WORKER
============================================================ */

export default {

  async fetch(request, env) {

    const cors = {

      "Access-Control-Allow-Origin": "*",

      "Access-Control-Allow-Methods":
        "GET,POST,OPTIONS",

      "Access-Control-Allow-Headers":
        "Content-Type,X-Master-Key"

    };


    /* --------------------------------------------------------
       OPTIONS
    -------------------------------------------------------- */

    if (request.method === "OPTIONS") {

      return new Response(
        null,
        {
          headers: cors
        }
      );

    }


    try {

      const url = new URL(request.url);


      /* ------------------------------------------------------
         HEALTH
      ------------------------------------------------------ */

      if (

        url.pathname === "/" ||

        url.pathname === "/health"

      ) {

        return json(

          {

            ok: true,

            service: "StoreMaster V4.4",

            version: "4.4"

          },

          200,

          cors

        );

      }


      /* ------------------------------------------------------
         AUTHORIZATION
      ------------------------------------------------------ */

      if (!authorized(request, env)) {

        return json(

          {

            ok: false,

            error: "Unauthorized"

          },

          401,

          cors

        );

      }


      /* ------------------------------------------------------
         CREATE STORE
      ------------------------------------------------------ */

      if (

        url.pathname === "/create-store" &&

        request.method === "POST"

      ) {

        const data = await request.json();

        const result = await createStore(
          data,
          env
        );

        return json(

          result,

          result.ok ? 201 : 500,

          cors

        );

      }


      /* ------------------------------------------------------
         VERIFY STORE
      ------------------------------------------------------ */

      if (

        url.pathname === "/verify-store" &&

        request.method === "POST"

      ) {

        const data = await request.json();

        return json(

          {

            ok: true,

            verification:

              await verifyStore(

                data.repository,

                env

              )

          },

          200,

          cors

        );

      }


      /* ------------------------------------------------------
         PUBLIC LICENSE CHECK
      ------------------------------------------------------ */

      if (

        url.pathname ===
          "/public-license-check" &&

        request.method === "POST"

      ) {

        const data = await request.json();

        return json(

          await publicLicenseCheck(

            data,

            env

          ),

          200,

          cors

        );

      }


      /* ------------------------------------------------------
         ROUTE NOT FOUND
      ------------------------------------------------------ */

      return json(

        {

          ok: false,

          error: "Route not found"

        },

        404,

        cors

      );


    }

    catch (e) {

      return json(

        {

          ok: false,

          error:

            e.message ||

            "Internal error"

        },

        500,

        cors

      );

    }

  }

};


/* ============================================================
   AUTHORIZATION
============================================================ */

function authorized(req, env) {

  return (

    !!env.MASTER_API_KEY &&

    req.headers.get(
      "X-Master-Key"
    ) === env.MASTER_API_KEY

  );

}


/* ============================================================
   HELPERS
============================================================ */

function enc(value) {

  return encodeURIComponent(value);

}


function encodePath(path) {

  return String(path)

    .split("/")

    .map(

      part => encodeURIComponent(part)

    )

    .join("/");

}


function repoName(value) {

  const name = String(

    value || ""

  )

    .trim()

    .toLowerCase()

    .replace(

      /[^a-z0-9._-]/g,

      "-"

    )

    .replace(

      /-+/g,

      "-"

    )

    .replace(

      /^-|-$/g,

      ""

    );


  if (!name) {

    throw new Error(

      "Nom de repository invalide."

    );

  }


  return name;

}


/* ============================================================
   GITHUB HEADERS
============================================================ */

function ghHeaders(env) {

  return {

    /*
      IMPORTANT:
      GitHub API requires
      a User-Agent.
    */

    "User-Agent":

      "StoreMaster-V4.4",


    Authorization:

      `Bearer ${env.GITHUB_TOKEN}`,


    Accept:

      "application/vnd.github+json",


    "Content-Type":

      "application/json",


    "X-GitHub-Api-Version":

      "2022-11-28"

  };

}


/* ============================================================
   GITHUB REQUEST
============================================================ */

async function gh(

  path,

  options = {},

  env

) {

  const response = await fetch(

    "https://api.github.com" + path,

    {

      ...options,

      headers: {

        ...ghHeaders(env),

        ...(options.headers || {})

      }

    }

  );


  const text = await response.text();


  let body;


  try {

    body = text

      ? JSON.parse(text)

      : {};

  }

  catch {

    body = {

      message: text

    };

  }


  if (!response.ok) {

    const error = new Error(

      body.message ||

      `GitHub error ${response.status}`

    );


    error.status = response.status;


    throw error;

  }


  return body;

}


/* ============================================================
   GET REPOSITORY
============================================================ */

async function getRepo(

  repo,

  env

) {

  return gh(

    `/repos/${enc(env.GITHUB_OWNER)}/${enc(repo)}`,

    {

      method: "GET"

    },

    env

  );

}


/* ============================================================
   CHECK REPOSITORY EXISTS
============================================================ */

async function exists(

  repo,

  env

) {

  try {

    await getRepo(

      repo,

      env

    );


    return true;

  }

  catch (error) {

    if (error.status === 404) {

      return false;

    }


    throw error;

  }

}


/* ============================================================
   CREATE REPOSITORY
============================================================ */

async function createRepo(

  repo,

  storeName,

  env

) {

  const body = {

    name: repo,


    description:

      `StoreMaster — ${storeName}`,


    /*
      PUBLIC REPOSITORY
    */

    private: false,


    auto_init: false

  };


  try {

    /*
      ORGANIZATION
    */

    return await gh(

      `/orgs/${enc(env.GITHUB_OWNER)}/repos`,

      {

        method: "POST",

        body: JSON.stringify(body)

      },

      env

    );

  }

  catch (error) {

    /*
      IF GITHUB_OWNER IS
      A PERSONAL ACCOUNT
    */

    if (

      error.status !== 404 &&

      error.status !== 422

    ) {

      throw error;

    }


    return gh(

      "/user/repos",

      {

        method: "POST",

        body: JSON.stringify(body)

      },

      env

    );

  }

}


/* ============================================================
   GET ALL FILES RECURSIVELY
============================================================ */

async function filesOf(

  repo,

  env

) {

  const repository = await getRepo(

    repo,

    env

  );


  const tree = await gh(

    `/repos/${enc(env.GITHUB_OWNER)}/${enc(repo)}/git/trees/${enc(repository.default_branch)}?recursive=1`,

    {

      method: "GET"

    },

    env

  );


  return (

    tree.tree || []

  )

    .filter(

      item =>

        item.type === "blob"

    )

    .map(

      item => item.path

    );

}


/* ============================================================
   READ FILE
============================================================ */

async function readFile(

  repo,

  path,

  env

) {

  return gh(

    `/repos/${enc(env.GITHUB_OWNER)}/${enc(repo)}/contents/${encodePath(path)}`,

    {

      method: "GET"

    },

    env

  );

}


/* ============================================================
   UTF-8 BASE64 DECODING
============================================================ */

/*
  This replaces:

  decodeURIComponent(
    escape(
      atob(...)
    )
  )

  which can cause:

  URI malformed
*/

function decodeBase64Utf8(base64) {

  const binary = atob(

    String(base64 || "")

      .replace(/\n/g, "")

  );


  const bytes = new Uint8Array(

    binary.length

  );


  for (

    let i = 0;

    i < binary.length;

    i++

  ) {

    bytes[i] =

      binary.charCodeAt(i);

  }


  return new TextDecoder(

    "utf-8"

  ).decode(bytes);

}


/* ============================================================
   UTF-8 BASE64 ENCODING
============================================================ */

function encodeBase64Utf8(text) {

  const bytes = new TextEncoder()

    .encode(

      String(text || "")

    );


  let binary = "";


  for (

    let i = 0;

    i < bytes.length;

    i++

  ) {

    binary +=

      String.fromCharCode(

        bytes[i]

      );

  }


  return btoa(binary);

}


/* ============================================================
   TEXT FILE DETECTION
============================================================ */

function isTextFile(path) {

  return /\.(

    html|

    htm|

    js|

    json|

    css|

    txt|

    xml|

    svg|

    md|

    csv

  )$/ix.test(path);

}


/* ============================================================
   PUT TEXT FILE
============================================================ */

async function putFile(

  repo,

  path,

  content,

  message,

  env

) {

  return gh(

    `/repos/${enc(env.GITHUB_OWNER)}/${enc(repo)}/contents/${encodePath(path)}`,

    {

      method: "PUT",


      body: JSON.stringify({

        message:

          message,


        content:

          encodeBase64Utf8(

            content

          )

      })

    },

    env

  );

}


/* ============================================================
   PUT BINARY FILE
============================================================ */

async function putBinaryFile(

  repo,

  path,

  base64Content,

  message,

  env

) {

  return gh(

    `/repos/${enc(env.GITHUB_OWNER)}/${enc(repo)}/contents/${encodePath(path)}`,

    {

      method: "PUT",


      body: JSON.stringify({

        message:

          message,


        /*
          Keep original
          GitHub Base64 content
        */

        content:

          String(

            base64Content || ""

          )

            .replace(/\n/g, "")

      })

    },

    env

  );

}


/* ============================================================
   COPY TEMPLATE
============================================================ */

async function copyTemplate(

  source,

  target,

  storeId,

  token,

  env

) {

  const files = await filesOf(

    source,

    env

  );


  let injected = 0;


  let copied = 0;


  for (

    const path of files

  ) {


    /*
      READ SOURCE FILE
    */

    const file = await readFile(

      source,

      path,

      env

    );


    /* ========================================================
       TEXT FILE
    ======================================================== */

    if (

      isTextFile(path)

    ) {


      let content =

        decodeBase64Utf8(

          file.content || ""

        );


      let changed = false;


      /* ------------------------------------------------------
         STORE ID
      ------------------------------------------------------ */

      if (

        content.includes(

          MARKERS.storeId

        )

      ) {

        content =

          content

            .split(

              MARKERS.storeId

            )

            .join(

              storeId

            );


        changed = true;

      }


      /* ------------------------------------------------------
         TOKEN
      ------------------------------------------------------ */

      if (

        content.includes(

          MARKERS.token

        )

      ) {

        content =

          content

            .split(

              MARKERS.token

            )

            .join(

              token

            );


        changed = true;

      }


      if (changed) {

        injected++;

      }


      /* ------------------------------------------------------
         COPY TEXT FILE
      ------------------------------------------------------ */

      await putFile(

        target,

        path,

        content,

        `StoreMaster V4.4: copie ${path}`,

        env

      );


      copied++;

    }


    /* ========================================================
       BINARY FILE
       JPG / PNG / WEBP / GIF / ETC.
    ======================================================== */

    else {


      await putBinaryFile(

        target,

        path,

        file.content,

        `StoreMaster V4.4: copie ${path}`,

        env

      );


      copied++;

    }

  }


  return {

    count:

      files.length,


    copied:

      copied,


    injected:

      injected

  };

}


/* ============================================================
   GENERATE TOKEN
============================================================ */

function generateToken() {

  const bytes =

    new Uint8Array(24);


  crypto.getRandomValues(

    bytes

  );


  return Array.from(

    bytes,

    byte =>

      byte

        .toString(16)

        .padStart(

          2,

          "0"

        )

  ).join("");

}


/* ============================================================
   CREATE LICENSE
============================================================ */

async function createLicense(

  data,

  env

) {


  if (!env.LICENSES) {

    throw new Error(

      "Cloudflare KV LICENSES non configuré."

    );

  }


  const storeId =

    crypto.randomUUID();


  const token =

    generateToken();


  const now =

    new Date()

      .toISOString();


  const license = {

    storeId:

      storeId,


    token:

      token,


    storeName:

      data.storeName,


    repository:

      data.repository,


    clientId:

      data.clientId || "",


    clientName:

      data.clientName || "",


    status:

      "ACTIVE",


    expiresAt:

      data.expiresAt || null,


    createdAt:

      now,


    updatedAt:

      now

  };


  await env.LICENSES.put(

    `license:${storeId}`,

    JSON.stringify(

      license

    )

  );


  return license;

}


/* ============================================================
   PUBLIC LICENSE CHECK
============================================================ */

async function publicLicenseCheck(

  data,

  env

) {

  try {


    if (!env.LICENSES) {

      throw new Error(

        "LICENSES unavailable."

      );

    }


    const raw =

      await env.LICENSES.get(

        `license:${data.storeId}`

      );


    if (!raw) {

      throw new Error(

        "Licence introuvable."

      );

    }


    const license =

      JSON.parse(raw);


    /* --------------------------------------------------------
       TOKEN
    -------------------------------------------------------- */

    if (

      license.token !== data.token

    ) {

      throw new Error(

        "Token invalide."

      );

    }


    /* --------------------------------------------------------
       STATUS
    -------------------------------------------------------- */

    if (

      license.status !== "ACTIVE"

    ) {

      throw new Error(

        "Boutique désactivée."

      );

    }


    /* --------------------------------------------------------
       EXPIRATION
    -------------------------------------------------------- */

    if (

      license.expiresAt &&

      new Date(

        license.expiresAt

      ) < new Date()

    ) {

      throw new Error(

        "Licence expirée."

      );

    }


    return {

      ok: true,

      active: true,

      storeId:

        license.storeId,

      expiresAt:

        license.expiresAt

    };

  }

  catch (error) {

    return {

      ok: false,

      active: false,

      error:

        error.message

    };

  }

}


/* ============================================================
   VERIFY STORE
============================================================ */

async function verifyStore(

  repo,

  env

) {

  const out = [];


  for (

    const item of REQUIRED_PATHS

  ) {

    try {


      const data =

        await readFile(

          repo,

          item.path,

          env

        );


      let exists = false;


      /* ------------------------------------------------------
         DIRECTORY
      ------------------------------------------------------ */

      if (

        item.type === "dir"

      ) {

        exists =

          Array.isArray(data) &&

          data.length > 0;

      }


      /* ------------------------------------------------------
         FILE
      ------------------------------------------------------ */

      else {

        exists =

          data.type === "file";

      }


      out.push({

        key:

          item.key,


        path:

          item.path,


        exists:

          exists

      });

    }


    catch {

      out.push({

        key:

          item.key,


        path:

          item.path,


        exists:

          false

      });

    }

  }


  return out;

}


/* ============================================================
   PROCESS STEP
============================================================ */

function step(

  id,

  label,

  success,

  detail = ""

) {

  return {

    id:

      id,


    label:

      label,


    success:

      success,


    detail:

      detail,


    at:

      new Date()

        .toISOString()

  };

}


/* ============================================================
   CREATE STORE
============================================================ */

async function createStore(

  data,

  env

) {

  const steps = [];


  try {


    /* --------------------------------------------------------
       GITHUB CONFIGURATION
    -------------------------------------------------------- */

    if (

      !env.GITHUB_TOKEN ||

      !env.GITHUB_OWNER

    ) {

      throw new Error(

        "GitHub configuration missing."

      );

    }


    /* --------------------------------------------------------
       REQUIRED DATA
    -------------------------------------------------------- */

    if (

      !data?.storeName ||

      !data?.repository ||

      !data?.templateRepo

    ) {

      throw new Error(

        "storeName, repository et templateRepo sont obligatoires."

      );

    }


    /* --------------------------------------------------------
       CLEAN REPOSITORY NAMES
    -------------------------------------------------------- */

    const repository =

      repoName(

        data.repository

      );


    const templateRepo =

      repoName(

        data.templateRepo

      );


    /* --------------------------------------------------------
       STEP 1
    -------------------------------------------------------- */

    steps.push(

      step(

        "validation",

        "Validation",

        true

      )

    );


    /* --------------------------------------------------------
       STEP 2
       TEMPLATE EXISTS
    -------------------------------------------------------- */

    await getRepo(

      templateRepo,

      env

    );


    steps.push(

      step(

        "template",

        "Template trouvé",

        true,

        templateRepo

      )

    );


    /* --------------------------------------------------------
       CHECK TARGET REPOSITORY
    -------------------------------------------------------- */

    if (

      await exists(

        repository,

        env

      )

    ) {

      throw new Error(

        `Repository "${repository}" existe déjà.`

      );

    }


    /* --------------------------------------------------------
       STEP 3
       LICENSE
    -------------------------------------------------------- */

    const license =

      await createLicense(

        {

          ...data,

          repository:

            repository

        },

        env

      );


    steps.push(

      step(

        "license",

        "Licence créée",

        true,

        license.storeId

      )

    );


    /* --------------------------------------------------------
       STEP 4
       CREATE REPOSITORY
    -------------------------------------------------------- */

    await createRepo(

      repository,

      data.storeName,

      env

    );


    steps.push(

      step(

        "repository",

        "Repository créé",

        true,

        repository

      )

    );


    /* --------------------------------------------------------
       STEP 5
       COPY TEMPLATE
    -------------------------------------------------------- */

    const copy =

      await copyTemplate(

        templateRepo,

        repository,

        license.storeId,

        license.token,

        env

      );


    steps.push(

      step(

        "copy",

        "Template copié",

        true,

        `${copy.copied} fichier(s)`

      )

    );


    /* --------------------------------------------------------
       STEP 6
       INJECTION
    -------------------------------------------------------- */

    steps.push(

      step(

        "injection",

        "STORE_ID + TOKEN injectés",

        copy.injected > 0,

        `${copy.injected} fichier(s)`

      )

    );


    /* --------------------------------------------------------
       STEP 7
       VERIFY STRUCTURE
    -------------------------------------------------------- */

    const verification =

      await verifyStore(

        repository,

        env

      );


    const complete =

      verification.every(

        item => item.exists

      );


    steps.push(

      step(

        "verification",

        "Structure vérifiée",

        complete

      );


    /* --------------------------------------------------------
       RETURN
    -------------------------------------------------------- */

    return {

      ok:

        complete,


      store: {

        storeName:

          data.storeName,


        repository:

          repository,


        templateRepo:

          templateRepo,


        createdAt:

          new Date()

            .toISOString()

      },


      license: {

        storeId:

          license.storeId,


        status:

          license.status,


        expiresAt:

          license.expiresAt

      },


      /*
        TOKEN IS RETURNED ONLY
        TO THE AUTHENTICATED
        MASTER DASHBOARD
      */

      credentials: {

        storeId:

          license.storeId,


        token:

          license.token

      },


      verification:

        verification,


      steps:

        steps

    };

  }

  catch (error) {


    steps.push(

      step(

        "error",

        "Erreur",

        false,

        error.message

      )

    );


    return {

      ok: false,


      error:

        error.message,


      steps:

        steps

    };

  }

}


/* ============================================================
   JSON RESPONSE
============================================================ */

function json(

  data,

  status,

  headers

) {

  return new Response(

    JSON.stringify(

      data,

      null,

      2

    ),

    {

      status:

        status,


      headers: {

        "Content-Type":

          "application/json; charset=UTF-8",


        ...headers

      }

    }

  );

}
