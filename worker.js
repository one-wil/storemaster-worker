/**
 * ============================================================
 * STOREMASTER V4.4
 * Automated Store Provisioning Worker
 * ============================================================
 *
 * REQUIRED ENVIRONMENT VARIABLES:
 *
 * GITHUB_TOKEN
 * GITHUB_OWNER
 * MASTER_API_KEY
 *
 * REQUIRED KV BINDING:
 *
 * LICENSES
 *
 * ============================================================
 *
 * TEMPLATE STRUCTURE:
 *
 * index.html
 * adm.html
 * config.js
 * config/store-config.json
 * images/
 *
 * ============================================================
 *
 * REQUIRED MARKERS IN config.js:
 *
 * __STOREMASTER_STORE_ID__
 * __STOREMASTER_TOKEN__
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
   STOREMASTER MARKERS
============================================================ */

const MARKERS = {
  storeId: "__STOREMASTER_STORE_ID__",
  token: "__STOREMASTER_TOKEN__"
};


/* ============================================================
   MAIN WORKER
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


    /* ========================================================
       CORS OPTIONS
    ======================================================== */

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


      /* ======================================================
         HEALTH CHECK
      ====================================================== */

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


      /* ======================================================
         AUTHORIZATION
      ====================================================== */

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


      /* ======================================================
         CREATE STORE
      ====================================================== */

      if (
        url.pathname === "/create-store" &&
        request.method === "POST"
      ) {

        const data = await request.json();

        const result =
          await createStore(data, env);

        return json(
          result,
          result.ok ? 201 : 500,
          cors
        );

      }


      /* ======================================================
         VERIFY STORE
      ====================================================== */

      if (
        url.pathname === "/verify-store" &&
        request.method === "POST"
      ) {

        const data = await request.json();

        const verification =
          await verifyStore(
            data.repository,
            env
          );

        return json(
          {
            ok: true,
            verification
          },
          200,
          cors
        );

      }


      /* ======================================================
         PUBLIC LICENSE CHECK
      ====================================================== */

      if (
        url.pathname === "/public-license-check" &&
        request.method === "POST"
      ) {

        const data =
          await request.json();

        const result =
          await publicLicenseCheck(
            data,
            env
          );

        return json(
          result,
          200,
          cors
        );

      }


      /* ======================================================
         ROUTE NOT FOUND
      ====================================================== */

      return json(
        {
          ok: false,
          error: "Route not found"
        },
        404,
        cors
      );


    }
    catch (error) {

      return json(
        {
          ok: false,
          error:
            error.message ||
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

function authorized(request, env) {

  return (
    !!env.MASTER_API_KEY &&
    request.headers.get("X-Master-Key")
      === env.MASTER_API_KEY
  );

}


/* ============================================================
   HELPERS
============================================================ */

function enc(value) {

  return encodeURIComponent(
    String(value)
  );

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

  const name =
    String(value || "")
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

  if (!env.GITHUB_TOKEN) {

    throw new Error(
      "GITHUB_TOKEN missing."
    );

  }


  return {

    /*
     * IMPORTANT
     * GitHub API needs User-Agent
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
   GITHUB API REQUEST
============================================================ */

async function gh(
  path,
  options = {},
  env
) {

  const response =
    await fetch(
      "https://api.github.com" + path,
      {
        ...options,

        headers: {

          ...ghHeaders(env),

          ...(options.headers || {})

        }

      }
    );


  const text =
    await response.text();


  let body;


  try {

    body =
      text
        ? JSON.parse(text)
        : {};

  }
  catch {

    body = {
      message: text
    };

  }


  if (!response.ok) {

    const error =
      new Error(
        body.message ||
        `GitHub error ${response.status}`
      );


    error.status =
      response.status;


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

  return await gh(
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

async function repositoryExists(
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

    if (
      error.status === 404
    ) {

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
     * PUBLIC REPOSITORY
     */

    private: false,


    auto_init: false

  };


  try {

    /*
     * Try Organization
     */

    return await gh(
      `/orgs/${enc(env.GITHUB_OWNER)}/repos`,
      {
        method: "POST",

        body:
          JSON.stringify(body)
      },
      env
    );

  }
  catch (error) {

    /*
     * If owner is personal account,
     * GitHub returns 404/422 here.
     */

    if (
      error.status !== 404 &&
      error.status !== 422
    ) {

      throw error;

    }


    /*
     * Personal account
     */

    return await gh(
      "/user/repos",
      {
        method: "POST",

        body:
          JSON.stringify(body)
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

  const repository =
    await getRepo(
      repo,
      env
    );


  const branch =
    repository.default_branch;


  if (!branch) {

    throw new Error(
      `Default branch not found for ${repo}`
    );

  }


  const tree =
    await gh(
      `/repos/${enc(env.GITHUB_OWNER)}/${enc(repo)}/git/trees/${enc(branch)}?recursive=1`,
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
      item =>
        item.path
    );

}


/* ============================================================
   READ FILE FROM GITHUB
============================================================ */

async function readFile(
  repo,
  path,
  env
) {

  return await gh(
    `/repos/${enc(env.GITHUB_OWNER)}/${enc(repo)}/contents/${encodePath(path)}`,
    {
      method: "GET"
    },
    env
  );

}


/* ============================================================
   SAFE BASE64 UTF-8 DECODING
============================================================ */

/*
 * IMPORTANT:
 *
 * We DO NOT use:
 *
 * decodeURIComponent(
 *   escape(atob(...))
 * )
 *
 * because it can cause:
 *
 * URI malformed
 *
 */

function decodeBase64Utf8(base64) {

  const cleanBase64 =
    String(base64 || "")
      .replace(/\s/g, "");


  const binary =
    atob(cleanBase64);


  const bytes =
    new Uint8Array(
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
   SAFE BASE64 UTF-8 ENCODING
============================================================ */

function encodeBase64Utf8(text) {

  const bytes =
    new TextEncoder()
      .encode(
        String(text ?? "")
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
   CHECK IF FILE IS TEXT
============================================================ */

function isTextFile(path) {

  const lower =
    String(path)
      .toLowerCase();


  return (
    lower.endsWith(".html") ||
    lower.endsWith(".htm") ||
    lower.endsWith(".js") ||
    lower.endsWith(".json") ||
    lower.endsWith(".css") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".xml") ||
    lower.endsWith(".svg") ||
    lower.endsWith(".md") ||
    lower.endsWith(".csv")
  );

}


/* ============================================================
   PUT TEXT FILE
============================================================ */

async function putTextFile(
  repo,
  path,
  content,
  message,
  env
) {

  return await gh(
    `/repos/${enc(env.GITHUB_OWNER)}/${enc(repo)}/contents/${encodePath(path)}`,
    {
      method: "PUT",

      body:
        JSON.stringify({

          message,

          content:
            encodeBase64Utf8(content)

        })

    },
    env
  );

}


/* ============================================================
   PUT BINARY FILE
============================================================ */

/*
 * Images are already returned
 * by GitHub as Base64.
 *
 * We copy the Base64 directly.
 *
 */

async function putBinaryFile(
  repo,
  path,
  base64Content,
  message,
  env
) {

  const cleanBase64 =
    String(base64Content || "")
      .replace(/\s/g, "");


  return await gh(
    `/repos/${enc(env.GITHUB_OWNER)}/${enc(repo)}/contents/${encodePath(path)}`,
    {
      method: "PUT",

      body:
        JSON.stringify({

          message,

          content:
            cleanBase64

        })

    },
    env
  );

}


/* ============================================================
   COPY TEMPLATE
============================================================ */

async function copyTemplate(
  sourceRepo,
  targetRepo,
  storeId,
  token,
  env
) {

  const files =
    await filesOf(
      sourceRepo,
      env
    );


  if (!files.length) {

    throw new Error(
      "Le template ne contient aucun fichier."
    );

  }


  let copied = 0;

  let injected = 0;


  for (
    const path of files
  ) {

    /*
     * Read source file
     */

    const file =
      await readFile(
        sourceRepo,
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


      /*
       * Copy text file
       */

      await putTextFile(
        targetRepo,
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

      /*
       * Copy original Base64
       * without UTF-8 conversion
       */

      await putBinaryFile(
        targetRepo,
        path,
        file.content,
        `StoreMaster V4.4: copie ${path}`,
        env
      );


      copied++;

    }

  }


  return {

    total:
      files.length,

    copied,

    injected

  };

}


/* ============================================================
   GENERATE SECURE TOKEN
============================================================ */

function generateToken() {

  const bytes =
    new Uint8Array(32);


  crypto.getRandomValues(
    bytes
  );


  return Array
    .from(bytes)

    .map(
      byte =>
        byte
          .toString(16)
          .padStart(2, "0")
    )

    .join("");

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
      "Cloudflare KV binding LICENSES non configuré."
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

    storeId,

    token,

    storeName:
      data.storeName || "",

    repository:
      data.repository || "",

    templateRepo:
      data.templateRepo || "",

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
    JSON.stringify(license)
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


    if (
      !data ||
      !data.storeId ||
      !data.token
    ) {

      throw new Error(
        "STORE_ID ou TOKEN manquant."
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


    /* ========================================================
       TOKEN
    ======================================================== */

    if (
      license.token !==
      data.token
    ) {

      throw new Error(
        "Token invalide."
      );

    }


    /* ========================================================
       STATUS
    ======================================================== */

    if (
      license.status !==
      "ACTIVE"
    ) {

      throw new Error(
        "Boutique désactivée."
      );

    }


    /* ========================================================
       EXPIRATION
    ======================================================== */

    if (
      license.expiresAt &&
      new Date(license.expiresAt)
        < new Date()
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
        license.expiresAt || null

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
   VERIFY DIRECTORY
============================================================ */

async function verifyDirectory(
  repo,
  directory,
  env
) {

  try {

    const result =
      await gh(
        `/repos/${enc(env.GITHUB_OWNER)}/${enc(repo)}/contents/${encodePath(directory)}`,
        {
          method: "GET"
        },
        env
      );


    return (
      Array.isArray(result) &&
      result.length > 0
    );

  }
  catch {

    return false;

  }

}


/* ============================================================
   VERIFY FILE
============================================================ */

async function verifyFile(
  repo,
  path,
  env
) {

  try {

    const result =
      await readFile(
        repo,
        path,
        env
      );


    return (
      result &&
      result.type === "file"
    );

  }
  catch {

    return false;

  }

}


/* ============================================================
   VERIFY STORE STRUCTURE
============================================================ */

async function verifyStore(
  repo,
  env
) {

  const results = [];


  for (
    const item of REQUIRED_PATHS
  ) {

    let exists = false;


    if (
      item.type === "file"
    ) {

      exists =
        await verifyFile(
          repo,
          item.path,
          env
        );

    }
    else {

      exists =
        await verifyDirectory(
          repo,
          item.path,
          env
        );

    }


    results.push({

      key:
        item.key,

      path:
        item.path,

      type:
        item.type,

      exists

    });

  }


  return results;

}


/* ============================================================
   CREATE STEP
============================================================ */

function createStep(
  id,
  label,
  success,
  detail = ""
) {

  return {

    id,

    label,

    success,

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

    /* ========================================================
       VALIDATE ENVIRONMENT
    ======================================================== */

    if (!env.GITHUB_OWNER) {

      throw new Error(
        "GITHUB_OWNER missing."
      );

    }


    if (!env.GITHUB_TOKEN) {

      throw new Error(
        "GITHUB_TOKEN missing."
      );

    }


    if (!env.LICENSES) {

      throw new Error(
        "LICENSES KV missing."
      );

    }


    /* ========================================================
       VALIDATE REQUEST
    ======================================================== */

    if (
      !data ||
      !data.storeName ||
      !data.repository ||
      !data.templateRepo
    ) {

      throw new Error(
        "storeName, repository et templateRepo sont obligatoires."
      );

    }


    const repository =
      repoName(
        data.repository
      );


    const templateRepo =
      repoName(
        data.templateRepo
      );


    /* ========================================================
       STEP 1
    ======================================================== */

    steps.push(
      createStep(
        "validation",
        "Validation",
        true
      )
    );


    /* ========================================================
       STEP 2
       CHECK TEMPLATE
    ======================================================== */

    await getRepo(
      templateRepo,
      env
    );


    const templateFiles =
      await filesOf(
        templateRepo,
        env
      );


    if (
      !templateFiles.length
    ) {

      throw new Error(
        "Le template est vide."
      );

    }


    steps.push(
      createStep(
        "template",
        "Template trouvé",
        true,
        `${templateFiles.length} fichier(s)`
      )
    );


    /* ========================================================
       CHECK TARGET REPOSITORY
    ======================================================== */

    if (
      await repositoryExists(
        repository,
        env
      )
    ) {

      throw new Error(
        `Repository "${repository}" existe déjà.`
      );

    }


    /* ========================================================
       STEP 3
       CREATE LICENSE
    ======================================================== */

    const license =
      await createLicense(
        {
          ...data,

          repository,

          templateRepo
        },
        env
      );


    steps.push(
      createStep(
        "license",
        "Licence créée",
        true,
        license.storeId
      )
    );


    /* ========================================================
       STEP 4
       CREATE REPOSITORY
    ======================================================== */

    await createRepo(
      repository,
      data.storeName,
      env
    );


    steps.push(
      createStep(
        "repository",
        "Repository créé",
        true,
        repository
      )
    );


    /* ========================================================
       STEP 5
       COPY TEMPLATE
    ======================================================== */

    const copyResult =
      await copyTemplate(
        templateRepo,
        repository,
        license.storeId,
        license.token,
        env
      );


    steps.push(
      createStep(
        "copy",
        "Template copié",
        true,
        `${copyResult.copied}/${copyResult.total} fichier(s)`
      )
    );


    /* ========================================================
       STEP 6
       INJECTION
    ======================================================== */

    const injectionSuccess =
      copyResult.injected > 0;


    steps.push(
      createStep(
        "injection",
        "STORE_ID + TOKEN injectés",
        injectionSuccess,
        `${copyResult.injected} fichier(s)`
      )
    );


    /*
     * The template must contain
     * the markers.
     */

    if (!injectionSuccess) {

      throw new Error(
        "Les marqueurs STOREMASTER n'ont pas été trouvés dans le template."
      );

    }


    /* ========================================================
       STEP 7
       VERIFY STRUCTURE
    ======================================================== */

    const verification =
      await verifyStore(
        repository,
        env
      );


    const complete =
      verification.every(
        item =>
          item.exists === true
      );


    steps.push(
      createStep(
        "verification",
        "Structure vérifiée",
        complete
      )
    );


    if (!complete) {

      const missing =
        verification

          .filter(
            item =>
              !item.exists
          )

          .map(
            item =>
              item.path
          )

          .join(", ");


      throw new Error(
        `Structure incomplète: ${missing}`
      );

    }


    /* ========================================================
       SUCCESS
    ======================================================== */

    return {

      ok: true,


      message:
        "Boutique créée avec succès.",


      store: {

        storeName:
          data.storeName,

        repository,

        templateRepo,

        githubUrl:
          `https://github.com/${env.GITHUB_OWNER}/${repository}`,

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
       * TOKEN returned only
       * to authenticated dashboard
       */

      credentials: {

        storeId:
          license.storeId,

        token:
          license.token

      },


      copy: {

        total:
          copyResult.total,

        copied:
          copyResult.copied,

        injected:
          copyResult.injected

      },


      verification,


      steps

    };

  }
  catch (error) {

    steps.push(
      createStep(
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
  cors
) {

  return new Response(

    JSON.stringify(
      data,
      null,
      2
    ),

    {

      status,

      headers: {

        "Content-Type":
          "application/json; charset=UTF-8",

        ...cors

      }

    }

  );

}
