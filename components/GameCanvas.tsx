
import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { IsoEngine } from '../services/IsoEngine';
import { CameraState, GameMode, BlockType, ChunkCoordinates } from '../types';

interface GameCanvasProps {
  camera: CameraState;
  mode: GameMode;
  renderHeight: number;
  worldSeed: string;
  onInventoryUpdate: (block: BlockType) => void;
  onStatsUpdate: (fps: number, blocks: number, chunk: ChunkCoordinates) => void;
  setCamera: (cam: Partial<CameraState>) => void;
}

export interface GameCanvasRef {
  engine: IsoEngine | null;
}

export const GameCanvas = forwardRef<GameCanvasRef, GameCanvasProps>(({ 
  camera, mode, renderHeight, worldSeed, onInventoryUpdate, onStatsUpdate, setCamera 
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<IsoEngine | null>(null);
  const requestRef = useRef<number>();
  
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  useImperativeHandle(ref, () => ({
    get engine() {
      return engineRef.current;
    }
  }));

  useEffect(() => {
    if (!canvasRef.current) return;
    
    const engine = new IsoEngine(canvasRef.current, worldSeed);
    engineRef.current = engine;
    
    engine.onInventoryUpdate = onInventoryUpdate;
    engine.onStatsUpdate = onStatsUpdate;

    const handleResize = () => engine.resize();
    window.addEventListener('resize', handleResize);

    const animate = (time: number) => {
      engine.render(time);
      requestRef.current = requestAnimationFrame(animate);
    };
    requestRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [worldSeed, onInventoryUpdate, onStatsUpdate]);

  useEffect(() => {
    engineRef.current?.setCamera(camera);
  }, [camera]);

  useEffect(() => {
    engineRef.current?.setMode(mode);
  }, [mode]);

  useEffect(() => {
    engineRef.current?.setRenderHeight(renderHeight);
  }, [renderHeight]);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    isDragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    engineRef.current?.handleInput(true);
  };

  const handlePointerUp = () => {
    isDragging.current = false;
    engineRef.current?.handleInput(false);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!engineRef.current || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    engineRef.current.checkInteraction(e.clientX - rect.left, e.clientY - rect.top);

    if (isDragging.current && mode === GameMode.CAMERA) {
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      setCamera({ x: camera.x + dx, y: camera.y + dy });
      lastMouse.current = { x: e.clientX, y: e.clientY };
    }
  };
  
  const handleWheel = (e: React.WheelEvent) => {
    const newZoom = Math.max(0.5, Math.min(3, camera.zoom - e.deltaY * 0.001));
    setCamera({ zoom: newZoom });
  };

  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full touch-none cursor-crosshair"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerUp}
      onWheel={handleWheel}
    />
  );
});
