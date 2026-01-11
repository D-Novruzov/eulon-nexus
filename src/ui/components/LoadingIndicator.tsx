/**
 * LoadingIndicator Component
 * 
 * A comprehensive loading indicator that shows:
 * - Current stage of processing
 * - Progress percentage (if available)
 * - Visual spinner
 * - Detailed status messages
 */

import React from "react";

export interface LoadingIndicatorProps {
  isVisible: boolean;
  message?: string;
  progress?: number; // 0-100
  stage?: string; // e.g., "Downloading", "Processing", "Analyzing"
  subMessage?: string; // Additional details
  showSpinner?: boolean;
  size?: "small" | "medium" | "large";
}

const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  isVisible,
  message = "Loading...",
  progress,
  stage,
  subMessage,
  showSpinner = true,
  size = "medium",
}) => {
  if (!isVisible) return null;

  const sizeStyles = {
    small: { width: "16px", height: "16px", fontSize: "12px" },
    medium: { width: "24px", height: "24px", fontSize: "14px" },
    large: { width: "32px", height: "32px", fontSize: "16px" },
  };

  const currentSize = sizeStyles[size];

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "16px",
          padding: "32px",
          maxWidth: "500px",
          width: "90%",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
          textAlign: "center",
        }}
      >
        {showSpinner && (
          <div
            style={{
              width: currentSize.width,
              height: currentSize.height,
              border: `3px solid #e5e7eb`,
              borderTop: `3px solid #3b82f6`,
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 20px",
            }}
          />
        )}

        {stage && (
          <div
            style={{
              fontSize: "12px",
              color: "#6b7280",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              marginBottom: "8px",
              fontWeight: "600",
            }}
          >
            {stage}
          </div>
        )}

        <div
          style={{
            fontSize: currentSize.fontSize,
            fontWeight: "600",
            color: "#1f2937",
            marginBottom: progress !== undefined ? "16px" : subMessage ? "8px" : "0",
          }}
        >
          {message}
        </div>

        {subMessage && (
          <div
            style={{
              fontSize: "13px",
              color: "#6b7280",
              marginTop: "8px",
            }}
          >
            {subMessage}
          </div>
        )}

        {progress !== undefined && (
          <div style={{ marginTop: "20px" }}>
            <div
              style={{
                width: "100%",
                height: "8px",
                backgroundColor: "#e5e7eb",
                borderRadius: "4px",
                overflow: "hidden",
                marginBottom: "8px",
              }}
            >
              <div
                style={{
                  width: `${progress}%`,
                  height: "100%",
                  backgroundColor: "#3b82f6",
                  borderRadius: "4px",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "#6b7280",
                fontWeight: "500",
              }}
            >
              {Math.round(progress)}%
            </div>
          </div>
        )}

        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
};

export default LoadingIndicator;

