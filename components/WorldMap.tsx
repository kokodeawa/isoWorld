import React from 'react';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, MapPin } from 'lucide-react';
import { ExplorationData } from '../types';
import { NavigationDirection } from './UIOverlay';

interface WorldMapProps {
  explorationData: ExplorationData;
  onNavigate: (direction: NavigationDirection) => void;
}

export const WorldMap: React.FC<WorldMapProps> = ({ explorationData, onNavigate }) => {
  const { current, visited } = explorationData;

  const getChunkKey = (x: number, y: number) => `${x},${y}`;

  const navDirections: { dir: NavigationDirection; coords: [number, number]; icon: React.ReactNode; pos: string }[] = [
    { dir: 'north', coords: [0, -1], icon: <ArrowUp size={16} />, pos: 'col-start-2 row-start-1' },
    { dir: 'south', coords: [0, 1], icon: <ArrowDown size={16} />, pos: 'col-start-2 row-start-3' },
    { dir: 'west', coords: [-1, 0], icon: <ArrowLeft size={16} />, pos: 'col-start-1 row-start-2' },
    { dir: 'east', coords: [1, 0], icon: <ArrowRight size={16} />, pos: 'col-start-3 row-start-2' },
  ];

  return (
    <div className="bg-slate-900/80 backdrop-blur text-white p-2 rounded-xl border border-slate-700 shadow-xl">
      <div className="grid grid-cols-3 grid-rows-3 gap-1 w-28 h-28 sm:w-32 sm:h-32">
        {navDirections.map(({ dir, coords, icon, pos }) => {
          const targetX = current.x + coords[0];
          const targetY = current.y + coords[1];
          const isVisited = visited.has(getChunkKey(targetX, targetY));
          
          return (
            <button
              key={dir}
              onClick={() => onNavigate(dir)}
              className={`flex items-center justify-center rounded-lg transition-colors active:scale-95 ${pos}
                ${isVisited 
                  ? 'bg-slate-700/60 hover:bg-slate-700/90 text-slate-300' 
                  : 'bg-emerald-800/50 hover:bg-emerald-800/80 text-emerald-300 animate-pulse'
                }`}
              title={`Go ${dir} ${isVisited ? '(Explored)' : '(Unexplored)'}`}
            >
              {icon}
            </button>
          );
        })}

        {/* Center Tile (Current Position) */}
        <div className="col-start-2 row-start-2 bg-emerald-500/80 rounded-lg flex flex-col items-center justify-center text-white shadow-inner shadow-emerald-900/50">
           <MapPin size={18} className="mb-0.5" />
           <span className="text-[10px] font-bold tracking-tighter">{current.x}, {current.y}</span>
        </div>
      </div>
    </div>
  );
};
