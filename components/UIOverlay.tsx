import React, { useState, useEffect } from 'react';
import { Camera, Hammer, RotateCcw, RotateCw, Layers, ChevronUp, ChevronDown, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Package, X, Sun, Moon } from 'lucide-react';
// FIX: Import BlockType to resolve undefined name error.
import { GameMode, CameraState, ExplorationData, NavigationDirection, TimeState, TimeOfDay, InventorySlot, BlockType } from '../types';
import { BLOCK_DEFINITIONS, WORLD_HEIGHT } from '../constants';
import { WorldMap } from './WorldMap';
import { Inventory } from '../game/Inventory';
import { ITEMS } from '../game/itemRegistry';

interface UIOverlayProps {
  mode: GameMode;
  setMode: (m: GameMode) => void;
  inventory: Inventory;
  selectedHotbarIndex: number;
  onSelectHotbarIndex: (index: number) => void;
  explorationData: ExplorationData;
  camera: CameraState;
  setCamera: (c: Partial<CameraState>) => void;
  renderHeight: number;
  setRenderHeight: (h: number) => void;
  onNavigate: (direction: NavigationDirection) => void;
  onAngleChange: (newAngle: number) => void;
  onPitchChange: (newPitch: number) => void;
  timeState: TimeState | null;
}

const TimeOfDayDisplay: React.FC<{timeState: TimeState}> = ({ timeState }) => {
    const isNight = timeState.timeOfDay === TimeOfDay.NIGHT || timeState.timeOfDay === TimeOfDay.SUNSET;
    const Icon = isNight ? Moon : Sun;
    const iconColor = isNight ? 'text-blue-300' : 'text-yellow-300';

    const circumference = 2 * Math.PI * 18; // r = 18

    return (
        <div className="bg-slate-900/80 backdrop-blur p-2 rounded-xl border border-slate-700 shadow-xl flex items-center justify-center w-14 h-14 relative">
            <svg className="absolute inset-0 w-full h-full transform -rotate-90" viewBox="0 0 40 40">
                <circle
                    cx="20"
                    cy="20"
                    r="18"
                    strokeWidth="3"
                    className="text-slate-700"
                    stroke="currentColor"
                    fill="transparent"
                />
                <circle
                    cx="20"
                    cy="20"
                    r="18"
                    strokeWidth="3"
                    className="text-emerald-500"
                    stroke="currentColor"
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference - timeState.cycleProgress * circumference}
                    strokeLinecap="round"
                />
            </svg>
            <div className="relative flex flex-col items-center justify-center">
                <Icon size={20} className={iconColor} />
                <span className="text-xs font-bold text-slate-300 capitalize mt-0.5">
                    {timeState.timeOfDay.toLowerCase()}
                </span>
            </div>
        </div>
    );
};

/**
 * Componente Hotbar
 * Muestra las primeras 8 ranuras del inventario como una barra de acceso rápido.
 * Es responsivo: muestra 5 ranuras en pantallas pequeñas (móvil vertical) y 8 en grandes.
 */
const Hotbar: React.FC<{
    inventory: Inventory;
    selectedIndex: number;
    onSelect: (index: number) => void;
}> = ({ inventory, selectedIndex, onSelect }) => {
    const hotbarSlots = inventory.slots.slice(0, 8); // 8 slots para la hotbar

    return (
        <div className="flex items-center justify-center gap-1.5 p-1.5 bg-slate-900/90 backdrop-blur border border-slate-700 rounded-2xl shadow-xl">
            {hotbarSlots.map((slot, index) => {
                const item = slot ? ITEMS[slot.itemId] : null;

                // Clases responsivas: las ranuras 6, 7 y 8 (índices 5, 6, 7) se ocultan en pantallas pequeñas.
                const isExtraSlot = index >= 5;
                const responsiveClass = isExtraSlot ? 'hidden sm:flex' : 'flex';

                return (
                    <button
                        key={index}
                        onClick={() => onSelect(index)}
                        className={`w-14 h-14 rounded-xl border-2 transition-all duration-150 relative items-center justify-center overflow-hidden ${responsiveClass}
                            ${selectedIndex === index 
                                ? 'border-emerald-400 bg-slate-600/80 scale-105 shadow-lg' 
                                : 'border-slate-600 bg-slate-800/80 hover:bg-slate-700/80'}
                        `}
                        title={item?.name || 'Vacío'}
                    >
                        {item && (
                            <>
                                {/* Preview del ítem (color) */}
                                <div className="w-9 h-9 rounded-md" style={{ backgroundColor: item.texture }} />
                                
                                {/* Contador de ítems */}
                                <span className="absolute bottom-0.5 right-1.5 text-white font-bold text-sm" style={{ textShadow: '1px 1px 2px black' }}>
                                    {slot!.count > 1 ? slot!.count : ''}
                                </span>
                            </>
                        )}
                        {/* Número del slot */}
                         <span className="absolute top-0.5 left-1.5 text-slate-500 font-mono text-[10px]">
                            {index + 1}
                        </span>
                    </button>
                );
            })}
        </div>
    );
};


export const UIOverlay: React.FC<UIOverlayProps> = ({ 
  mode, setMode, inventory, selectedHotbarIndex, onSelectHotbarIndex, explorationData, camera, setCamera, renderHeight, setRenderHeight, onNavigate, onAngleChange, onPitchChange, timeState
}) => {
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key.toLowerCase() === 'e') {
        setIsInventoryOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setIsInventoryOpen(false);
      }
      // Permitir seleccionar slot de hotbar con los números 1-8
      if (!isNaN(parseInt(e.key)) && parseInt(e.key) >= 1 && parseInt(e.key) <= 8) {
        onSelectHotbarIndex(parseInt(e.key) - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSelectHotbarIndex]);

  const rotate = (delta: number) => {
    onAngleChange(camera.angle + delta);
  };
  
  const resetRotation = () => {
      onAngleChange(Math.PI / 4);
      onPitchChange(Math.PI / 6);
  };

  const changeLayer = (delta: number) => {
    setRenderHeight(Math.min(WORLD_HEIGHT, Math.max(1, renderHeight + delta)));
  };

  const allBlocks = Object.values(BLOCK_DEFINITIONS).filter(b => b.id !== BlockType.AIR);
  
  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 sm:p-6 select-none z-10">
      
      {isInventoryOpen && (
        <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border-2 border-slate-600 rounded-xl shadow-2xl max-w-2xl w-full m-4 flex flex-col max-h-[80vh]">
            
            {/* Header */}
            <div className="flex justify-between items-center p-4 border-b border-slate-700 bg-slate-800/50 rounded-t-xl">
              <h2 className="text-xl font-bold text-white flex items-center gap-2 font-mono tracking-wide">
                <Package className="text-emerald-400" /> INVENTARIO
              </h2>
              <button 
                onClick={() => setIsInventoryOpen(false)}
                className="p-1 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            
            {/* Grid Content */}
            <div className="p-6 overflow-y-auto custom-scrollbar">
               {/* Aquí iría la UI completa del inventario (hotbar + mochila) */}
               <p className="text-slate-400 text-center">La interfaz completa del inventario y crafteo estará aquí pronto.</p>
            </div>

            {/* Footer / Hint */}
            <div className="p-3 bg-slate-950/30 border-t border-slate-800 text-center text-xs text-slate-500 rounded-b-xl">
              Press <span className="text-emerald-400 font-bold">[E]</span> to close
            </div>
          </div>
        </div>
      )}

      {/* Top Header & Controls */}
      <div className="flex justify-between items-start pointer-events-auto">
        <div className="flex items-start gap-2">
            <WorldMap explorationData={explorationData} onNavigate={onNavigate} />
            {timeState && <TimeOfDayDisplay timeState={timeState} />}
        </div>

        {/* Rotation & Pitch Controls & Compass */}
        <div className="flex flex-col gap-2 bg-slate-900/80 backdrop-blur p-2 rounded-xl border border-slate-700 shadow-xl items-center w-36 sm:w-40">
           {/* Compass UI */}
           <div className="relative w-12 h-12 rounded-full border-2 border-slate-600 bg-slate-800 flex items-center justify-center mb-1 overflow-hidden">
                <div 
                    className="absolute inset-0 flex items-center justify-center transition-transform duration-100"
                    style={{ transform: `rotate(${-camera.angle}rad)` }}
                >
                    <div className="absolute top-1 text-[8px] font-bold text-red-500">N</div>
                    <div className="absolute bottom-1 text-[8px] font-bold text-slate-400">S</div>
                    <div className="absolute right-1 text-[8px] font-bold text-slate-400">E</div>
                    <div className="absolute left-1 text-[8px] font-bold text-slate-400">W</div>
                    <div className="w-0.5 h-full bg-transparent relative">
                        <div className="absolute top-0 left-0 w-full h-1/2 bg-red-500/50"></div>
                        <div className="absolute bottom-0 left-0 w-full h-1/2 bg-slate-400/20"></div>
                    </div>
                    <div className="w-full h-0.5 bg-slate-400/20 absolute"></div>
                </div>
                <div className="w-1 h-1 bg-white rounded-full z-10"></div>
           </div>

          <div className="flex gap-2 w-full justify-center">
            <button 
              onClick={() => rotate(-Math.PI / 8)}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors active:scale-95"
              title="Rotate Left"
            >
              <RotateCcw size={16} />
            </button>
            <button 
               onClick={resetRotation}
               className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors active:scale-95"
               title="Reset View"
            >
              <RotateCw size={16} className="rotate-180" />
            </button>
            <button 
               onClick={() => rotate(Math.PI / 8)}
               className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors active:scale-95"
               title="Rotate Right"
            >
              <RotateCw size={16} />
            </button>
          </div>
          
          <input 
              type="range" 
              min="0" 
              max={Math.PI * 2} 
              step="0.01" 
              value={camera.angle}
              onChange={(e) => onAngleChange(parseFloat(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500 touch-pan-x"
          />

          <div className="flex items-center justify-between w-full gap-2 mt-1">
             <ArrowDown size={14} className="text-slate-400" />
             <input 
                type="range" 
                min="0.1" 
                max={Math.PI / 2} 
                step="0.01" 
                value={camera.pitch}
                onChange={(e) => onPitchChange(parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500 touch-pan-x"
              />
             <ArrowUp size={14} className="text-slate-400" />
          </div>
        </div>
      </div>

      {/* Layer Control */}
      <div className="pointer-events-auto absolute right-4 sm:right-6 top-1/2 -translate-y-1/2 flex flex-col gap-2">
         <div className="bg-slate-900/80 backdrop-blur p-2 rounded-xl border border-slate-700 shadow-xl flex flex-col items-center gap-1">
            <button 
              onClick={() => changeLayer(1)}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg active:scale-95 disabled:opacity-50"
              disabled={renderHeight >= WORLD_HEIGHT}
            >
               <ChevronUp size={20} />
            </button>
            
            <div className="flex flex-col items-center py-1">
              <Layers size={16} className="text-slate-400 mb-1" />
              <span className="text-sm font-bold text-white">{renderHeight}</span>
              <span className="text-[10px] text-slate-500">LAYER</span>
            </div>

            <button 
              onClick={() => changeLayer(-1)}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg active:scale-95 disabled:opacity-50"
              disabled={renderHeight <= 1}
            >
               <ChevronDown size={20} />
            </button>
         </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center sm:items-end justify-center w-full relative mb-safe pb-2">
        
        <div className="pointer-events-auto mb-20 sm:mb-0 sm:absolute sm:bottom-0 sm:left-1/2 sm:-translate-x-1/2 flex items-end gap-2">
            <Hotbar inventory={inventory} selectedIndex={selectedHotbarIndex} onSelect={onSelectHotbarIndex} />
        </div>

        {/* Action Button - Edit/Camera Mode Switch */}
        <div className="pointer-events-auto absolute bottom-0 right-0 sm:right-6">
          <button
            onClick={() => setMode(mode === GameMode.CAMERA ? GameMode.EDIT : GameMode.CAMERA)}
            className={`
              w-14 h-14 sm:w-16 sm:h-16 rounded-2xl shadow-2xl flex items-center justify-center transition-all transform active:scale-90
              ${mode === GameMode.EDIT ? 'bg-amber-500 hover:bg-amber-600 ring-4 ring-amber-500/30' : 'bg-blue-500 hover:bg-blue-600 ring-4 ring-blue-500/30'}
            `}
          >
            {mode === GameMode.CAMERA ? <Camera size={28} className="sm:w-8 sm:h-8" color="white" /> : <Hammer size={28} className="sm:w-8 sm:h-8" color="white" />}
          </button>
          <div className="mt-2 text-center text-[10px] sm:text-xs font-bold text-white bg-black/50 rounded px-2 py-1">
            {mode === GameMode.CAMERA ? 'VIEW' : 'EDIT'}
          </div>
        </div>
        
      </div>
    </div>
  );
};
