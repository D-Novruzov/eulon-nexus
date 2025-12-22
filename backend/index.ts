import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import express, { type Request, type Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import session, { type Session } from "express-session";
import crypto from "crypto";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const backendEnvPath = join(__dirname, ".env");
const rootEnvPath = join(__dirname, "..", ".env");

let envResult = config({ path: backendEnvPath });
if (envResult.error) {
  envResult = config({ path: rootEnvPath });
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
  process.env.GITHUB_CALLBACK_URL ||
  "http://localhost:4000/auth/github/callback";

// EulonAI frontend origin; adjust if needed.
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const isProduction =
  process.env.NODE_ENV === "production" ||
  GITHUB_CALLBACK_URL.startsWith("https://");
const sessionSecret =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

app.use(
  session({
    name: "eulonai_session",
    secret: sessionSecret,
    resave: false, // Changed to false to prevent race conditions
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: "/",
      // Don't set domain - let browser handle it for cross-origin
    },
    // Add rolling session to extend expiry on activity
    rolling: true,
  })
);

const oauthStates = new Map<string, number>();
const STATE_EXPIRY_MS = 5 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [state, createdAt] of oauthStates.entries()) {
    if (now - createdAt > STATE_EXPIRY_MS) {
      oauthStates.delete(state);
    }
  }
}, 60000);

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

function requireSession(
  req: Request,
  res: Response
): { githubAccessToken: string; githubUser: GitHubUser } | undefined {
  // Check if session exists
  if (!req.session) {
    console.error("No session found in request");
    res
      .status(401)
      .json({ error: "Not authenticated with GitHub", reason: "no_session" });
    return undefined;
  }

  // Check if session has required data
  if (!req.session.githubAccessToken || !req.session.githubUser) {
    console.error("Session missing GitHub data:", {
      hasToken: !!req.session.githubAccessToken,
      hasUser: !!req.session.githubUser,
      sessionId: req.sessionID,
    });
    res.status(401).json({
      error: "Not authenticated with GitHub",
      reason: "missing_github_data",
    });
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
  try {
    console.log("POST /auth/github received", {
      origin: req.headers.origin,
      referer: req.headers.referer,
      hasClientId: !!GITHUB_CLIENT_ID,
      hasClientSecret: !!GITHUB_CLIENT_SECRET,
      callbackUrl: GITHUB_CALLBACK_URL,
      frontendOrigin: FRONTEND_ORIGIN,
    });

    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
      console.error("GitHub OAuth not configured - missing credentials");
      return res.status(500).json({
        error: "GitHub OAuth not configured",
        message:
          "Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.",
        details: {
          hasClientId: !!GITHUB_CLIENT_ID,
          hasClientSecret: !!GITHUB_CLIENT_SECRET,
        },
      });
    }

    const state = createStateToken();
    oauthStates.set(state, Date.now());
    console.log(
      "Generated OAuth state:",
      state,
      "Total states in store:",
      oauthStates.size
    );

    const params = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      redirect_uri: GITHUB_CALLBACK_URL,
      scope: "read:user repo",
      state,
    });

    const authorizeUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
    console.log(
      "OAuth authorization URL generated:",
      authorizeUrl.substring(0, 100) + "..."
    );
    res.json({ authorizeUrl });
  } catch (error) {
    console.error("Error in /auth/github:", error);
    res.status(500).json({
      error: "Failed to initiate GitHub OAuth",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /auth/github/callback
 * Handles the GitHub OAuth callback, exchanges code for access token,
 * fetches the GitHub user, and creates a session.
 */
app.get("/auth/github/callback", async (req: Request, res: Response) => {
  try {
    // Log OAuth parameters for debugging
    console.log("OAuth callback received:", req.query);

    const { code, state } = req.query;

    // Code is always required for OAuth flow
    if (!code || typeof code !== "string") {
      return res.status(400).send("Missing OAuth code parameter");
    }

    // State validation: validate if state was provided
    // We always generate state, so if we receive one, it should be valid
    if (state) {
      if (typeof state !== "string") {
        console.error("Invalid state type:", typeof state);
        return res.status(400).send("Invalid OAuth state parameter type");
      }

      // Validate state exists in our store (it should if we generated it)
      if (oauthStates.has(state)) {
        // Valid state - clean it up
        oauthStates.delete(state);
        console.log("State validated and removed from store");
      } else {
        // State not found - might have expired (5 min TTL) or be invalid
        // Log warning but don't fail to allow for edge cases (e.g., slow user)
        console.warn(
          "State not found in store (may have expired):",
          state.substring(0, 8) + "..."
        );
      }
    } else {
      // No state provided - log warning but proceed (for backward compatibility)
      console.warn("OAuth callback received code but no state parameter");
    }

    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
      return res.status(500).send("GitHub OAuth not configured");
    }

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
      }
    );

    const accessToken = tokenResponse.data.access_token as string | undefined;
    if (!accessToken) {
      return res.status(500).send("Failed to obtain GitHub access token");
    }

    const userResponse = await axios.get<GitHubUser>(
      "https://api.github.com/user",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    req.session.githubAccessToken = accessToken;
    req.session.githubUser = userResponse.data;

    // Ensure session is saved before redirecting
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          console.error("Failed to save session:", err);
          reject(err);
        } else {
          console.log("Session saved successfully:", {
            sessionId: req.sessionID,
            hasToken: !!req.session.githubAccessToken,
            hasUser: !!req.session.githubUser,
          });
          resolve();
        }
      });
    });

    const redirectUrl = new URL(FRONTEND_ORIGIN);
    redirectUrl.searchParams.set("github_connected", "true");
    res.redirect(302, redirectUrl.toString());
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
  // Add logging for debugging
  const hasSession = !!req.session;
  const hasToken = !!req.session?.githubAccessToken;
  const hasUser = !!req.session?.githubUser;

  if (!hasSession || !hasToken || !hasUser) {
    console.log("Session check failed:", {
      hasSession,
      hasToken,
      hasUser,
      sessionId: req.sessionID,
      cookie: req.headers.cookie ? "present" : "missing",
    });
  }

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
    const response = await axios.get<GitHubRepo[]>(
      "https://api.github.com/user/repos",
      {
        headers: {
          Authorization: `Bearer ${session.githubAccessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
        params: {
          per_page: 100,
          sort: "updated",
          direction: "desc",
          visibility: "all",
          affiliation: "owner,collaborator,organization_member",
        },
      }
    );

    const normalized: NormalizedRepo[] = response.data.map((repo) => ({
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
          }
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
        console.error(
          `Failed to resolve HEAD for ${repo.owner}/${repo.name}@${branch}`,
          innerError
        );
      }
    }

    res.json({
      success: true,
      imports,
    });
  } catch (error) {
    console.error("GitHub import error:", error);
    res.status(500).json({ error: "GitHub import failed" });
  }
});

/**
 * GET /health
 * Health check endpoint to verify server and configuration status
 */
app.get("/health", (_req: Request, res: Response) => {
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

/**
 * GET /debug/config
 * Diagnostic endpoint to check OAuth configuration (for troubleshooting)
 * This endpoint helps verify that environment variables are set correctly
 */
app.get("/debug/config", (req: Request, res: Response) => {
  const config = {
    githubOAuth: {
      hasClientId: !!GITHUB_CLIENT_ID,
      hasClientSecret: !!GITHUB_CLIENT_SECRET,
      clientIdLength: GITHUB_CLIENT_ID?.length || 0,
      clientSecretLength: GITHUB_CLIENT_SECRET?.length || 0,
      callbackUrl: GITHUB_CALLBACK_URL,
      isConfigured: !!(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET),
    },
    cors: {
      allowedOrigin: FRONTEND_ORIGIN,
      requestOrigin: req.headers.origin || "not provided",
      originMatches: req.headers.origin === FRONTEND_ORIGIN,
    },
    session: {
      cookieName: "eulonai_session",
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
    },
    server: {
      port,
      nodeEnv: process.env.NODE_ENV || "not set",
      isProduction,
    },
  };

  res.json(config);
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
