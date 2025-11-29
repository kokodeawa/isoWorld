import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { IsoEngine } from '../services/IsoEngine';
import { CameraState, GameMode, BlockType, ChunkCoordinates, TimeState } from '../types';

interface GameCanvasProps {
  camera: CameraState;
  mode: GameMode;
  renderHeight: number;
  worldSeed: string;
  selectedBlock: BlockType | null;
  onInventoryUpdate: (block: BlockType) => void;
  onBlockPlaced: (block: BlockType) => void;
  onStatsUpdate: (fps: number, blocks: number, chunk: ChunkCoordinates) => void;
  onTimeUpdate: (timeState: TimeState) => void;
  onReady: () => void;
  setCamera: (cam: Partial<CameraState>) => void;
}

export interface GameCanvasRef {
  engine: IsoEngine | null;
}

export const GameCanvas = forwardRef<GameCanvasRef, GameCanvasProps>(({ 
  camera, mode, renderHeight, worldSeed, selectedBlock, onInventoryUpdate, onBlockPlaced, onStatsUpdate, onTimeUpdate, onReady, setCamera 
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<IsoEngine | null>(null);
  const requestRef = useRef<number>(0);
  
  // Input state refs
  const isInteracting = useRef(false);
  const pointers = useRef<React.PointerEvent<HTMLCanvasElement>[]>([]);
  const lastPanPoint = useRef({ x: 0, y: 0 });
  const lastPinchDist = useRef<number>(0);
  
  // Mobile Tap/Hold Logic
  const touchStartTime = useRef<number>(0);
  const touchStartPos = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useImperativeHandle(ref, () => ({
    get engine() {
      return engineRef.current;
    }
  }));

  // --- ENGINE LIFECYCLE MANAGEMENT ---
  // This effect creates and manages the engine instance.
  // CRITICAL: It ONLY depends on `worldSeed`. This ensures the engine is created
  // once per world and is not destroyed and recreated on other prop changes (like hotbar selection),
  // which was the cause of the camera reset and mining cancellation bug.
  useEffect(() => {
    if (!canvasRef.current) return;
    
    if (engineRef.current) {
        engineRef.current.dispose();
    }

    const engine = new IsoEngine(canvasRef.current, worldSeed);
    engineRef.current = engine;
    
    // Call the onReady callback once the engine is initialized.
    onReady();

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
      engine.dispose();
    };
  }, [worldSeed, onReady]);

  // --- ENGINE PROPERTY UPDATES ---
  // These effects update the properties on the STABLE engine instance
  // without triggering a re-instantiation.

  useEffect(() => {
    if (engineRef.current) engineRef.current.onInventoryUpdate = onInventoryUpdate;
  }, [onInventoryUpdate]);
  
  useEffect(() => {
    if (engineRef.current) engineRef.current.onBlockPlaced = onBlockPlaced;
  }, [onBlockPlaced]);

  useEffect(() => {
    if (engineRef.current) engineRef.current.onStatsUpdate = onStatsUpdate;
  }, [onStatsUpdate]);

  useEffect(() => {
    if (engineRef.current) engineRef.current.onTimeUpdate = onTimeUpdate;
  }, [onTimeUpdate]);

  useEffect(() => {
    if (engineRef.current) engineRef.current.selectedBlockType = selectedBlock;
  }, [selectedBlock]);

  useEffect(() => {
    engineRef.current?.setCamera(camera);
  }, [camera]);

  useEffect(() => {
    engineRef.current?.setMode(mode);
  }, [mode]);

  useEffect(() => {
    engineRef.current?.setRenderHeight(renderHeight);
  }, [renderHeight]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    isInteracting.current = true;
    pointers.current.push(e);

    // Update position immediately on touch down so mining target is correct
    if (engineRef.current && canvasRef.current) {
         const rect = canvasRef.current.getBoundingClientRect();
         engineRef.current.updateMousePosition(e.clientX - rect.left, e.clientY - rect.top, e.pointerType as 'mouse' | 'touch');
    }

    if (mode === GameMode.CAMERA) {
      if (pointers.current.length === 1) { // Pan start
        lastPanPoint.current = { x: e.clientX, y: e.clientY };
        touchStartPos.current = { x: e.clientX, y: e.clientY };
        isDragging.current = false;
      } else if (pointers.current.length === 2) { // Zoom start
        const [p1, p2] = pointers.current;
        lastPinchDist.current = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
      }
    } else if (mode === GameMode.EDIT) {
      if (e.pointerType === 'mouse') {
          if (e.button === 0) { // Left Click -> Mine
             engineRef.current?.handleInput(true);
          } else if (e.button === 2) { // Right Click -> Place
             engineRef.current?.placeBlock();
          }
      } else {
          // Touch Logic
          touchStartTime.current = performance.now();
          touchStartPos.current = { x: e.clientX, y: e.clientY };
          isDragging.current = false;
          
          // Long press to mine
          longPressTimer.current = setTimeout(() => {
              if (!isDragging.current) {
                  if (navigator.vibrate) navigator.vibrate(50);
                  engineRef.current?.handleInput(true); // Start mining
              }
          }, 500);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    canvasRef.current?.releasePointerCapture(e.pointerId);
    pointers.current = pointers.current.filter(p => p.pointerId !== e.pointerId);

    if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
    }

    if (mode === GameMode.EDIT) {
        engineRef.current?.handleInput(false); // Stop mining if active
        
        if (e.pointerType !== 'mouse') {
            // Touch Tap Logic
            if (!isDragging.current) {
                const duration = performance.now() - touchStartTime.current;
                if (duration < 500) {
                    engineRef.current?.placeBlock();
                }
            }
        }
    }

    if (pointers.current.length < 2) lastPinchDist.current = 0;
    
    if (pointers.current.length < 1) {
      isInteracting.current = false;
    } else if (pointers.current.length === 1 && mode === GameMode.CAMERA) {
      // If we were zooming and one finger lifts, reset pan point to the remaining finger
      lastPanPoint.current = { x: pointers.current[0].clientX, y: pointers.current[0].clientY };
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!engineRef.current || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    // Use the continuous hit-testing update instead of one-off check
    engineRef.current.updateMousePosition(e.clientX - rect.left, e.clientY - rect.top, e.pointerType as 'mouse' | 'touch');

    if (!isInteracting.current) return;
    
    // Check drag threshold for tap cancellation
    if (pointers.current.length === 1) {
        const dist = Math.hypot(e.clientX - touchStartPos.current.x, e.clientY - touchStartPos.current.y);
        if (dist > 10) {
            isDragging.current = true;
            // Only cancel the long press timer if we haven't started mining yet
            if (longPressTimer.current && !engineRef.current.isInputActive) {
                clearTimeout(longPressTimer.current);
                longPressTimer.current = null;
            }
        }
    }
    
    const pointerIndex = pointers.current.findIndex(p => p.pointerId === e.pointerId);
    if (pointerIndex !== -1) {
      pointers.current[pointerIndex] = e;
    }

    // Allow panning if in Camera Mode OR if in Edit mode and dragging (to look around)
    // BUT NOT IF MINING (isInputActive is true)
    const isMining = engineRef.current.isInputActive;
    const canPan = mode === GameMode.CAMERA || (mode === GameMode.EDIT && isDragging.current && !isMining);

    if (pointers.current.length === 1 && canPan) {
      // Panning
      const dx = e.clientX - lastPanPoint.current.x;
      const dy = e.clientY - lastPanPoint.current.y;
      setCamera({ x: camera.x + dx, y: camera.y + dy });
      lastPanPoint.current = { x: e.clientX, y: e.clientY };

    } else if (pointers.current.length === 2) {
      // Pinch to zoom towards midpoint
      const [p1, p2] = pointers.current;
      const newDist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);

      if (lastPinchDist.current > 0) {
        const delta = newDist - lastPinchDist.current;
        const oldZoom = camera.zoom;
        const newZoom = Math.max(0.5, Math.min(3, oldZoom + delta * 0.01));

        if(Math.abs(oldZoom - newZoom) > 0.001) {
            const midX = (p1.clientX + p2.clientX) / 2 - rect.left;
            const midY = (p1.clientY + p2.clientY) / 2 - rect.top;

            const worldX = (midX - rect.width / 2 - camera.x) / oldZoom;
            const worldY = (midY - rect.height / 2 - camera.y) / oldZoom;

            const newCamX = midX - rect.width / 2 - worldX * newZoom;
            const newCamY = midY - rect.height / 2 - worldY * newZoom;
            
            setCamera({ zoom: newZoom, x: newCamX, y: newCamY });
        }
      }
      lastPinchDist.current = newDist;
    }
  };
  
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!canvasRef.current || !engineRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    engineRef.current.updateMousePosition(mouseX, mouseY, 'mouse');
    
    const oldZoom = camera.zoom;
    const newZoom = Math.max(0.5, Math.min(3, oldZoom - e.deltaY * 0.0015));

    const worldX = (mouseX - rect.width / 2 - camera.x) / oldZoom;
    const worldY = (mouseY - rect.height / 2 - camera.y) / oldZoom;
    
    const newCamX = mouseX - rect.width / 2 - worldX * newZoom;
    const newCamY = mouseY - rect.height / 2 - worldY * newZoom;

    setCamera({ zoom: newZoom, x: newCamX, y: newCamY });
  };
  
  const handlePointerLeave = (e: React.PointerEvent<HTMLCanvasElement>) => {
     handlePointerUp(e);
     if (engineRef.current) engineRef.current.updateMousePosition(-1, -1, 'mouse');
  };

  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full touch-none cursor-crosshair"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onWheel={handleWheel}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
});