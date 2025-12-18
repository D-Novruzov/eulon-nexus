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
      const res = await fetch(`${API_BASE_URL}/integrations/github/me`, {
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
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
        onConnected();
      } else {
        setIsConnected(false);
        setUser(undefined);
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
      // After OAuth callback, wait a bit for session to be fully established
      // then retry with exponential backoff
      const retryWithBackoff = async (attempt = 0) => {
        const maxAttempts = 3;
        const delay = Math.min(1000 * Math.pow(2, attempt), 3000); // Max 3 seconds
        
        if (attempt > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        try {
          await refreshStatus();
        } catch (e) {
          if (attempt < maxAttempts) {
            console.log(`Retrying GitHub status check (attempt ${attempt + 1}/${maxAttempts})...`);
            await retryWithBackoff(attempt + 1);
          } else {
            console.error("Failed to refresh GitHub auth status after retries", e);
          }
        }
      };
      
      void retryWithBackoff();
      url.searchParams.delete("github_connected");
      window.history.replaceState({}, document.title, url.toString());
    } else {
      void refreshStatus();
    }
  }, [refreshStatus]);

  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      setError(null);

      console.log("Initiating GitHub OAuth flow...", { apiBaseUrl: API_BASE_URL });
      
      const res = await fetch(`${API_BASE_URL}/auth/github`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      console.log("GitHub OAuth response:", { status: res.status, ok: res.ok });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const errorMessage = body.error || body.message || `HTTP ${res.status}: ${res.statusText}`;
        console.error("GitHub OAuth failed:", { status: res.status, body, errorMessage });
        throw new Error(errorMessage);
      }

      const data = (await res.json()) as { authorizeUrl: string };
      console.log("Redirecting to GitHub authorization URL");
      
      if (!data.authorizeUrl) {
        throw new Error("No authorization URL received from server");
      }
      
      window.location.href = data.authorizeUrl;
    } catch (e) {
      console.error("GitHub connect failed", e);
      const errorMessage = e instanceof Error ? e.message : "GitHub connection failed";
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
          border-radius: 18px;
          padding: 1.5rem 1.75rem;
          border: 1px solid rgba(148, 163, 184, 0.35);
          box-shadow: 0 18px 45px rgba(15, 23, 42, 0.9);
          color: #e5e7eb;
        }

        .github-card-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
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
          font-size: 1.15rem;
          font-weight: 600;
          color: #f9fafb;
        }

        .github-subtitle {
          margin: 0.15rem 0 0;
          font-size: 0.9rem;
          color: #9ca3af;
        }

        .github-connect-button {
          margin-top: 0.75rem;
          width: 100%;
          border-radius: 999px;
          padding: 0.65rem 1rem;
          border: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          background: linear-gradient(135deg, #0f766e, #22c55e);
          color: #ecfdf5;
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          box-shadow: 0 12px 35px rgba(34, 197, 94, 0.45);
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
      `}</style>
    </div>
  );
};

export default GitHubConnectCard;
