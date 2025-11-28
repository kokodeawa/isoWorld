import React, { useState } from 'react';

interface WorldCreationMenuProps {
  onCreate: (worldName: string, seed: string) => void;
}

export const WorldCreationMenu: React.FC<WorldCreationMenuProps> = ({ onCreate }) => {
  const [worldName, setWorldName] = useState('My Voxel World');
  const [seed, setSeed] = useState('');

  const handleCreate = () => {
    // If seed is empty, generate a random one
    const finalSeed = seed.trim() === '' ? Math.random().toString(36).substring(7) : seed;
    onCreate(worldName, finalSeed);
  };

  return (
    <div className="flex items-center justify-center w-screen h-screen bg-slate-900 font-sans">
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-8 shadow-2xl w-full max-w-md m-4">
        <h1 className="text-3xl font-bold text-center mb-2 bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
          Create a New World
        </h1>
        <p className="text-slate-400 text-center mb-8">Define your new adventure.</p>
        
        <div className="space-y-6">
          <div>
            <label htmlFor="worldName" className="block text-sm font-medium text-slate-300 mb-2">
              World Name
            </label>
            <input
              type="text"
              id="worldName"
              value={worldName}
              onChange={(e) => setWorldName(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
              placeholder="e.g., My Awesome World"
            />
          </div>
          <div>
            <label htmlFor="seed" className="block text-sm font-medium text-slate-300 mb-2">
              Seed (optional)
            </label>
            <input
              type="text"
              id="seed"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
              placeholder="Leave blank for a random world"
            />
          </div>
        </div>
        
        <button
          onClick={handleCreate}
          disabled={!worldName.trim()}
          className="w-full mt-10 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-lg text-lg transition-all transform active:scale-95 disabled:bg-slate-700 disabled:cursor-not-allowed disabled:text-slate-400"
        >
          Create World
        </button>
      </div>
    </div>
  );
};
