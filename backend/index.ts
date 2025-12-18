import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import express, { type Request, type Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import session, { type Session } from "express-session";
import crypto from "crypto";
import axios from "axios";
// Load .env file - check backend directory first, then root as fallback
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const backendEnvPath = join(__dirname, ".env");
const rootEnvPath = join(__dirname, "..", ".env");

// Try backend/.env first, then root/.env as fallback
let envResult = config({ path: backendEnvPath });

if (envResult.error) {
  // Try root directory as fallback
  envResult = config({ path: rootEnvPath });
  if (!envResult.error) {
    console.log(`[dotenv] Loaded .env file from root directory: ${rootEnvPath}`);
    console.warn(`[dotenv] Note: Consider moving .env to backend/.env for better organization`);
  } else {
    console.warn(`[dotenv] Warning: Could not load .env file from either location`);
    console.warn(`[dotenv] Tried: ${backendEnvPath}`);
    console.warn(`[dotenv] Tried: ${rootEnvPath}`);
    console.warn(`[dotenv] Error: ${envResult.error.message}`);
    console.warn(`[dotenv] Make sure backend/.env file exists with your GitHub OAuth credentials`);
  }
} else {
  console.log(`[dotenv] Loaded .env file from backend directory: ${backendEnvPath}`);
}
import type {
  GitHubRepo,
  GitHubUser,
  NormalizedRepo,
  GitHubImportRequest,
  GitHubImportResult,
} from "./github-types.ts";

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 4000;

// Configuration – client id/secret must be provided via env for production.
// The raw values from the prompt are intentionally NOT hard-coded here.
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GITHUB_CALLBACK_URL =
  process.env.GITHUB_CALLBACK_URL || "http://localhost:4000/auth/github/callback";

// Debug: Log environment variable status (without exposing secrets)
if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
  // eslint-disable-next-line no-console
  console.warn(
    "[GitHub OAuth] GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET are not set. OAuth will not work until they are configured.",
  );
  // eslint-disable-next-line no-console
  console.log("[Debug] GITHUB_CLIENT_ID exists:", !!GITHUB_CLIENT_ID);
  // eslint-disable-next-line no-console
  console.log("[Debug] GITHUB_CLIENT_SECRET exists:", !!GITHUB_CLIENT_SECRET);
} else {
  // eslint-disable-next-line no-console
  console.log("[GitHub OAuth] Configuration loaded successfully");
}

// EulonAI frontend origin; adjust if needed.
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

// Configure session middleware for persistent sessions
const isProduction = process.env.NODE_ENV === "production" || GITHUB_CALLBACK_URL.startsWith("https://");
app.use(
  session({
    name: "eulonai_session",
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: "/",
    },
  })
);

const STATE_COOKIE_NAME = "github_oauth_state";

// Store OAuth states server-side with expiration (5 minutes)
const oauthStates = new Map<string, { createdAt: number; frontendOrigin: string }>();
const STATE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

// Clean up expired states periodically
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of oauthStates.entries()) {
    if (now - data.createdAt > STATE_EXPIRY_MS) {
      oauthStates.delete(state);
    }
  }
}, 60000); // Clean up every minute

function createStateToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

// Extend Express Request to include session
declare module "express-session" {
  interface SessionData {
    githubAccessToken?: string;
    githubUser?: GitHubUser;
  }
}

// Extend Express Request type to include session
declare module "express-serve-static-core" {
  interface Request {
    session: Session & {
      githubAccessToken?: string;
      githubUser?: GitHubUser;
    };
  }
}

function requireSession(req: Request, res: Response): { githubAccessToken: string; githubUser: GitHubUser } | undefined {
  if (!req.session.githubAccessToken || !req.session.githubUser) {
    res.status(401).json({ error: "Not authenticated with GitHub" });
    return undefined;
  }

  return {
    githubAccessToken: req.session.githubAccessToken,
    githubUser: req.session.githubUser,
  };
}

/**
 * POST /auth/github
 * Initiates the GitHub OAuth web flow by redirecting the browser.
 */
app.post("/auth/github", (req: Request, res: Response) => {
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return res.status(500).json({ 
      error: "GitHub OAuth not configured",
      message: "Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables. See backend/GITHUB_OAUTH_SETUP.md for instructions."
    });
  }

  const state = createStateToken();
  // Store state server-side instead of relying on cookies
  oauthStates.set(state, {
    createdAt: Date.now(),
    frontendOrigin: FRONTEND_ORIGIN,
  });
  
  // Also set cookie as backup (but we'll primarily use server-side storage)
  // In production (HTTPS), use secure cookies with sameSite: "none" for cross-site redirects
  const isProduction = process.env.NODE_ENV === "production" || GITHUB_CALLBACK_URL.startsWith("https://");
  res.cookie(STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: isProduction, // Must be true when sameSite is "none"
    sameSite: isProduction ? "none" : "lax", // "none" for cross-site, "lax" for same-site
    path: "/",
  });

  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_CALLBACK_URL,
    scope: "read:user repo",
    state,
  });

  const authorizeUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
  res.json({ authorizeUrl });
});

/**
 * GET /auth/github/callback
 * Handles the GitHub OAuth callback, exchanges code for access token,
 * fetches the GitHub user, and creates a session.
 */
app.get("/auth/github/callback", async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query;

    if (!code || !state || typeof code !== "string" || typeof state !== "string") {
      return res.status(400).send("Missing OAuth parameters");
    }

    // Check server-side state storage first (more reliable)
    const storedStateData = oauthStates.get(state);
    const cookieState = req.cookies[STATE_COOKIE_NAME];
    
    // Validate state - check server-side storage or cookie
    const isValidState = storedStateData || (cookieState && cookieState === state);
    
    if (!isValidState) {
      console.warn("[OAuth] State validation failed", {
        hasServerState: !!storedStateData,
        hasCookieState: !!cookieState,
        receivedState: state ? "present" : "missing",
        cookies: Object.keys(req.cookies),
      });
      return res.status(400).send("Invalid OAuth state");
    }
    
    // Clean up the state after validation
    if (storedStateData) {
      oauthStates.delete(state);
    }

    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
      return res.status(500).send("GitHub OAuth not configured");
    }

    // Exchange code for access token
    const tokenResponse = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: GITHUB_CALLBACK_URL,
      },
      {
        headers: {
          Accept: "application/json",
        },
      },
    );

    const accessToken = tokenResponse.data.access_token as string | undefined;
    if (!accessToken) {
      return res.status(500).send("Failed to obtain GitHub access token");
    }

    // Fetch GitHub user
    const userResponse = await axios.get<GitHubUser>("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    const githubUser = userResponse.data;

    // Store session data using express-session (persistent across restarts)
    req.session.githubAccessToken = accessToken;
    req.session.githubUser = githubUser;
    
    // Save the session
    req.session.save((err: Error | null) => {
      if (err) {
        console.error("[OAuth] Failed to save session:", err);
        return res.status(500).send("Failed to create session");
      }

      // Clear OAuth state cookie (use same settings as when it was set)
      const isProductionForClear = process.env.NODE_ENV === "production" || GITHUB_CALLBACK_URL.startsWith("https://");
      res.clearCookie(STATE_COOKIE_NAME, {
        httpOnly: true,
        secure: isProductionForClear,
        sameSite: isProductionForClear ? "none" : "lax",
        path: "/",
      });

      // Redirect back to frontend with a lightweight flag.
      const redirectUrl = new URL(FRONTEND_ORIGIN);
      redirectUrl.searchParams.set("github_connected", "true");
      console.log(`[OAuth] Successfully authenticated user ${githubUser.login}, redirecting to ${redirectUrl.toString()}`);
      res.redirect(302, redirectUrl.toString());
    });
  } catch (error) {
    console.error("GitHub OAuth callback error:", error);
    res.status(500).send("GitHub OAuth failed");
  }
});

/**
 * GET /integrations/github/me
 * Simple endpoint so the frontend can check whether GitHub is connected.
 */
app.get("/integrations/github/me", (req: Request, res: Response) => {
  const session = requireSession(req, res);
  if (!session) return;

  res.json({
    connected: true,
    user: session.githubUser,
  });
});

/**
 * GET /integrations/github/repos
 * Fetches repositories visible to the authenticated GitHub user.
 */
app.get("/integrations/github/repos", async (req: Request, res: Response) => {
  const session = requireSession(req, res);
  if (!session) return;

  try {
    const perPage = 100;

    const response = await axios.get<GitHubRepo[]>(
      "https://api.github.com/user/repos",
      {
        headers: {
          Authorization: `Bearer ${session.githubAccessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
        params: {
          per_page: perPage,
          sort: "updated",
          direction: "desc",
          visibility: "all",
          affiliation: "owner,collaborator,organization_member",
        },
      },
    );

    const repos = response.data;
    const normalized: NormalizedRepo[] = repos.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      owner: repo.owner.login,
      description: repo.description,
      defaultBranch: repo.default_branch,
      language: repo.language,
      visibility: repo.visibility ?? (repo.private ? "private" : "public"),
    }));

    res.json({ repos: normalized });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Error fetching GitHub repositories:", error);
    res.status(500).json({ error: "Failed to fetch GitHub repositories" });
  }
});

/**
 * POST /integrations/github/import
 * For now this endpoint only resolves the HEAD commit for the default branch
 * and returns metadata. The actual graph indexing still happens on the client
 * using the existing GitNexus ingestion pipeline.
 *
 * TODO: For future multi-backend integrations (GitLab, Bitbucket),
 *       this endpoint can evolve to normalize repository content into a
 *       common structure and call a shared ingestion orchestration layer.
 */
app.post("/integrations/github/import", async (req: Request, res: Response) => {
  const session = requireSession(req, res);
  if (!session) return;

  const body = req.body as GitHubImportRequest | undefined;
  if (!body || !Array.isArray(body.repos) || body.repos.length === 0) {
    return res
      .status(400)
      .json({ error: "No repositories provided for import" });
  }

  try {
    const imports: GitHubImportResult["imports"] = [];

    for (const repo of body.repos) {
      const branch = repo.defaultBranch || "main";
      try {
        const commitResponse = await axios.get(
          `https://api.github.com/repos/${repo.owner}/${repo.name}/commits/${branch}`,
          {
            headers: {
              Authorization: `Bearer ${session.githubAccessToken}`,
              Accept: "application/vnd.github.v3+json",
            },
          },
        );

        const commitHash = commitResponse.data?.sha as string | undefined;

        imports.push({
          id: repo.id,
          owner: repo.owner,
          name: repo.name,
          defaultBranch: branch,
          commitHash: commitHash ?? "unknown",
          source: "github",
        });
      } catch (innerError) {
        // eslint-disable-next-line no-console
        console.error(
          `Failed to resolve HEAD for ${repo.owner}/${repo.name}@${branch}`,
          innerError,
        );
      }
    }

    res.json({
      success: true,
      imports,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("GitHub import error:", error);
    res.status(500).json({ error: "GitHub import failed" });
  }
});

/**
 * GET /health
 * Health check endpoint to verify server and configuration status
 */
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    githubOAuthConfigured: !!(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET),
    hasClientId: !!GITHUB_CLIENT_ID,
    hasClientSecret: !!GITHUB_CLIENT_SECRET,
    callbackUrl: GITHUB_CALLBACK_URL,
    frontendOrigin: FRONTEND_ORIGIN,
    port,
  });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(
    `EulonAI GitHub integration server listening on http://localhost:${port}`,
  );
  // eslint-disable-next-line no-console
  console.log(`Health check: http://localhost:${port}/health`);
});


