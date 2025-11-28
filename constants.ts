
import { BlockConfig, BlockType } from './types';

export const MIN_CHUNK_SIZE = 32;
export const MAX_CHUNK_SIZE = 40;
export const WORLD_HEIGHT = 23; // Reduced from 26
export const TILE_SIZE = 24;

// Colors for the voxel engine
export const BLOCK_DEFINITIONS: Record<BlockType, BlockConfig> = {
  [BlockType.AIR]: {
    id: BlockType.AIR,
    name: 'Air',
    hp: 0,
    colors: { top: 'transparent', side1: 'transparent', side2: 'transparent' },
  },
  [BlockType.GRASS]: {
    id: BlockType.GRASS,
    name: 'Grass',
    hp: 30, 
    // Vivid natural green
    colors: { top: '#4ade80', side1: '#16a34a', side2: '#15803d' }, 
  },
  [BlockType.DIRT]: {
    id: BlockType.DIRT,
    name: 'Dirt',
    hp: 25,
    // Natural Brown soil
    colors: { top: '#b45309', side1: '#92400e', side2: '#78350f' },
  },
  [BlockType.STONE]: {
    id: BlockType.STONE,
    name: 'Stone',
    hp: 60,
    colors: { top: '#cbd5e1', side1: '#64748b', side2: '#475569' },
  },
  [BlockType.BEDROCK]: {
    id: BlockType.BEDROCK,
    name: 'Bedrock',
    hp: 99999, 
    colors: { top: '#334155', side1: '#1e293b', side2: '#0f172a' },
  },
  [BlockType.LOG]: {
    id: BlockType.LOG,
    name: 'Wood',
    hp: 40,
    // Oak-like wood colors
    colors: { top: '#d4a373', side1: '#925c38', side2: '#784a2b' },
  },
  [BlockType.LEAVES]: {
    id: BlockType.LEAVES,
    name: 'Leaves',
    hp: 10,
    // Lush foliage green
    colors: { top: '#86efac', side1: '#22c55e', side2: '#15803d' },
  },
};

export const MINE_SPEED = 1;
