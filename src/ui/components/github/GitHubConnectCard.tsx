import React, { useEffect, useState, useCallback } from "react";

interface GitHubConnectCardProps {
  onConnected: () => void;
}

interface GitHubMeResponse {
  connected: boolean;
  user?: {
    login: string;
    name?: string;
    avatar_url?: string;
  };
  accessToken?: string; // GitHub access token for API calls
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

const GitHubConnectCard: React.FC<GitHubConnectCardProps> = ({
  onConnected,
}) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [user, setUser] = useState<GitHubMeResponse["user"] | undefined>(
    undefined
  );
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      setError(null);

      // Get session token from localStorage (workaround for cross-origin cookies)
      const sessionToken = localStorage.getItem("github_session_token");

      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };

      // Add session token to header if available
      if (sessionToken) {
        headers["X-Session-Token"] = sessionToken;
      }

      const res = await fetch(`${API_BASE_URL}/integrations/github/me`, {
        credentials: "include",
        headers,
      });

      if (!res.ok) {
        if (res.status === 401) {
          // Not authenticated - this is expected if not connected
          setIsConnected(false);
          setUser(undefined);
          return;
        }
        // Other errors
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = (await res.json()) as GitHubMeResponse;
      if (data.connected) {
        setIsConnected(true);
        setUser(data.user);

        // Store the GitHub access token for authenticated API calls
        if (data.accessToken) {
          sessionStorage.setItem("github_access_token", data.accessToken);
          console.log(
            "🔑 Stored GitHub access token for authenticated requests"
          );
        }

        onConnected();
      } else {
        setIsConnected(false);
        setUser(undefined);
        // Clear stored tokens if not connected
        sessionStorage.removeItem("github_access_token");
      }
    } catch (e) {
      console.error("Failed to refresh GitHub auth status", e);
      // Only set error if it's not a 401 (which is expected when not connected)
      if (e instanceof Error && !e.message.includes("401")) {
        setError("Unable to verify GitHub connection");
      }
      setIsConnected(false);
      setUser(undefined);
    }
  }, [onConnected]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("github_connected") === "true") {
      // Extract session token from URL (workaround for cross-origin cookies)
      const sessionToken = url.searchParams.get("session_token");
      if (sessionToken) {
        // Store the session token in localStorage for future requests
        localStorage.setItem("github_session_token", sessionToken);
        console.log("Stored session token for cross-origin authentication");
      }

      // After OAuth callback, wait a bit for session to be fully established
      // then retry with exponential backoff
      const retryWithBackoff = async (attempt = 0) => {
        const maxAttempts = 3;
        const delay = Math.min(1000 * Math.pow(2, attempt), 3000); // Max 3 seconds

        if (attempt > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        try {
          await refreshStatus();
        } catch (e) {
          if (attempt < maxAttempts) {
            console.log(
              `Retrying GitHub status check (attempt ${
                attempt + 1
              }/${maxAttempts})...`
            );
            await retryWithBackoff(attempt + 1);
          } else {
            console.error(
              "Failed to refresh GitHub auth status after retries",
              e
            );
          }
        }
      };

      void retryWithBackoff();
      url.searchParams.delete("github_connected");
      url.searchParams.delete("session_token");
      window.history.replaceState({}, document.title, url.toString());
    } else {
      void refreshStatus();
    }
  }, [refreshStatus]);

  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      setError(null);

      console.log("Initiating GitHub OAuth flow...", {
        apiBaseUrl: API_BASE_URL,
        currentUrl: window.location.href,
      });

      // Check if API_BASE_URL is still localhost in production
      if (
        API_BASE_URL.includes("localhost") &&
        window.location.href.includes("railway.app")
      ) {
        const errorMsg =
          "Configuration Error: Frontend is trying to connect to localhost. Please set VITE_API_BASE_URL environment variable in Railway to your backend URL.";
        console.error(errorMsg);
        setError(errorMsg);
        setIsConnecting(false);
        return;
      }

      // Get session token from localStorage if available
      const sessionToken = localStorage.getItem("github_session_token");

      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };

      if (sessionToken) {
        headers["X-Session-Token"] = sessionToken;
      }

      const res = await fetch(`${API_BASE_URL}/auth/github`, {
        method: "POST",
        credentials: "include",
        headers,
      });

      console.log("GitHub OAuth response:", {
        status: res.status,
        ok: res.ok,
        statusText: res.statusText,
        url: res.url,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const errorMessage =
          body.error || body.message || `HTTP ${res.status}: ${res.statusText}`;
        const details = body.details || {};
        console.error("GitHub OAuth failed:", {
          status: res.status,
          body,
          errorMessage,
          details,
        });

        // Provide more helpful error messages
        let userFriendlyError = errorMessage;
        if (
          res.status === 500 &&
          body.error === "GitHub OAuth not configured"
        ) {
          userFriendlyError =
            "Backend configuration error: GitHub OAuth credentials are missing. Please check backend environment variables.";
        } else if (res.status === 0 || res.status === 503) {
          userFriendlyError = `Cannot connect to backend at ${API_BASE_URL}. Please verify VITE_API_BASE_URL is set correctly.`;
        }

        throw new Error(userFriendlyError);
      }

      const data = (await res.json()) as { authorizeUrl: string };
      console.log("Received authorization URL, redirecting...", {
        urlLength: data.authorizeUrl?.length,
        urlPreview: data.authorizeUrl?.substring(0, 80) + "...",
      });

      if (!data.authorizeUrl) {
        throw new Error("No authorization URL received from server");
      }

      window.location.href = data.authorizeUrl;
    } catch (e) {
      console.error("GitHub connect failed", e);
      const errorMessage =
        e instanceof Error ? e.message : "GitHub connection failed";
      setError(errorMessage);
      setIsConnecting(false);
    }
  };

  return (
    <div className="github-card">
      <div className="github-card-header">
        <div className="github-logo-circle">
          <span className="github-logo"></span>
        </div>
        <div>
          <h3 className="github-title">Connect GitHub Account</h3>
          <p className="github-subtitle">
            Import your repositories directly into your EulonAI knowledge graph.
          </p>
        </div>
      </div>

      {isConnected && user && (
        <div className="github-connected">
          <div className="github-user">
            {user.avatar_url && (
              <img
                src={user.avatar_url}
                alt={user.login}
                className="github-avatar"
              />
            )}
            <div>
              <div className="github-user-name">{user.name || user.login}</div>
              <div className="github-user-handle">@{user.login}</div>
            </div>
          </div>
          <span className="github-pill github-pill-success">
            GitHub Connected
          </span>
        </div>
      )}

      {!isConnected && (
        <button
          className="github-connect-button"
          onClick={handleConnect}
          disabled={isConnecting}
        >
          <span className="github-button-icon"></span>
          {isConnecting ? "Connecting…" : "Sign in with GitHub"}
        </button>
      )}

      {error && <div className="github-error">{error}</div>}

      <style>{`
        .github-card {
          background: radial-gradient(circle at top left, rgba(139, 92, 246, 0.35), transparent),
                      radial-gradient(circle at bottom right, rgba(16, 185, 129, 0.25), transparent),
                      #020617;
          border-radius: 12px;
          padding: 1rem 1.25rem;
          border: 1px solid rgba(148, 163, 184, 0.35);
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.9);
          color: #e5e7eb;
        }

        .github-card-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
        }

        .github-logo-circle {
          width: 40px;
          height: 40px;
          border-radius: 999px;
          background: radial-gradient(circle at 30% 30%, #22d3ee, #1d4ed8);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 18px rgba(34, 211, 238, 0.7);
        }

        .github-logo {
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 1.2rem;
        }

        .github-title {
          margin: 0;
          font-size: 1rem;
          font-weight: 600;
          color: #f9fafb;
        }

        .github-subtitle {
          margin: 0.1rem 0 0;
          font-size: 0.8rem;
          color: #9ca3af;
        }

        .github-connect-button {
          margin-top: 0.5rem;
          width: 100%;
          border-radius: 999px;
          padding: 0.5rem 0.875rem;
          border: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          background: linear-gradient(135deg, #0f766e, #22c55e);
          color: #ecfdf5;
          font-weight: 600;
          font-size: 0.85rem;
          cursor: pointer;
          box-shadow: 0 8px 25px rgba(34, 197, 94, 0.45);
          transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
        }

        .github-connect-button:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 18px 45px rgba(34, 197, 94, 0.6);
          filter: brightness(1.05);
        }

        .github-connect-button:disabled {
          opacity: 0.6;
          cursor: default;
          box-shadow: none;
        }

        .github-button-icon {
          font-size: 1.1rem;
        }

        .github-connected {
          margin-top: 0.75rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .github-user {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }

        .github-avatar {
          width: 32px;
          height: 32px;
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.6);
        }

        .github-user-name {
          font-size: 0.9rem;
          font-weight: 600;
        }

        .github-user-handle {
          font-size: 0.8rem;
          color: #9ca3af;
        }

        .github-pill {
          border-radius: 999px;
          padding: 0.25rem 0.7rem;
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }

        .github-pill-success {
          background: rgba(16, 185, 129, 0.12);
          border: 1px solid rgba(52, 211, 153, 0.8);
          color: #6ee7b7;
        }

        .github-error {
          margin-top: 0.5rem;
          font-size: 0.8rem;
          color: #fecaca;
        }

        /* Responsive styles */
        @media (max-width: 768px) {
          .github-card {
            padding: 1rem 1.25rem;
            border-radius: 12px;
          }

          .github-card-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.75rem;
          }

          .github-logo-circle {
            width: 36px;
            height: 36px;
          }

          .github-title {
            font-size: 1rem;
          }

          .github-subtitle {
            font-size: 0.85rem;
          }

          .github-connect-button {
            padding: 0.6rem 0.9rem;
            font-size: 0.85rem;
          }

          .github-connected {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.5rem;
          }

          .github-user {
            width: 100%;
          }

          .github-pill {
            align-self: flex-start;
          }
        }

        @media (max-width: 480px) {
          .github-card {
            padding: 0.875rem 1rem;
          }

          .github-title {
            font-size: 0.95rem;
          }

          .github-subtitle {
            font-size: 0.8rem;
          }

          .github-connect-button {
            padding: 0.55rem 0.8rem;
            font-size: 0.8rem;
          }
        }
      `}</style>
    </div>
  );
};

export default GitHubConnectCard;
