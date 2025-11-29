
import React, { Component, useState, useCallback, useEffect, ErrorInfo, ReactNode, useRef } from 'react';
import { GameCanvas, GameCanvasRef } from './components/GameCanvas';
import { UIOverlay } from './components/UIOverlay';
import { BlockType, CameraState, ChunkCoordinates, GameMode, EngineStats, ExplorationData, NavigationDirection, TimeState, InventorySlot } from './types';
import { WORLD_HEIGHT, TILE_SIZE } from './constants';
import { WorldCreationMenu } from './components/WorldCreationMenu';
import { Inventory } from './game/Inventory';
import { BLOCK_TO_ITEM, ITEMS } from './game/itemRegistry';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  readonly props: Readonly<ErrorBoundaryProps>;

  public state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

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

const INVENTORY_SIZE = 35; // 27 backpack + 8 hotbar

function Game({ worldName, worldSeed }: GameProps) {
  const [mode, setMode] = useState<GameMode>(GameMode.CAMERA);
  const [renderHeight, setRenderHeight] = useState<number>(WORLD_HEIGHT);
  const [stats, setStats] = useState<EngineStats>({ fps: 0, visibleBlocks: 0, chunk: {x: 0, y: 0} });
  const [explorationData, setExplorationData] = useState<ExplorationData>({ visited: new Set(['0,0']), current: { x: 0, y: 0 } });
  const [timeState, setTimeState] = useState<TimeState | null>(null);
  const gameCanvasRef = useRef<GameCanvasRef>(null);

  // --- NUEVO SISTEMA DE INVENTARIO ---
  const inventoryRef = useRef<Inventory | null>(null);
  const [inventorySlots, setInventorySlots] = useState<(InventorySlot | null)[]>(new Array(INVENTORY_SIZE).fill(null));
  const [selectedHotbarIndex, setSelectedHotbarIndex] = useState(0); // Índice 0-7 para la hotbar
  const [selectedBlockForPlacement, setSelectedBlockForPlacement] = useState<BlockType | null>(null);

  const inventorySaveKey = `isoworld_inventory_${worldSeed}`;

  // Cargar inventario al iniciar
  useEffect(() => {
    try {
      const savedData = localStorage.getItem(inventorySaveKey);
      const savedSlots = savedData ? JSON.parse(savedData) : null;
      inventoryRef.current = new Inventory(INVENTORY_SIZE, savedSlots);
      setInventorySlots(inventoryRef.current.slots);
    } catch (e) {
      console.error("Failed to load inventory:", e);
      inventoryRef.current = new Inventory(INVENTORY_SIZE);
      setInventorySlots(inventoryRef.current.slots);
    }
  }, [worldSeed, inventorySaveKey]);

  // Guardar inventario cuando cambie
  useEffect(() => {
    try {
        if (inventoryRef.current) {
            localStorage.setItem(inventorySaveKey, JSON.stringify(inventoryRef.current.slots));
        }
    } catch (e) {
        console.error("Failed to save inventory:", e);
    }
  }, [inventorySlots, inventorySaveKey]);


  const [camera, setCameraState] = useState<CameraState>({
    x: 0,
    y: 0, // Will be calculated on init
    zoom: 1.2,
    angle: Math.PI / 4,
    pitch: Math.PI / 6, // 30 degrees default for isometric view
  });

  const updateCamera = useCallback((newCam: Partial<CameraState>) => {
    setCameraState(prev => ({ ...prev, ...newCam }));
  }, []);

  const handleAngleChange = useCallback((newAngle: number) => {
    const engine = gameCanvasRef.current?.engine;
    if (engine) {
      const nextState = engine.rotateCameraAroundScreenCenter(newAngle);
      setCameraState(nextState);
    } else {
      setCameraState(prev => ({ ...prev, angle: newAngle }));
    }
  }, []);

  const handlePitchChange = useCallback((newPitch: number) => {
     setCameraState(prev => ({ ...prev, pitch: newPitch }));
  }, []);

  const centerCameraOnSurface = useCallback(() => {
    const engine = gameCanvasRef.current?.engine;
    if (engine) {
      const avgHeight = engine.getCurrentChunkAverageHeight();
      setCameraState(prev => {
        const targetY = avgHeight * TILE_SIZE * prev.zoom;
        return { ...prev, y: targetY };
      });
    }
  }, []);
  
  const handleEngineReady = useCallback(() => {
    if (gameCanvasRef.current?.engine) {
      setExplorationData(gameCanvasRef.current.engine.getExplorationData());
      centerCameraOnSurface();
    }
  }, [centerCameraOnSurface]);

  // --- Callbacks del motor de juego ---
  const handleInventoryUpdate = useCallback((minedBlock: BlockType) => {
    const itemId = BLOCK_TO_ITEM[minedBlock];
    if (itemId && inventoryRef.current) {
        inventoryRef.current.addItem(itemId, 1);
        setInventorySlots([...inventoryRef.current.slots]); // Clonar para forzar re-render
    }
  }, []);
  
  const handleBlockPlaced = useCallback((placedBlock: BlockType) => {
    if (inventoryRef.current) {
        inventoryRef.current.removeItemFromSlot(selectedHotbarIndex, 1);
        setInventorySlots([...inventoryRef.current.slots]);
    }
  }, [selectedHotbarIndex]);

  const handleStatsUpdate = useCallback((fps: number, blocks: number, chunk: ChunkCoordinates) => {
    setStats({ fps, visibleBlocks: blocks, chunk });
  }, []);
  
  const handleTimeUpdate = useCallback((newTimeState: TimeState) => {
    setTimeState(newTimeState);
  }, []);

  // Actualizar el bloque que el motor puede colocar cuando cambia la selección de la hotbar
  useEffect(() => {
      const engine = gameCanvasRef.current?.engine;
      if (engine && inventoryRef.current) {
          const selectedSlot = inventoryRef.current.getSlot(selectedHotbarIndex);
          let blockToPlace: BlockType | null = null;
          if (selectedSlot) {
              const itemDef = ITEMS[selectedSlot.itemId];
              if (itemDef && itemDef.type === 'BLOCK' && itemDef.blockType) {
                  blockToPlace = itemDef.blockType;
              }
          }
          engine.selectedBlockType = blockToPlace; // El motor usa esta propiedad para saber qué colocar
          setSelectedBlockForPlacement(blockToPlace);
      }
  }, [selectedHotbarIndex, inventorySlots]);

  const handleNavigate = useCallback((direction: NavigationDirection) => {
    const engine = gameCanvasRef.current?.engine;
    if (engine) {
      engine.navigateTo(direction);
      setExplorationData(engine.getExplorationData());
      centerCameraOnSurface(); 
      updateCamera({ x: 0 }); 
    }
  }, [updateCamera, centerCameraOnSurface]);

  if (!inventoryRef.current) {
      return null; // O un spinner de carga
  }

  return (
    <div className="relative w-screen h-[100dvh] bg-slate-900 overflow-hidden font-sans">
      <GameCanvas 
        ref={gameCanvasRef}
        worldSeed={worldSeed}
        mode={mode}
        camera={camera}
        renderHeight={renderHeight}
        selectedBlock={selectedBlockForPlacement}
        setCamera={updateCamera}
        onInventoryUpdate={handleInventoryUpdate}
        onBlockPlaced={handleBlockPlaced}
        onStatsUpdate={handleStatsUpdate}
        onTimeUpdate={handleTimeUpdate}
        onReady={handleEngineReady}
      />
      <UIOverlay 
        mode={mode}
        setMode={setMode}
        inventory={inventoryRef.current}
        selectedHotbarIndex={selectedHotbarIndex}
        onSelectHotbarIndex={setSelectedHotbarIndex}
        explorationData={explorationData}
        camera={camera}
        setCamera={updateCamera}
        renderHeight={renderHeight}
        setRenderHeight={setRenderHeight}
        onNavigate={handleNavigate}
        onAngleChange={handleAngleChange}
        onPitchChange={handlePitchChange}
        timeState={timeState}
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