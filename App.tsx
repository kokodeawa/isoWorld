import React, { useState, useCallback, useEffect, ErrorInfo, ReactNode, useRef } from 'react';
import { GameCanvas, GameCanvasRef } from './components/GameCanvas';
import { UIOverlay, NavigationDirection } from './components/UIOverlay';
import { BlockType, CameraState, ChunkCoordinates, GameMode, EngineStats, ExplorationData } from './types';
import { WORLD_HEIGHT } from './constants';
import { WorldCreationMenu } from './components/WorldCreationMenu';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // Fix: Initialize state as a class property. This modern syntax for React class components resolves TypeScript errors where `this.state` and `this.props` were not being recognized.
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("App Crash:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center w-screen h-screen bg-slate-900 text-white p-6 z-50 relative">
          <h2 className="text-xl font-bold text-red-400 mb-2">Something went wrong</h2>
          <p className="text-slate-400 text-sm mb-4 text-center max-w-md">
            The application encountered an error.
          </p>
          <pre className="bg-slate-800 p-4 rounded text-xs font-mono text-red-200 overflow-auto max-w-full mb-6 border border-slate-700">
            {this.state.error?.message}
          </pre>
          <button 
            onClick={this.handleReload}
            className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg transition-colors shadow-lg"
          >
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface GameProps {
  worldName: string;
  worldSeed: string;
}

function Game({ worldName, worldSeed }: GameProps) {
  const [mode, setMode] = useState<GameMode>(GameMode.CAMERA);
  const [renderHeight, setRenderHeight] = useState<number>(WORLD_HEIGHT);
  const [stats, setStats] = useState<EngineStats>({ fps: 0, visibleBlocks: 0, chunk: {x: 0, y: 0} });
  const [explorationData, setExplorationData] = useState<ExplorationData>({ visited: new Set(['0,0']), current: { x: 0, y: 0 } });
  const gameCanvasRef = useRef<GameCanvasRef>(null);

  const inventoryKey = `isovoxel_inventory_${worldName}`;

  const [inventory, setInventory] = useState<Record<BlockType, number>>(() => {
    try {
      const saved = localStorage.getItem(inventoryKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (e) { console.warn("Failed to load save:", e); }
    return { [BlockType.AIR]: 0, [BlockType.BEDROCK]: 0, [BlockType.GRASS]: 0, [BlockType.DIRT]: 0, [BlockType.STONE]: 0, [BlockType.LOG]: 0, [BlockType.LEAVES]: 0 };
  });

  const [camera, setCameraState] = useState<CameraState>({
    x: 0,
    y: 200,
    zoom: 1.2,
    angle: Math.PI / 4,
  });

  useEffect(() => {
    if (gameCanvasRef.current?.engine) {
      setExplorationData(gameCanvasRef.current.engine.getExplorationData());
    }
  }, [worldSeed]); // Runs when engine is created

  useEffect(() => {
    try {
      localStorage.setItem(inventoryKey, JSON.stringify(inventory));
    } catch (e) {
      console.error("Failed to save progress:", e);
    }
  }, [inventory, inventoryKey]);

  const updateCamera = useCallback((newCam: Partial<CameraState>) => {
    setCameraState(prev => ({ ...prev, ...newCam }));
  }, []);

  const handleInventoryUpdate = useCallback((block: BlockType) => {
    setInventory(prev => ({ ...prev, [block]: (prev[block] || 0) + 1 }));
  }, []);

  const handleStatsUpdate = useCallback((fps: number, blocks: number, chunk: ChunkCoordinates) => {
    setStats({ fps, visibleBlocks: blocks, chunk });
  }, []);

  const handleNavigate = useCallback((direction: NavigationDirection) => {
    const engine = gameCanvasRef.current?.engine;
    if (engine) {
      engine.navigateTo(direction);
      setExplorationData(engine.getExplorationData());
    }
  }, []);

  return (
    <div className="relative w-screen h-[100dvh] bg-slate-900 overflow-hidden font-sans">
      <GameCanvas 
        ref={gameCanvasRef}
        worldSeed={worldSeed}
        mode={mode}
        camera={camera}
        renderHeight={renderHeight}
        setCamera={updateCamera}
        onInventoryUpdate={handleInventoryUpdate}
        onStatsUpdate={handleStatsUpdate}
      />
      <UIOverlay 
        mode={mode}
        setMode={setMode}
        inventory={inventory}
        explorationData={explorationData}
        camera={camera}
        setCamera={updateCamera}
        renderHeight={renderHeight}
        setRenderHeight={setRenderHeight}
        onNavigate={handleNavigate}
      />
    </div>
  );
}

export default function App() {
  const [worldConfig, setWorldConfig] = useState<{ name: string; seed: string } | null>(null);

  const handleCreateWorld = (name: string, seed: string) => {
    setWorldConfig({ name, seed });
  };

  if (!worldConfig) {
    return <WorldCreationMenu onCreate={handleCreateWorld} />;
  }

  return (
    <ErrorBoundary>
      <Game worldName={worldConfig.name} worldSeed={worldConfig.seed} />
    </ErrorBoundary>
  );
}