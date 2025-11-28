
import React from 'react';
import { Camera, Pickaxe, RotateCcw, RotateCw, Layers, ChevronUp, ChevronDown } from 'lucide-react';
import { BlockType, GameMode, CameraState, ExplorationData } from '../types';
import { BLOCK_DEFINITIONS, WORLD_HEIGHT } from '../constants';
import { WorldMap } from './WorldMap';

export type NavigationDirection = 'north' | 'south' | 'east' | 'west';

interface UIOverlayProps {
  mode: GameMode;
  setMode: (m: GameMode) => void;
  inventory: Record<BlockType, number>;
  explorationData: ExplorationData;
  camera: CameraState;
  setCamera: (c: Partial<CameraState>) => void;
  renderHeight: number;
  setRenderHeight: (h: number) => void;
  onNavigate: (direction: NavigationDirection) => void;
}

export const UIOverlay: React.FC<UIOverlayProps> = ({ 
  mode, setMode, inventory, explorationData, camera, setCamera, renderHeight, setRenderHeight, onNavigate
}) => {
  
  const rotate = (delta: number) => {
    setCamera({ angle: camera.angle + delta });
  };

  const changeLayer = (delta: number) => {
    setRenderHeight(Math.min(WORLD_HEIGHT, Math.max(1, renderHeight + delta)));
  };

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 sm:p-6 select-none z-10">
      {/* Top Header & Controls */}
      <div className="flex justify-between items-start pointer-events-auto">
        {/* World Map */}
        <WorldMap explorationData={explorationData} onNavigate={onNavigate} />

        {/* Rotation Controls */}
        <div className="flex flex-col gap-2 bg-slate-900/80 backdrop-blur p-2 rounded-xl border border-slate-700 shadow-xl">
          <div className="flex gap-2">
            <button 
              onClick={() => rotate(-Math.PI / 8)}
              className="p-2 sm:p-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors active:scale-95"
            >
              <RotateCcw size={18} className="sm:w-5 sm:h-5" />
            </button>
            <button 
               onClick={() => rotate(Math.PI / 8)}
               className="p-2 sm:p-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors active:scale-95"
            >
              <RotateCw size={18} className="sm:w-5 sm:h-5" />
            </button>
          </div>
           <input 
              type="range" 
              min="0" 
              max={Math.PI * 2} 
              step="0.01" 
              value={camera.angle}
              onChange={(e) => setCamera({ angle: parseFloat(e.target.value) })}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500 touch-pan-x"
            />
        </div>
      </div>

      {/* Layer Control - Right Side */}
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

      {/* Bottom Area */}
      <div className="flex flex-col sm:flex-row items-center sm:items-end justify-center w-full relative mb-safe pb-2">
        
        {/* Inventory - Center */}
        <div className="pointer-events-auto mb-20 sm:mb-0 sm:absolute sm:bottom-0 sm:left-1/2 sm:-translate-x-1/2">
           <div className="flex gap-2 sm:gap-3 bg-slate-900/90 backdrop-blur p-2 sm:p-3 rounded-2xl border border-slate-700 shadow-2xl overflow-x-auto max-w-[80vw]">
             {[BlockType.GRASS, BlockType.DIRT, BlockType.STONE, BlockType.LOG, BlockType.LEAVES].map(type => (
               <div key={type} className="flex flex-col items-center min-w-[50px] sm:min-w-[60px]">
                  <div 
                    className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg shadow-inner mb-1"
                    style={{ backgroundColor: BLOCK_DEFINITIONS[type].colors.top }}
                  />
                  <span className="text-[10px] sm:text-xs font-bold text-slate-300">{BLOCK_DEFINITIONS[type].name}</span>
                  <span className="text-[10px] sm:text-xs text-emerald-400 font-mono">{inventory[type] || 0}</span>
               </div>
             ))}
           </div>
        </div>

        {/* Action Button - Bottom Right */}
        <div className="pointer-events-auto absolute bottom-0 right-0 sm:right-6">
          <button
            onClick={() => setMode(mode === GameMode.CAMERA ? GameMode.MINING : GameMode.CAMERA)}
            className={`
              w-14 h-14 sm:w-16 sm:h-16 rounded-2xl shadow-2xl flex items-center justify-center transition-all transform active:scale-90
              ${mode === GameMode.MINING ? 'bg-red-500 hover:bg-red-600 ring-4 ring-red-500/30' : 'bg-blue-500 hover:bg-blue-600 ring-4 ring-blue-500/30'}
            `}
          >
            {mode === GameMode.CAMERA ? <Camera size={28} className="sm:w-8 sm:h-8" color="white" /> : <Pickaxe size={28} className="sm:w-8 sm:h-8" color="white" />}
          </button>
          <div className="mt-2 text-center text-[10px] sm:text-xs font-bold text-white bg-black/50 rounded px-2 py-1">
            {mode}
          </div>
        </div>
        
      </div>
    </div>
  );
};
