
export enum BlockType {
  AIR = 0,
  GRASS = 1,
  DIRT = 2,
  STONE = 3,
  BEDROCK = 4,
  LOG = 5,
  LEAVES = 6,
  SAND = 7,
  VINE = 8,
  ICE = 9,
  SPRUCE_LOG = 10,
  SPRUCE_LEAVES = 11,
  WOODEN_PLANKS = 12,
}

export enum BiomeType {
  GRASSLAND = 'GRASSLAND',
  PRAIRIE = 'PRAIRIE',
  DESERT = 'DESERT',
  JUNGLE = 'JUNGLE',
  SNOW = 'SNOW',
}

export enum GameMode {
  CAMERA = 'CAMERA',
  EDIT = 'EDIT',
}

export enum TimeOfDay {
  SUNRISE = 'SUNRISE',
  DAY = 'DAY',
  SUNSET = 'SUNSET',
  NIGHT = 'NIGHT',
}

export interface TimeState {
  timeOfDay: TimeOfDay;
  ambientLight: number;
  skyColor: string;
  cycleProgress: number; // 0 to 1
}

export type NavigationDirection = 'north' | 'south' | 'east' | 'west';

export interface BlockConfig {
  id: BlockType;
  name: string;
  hp: number; // Kept for compatibility but logic uses hardness/time
  hardness: number; // Added for time-based mining
  colors: {
    top: string;
    side1: string; // Right face usually
    side2: string; // Left face usually
  };
  lightDampening: number; // How much light is lost passing through
  lightEmission: number; // How much light it emits
}

export interface BlockInstance {
  type: BlockType;
  hp: number; // Current HP
  isNatural?: boolean; // Flag for naturally generated blocks like trees
  variant?: 'SNOWY'; // Visual variant for blending biomes
}

// 3D Grid: Z -> Y -> X
export type WorldMap = (BlockInstance | null)[][][];

export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface CameraState {
  x: number; // Offset X
  y: number; // Offset Y
  zoom: number;
  angle: number; // Rotation in radians (0 to 2PI)
  pitch: number; // Vertical angle in radians (0 to PI/2)
}

export interface ChunkCoordinates {
  x: number;
  y: number;
}

export interface EngineStats {
  fps: number;
  visibleBlocks: number;
  chunk: ChunkCoordinates;
}

export interface ExplorationData {
  visited: Set<string>;
  current: ChunkCoordinates;
}

// --- NEW TYPES FOR SURVIVAL SYSTEM ---

/** Defines the category of an item. */
export type ItemType = 'BLOCK' | 'ITEM' | 'TOOL';

/**
 * Defines the static properties of an item in the game.
 */
export interface ItemDefinition {
  id: number;
  name: string;
  type: ItemType;
  maxStack: number;
  texture: string; // Placeholder: can be a hex color or an asset name
  blockType?: BlockType; // The block to place if the item is of type 'BLOCK'
}

/**
 * Represents a stack of items in an inventory slot.
 */
export interface InventorySlot {
  itemId: number;
  count: number;
}
