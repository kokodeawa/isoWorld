export enum BlockType {
  AIR = 0,
  GRASS = 1,
  DIRT = 2,
  STONE = 3,
  BEDROCK = 4,
  LOG = 5,
  LEAVES = 6,
}

export enum GameMode {
  CAMERA = 'CAMERA',
  MINING = 'MINING',
}

export interface BlockConfig {
  id: BlockType;
  name: string;
  hp: number;
  colors: {
    top: string;
    side1: string; // Right face usually
    side2: string; // Left face usually
  };
}

export interface BlockInstance {
  type: BlockType;
  hp: number; // Current HP
  isNatural?: boolean; // Flag for naturally generated blocks like trees
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
