// @ts-nocheck
import React, { useState, useCallback, useRef } from "react";

interface RepositoryInputProps {
  onZipFileSubmit: (file: File) => void;
  disabled?: boolean;
}

const RepositoryInput: React.FC<RepositoryInputProps> = ({
  onZipFileSubmit,
  disabled = false,
}) => {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    (file: File) => {
      if (file && file.name.endsWith(".zip")) {
        setSelectedFile(file);
        onZipFileSubmit(file);
      } else {
        alert("Please select a valid ZIP file (.zip extension required)");
      }
    },
    [onZipFileSubmit]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDropZoneClick = useCallback(() => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [disabled]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="repository-input">
      <div className="upload-header">
        <h3>📦 Upload Project ZIP File</h3>
        <p>Drag and drop your project ZIP file below or click to browse</p>
      </div>

      <div
        className={`zip-drop-zone ${dragOver ? "drag-over" : ""} ${
          selectedFile ? "has-file" : ""
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleDropZoneClick}
      >
        <div className="drop-zone-content">
          {!selectedFile ? (
            <>
              <div className="drop-zone-icon">{dragOver ? "📥" : "📁"}</div>
              <div className="drop-zone-text">
                <div className="drop-zone-primary">
                  {dragOver
                    ? "Drop your ZIP file here!"
                    : "Drop a ZIP file here or click to browse"}
                </div>
                <div className="drop-zone-secondary">
                  Upload a ZIP file containing your project source code
                </div>
              </div>
              <div className="browse-button">📂 Browse Files</div>
            </>
          ) : (
            <div className="selected-file-info">
              <div className="file-icon">✅</div>
              <div className="file-details">
                <div className="file-name">{selectedFile.name}</div>
                <div className="file-size">
                  {formatFileSize(selectedFile.size)}
                </div>
              </div>
              <div className="file-actions">
                <button
                  className="change-file-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                  disabled={disabled}
                >
                  🔄 Change File
                </button>
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            onChange={handleFileInput}
            disabled={disabled}
            className="file-input"
            id="zip-file-input"
          />
        </div>
      </div>

      <div className="upload-tips">
        <div className="tip-item">
          <span className="tip-icon">💡</span>
          <span>Supported format: ZIP files only</span>
        </div>
        <div className="tip-item">
          <span className="tip-icon">⚡</span>
          <span>Processing typically takes just a few seconds</span>
        </div>
        <div className="tip-item">
          <span className="tip-icon">🔒</span>
          <span>Your files are processed locally in your browser</span>
        </div>
      </div>

      <style>{`
        .repository-input {
          margin-bottom: 0;
          background: radial-gradient(circle at top left, rgba(79,70,229,0.45), transparent 55%),
                      radial-gradient(circle at bottom right, rgba(34,197,94,0.35), transparent 55%),
                      rgba(15,23,42,0.98);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 16px 45px rgba(15,23,42,0.9);
          border: 1px solid rgba(148,163,184,0.5);
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
        }
        
        .upload-header {
          padding: 0.75rem 1rem 0.5rem 1rem;
          text-align: left;
          background: linear-gradient(135deg, #0f172a 0%, #1d4ed8 45%, #22c55e 100%);
          color: #e5e7eb;
          box-sizing: border-box;
        }
        
        .upload-header h3 {
          margin: 0 0 0.3rem 0;
          font-size: 1.1rem;
          font-weight: 600;
        }
        
        .upload-header p {
          margin: 0;
          opacity: 0.9;
          font-size: 0.85rem;
          color: #cbd5f5;
        }
        
        .zip-drop-zone {
          margin: 0.75rem 1rem;
          border: 2px dashed rgba(148,163,184,0.7);
          border-radius: 8px;
          padding: 1rem;
          text-align: center;
          cursor: pointer;
          transition: all 0.25s ease;
          position: relative;
          background: radial-gradient(circle at top, rgba(15,23,42,0.95), rgba(15,23,42,0.98));
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
        }
        
        .zip-drop-zone:hover {
          border-color: rgba(129,140,248,0.95);
          background: radial-gradient(circle at top, rgba(30,64,175,0.85), rgba(15,23,42,0.98));
          transform: translateY(-1px);
          box-shadow: 0 18px 45px rgba(30,64,175,0.6);
        }
        
        .zip-drop-zone.drag-over {
          border-color: rgba(34,197,94,0.95);
          background: radial-gradient(circle at top, rgba(22,163,74,0.35), rgba(15,23,42,0.98));
          transform: scale(1.01);
          box-shadow: 0 20px 55px rgba(34,197,94,0.55);
        }
        
        .zip-drop-zone.has-file {
          border-color: rgba(34,197,94,0.95);
          background: radial-gradient(circle at top, rgba(22,163,74,0.25), rgba(15,23,42,0.98));
          border-style: solid;
        }
        
        .drop-zone-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
        }
        
        .drop-zone-icon {
          font-size: 3rem;
          opacity: 0.7;
          transition: all 0.3s ease;
        }
        
        .zip-drop-zone:hover .drop-zone-icon,
        .zip-drop-zone.drag-over .drop-zone-icon {
          transform: scale(1.1);
          opacity: 1;
        }
        
        .drop-zone-text {
          text-align: center;
        }
        
        .drop-zone-primary {
          font-size: 0.95rem;
          font-weight: 600;
          color: #e5e7eb;
          margin-bottom: 0.3rem;
        }
        
        .drop-zone-secondary {
          font-size: 0.85rem;
          color: #9ca3af;
        }
        
        .browse-button {
          padding: 0.5rem 1.2rem;
          background: linear-gradient(135deg, #6366f1 0%, #22d3ee 50%, #22c55e 100%);
          color: #f9fafb;
          border-radius: 999px;
          font-weight: 600;
          font-size: 0.8rem;
          transition: all 0.2s ease;
          box-shadow: 0 10px 30px rgba(56,189,248,0.55);
          white-space: nowrap;
        }
        
        .zip-drop-zone:hover .browse-button {
          transform: translateY(-1px);
          box-shadow: 0 6px 12px -2px rgba(0, 0, 0, 0.15);
        }
        
        .selected-file-info {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.75rem 1rem;
          background: rgba(15,23,42,0.95);
          border-radius: 8px;
          box-shadow: 0 10px 30px rgba(15,23,42,0.8);
          min-width: 0;
          max-width: 100%;
          width: 100%;
          border: 1px solid rgba(148,163,184,0.6);
          box-sizing: border-box;
        }
        
        .file-icon {
          font-size: 2rem;
        }
        
        .file-details {
          flex: 1;
          text-align: left;
        }
        
        .file-name {
          font-weight: 600;
          color: #e5e7eb;
          margin-bottom: 0.25rem;
          word-break: break-word;
        }
        
        .file-size {
          font-size: 0.875rem;
          color: #9ca3af;
        }
        
        .change-file-button {
          padding: 0.5rem 1rem;
          background: rgba(15,23,42,0.9);
          color: #e5e7eb;
          border: 1px solid rgba(148,163,184,0.7);
          border-radius: 999px;
          cursor: pointer;
          font-size: 0.85rem;
          font-weight: 500;
          transition: all 0.2s ease;
        }
        
        .change-file-button:hover:not(:disabled) {
          background: rgba(30,64,175,0.9);
          border-color: rgba(129,140,248,0.95);
        }
        
        .change-file-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .file-input {
          display: none;
        }
        
        .upload-tips {
          padding: 0.75rem 1rem 1rem 1rem;
          background: radial-gradient(circle at left, rgba(15,23,42,1), rgba(15,23,42,0.98));
          border-top: 1px solid rgba(15,23,42,1);
          box-sizing: border-box;
        }
        
        .tip-item {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          margin-bottom: 0.5rem;
          font-size: 0.8rem;
          color: #9ca3af;
        }
        
        .tip-item:last-child {
          margin-bottom: 0;
        }
        
        .tip-icon {
          font-size: 1rem;
          opacity: 0.9;
        }
        
        @media (max-width: 640px) {
          .zip-drop-zone {
            margin: 1rem;
            padding: 2rem 1rem;
          }
          
          .upload-header {
            padding: 1.5rem 1rem 1rem 1rem;
          }
          
          .selected-file-info {
            flex-direction: column;
            text-align: center;
            gap: 1rem;
            min-width: auto;
          }
          
          .file-details {
            text-align: center;
          }
        }
      `}</style>
    </div>
  );
};

export default RepositoryInput;
