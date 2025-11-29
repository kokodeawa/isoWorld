
import { BlockConfig, BlockType } from './types';

export const MIN_CHUNK_SIZE = 30; // Slightly smaller minimum
export const MAX_CHUNK_SIZE = 50; // Much larger maximum for variety
export const WORLD_HEIGHT = 70; // Increased from 45 to 70 for deeper maps
export const TILE_SIZE = 24;

// Colors for the voxel engine
export const BLOCK_DEFINITIONS: Record<BlockType, BlockConfig> = {
  [BlockType.AIR]: {
    id: BlockType.AIR,
    name: 'Air',
    hp: 0,
    hardness: 0,
    colors: { top: 'transparent', side1: 'transparent', side2: 'transparent' },
    lightDampening: 1,
    lightEmission: 0,
  },
  [BlockType.GRASS]: {
    id: BlockType.GRASS,
    name: 'Grass',
    hp: 30,
    hardness: 0, // Fast to break
    // Vivid natural green
    colors: { top: '#4ade80', side1: '#16a34a', side2: '#15803d' }, 
    lightDampening: 16,
    lightEmission: 0,
  },
  [BlockType.DIRT]: {
    id: BlockType.DIRT,
    name: 'Dirt',
    hp: 25,
    hardness: 1,
    // Natural Brown soil
    colors: { top: '#b45309', side1: '#92400e', side2: '#78350f' },
    lightDampening: 16,
    lightEmission: 0,
  },
  [BlockType.STONE]: {
    id: BlockType.STONE,
    name: 'Stone',
    hp: 60,
    hardness: 3,
    colors: { top: '#cbd5e1', side1: '#64748b', side2: '#475569' },
    lightDampening: 16,
    lightEmission: 0,
  },
  [BlockType.BEDROCK]: {
    id: BlockType.BEDROCK,
    name: 'Bedrock',
    hp: 99999, 
    hardness: 100,
    colors: { top: '#334155', side1: '#1e293b', side2: '#0f172a' },
    lightDampening: 16,
    lightEmission: 0,
  },
  [BlockType.LOG]: {
    id: BlockType.LOG,
    name: 'Wood',
    hp: 40,
    hardness: 2,
    // Oak-like wood colors
    colors: { top: '#d4a373', side1: '#925c38', side2: '#784a2b' },
    lightDampening: 16,
    lightEmission: 0,
  },
  [BlockType.LEAVES]: {
    id: BlockType.LEAVES,
    name: 'Leaves',
    hp: 10,
    hardness: 0,
    // Lush foliage green
    colors: { top: '#86efac', side1: '#22c55e', side2: '#15803d' },
    lightDampening: 2,
    lightEmission: 0,
  },
  [BlockType.SAND]: {
    id: BlockType.SAND,
    name: 'Sand',
    hp: 20,
    hardness: 1,
    // Sandy yellow/tan colors
    colors: { top: '#fde047', side1: '#ca8a04', side2: '#a16207' },
    lightDampening: 16,
    lightEmission: 0,
  },
  [BlockType.VINE]: {
    id: BlockType.VINE,
    name: 'Vines',
    hp: 5,
    hardness: 0,
    colors: { top: '#16a34a', side1: '#15803d', side2: '#14532d' },
    lightDampening: 2,
    lightEmission: 0,
  },
  [BlockType.ICE]: {
    id: BlockType.ICE,
    name: 'Ice',
    hp: 20,
    hardness: 1,
    // Solid colors to fix rendering glitches (no transparency)
    colors: { top: '#bae6fd', side1: '#7dd3fc', side2: '#38bdf8' },
    lightDampening: 2,
    lightEmission: 0,
  },
  [BlockType.SPRUCE_LOG]: {
    id: BlockType.SPRUCE_LOG,
    name: 'Spruce Log',
    hp: 40,
    hardness: 2,
    // Darker, desaturated brown
    colors: { top: '#5c4033', side1: '#4a342a', side2: '#3e2c22' },
    lightDampening: 16,
    lightEmission: 0,
  },
  [BlockType.SPRUCE_LEAVES]: {
    id: BlockType.SPRUCE_LEAVES,
    name: 'Spruce Leaves',
    hp: 10,
    hardness: 0,
    // Dark, bluish green
    colors: { top: '#2f4f4f', side1: '#2a4747', side2: '#253e3e' },
    lightDampening: 2,
    lightEmission: 0,
  },
  [BlockType.WOODEN_PLANKS]: {
    id: BlockType.WOODEN_PLANKS,
    name: 'Wooden Planks',
    hp: 35,
    hardness: 1.5,
    colors: { top: '#fef3c7', side1: '#d69e2e', side2: '#b45309' },
    lightDampening: 16,
    lightEmission: 0,
  },
};

export const MINE_SPEED = 1;
