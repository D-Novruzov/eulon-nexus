import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { KnowledgeGraph, GraphNode, GraphRelationship } from '../../../core/graph/types.ts';

interface GraphVisualizationProps {
  graph: KnowledgeGraph;
  onNodeSelect?: (nodeId: string | null, event?: MouseEvent) => void;
  selectedNodeId?: string | null;
  className?: string;
  style?: React.CSSProperties;
}

interface RenderNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  nodeType: string;
  color: string;
  size: number;
}

interface RenderLink extends d3.SimulationLinkDatum<RenderNode> {
  id: string;
  source: string | RenderNode;
  target: string | RenderNode;
  color: string;
  width: number;
  dash?: string;
}

const palette: Record<string, string> = {
  project: '#22d3ee',
  folder: '#f97316',
  file: '#38bdf8',
  class: '#ec4899',
  interface: '#f472b6',
  function: '#a855f7',
  method: '#c084fc',
  variable: '#94a3b8',
  default: '#818cf8',
};

const linkPalette: Record<string, { color: string; dash?: string }> = {
  contains: { color: '#22c55e' },
  calls: { color: '#f87171', dash: '5,5' },
  imports: { color: '#a5b4fc', dash: '3,3' },
  inherits: { color: '#38bdf8' },
  default: { color: 'rgba(148,163,184,0.35)' },
};

const GraphVisualization: React.FC<GraphVisualizationProps> = ({
  graph,
  onNodeSelect,
  selectedNodeId,
  className = '',
  style = {},
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<RenderNode, RenderLink> | null>(null);
  const nodesRef = useRef<RenderNode[]>([]);
  const linksRef = useRef<RenderLink[]>([]);
  const transformRef = useRef(d3.zoomIdentity);
  const animationFrame = useRef<number | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<RenderNode | null>(null);

  const getContext = () => canvasRef.current?.getContext('2d', { alpha: false });

  const convertToRenderData = (kg: KnowledgeGraph) => {
    const nodes: RenderNode[] = kg.nodes.map((node: GraphNode) => {
      const color = palette[node.label.toLowerCase()] || palette.default;
      let baseSize = 7;
      switch (node.label.toLowerCase()) {
        case 'project':
          baseSize = 20;
          break;
        case 'folder':
          baseSize = 14;
          break;
        case 'file':
          baseSize = 11;
          break;
        case 'class':
        case 'interface':
          baseSize = 12;
          break;
        case 'function':
        case 'method':
          baseSize = 8;
          break;
        default:
          baseSize = 7;
      }

      const label = getDisplayName(node);

      return {
        id: node.id,
        label,
        nodeType: node.label.toLowerCase(),
        color,
        size: baseSize,
      };
    });

    const links: RenderLink[] = kg.relationships
      .filter((rel: GraphRelationship) => rel.source !== rel.target)
      .map((rel) => {
        const relType = rel.type.toLowerCase();
        const paletteEntry = linkPalette[relType] || linkPalette.default;
        return {
          id: rel.id,
          source: rel.source,
          target: rel.target,
          color: paletteEntry.color,
          width: relType === 'contains' || relType === 'inherits' ? 2 : 1,
          dash: paletteEntry.dash,
          relationshipType: relType,
        } as RenderLink;
      });

    return { nodes, links };
  };

  const getDisplayName = (node: GraphNode) => {
    const propName = node.properties.name;
    if (propName && typeof propName === 'string') {
      if (node.label.toLowerCase() === 'file') {
        return propName.split('/').pop() || propName;
      }
      return propName;
    }
    if (node.label.toLowerCase() === 'file' && node.properties.filePath) {
      const path = node.properties.filePath as string;
      return path.split('/').pop() || path;
    }
    const fallback = node.id.replace(/^(file|function|class|method)_?/i, '');
    return fallback.substring(0, 32);
  };

  const draw = () => {
    const context = getContext();
    if (!context || !canvasRef.current) return;

    const { width, height } = canvasRef.current;
    context.save();
    context.clearRect(0, 0, width, height);

    // Background gradient
    const gradient = context.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.2,
      width / 2,
      height / 2,
      Math.max(width, height)
    );
    gradient.addColorStop(0, 'rgba(15, 23, 42, 0.95)');
    gradient.addColorStop(1, 'rgba(2, 6, 23, 1)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    // Grid overlay
    context.strokeStyle = 'rgba(148,163,184,0.08)';
    context.lineWidth = 1;
    const gridSize = 80;
    for (let x = 0; x < width; x += gridSize) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }

    context.translate(transformRef.current.x, transformRef.current.y);
    context.scale(transformRef.current.k, transformRef.current.k);

    // Draw links
    context.lineCap = 'round';
    linksRef.current.forEach((link) => {
      const source = link.source as RenderNode;
      const target = link.target as RenderNode;
      if (!source || !target || source.x === undefined || target.x === undefined) return;

      context.strokeStyle = link.color;
      context.lineWidth = link.width;
      if (link.dash) {
        const [a, b] = link.dash.split(',').map((n) => Number(n.trim()));
        context.setLineDash([a, b]);
      } else {
        context.setLineDash([]);
      }
      context.globalAlpha = 0.8;
      context.beginPath();
      context.moveTo(source.x!, source.y!);
      context.lineTo(target.x!, target.y!);
      context.stroke();
    });

    context.setLineDash([]);

    // Draw nodes
    nodesRef.current.forEach((node) => {
      if (node.x === undefined || node.y === undefined) return;
      context.beginPath();
      const radius = node.size;
      const gradient = context.createRadialGradient(node.x, node.y, radius * 0.2, node.x, node.y, radius * 1.4);
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.4, node.color);
      gradient.addColorStop(1, 'rgba(0,0,0,0.4)');
      context.fillStyle = gradient;
      context.strokeStyle = 'rgba(255,255,255,0.25)';
      context.lineWidth = 1;
      context.globalAlpha = node.id === selectedNodeId ? 1 : 0.9;
      context.arc(node.x, node.y, radius, 0, Math.PI * 2);
      context.fill();
      context.stroke();

      if (node.id === hoveredNode?.id) {
        context.strokeStyle = '#fcd34d';
        context.lineWidth = 2;
        context.globalAlpha = 1;
        context.stroke();
      }
    });

    // Labels
    context.font = '500 12px "Space Grotesk", Inter, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'top';
    nodesRef.current.forEach((node) => {
      if (node.x === undefined || node.y === undefined) return;
      context.fillStyle = 'rgba(255,255,255,0.85)';
      context.globalAlpha = node.id === selectedNodeId ? 1 : 0.85;
      context.fillText(node.label, node.x!, node.y! + node.size + 4);
    });

    context.restore();
  };

  const initializeSimulation = (data: { nodes: RenderNode[]; links: RenderLink[] }) => {
    if (simulationRef.current) {
      simulationRef.current.stop();
      simulationRef.current = null;
    }

    nodesRef.current = data.nodes;
    linksRef.current = data.links;

    const simulation = d3
      .forceSimulation<RenderNode>(nodesRef.current)
      .force(
        'link',
        d3
          .forceLink<RenderNode, RenderLink>(linksRef.current)
          .id((d) => d.id)
          .distance((link) => {
            switch (link.relationshipType) {
              case 'contains':
                return 80;
              case 'imports':
                return 140;
              case 'calls':
                return 110;
              default:
                return 120;
            }
          })
          .strength(0.7)
      )
      .force(
        'charge',
        d3.forceManyBody().strength((d) => {
          switch (d.nodeType) {
            case 'project':
              return -800;
            case 'folder':
              return -500;
            case 'file':
              return -350;
            default:
              return -250;
          }
        })
      )
      .force('center', d3.forceCenter(canvasRef.current!.width / 2, canvasRef.current!.height / 2))
      .force(
        'collision',
        d3.forceCollide().radius((node) => node.size + 6)
      )
      .alphaDecay(0.03);

    let lastDraw = 0;
    simulation.on('tick', () => {
      const now = performance.now();
      if (now - lastDraw < 16) return; // ~60fps
      lastDraw = now;
      scheduleDraw();
      if (simulation.alpha() < 0.04) {
        simulation.alphaTarget(0);
        simulation.stop();
      }
    });

    simulationRef.current = simulation;
  };

  const scheduleDraw = () => {
    if (animationFrame.current) {
      cancelAnimationFrame(animationFrame.current);
    }
    animationFrame.current = requestAnimationFrame(() => draw());
  };

  const handleResize = () => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const { width, height } = parent.getBoundingClientRect();
    canvas.width = width;
    canvas.height = height;
    overlay.style.width = `${width}px`;
    overlay.style.height = `${height}px`;
    scheduleDraw();
  };

  const handlePointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (event.clientX - rect.left - transformRef.current.x) / transformRef.current.k;
    const y = (event.clientY - rect.top - transformRef.current.y) / transformRef.current.k;

    let closest: RenderNode | null = null;
    let minDistance = Infinity;
    nodesRef.current.forEach((node) => {
      if (node.x === undefined || node.y === undefined) return;
      const distance = Math.hypot(node.x - x, node.y - y);
      if (distance < node.size + 6 && distance < minDistance) {
        closest = node;
        minDistance = distance;
      }
    });
    setHoveredNode(closest);
    scheduleDraw();
  };

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!hoveredNode) {
      onNodeSelect?.(null, event.nativeEvent);
      return;
    }
    onNodeSelect?.(hoveredNode.id, event.nativeEvent);
    scheduleDraw();
  };

  useEffect(() => {
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const zoom = d3
      .zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => {
        transformRef.current = event.transform;
        scheduleDraw();
      });
    const selection = d3.select(canvas);
    selection.call(zoom as any);
    selection.on('dblclick.zoom', null);
    selection.on('dblclick', () => {
      selection.transition().duration(400).call(zoom.transform, d3.zoomIdentity);
    });

    return () => {
      selection.on('.zoom', null);
    };
  }, []);

  useEffect(() => {
    if (!graph || !graph.nodes.length || !canvasRef.current) return;
    const data = convertToRenderData(graph);
    initializeSimulation(data);
    setIsReady(true);
    scheduleDraw();

    return () => {
      simulationRef.current?.stop();
      simulationRef.current = null;
      if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
    };
  }, [graph]);

  useEffect(() => {
    scheduleDraw();
  }, [selectedNodeId, hoveredNode]);

  const containerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    position: 'relative',
    borderRadius: '28px',
    overflow: 'hidden',
    ...style,
  };

  return (
    <div className={`graph-visualization ${className}`} style={containerStyle}>
      <canvas
        ref={canvasRef}
        className="graph-canvas"
        style={{ width: '100%', height: '100%', display: 'block' }}
        onPointerMove={handlePointer}
        onPointerLeave={() => {
          if (hoveredNode) {
            setHoveredNode(null);
            scheduleDraw();
          }
        }}
        onClick={handleClick}
      />

      <div ref={overlayRef} className="graph-overlay" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'rgba(15,23,42,0.85)',
            color: '#f8fafc',
            borderRadius: '16px',
            padding: '12px 16px',
            border: '1px solid rgba(99,102,241,0.35)',
            fontSize: '12px',
            boxShadow: '0 20px 40px rgba(2,6,23,0.45)',
            lineHeight: 1.6,
            pointerEvents: 'auto',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '6px', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '11px' }}>
            Navigation
          </div>
          <div>• Drag background to pan</div>
          <div>• Scroll to zoom</div>
          <div>• Double-click background to reset</div>
          <div>• Drag nodes to pin positions</div>
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: '16px',
            right: '16px',
            background: 'rgba(2,6,23,0.85)',
            color: '#f8fafc',
            borderRadius: '16px',
            padding: '12px 16px',
            border: '1px solid rgba(99,102,241,0.35)',
            fontSize: '12px',
            boxShadow: '0 20px 40px rgba(2,6,23,0.45)',
            pointerEvents: 'auto',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '8px', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '11px' }}>
            Legend
          </div>
          {[
            { label: 'Project', color: palette.project },
            { label: 'Folder', color: palette.folder },
            { label: 'File', color: palette.file },
            { label: 'Class / Interface', color: palette.class },
            { label: 'Function / Method', color: palette.function },
          ].map((item) => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: item.color,
                  boxShadow: `0 0 8px ${item.color}88`,
                }}
              />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {!isReady && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#cbd5f5',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: 'rgba(15,23,42,0.85)',
            padding: '12px 16px',
            borderRadius: '12px',
            border: '1px solid rgba(99,102,241,0.35)',
          }}
        >
          <div
            style={{
              width: '20px',
              height: '20px',
              border: '2px solid rgba(148,163,184,0.6)',
              borderTop: '2px solid transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
          Initializing knowledge graph…
        </div>
      )}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default GraphVisualization;
