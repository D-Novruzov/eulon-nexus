import React from 'react';

export type ExportFormat = 'csv' | 'json';

interface ExportFormatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFormat: (format: ExportFormat) => void;
  projectName?: string;
}

const ExportFormatModal: React.FC<ExportFormatModalProps> = ({
  isOpen,
  onClose,
  onSelectFormat,
  projectName
}) => {
  if (!isOpen) return null;

  const handleFormatSelect = (format: ExportFormat) => {
    onSelectFormat(format);
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        maxWidth: '500px',
        width: '90%',
        padding: '24px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px'
        }}>
          <h2 style={{
            fontSize: '20px',
            fontWeight: '600',
            color: '#111827',
            margin: 0
          }}>
            Export Knowledge Graph
          </h2>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'none',
              color: '#9CA3AF',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              transition: 'color 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.color = '#4B5563'}
            onMouseOut={(e) => e.currentTarget.style.color = '#9CA3AF'}
            aria-label="Close modal"
          >
            <svg style={{ width: '24px', height: '24px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p style={{
          color: '#4B5563',
          marginBottom: '24px',
          lineHeight: '1.5'
        }}>
          Choose the export format for your knowledge graph:
          {projectName && (
            <span style={{
              display: 'block',
              fontSize: '14px',
              color: '#6B7280',
              marginTop: '4px'
            }}>
              Project: {projectName}
            </span>
          )}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* CSV Option */}
          <button
            onClick={() => handleFormatSelect('csv')}
            style={{
              width: '100%',
              padding: '16px',
              border: '1px solid #E5E7EB',
              borderRadius: '8px',
              backgroundColor: 'white',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = '#93C5FD';
              e.currentTarget.style.backgroundColor = '#EFF6FF';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = '#E5E7EB';
              e.currentTarget.style.backgroundColor = 'white';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{
                flexShrink: 0,
                width: '40px',
                height: '40px',
                backgroundColor: '#D1FAE5',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <svg style={{ width: '24px', height: '24px', color: '#059669' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{
                  fontWeight: '500',
                  color: '#111827',
                  marginBottom: '4px',
                  fontSize: '16px'
                }}>
                  📊 CSV Format
                </h3>
                <p style={{
                  fontSize: '14px',
                  color: '#6B7280',
                  margin: 0,
                  lineHeight: '1.4'
                }}>
                  For Neo4j, Amazon Neptune, and other graph databases
                </p>
              </div>
            </div>
          </button>

          {/* JSON Option */}
          <button
            onClick={() => handleFormatSelect('json')}
            style={{
              width: '100%',
              padding: '16px',
              border: '1px solid #E5E7EB',
              borderRadius: '8px',
              backgroundColor: 'white',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = '#C4B5FD';
              e.currentTarget.style.backgroundColor = '#F5F3FF';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = '#E5E7EB';
              e.currentTarget.style.backgroundColor = 'white';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{
                flexShrink: 0,
                width: '40px',
                height: '40px',
                backgroundColor: '#E9D5FF',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <svg style={{ width: '24px', height: '24px', color: '#7C3AED' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{
                  fontWeight: '500',
                  color: '#111827',
                  marginBottom: '4px',
                  fontSize: '16px'
                }}>
                  📄 JSON Format
                </h3>
                <p style={{
                  fontSize: '14px',
                  color: '#6B7280',
                  margin: 0,
                  lineHeight: '1.4'
                }}>
                  Complete export with metadata - perfect for backup
                </p>
              </div>
            </div>
          </button>
        </div>

        <div style={{
          marginTop: '20px',
          paddingTop: '16px',
          borderTop: '1px solid #E5E7EB'
        }}>
          <div style={{
            fontSize: '12px',
            color: '#6B7280',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }}>
            <p style={{ margin: 0 }}>
              <strong>CSV:</strong> Two files (nodes.csv, relationships.csv)
            </p>
            <p style={{ margin: 0 }}>
              <strong>JSON:</strong> Single file with complete graph data
            </p>
          </div>
        </div>

        <div style={{
          marginTop: '20px',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              border: 'none',
              background: 'none',
              color: '#6B7280',
              cursor: 'pointer',
              fontSize: '14px',
              borderRadius: '4px',
              transition: 'color 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.color = '#111827'}
            onMouseOut={(e) => e.currentTarget.style.color = '#6B7280'}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportFormatModal;
