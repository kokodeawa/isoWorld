
import { BLOCK_DEFINITIONS, TILE_SIZE, WORLD_HEIGHT, MINE_SPEED, MIN_CHUNK_SIZE, MAX_CHUNK_SIZE } from '../constants';
import { BlockInstance, BlockType, CameraState, GameMode, Point2D, Point3D, WorldMap, ChunkCoordinates, ExplorationData, BiomeType, BlockConfig, NavigationDirection, TimeState } from '../types';
import { TimeService } from './TimeService';

class SeededRandom {
    private seed: number;

    constructor(seedStr: string) {
        let h = 1779033703; // A prime number
        for (let i = 0; i < seedStr.length; i++) {
            h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
        }
        this.seed = h;
    }

    // mulberry32 implementation
    public next(): number {
        let t = this.seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

class PerlinNoise {
    private permutation: number[];
    private p: number[];

    constructor(seedStr: string) {
        const prng = new SeededRandom(seedStr);
        this.permutation = new Array(256);
        for (let i = 0; i < 256; i++) {
            this.permutation[i] = Math.floor(prng.next() * 256);
        }
        this.p = new Array(512);
        for (let i = 0; i < 512; i++) {
            this.p[i] = this.permutation[i % 256];
        }
    }

    private fade(t: number): number {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    private lerp(t: number, a: number, b: number): number {
        return a + t * (b - a);
    }

    private grad(hash: number, x: number, y: number, z: number): number {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    public noise(x: number, y: number, z: number): number {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        const Z = Math.floor(z) & 255;

        x -= Math.floor(x);
        y -= Math.floor(y);
        z -= Math.floor(z);

        const u = this.fade(x);
        const v = this.fade(y);
        const w = this.fade(z);

        const A = this.p[X] + Y;
        const AA = this.p[A] + Z;
        const AB = this.p[A + 1] + Z;
        const B = this.p[X + 1] + Y;
        const BA = this.p[B] + Z;
        const BB = this.p[B + 1] + Z;

        return this.lerp(w,
            this.lerp(v,
                this.lerp(u, this.grad(this.p[AA], x, y, z), this.grad(this.p[BA], x - 1, y, z)),
                this.lerp(u, this.grad(this.p[AB], x, y - 1, z), this.grad(this.p[BB], x - 1, y - 1, z))
            ),
            this.lerp(v,
                this.lerp(u, this.grad(this.p[AA + 1], x, y, z - 1), this.grad(this.p[BA + 1], x - 1, y, z - 1)),
                this.lerp(u, this.grad(this.p[AB + 1], x, y - 1, z - 1), this.grad(this.p[BB + 1], x - 1, y - 1, z - 1))
            )
        );
    }
}

type LightMap = Uint8Array[][];

type Chunk = {
  map: WorldMap;
  lightMap: LightMap;
  size: number;
  biome: BiomeType;
  averageSurfaceHeight: number;
  
  // Caching Properties
  coordX: number; // Chunk Grid X
  coordY: number; // Chunk Grid Y
  cacheCanvas?: HTMLCanvasElement;
  cacheCtx?: CanvasRenderingContext2D;
  isDirty: boolean;
  lastCameraHash: string; // To invalidate cache on camera move
  drawOffset: Point2D; // Offset to draw the cached canvas relative to world center
}

export class IsoEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number = 0;
  private height: number = 0;
  private worldSeed: string;
  private biomeNoise: PerlinNoise;
  private humidityNoise: PerlinNoise;
  private timeService: TimeService;
  
  // Chunk Management
  private chunks: Map<string, Chunk> = new Map();
  // PERSISTENCE: Key is "chunkX,chunkY", Value is Map of "localX,localY,z" -> BlockInstance | null
  private chunkModifications: Map<string, Map<string, BlockInstance | null>> = new Map();
  
  private currentChunkCoords: ChunkCoordinates = { x: 0, y: 0 };
  private currentChunk: Chunk;
  private visitedChunks: Set<string> = new Set();

  // State
  private camera: CameraState = { x: 0, y: 150, zoom: 1, angle: Math.PI / 4, pitch: Math.PI / 6 };
  private hoveredBlock: Point3D | null = null;
  private hoveredFace: Point3D | null = null; // Normal of the hovered face
  public selectedBlockType: BlockType | null = null;
  private mode: GameMode = GameMode.CAMERA;
  private renderHeight: number = WORLD_HEIGHT;
  
  // Interaction State
  private mouseX: number = -1;
  private mouseY: number = -1;
  private pointerType: 'mouse' | 'touch' = 'mouse';

  // Mining State
  private isMining: boolean = false;
  private miningTarget: Point3D | null = null;
  private miningStartTime: number = 0;
  private isInputDown: boolean = false; // Tracks if the user is holding down the input
  
  // Callbacks
  public onInventoryUpdate: ((block: BlockType) => void) | null = null;
  public onBlockPlaced: ((block: BlockType) => void) | null = null;
  public onStatsUpdate: ((fps: number, blocks: number, chunk: ChunkCoordinates) => void) | null = null;
  public onTimeUpdate: ((timeState: TimeState) => void) | null = null;


  // Performance vars
  private frameCount = 0;
  private lastTime = 0;
  private visibleBlockCount = 0;
  private ambientLightLevel: number = 15;
  private skyColor: string = '#0f172a';

  // Frame Calculation Cache
  private cornerOffsets: Point2D[] = [];
  private faceVisibility: boolean[] = [false, false, false, false]; // N, E, S, W
  private faceShadows: number[] = [0, 0, 0, 0]; // N, E, S, W opacity

  // Persistence
  private autoSaveInterval: number | null = null;

  constructor(canvas: HTMLCanvasElement, seed: string = 'default') {
    this.canvas = canvas;
    this.worldSeed = seed;
    
    // Initialize Biome Noises
    this.biomeNoise = new PerlinNoise(`${seed}-temp`);
    this.humidityNoise = new PerlinNoise(`${seed}-humid`);
    this.timeService = new TimeService();
    
    let context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Could not get 2D context.');
    this.ctx = context;

    // Load persisted data BEFORE generating the first chunk
    this.loadFromStorage();
    this.startAutoSave();

    this.visitedChunks.add(this.getChunkKey(0,0));
    this.currentChunk = this.loadChunk(0, 0);
    this.resize();
  }
  
  private getChunkKey(x: number, y: number): string {
    return `${x},${y}`;
  }

  // --- PERSISTENCE METHODS ---

  private getStorageKey(): string {
    return `isoworld_save_${this.worldSeed}`;
  }

  public saveToStorage() {
    try {
        // Convert Map<string, Map<string, BlockInstance>> to a JSON-stringifiable structure
        // Structure: [[chunkKey, [[voxelKey, blockData], ...]], ...]
        const serialized = JSON.stringify(Array.from(this.chunkModifications.entries()).map(([chunkKey, modMap]) => {
            return [chunkKey, Array.from(modMap.entries())];
        }));
        
        localStorage.setItem(this.getStorageKey(), serialized);
        console.log(`[IsoWorld] Game Saved. Seed: ${this.worldSeed}, Chunks Modified: ${this.chunkModifications.size}`);
    } catch (e) {
        if (e instanceof DOMException && e.name === "QuotaExceededError") {
            console.error("[IsoWorld] Storage limit reached!");
            alert("Warning: Game cannot be saved. Storage quota exceeded.");
        } else {
            console.error("[IsoWorld] Save failed", e);
        }
    }
  }

  private loadFromStorage() {
    try {
        const raw = localStorage.getItem(this.getStorageKey());
        if (raw) {
            const parsed = JSON.parse(raw);
            // Reconstruct Map<string, Map<string, BlockInstance | null>>
            this.chunkModifications = new Map(
                parsed.map(([chunkKey, modArray]: any) => [
                    chunkKey,
                    new Map(modArray)
                ])
            );
            console.log(`[IsoWorld] Loaded ${this.chunkModifications.size} modified chunks from storage.`);
        }
    } catch (e) {
        console.error("[IsoWorld] Failed to load save data. Starting fresh.", e);
        this.chunkModifications = new Map();
    }
  }

  private startAutoSave() {
    // Save every 30 seconds
    this.autoSaveInterval = window.setInterval(() => {
        this.saveToStorage();
    }, 30000);
  }

  public clearSave() {
      try {
          localStorage.removeItem(this.getStorageKey());
          this.chunkModifications.clear();
          // Reload current chunk to reflect clear
          this.chunks.delete(this.getChunkKey(this.currentChunkCoords.x, this.currentChunkCoords.y));
          this.currentChunk = this.loadChunk(this.currentChunkCoords.x, this.currentChunkCoords.y);
          console.log("[IsoWorld] Save data cleared.");
      } catch (e) {
          console.error("Failed to clear save", e);
      }
  }

  public dispose() {
      if (this.autoSaveInterval !== null) {
          clearInterval(this.autoSaveInterval);
          this.autoSaveInterval = null;
      }
      // Save one last time on close
      this.saveToStorage();
  }

  private getVoxelKey(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  /**
   * Modifies a block in a specific chunk and saves the change to memory (Delta).
   */
  public modifyBlock(chunkX: number, chunkY: number, x: number, y: number, z: number, block: BlockInstance | null) {
    const chunkKey = this.getChunkKey(chunkX, chunkY);
    
    // 1. Save to Memory (Delta)
    if (!this.chunkModifications.has(chunkKey)) {
        this.chunkModifications.set(chunkKey, new Map());
    }
    const chunkMods = this.chunkModifications.get(chunkKey)!;
    chunkMods.set(this.getVoxelKey(x, y, z), block);

    // 2. Update currently loaded chunk map if applicable
    const loadedChunk = this.chunks.get(chunkKey);
    if (loadedChunk) {
        if (!loadedChunk.map[z]) loadedChunk.map[z] = [];
        if (!loadedChunk.map[z][y]) loadedChunk.map[z][y] = [];
        loadedChunk.map[z][y][x] = block;

        // 3. Recalculate lighting for the modified chunk
        this.recalculateLighting(loadedChunk);
        
        // 4. Mark dirty for caching (self + neighbors for lighting spill)
        loadedChunk.isDirty = true;
        this.markNeighborChunksDirty(chunkX, chunkY);
    }
  }
  
  private markNeighborChunksDirty(cx: number, cy: number) {
      const neighbors = [
          this.getChunkKey(cx + 1, cy),
          this.getChunkKey(cx - 1, cy),
          this.getChunkKey(cx, cy + 1),
          this.getChunkKey(cx, cy - 1)
      ];
      neighbors.forEach(key => {
          const chunk = this.chunks.get(key);
          if (chunk) chunk.isDirty = true;
      });
  }

  public placeBlock() {
      if (this.mode !== GameMode.EDIT || !this.hoveredBlock || !this.hoveredFace || !this.selectedBlockType) return;
      
      const { x, y, z } = this.hoveredBlock;
      const { x: dx, y: dy, z: dz } = this.hoveredFace;
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      
      // Bounds check
      if (nx < 0 || ny < 0 || nz < 0 || nx >= this.currentChunk.size || ny >= this.currentChunk.size || nz >= WORLD_HEIGHT) return;
      
      // Occupancy check
      if (this.currentChunk.map[nz]?.[ny]?.[nx]) return;

      const newBlock: BlockInstance = {
          type: this.selectedBlockType,
          hp: BLOCK_DEFINITIONS[this.selectedBlockType].hp
      };
      
      this.modifyBlock(this.currentChunkCoords.x, this.currentChunkCoords.y, nx, ny, nz, newBlock);
      if (this.onBlockPlaced) this.onBlockPlaced(this.selectedBlockType);
  }

  // --- LIGHTING ENGINE ---

  private createEmptyLightMap(size: number): LightMap {
      const lightMap: LightMap = [];
      for (let z = 0; z < WORLD_HEIGHT; z++) {
          lightMap[z] = [];
          for (let y = 0; y < size; y++) {
              lightMap[z][y] = new Uint8Array(size).fill(0);
          }
      }
      return lightMap;
  }
  
  private getLight(lightMap: LightMap, x: number, y: number, z: number, size: number): number {
    if (x < 0 || x >= size || y < 0 || y >= size || z < 0 || z >= WORLD_HEIGHT) {
        return 0;
    }
    return lightMap[z]?.[y]?.[x] ?? 0;
  }

  private setLight(lightMap: LightMap, x: number, y: number, z: number, value: number, size: number) {
      if (x < 0 || x >= size || y < 0 || y >= size || z < 0 || z >= WORLD_HEIGHT) {
          return;
      }
      lightMap[z][y][x] = value;
  }

  private recalculateLighting(chunk: Chunk) {
    for (let z = 0; z < WORLD_HEIGHT; z++) {
        for (let y = 0; y < chunk.size; y++) {
            chunk.lightMap[z][y].fill(0);
        }
    }
    this.calculateLighting(chunk.map, chunk.lightMap, chunk.size);
  }

  private calculateLighting(map: WorldMap, lightMap: LightMap, size: number) {
      const lightQueue: { x: number, y: number, z: number }[] = [];

      // Step 1: Sunlight Pass (cast from top using current ambient light)
      for (let x = 0; x < size; x++) {
          for (let y = 0; y < size; y++) {
              let lightLevel = this.ambientLightLevel;
              for (let z = WORLD_HEIGHT - 1; z >= 0; z--) {
                  if (lightLevel <= 0) break;
                  
                  this.setLight(lightMap, x, y, z, lightLevel, size);

                  const block = map[z]?.[y]?.[x];
                  // Light only loses strength when passing THROUGH a block, not through open air.
                  if (block) {
                      const dampening = BLOCK_DEFINITIONS[block.type].lightDampening;
                      lightLevel -= dampening;
                  }
              }
          }
      }

      // Step 1.5: Inject Orb light source if this is the center chunk
      const isOrbChunk = this.currentChunkCoords.x === 0 && this.currentChunkCoords.y === 0;
      if (isOrbChunk) {
        const orbX = Math.floor(size / 2);
        const orbY = Math.floor(size / 2);
        const orbZ = 40;
        this.setLight(lightMap, orbX, orbY, orbZ, 15, size);
      }

      // Step 2: Gather initial light sources for BFS
      for (let z = 0; z < WORLD_HEIGHT; z++) {
          for (let y = 0; y < size; y++) {
              for (let x = 0; x < size; x++) {
                  const lightLevel = this.getLight(lightMap, x, y, z, size);
                  const emission = map[z]?.[y]?.[x] ? BLOCK_DEFINITIONS[map[z][y][x]!.type].lightEmission : 0;

                  if (lightLevel > 0 || emission > 0) {
                      if (emission > lightLevel) {
                          this.setLight(lightMap, x, y, z, emission, size);
                      }
                      lightQueue.push({ x, y, z });
                  }
              }
          }
      }

      // Step 3: Propagate light with BFS
      const directions = [
          { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
          { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
          { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
      ];

      let head = 0;
      while (head < lightQueue.length) {
          const { x, y, z } = lightQueue[head++];
          const currentLight = this.getLight(lightMap, x, y, z, size);

          for (const dir of directions) {
              const nx = x + dir.x;
              const ny = y + dir.y;
              const nz = z + dir.z;

              if (nx < 0 || nx >= size || ny < 0 || ny >= size || nz < 0 || nz >= WORLD_HEIGHT) continue;
              
              const neighborBlock = map[nz]?.[ny]?.[nx];
              const dampening = neighborBlock ? BLOCK_DEFINITIONS[neighborBlock.type].lightDampening : BLOCK_DEFINITIONS[BlockType.AIR].lightDampening;
              const lightInNeighbor = this.getLight(lightMap, nx, ny, nz, size);
              const newLightLevel = currentLight - dampening;
              
              if (newLightLevel > lightInNeighbor) {
                  this.setLight(lightMap, nx, ny, nz, newLightLevel, size);
                  lightQueue.push({ x: nx, y: ny, z: nz });
              }
          }
      }
  }


  // ---------------------------

  private getBiomeAt(chunkX: number, chunkY: number): BiomeType {
      const scale = 0.1;
      const temperature = this.biomeNoise.noise(chunkX * scale, chunkY * scale, 0); 
      const humidity = this.humidityNoise.noise(chunkX * scale, chunkY * scale, 0);

      if (temperature < -0.5) return BiomeType.SNOW;
      if (temperature > 0.5) return BiomeType.DESERT;
      if (humidity > 0.3) return BiomeType.JUNGLE;
      if (humidity < -0.3) return BiomeType.PRAIRIE;
      
      return BiomeType.GRASSLAND;
  }

  private loadChunk(x: number, y: number): Chunk {
    const key = this.getChunkKey(x, y);
    if (this.chunks.has(key)) {
      return this.chunks.get(key)!;
    }
    const biome = this.getBiomeAt(x, y);
    const newChunk = this.generateChunk(x, y, biome);
    this.chunks.set(key, newChunk);
    return newChunk;
  }

  private generateChunk(chunkX: number, chunkY: number, biome: BiomeType): Chunk {
    const chunkSeed = `${this.worldSeed}_${chunkX},${chunkY}`;
    const prng = new SeededRandom(chunkSeed);
    
    const size = MIN_CHUNK_SIZE + Math.floor(prng.next() * (MAX_CHUNK_SIZE - MIN_CHUNK_SIZE + 1));
    const map: WorldMap = [];

    const nBiome = this.getBiomeAt(chunkX, chunkY - 1);
    const sBiome = this.getBiomeAt(chunkX, chunkY + 1);
    const wBiome = this.getBiomeAt(chunkX - 1, chunkY);
    const eBiome = this.getBiomeAt(chunkX + 1, chunkY);

    let noise: (x: number, y: number) => number;
    let surfaceBlock: BlockType;
    let underSurfaceBlock: BlockType;
    let minTreeHeight: number = 0;
    let maxTreeHeight: number = 0;
    let treeChance: number = 0;
    let placeTrees: boolean;
    let hasVines = false;
    let baseHeightModifier = 0.5;

    const perlin = new PerlinNoise(this.worldSeed); 
    
    const offsetX = chunkX * MAX_CHUNK_SIZE;
    const offsetY = chunkY * MAX_CHUNK_SIZE;

    switch (biome) {
      case BiomeType.SNOW:
        noise = (x, y) => {
             const gx = x + offsetX;
             const gy = y + offsetY;
             let n = perlin.noise(gx * 0.012, gy * 0.012, 0) * 20; 
             n += perlin.noise(gx * 0.05, gy * 0.05, 0) * 2;
             return n;
        };
        surfaceBlock = BlockType.GRASS; 
        underSurfaceBlock = BlockType.DIRT;
        minTreeHeight = 4;
        maxTreeHeight = 8;
        treeChance = 0.015;
        placeTrees = true;
        baseHeightModifier = 0.45; 
        break;
      
      case BiomeType.JUNGLE:
        noise = (x, y) => {
             const gx = x + offsetX;
             const gy = y + offsetY;
             let n = perlin.noise(gx * 0.02, gy * 0.02, 0) * 12;
             n += Math.abs(perlin.noise(gx * 0.08, gy * 0.08, 0)) * 4;
             return n;
        };
        baseHeightModifier = 0.5; 
        surfaceBlock = BlockType.GRASS;
        underSurfaceBlock = BlockType.DIRT;
        minTreeHeight = 15;
        maxTreeHeight = 25;
        treeChance = 0; 
        placeTrees = true;
        hasVines = true;
        break;
      
      case BiomeType.PRAIRIE:
        noise = (x, y) => {
             const gx = x + offsetX;
             const gy = y + offsetY;
             return perlin.noise(gx * 0.01, gy * 0.01, 0) * 6;
        };
        surfaceBlock = BlockType.GRASS;
        underSurfaceBlock = BlockType.DIRT;
        minTreeHeight = 2;
        maxTreeHeight = 4;
        treeChance = 0.005;
        placeTrees = true;
        baseHeightModifier = 0.6;
        break;
      
      case BiomeType.DESERT:
        noise = (x, y) => {
             const gx = x + offsetX;
             const gy = y + offsetY;
             return Math.abs(perlin.noise(gx * 0.025, gy * 0.025, 0)) * 10;
        };
        surfaceBlock = BlockType.SAND;
        underSurfaceBlock = BlockType.SAND;
        placeTrees = false;
        baseHeightModifier = 0.5;
        break;

      case BiomeType.GRASSLAND:
      default:
        noise = (x, y) => {
             const gx = x + offsetX;
             const gy = y + offsetY;
             let n = perlin.noise(gx * 0.015, gy * 0.015, 0) * 10;
             return n;
        };
        surfaceBlock = BlockType.GRASS;
        underSurfaceBlock = BlockType.DIRT;
        minTreeHeight = 3;
        maxTreeHeight = 6;
        treeChance = 0.01;
        placeTrees = true;
        baseHeightModifier = 0.55;
        break;
    }

    const baseHeight = Math.floor(WORLD_HEIGHT * baseHeightModifier);

    for (let z = 0; z < WORLD_HEIGHT; z++) {
      map[z] = [];
      for (let y = 0; y < size; y++) {
        map[z][y] = [];
        for (let x = 0; x < size; x++) {
          let block: BlockInstance | null = null;
          if (z === 0) {
            block = { type: BlockType.BEDROCK, hp: BLOCK_DEFINITIONS[BlockType.BEDROCK].hp };
          } else {
            const surfaceHeight = Math.max(1, Math.min(WORLD_HEIGHT - 1, Math.floor(baseHeight + noise(x, y))));
            
            if (z <= surfaceHeight) {
                const gx = (chunkX * MAX_CHUNK_SIZE + x);
                const gy = (chunkY * MAX_CHUNK_SIZE + y);
                const gz = z;
                
                const caveScale = 0.04; 
                const n3d = perlin.noise(gx * caveScale, gy * caveScale, gz * caveScale * 1.5);
                
                const tunnelWidth = 0.16; 
                const surfaceBuffer = 12;
                let isCave = false;

                if (Math.abs(n3d) < tunnelWidth && z < surfaceHeight - surfaceBuffer) {
                   isCave = true;
                }

              if (!isCave) {
                if (z < surfaceHeight - 4) block = { type: BlockType.STONE, hp: BLOCK_DEFINITIONS[BlockType.STONE].hp };
                else if (z < surfaceHeight) block = { type: underSurfaceBlock, hp: BLOCK_DEFINITIONS[underSurfaceBlock].hp };
                else {
                    let finalBlockType = surfaceBlock;
                    let isSnowy = false;
                    const distToN = y;
                    const distToS = size - 1 - y;
                    const distToW = x;
                    const distToE = size - 1 - x;
                    const blendThreshold = 6; 

                    const shouldBleed = (dist: number, seedX: number, seedY: number) => {
                        return dist < blendThreshold && (perlin.noise(seedX * 0.5, seedY * 0.5, 0) + 1) / 2 > (dist / blendThreshold);
                    };

                    if (nBiome === BiomeType.SNOW && shouldBleed(distToN, x, 0)) isSnowy = true;
                    if (sBiome === BiomeType.SNOW && shouldBleed(distToS, x, size)) isSnowy = true;
                    if (wBiome === BiomeType.SNOW && shouldBleed(distToW, 0, y)) isSnowy = true;
                    if (eBiome === BiomeType.SNOW && shouldBleed(distToE, size, y)) isSnowy = true;

                    if (nBiome === BiomeType.DESERT && shouldBleed(distToN, x, 0)) finalBlockType = BlockType.SAND;
                    if (sBiome === BiomeType.DESERT && shouldBleed(distToS, x, size)) finalBlockType = BlockType.SAND;
                    if (wBiome === BiomeType.DESERT && shouldBleed(distToW, 0, y)) finalBlockType = BlockType.SAND;
                    if (eBiome === BiomeType.DESERT && shouldBleed(distToE, size, y)) finalBlockType = BlockType.SAND;

                    block = { 
                        type: finalBlockType, 
                        hp: BLOCK_DEFINITIONS[finalBlockType].hp,
                        variant: isSnowy ? 'SNOWY' : undefined
                    };
                }
              }
            }
          }
          map[z][y][x] = block;
        }
      }
    }
    
    // ORB GENERATION LOGIC: Excavate "Crater" from orbZ up to the sky
    if (chunkX === 0 && chunkY === 0) {
        const cx = Math.floor(size / 2);
        const cy = Math.floor(size / 2);
        const orbZ = 40;
        const radius = 2; // Radius of 2 blocks (5x5 square) to ensure visibility
        
        // Excavate a column/crater from the orb's position up to the sky
        // to ensure it is always visible from above.
        for (let z = orbZ; z < WORLD_HEIGHT; z++) {
            for (let y = cy - radius; y <= cy + radius; y++) {
                for (let x = cx - radius; x <= cx + radius; x++) {
                    if (z >= 0 && z < WORLD_HEIGHT && y >= 0 && y < size && x >= 0 && x < size) {
                        if (!map[z]) map[z] = [];
                        if (!map[z][y]) map[z][y] = [];
                        map[z][y][x] = null; // Destroy blocks to create crater
                    }
                }
            }
        }
    }
    
    if (biome === BiomeType.SNOW) {
        const lakeLevel = baseHeight - 4; 
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                let surfaceZ = -1;
                for (let z = WORLD_HEIGHT - 1; z >= 0; z--) {
                    if (map[z][y][x] !== null) { surfaceZ = z; break; }
                }
                if (surfaceZ !== -1 && surfaceZ < lakeLevel) {
                    for (let z = surfaceZ + 1; z <= lakeLevel; z++) {
                        map[z][y][x] = { type: BlockType.ICE, hp: BLOCK_DEFINITIONS[BlockType.ICE].hp };
                    }
                    if (map[surfaceZ][y][x]?.type === BlockType.GRASS) {
                        map[surfaceZ][y][x]!.type = BlockType.DIRT;
                    }
                }
            }
        }
    }

    if (placeTrees) {
        // Safe Zone for Orb (radius 6 around center of chunk 0,0)
        const isCenterChunk = chunkX === 0 && chunkY === 0;
        const centerX = size / 2;
        const centerY = size / 2;
        const safeRadiusSq = 36; // 6 * 6

        if (biome === BiomeType.SNOW) {
            const hasIceSpikes = prng.next() < 0.6; 
            if (hasIceSpikes) {
                const numSpikes = 4 + Math.floor(prng.next() * 6); 
                for (let i = 0; i < numSpikes; i++) {
                    const x = 3 + Math.floor(prng.next() * (size - 6));
                    const y = 3 + Math.floor(prng.next() * (size - 6));
                    
                    // Orb Protection Check
                    if (isCenterChunk) {
                        const distSq = (x - centerX) ** 2 + (y - centerY) ** 2;
                        if (distSq < safeRadiusSq) continue;
                        if (x > centerX && y > centerY) continue; // Prevent generation in front of orb
                    }

                    let surfaceZ = -1;
                    for (let z = WORLD_HEIGHT - 1; z >= 0; z--) {
                        if (map[z][y][x] !== null) { surfaceZ = z; break; }
                    }
                    if (surfaceZ > 0 && map[surfaceZ][y][x]?.type !== BlockType.ICE && map[surfaceZ][y][x] !== null) {
                        this.generateIceSpike(map, x, y, surfaceZ + 1, size, prng);
                    }
                }
            } else {
                for (let y = 2; y < size - 3; y++) {
                    for (let x = 2; x < size - 3; x++) {
                         // Orb Protection Check
                        if (isCenterChunk) {
                            const distSq = (x - centerX) ** 2 + (y - centerY) ** 2;
                            if (distSq < safeRadiusSq) continue;
                            if (x > centerX && y > centerY) continue; // Prevent generation in front of orb
                        }

                        if (prng.next() < treeChance) {
                            let surfaceZ = -1;
                            for (let z = WORLD_HEIGHT - 1; z >= 0; z--) {
                                if (map[z][y][x] !== null) { surfaceZ = z; break; }
                            }
                            if (surfaceZ > 0 && (map[surfaceZ][y][x]?.type === BlockType.GRASS || map[surfaceZ][y][x]?.type === BlockType.DIRT)) {
                                this.growTree(map, x, y, surfaceZ + 1, size, prng, minTreeHeight, maxTreeHeight, false, biome);
                            }
                        }
                    }
                }
            }
        } else if (biome === BiomeType.JUNGLE) {
            const numTrees = 8 + Math.floor(Math.pow(prng.next(), 0.5) * 5); 
            let treesPlaced = 0;
            let attempts = 0;
            const maxAttempts = numTrees * 15;

            while (treesPlaced < numTrees && attempts < maxAttempts) {
                attempts++;
                const x = 3 + Math.floor(prng.next() * (size - 8));
                const y = 3 + Math.floor(prng.next() * (size - 8));
                
                // Orb Protection Check
                if (isCenterChunk) {
                    const distSq = (x - centerX) ** 2 + (y - centerY) ** 2;
                    if (distSq < safeRadiusSq) continue;
                    if (x > centerX && y > centerY) continue; // Prevent generation in front of orb
                }

                let surfaceZ = -1;
                for (let z = WORLD_HEIGHT - 1; z >= 0; z--) {
                    if (map[z][y][x] !== null) { surfaceZ = z; break; }
                }

                if (surfaceZ <= 0) continue;

                let canPlace = true;
                for (let dy = 0; dy <= 1; dy++) {
                    for (let dx = 0; dx <= 1; dx++) {
                        const groundBlock = map[surfaceZ]?.[y + dy]?.[x + dx];
                        const blockAbove = map[surfaceZ + 1]?.[y + dy]?.[x + dx];
                        if (groundBlock?.type !== BlockType.GRASS || (blockAbove !== null && blockAbove !== undefined)) {
                            canPlace = false;
                            break;
                        }
                    }
                    if (!canPlace) break;
                }

                if (canPlace) {
                    this.growTree(map, x, y, surfaceZ + 1, size, prng, minTreeHeight, maxTreeHeight, hasVines, biome);
                    treesPlaced++;
                }
            }
        } else {
            for (let y = 2; y < size - 3; y++) {
                for (let x = 2; x < size - 3; x++) {
                    // Orb Protection Check
                    if (isCenterChunk) {
                        const distSq = (x - centerX) ** 2 + (y - centerY) ** 2;
                        if (distSq < safeRadiusSq) continue;
                        if (x > centerX && y > centerY) continue; // Prevent generation in front of orb
                    }

                    if (prng.next() < treeChance) {
                        let surfaceZ = -1;
                        for (let z = WORLD_HEIGHT - 1; z >= 0; z--) {
                            if (map[z][y][x] !== null) { surfaceZ = z; break; }
                        }
                        if (surfaceZ > 0 && map[surfaceZ][y][x]?.type === BlockType.GRASS) {
                            this.growTree(map, x, y, surfaceZ + 1, size, prng, minTreeHeight, maxTreeHeight, hasVines, biome);
                        }
                    }
                }
            }
        }
    }
    
    // --- APPLY PERSISTENT MODIFICATIONS (DELTAS) ---
    const chunkKey = this.getChunkKey(chunkX, chunkY);
    if (this.chunkModifications.has(chunkKey)) {
        const mods = this.chunkModifications.get(chunkKey)!;
        for (const [key, block] of mods.entries()) {
            const [lx, ly, lz] = key.split(',').map(Number);
            if (lz >= 0 && lz < WORLD_HEIGHT && ly >= 0 && ly < size && lx >= 0 && lx < size) {
                if (!map[lz]) map[lz] = [];
                if (!map[lz][ly]) map[lz][ly] = [];
                map[lz][ly][lx] = block;
            }
        }
    }

    // --- LIGHTING CALCULATION ---
    const lightMap = this.createEmptyLightMap(size);
    this.calculateLighting(map, lightMap, size);

    let totalHeight = 0;
    let surfaceBlockCount = 0;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            for (let z = WORLD_HEIGHT - 1; z >= 0; z--) {
                if (map[z]?.[y]?.[x] !== null) {
                    totalHeight += z;
                    surfaceBlockCount++;
                    break;
                }
            }
        }
    }
    const averageSurfaceHeight = surfaceBlockCount > 0 ? totalHeight / surfaceBlockCount : baseHeight;

    return { 
        map, 
        lightMap, 
        size, 
        biome, 
        averageSurfaceHeight,
        coordX: chunkX,
        coordY: chunkY,
        isDirty: true, // Needs initial prerender
        lastCameraHash: '',
        drawOffset: { x: 0, y: 0 }
    };
  }

    private generateIceSpike(map: WorldMap, x: number, y: number, startZ: number, chunkSize: number, prng: SeededRandom) {
        const spikeHeight = 12 + Math.floor(prng.next() * 15);
        if (x + 3 >= chunkSize || y + 3 >= chunkSize || x - 1 < 0 || y - 1 < 0 || startZ + spikeHeight + 4 >= WORLD_HEIGHT) return;

        for (let h = 0; h < spikeHeight; h++) {
            const z = startZ + h;
            for (let dx = 0; dx <= 1; dx++) {
                for (let dy = 0; dy <= 1; dy++) {
                     if (!map[z]) map[z] = []; if(!map[z][y+dy]) map[z][y+dy] = [];
                     if (map[z]?.[y + dy]?.[x + dx] === null) {
                        map[z][y + dy][x + dx] = { type: BlockType.ICE, hp: BLOCK_DEFINITIONS[BlockType.ICE].hp, isNatural: true };
                     }
                }
            }
        }

        const tipZ = startZ + spikeHeight;
        for (let dy = -1; dy <= 2; dy++) {
            for (let dx = -1; dx <= 2; dx++) {
                if ((dx === -1 || dx === 2) && (dy === -1 || dy === 2)) continue;
                const blockX = x + dx;
                const blockY = y + dy;
                if (!map[tipZ]) map[tipZ] = []; if(!map[tipZ][blockY]) map[tipZ][blockY] = [];
                if (map[tipZ]?.[blockY]?.[blockX] === null) {
                    map[tipZ][blockY][blockX] = { type: BlockType.ICE, hp: BLOCK_DEFINITIONS[BlockType.ICE].hp, isNatural: true };
                }
            }
        }
        if (!map[tipZ + 1]) map[tipZ + 1] = []; if(!map[tipZ + 1][y]) map[tipZ + 1][y] = [];
        if (map[tipZ + 1]?.[y]?.[x] === null) {
            map[tipZ + 1][y][x] = { type: BlockType.ICE, hp: BLOCK_DEFINITIONS[BlockType.ICE].hp, isNatural: true };
        }
    }

    private growTree(map: WorldMap, x: number, y: number, startZ: number, chunkSize: number, prng: SeededRandom, minHeight: number, maxHeight: number, hasVines: boolean, biome: BiomeType) {
        if (biome === BiomeType.JUNGLE) {
            this.growJungleTree(map, x, y, startZ, chunkSize, prng, minHeight, maxHeight);
        } else if (biome === BiomeType.SNOW) {
            this.growSpruceTree(map, x, y, startZ, chunkSize, prng, minHeight, maxHeight);
        } else {
            this.growRegularTree(map, x, y, startZ, chunkSize, prng, minHeight, maxHeight, hasVines);
        }
    }
    
    private growSpruceTree(map: WorldMap, x: number, y: number, startZ: number, chunkSize: number, prng: SeededRandom, minHeight: number, maxHeight: number) {
        const treeHeight = minHeight + Math.floor(prng.next() * (maxHeight - minHeight + 1));
        if (startZ + treeHeight + 1 >= WORLD_HEIGHT) return;

        for (let h = 0; h < treeHeight; h++) {
            const z = startZ + h;
            if (z < WORLD_HEIGHT) {
                if (!map[z]) map[z] = []; if(!map[z][y]) map[z][y] = [];
                map[z][y][x] = { type: BlockType.SPRUCE_LOG, hp: BLOCK_DEFINITIONS[BlockType.SPRUCE_LOG].hp, isNatural: true };
            }
        }

        let radius = 0;
        for (let lz = startZ + treeHeight; lz >= startZ + 1; lz--) {
            const layerFromTop = startZ + treeHeight - lz;
            if (layerFromTop % 2 === 0) radius++;
            const currentRadius = Math.min(2, radius);

            for (let ly = y - currentRadius; ly <= y + currentRadius; ly++) {
                for (let lx = x - currentRadius; lx <= x + currentRadius; lx++) {
                    if (Math.abs(lx - x) === currentRadius && Math.abs(ly - y) === currentRadius && prng.next() > 0.25) continue;
                    
                    if (ly >= 0 && ly < chunkSize && lx >= 0 && lx < chunkSize) {
                        if (!map[lz]) map[lz] = []; if(!map[lz][ly]) map[lz][ly] = [];
                        if (map[lz]?.[ly]?.[lx] === null) {
                           map[lz][ly][lx] = { type: BlockType.SPRUCE_LEAVES, hp: BLOCK_DEFINITIONS[BlockType.SPRUCE_LEAVES].hp, isNatural: true };
                        }
                    }
                }
            }
        }
    }

    private growJungleTree(map: WorldMap, x: number, y: number, startZ: number, chunkSize: number, prng: SeededRandom, minHeight: number, maxHeight: number) {
        const treeHeight = minHeight + Math.floor(prng.next() * (maxHeight - minHeight + 1));
        if (x + 1 >= chunkSize || y + 1 >= chunkSize || startZ + treeHeight + 5 >= WORLD_HEIGHT) return;

        for (let h = 0; h < treeHeight; h++) {
            const z = startZ + h;
            for (let dx = 0; dx <= 1; dx++) {
                for (let dy = 0; dy <= 1; dy++) {
                    if (!map[z]) map[z] = []; if(!map[z][y+dy]) map[z][y+dy] = [];
                    map[z][y + dy][x + dx] = { type: BlockType.LOG, hp: BLOCK_DEFINITIONS[BlockType.LOG].hp, isNatural: true };
                }
            }
        }

        const canopyRadius = 3;
        const canopyCenterZ = startZ + treeHeight;
        for (let lz = canopyCenterZ - 2; lz <= canopyCenterZ + 2; lz++) {
            for (let ly = y - canopyRadius; ly <= y + 1 + canopyRadius; ly++) {
                for (let lx = x - canopyRadius; lx <= x + 1 + canopyRadius; lx++) {
                    const distSq = Math.pow(lx - (x + 0.5), 2) + Math.pow(ly - (y + 0.5), 2) + Math.pow(lz - canopyCenterZ, 2);
                    if (distSq < Math.pow(canopyRadius + 1, 2) * (prng.next() * 0.5 + 0.7)) {
                        if (lz < WORLD_HEIGHT && ly >= 0 && ly < chunkSize && lx >= 0 && lx < chunkSize) {
                            if (!map[lz]) map[lz] = []; if(!map[lz][ly]) map[lz][ly] = [];
                            if (map[lz]?.[ly]?.[lx] === null) {
                                map[lz][ly][lx] = { type: BlockType.LEAVES, hp: BLOCK_DEFINITIONS[BlockType.LEAVES].hp, isNatural: true };
                            }
                        }
                    }
                }
            }
        }

        const potentialVineLocations: Point3D[] = [];
        for (let lz = startZ; lz <= canopyCenterZ + 2; lz++) {
            for (let ly = y - canopyRadius - 1; ly <= y + 1 + canopyRadius + 1; ly++) {
                for (let lx = x - canopyRadius - 1; lx <= x + 1 + canopyRadius + 1; lx++) {
                    if (map[lz]?.[ly]?.[lx]?.type === BlockType.LEAVES) {
                        if (map[lz - 1]?.[ly]?.[lx] === null) {
                            potentialVineLocations.push({ x: lx, y: ly, z: lz - 1 });
                        }
                    }
                }
            }
        }
        
        potentialVineLocations.forEach(pos => {
            if (prng.next() < 0.10) { 
                const isTooCloseToTrunk = pos.x >= x - 2 && pos.x <= x + 3 && pos.y >= y - 2 && pos.y <= y + 3;
                if (!isTooCloseToTrunk) {
                    const vineLength = 2 + Math.floor(prng.next() * (treeHeight * 0.6));
                    for (let i = 0; i < vineLength; i++) {
                        const vineZ = pos.z - i;
                        if (!map[vineZ]) map[vineZ] = []; if(!map[vineZ][pos.y]) map[vineZ][pos.y] = [];
                        if (vineZ > 0 && map[vineZ]?.[pos.y]?.[pos.x] === null) {
                            map[vineZ][pos.y][pos.x] = { type: BlockType.VINE, hp: BLOCK_DEFINITIONS[BlockType.VINE].hp, isNatural: true };
                        } else {
                            break; 
                        }
                    }
                }
            }
        });
    }

    private growRegularTree(map: WorldMap, x: number, y: number, startZ: number, chunkSize: number, prng: SeededRandom, minHeight: number, maxHeight: number, hasVines: boolean = false) {
        const treeHeight = minHeight + Math.floor(prng.next() * (maxHeight - minHeight + 1));
        if (startZ + treeHeight + 2 >= WORLD_HEIGHT) return;

        for (let h = 0; h < treeHeight; h++) {
            const z = startZ + h;
            if (z < WORLD_HEIGHT) {
                if (!map[z]) map[z] = []; if(!map[z][y]) map[z][y] = [];
                map[z][y][x] = { type: BlockType.LOG, hp: BLOCK_DEFINITIONS[BlockType.LOG].hp, isNatural: true };
            }
        }

        const leaveStart = startZ + treeHeight - 1;
        for (let lz = leaveStart; lz <= leaveStart + 2; lz++) {
            for (let ly = y - 1; ly <= y + 1; ly++) {
                for (let lx = x - 1; lx <= x + 1; lx++) {
                    if (lz === leaveStart && lx === x && ly === y) continue;
                    if (Math.abs(lx - x) === 1 && Math.abs(ly - y) === 1 && prng.next() > 0.4 && lz !== leaveStart) continue;
                    if (lz === leaveStart + 2 && (Math.abs(lx - x) === 1 && Math.abs(ly - y) === 1)) continue;

                    if (lz < WORLD_HEIGHT && ly >= 0 && ly < chunkSize && lx >= 0 && lx < chunkSize) {
                        if (!map[lz]) map[lz] = []; if(!map[lz][ly]) map[lz][ly] = [];
                        if (map[lz][ly][lx] === null) {
                            map[lz][ly][lx] = { type: BlockType.LEAVES, hp: BLOCK_DEFINITIONS[BlockType.LEAVES].hp, isNatural: true };
                        }
                    }
                }
            }
        }
        if (startZ + treeHeight < WORLD_HEIGHT) {
            if (!map[startZ+treeHeight]) map[startZ+treeHeight] = []; if(!map[startZ+treeHeight][y]) map[startZ+treeHeight][y] = [];
            map[startZ + treeHeight][y][x] = { type: BlockType.LEAVES, hp: BLOCK_DEFINITIONS[BlockType.LEAVES].hp, isNatural: true };
        }

        if (hasVines) {
            const potentialVineLocations: Point3D[] = [];
            for (let lz = leaveStart; lz <= leaveStart + 2; lz++) {
                for (let ly = y - 2; ly <= y + 2; ly++) {
                    for (let lx = x - 2; lx <= x + 2; lx++) {
                        if (map[lz]?.[ly]?.[lx]?.type === BlockType.LEAVES) {
                            if (map[lz - 1]?.[ly]?.[lx] === null) {
                                potentialVineLocations.push({ x: lx, y: ly, z: lz - 1 });
                            }
                        }
                    }
                }
            }
            
            potentialVineLocations.forEach(pos => {
                if (prng.next() < 0.25) { 
                    const vineLength = 2 + Math.floor(prng.next() * (treeHeight * 0.7));
                    for (let i = 0; i < vineLength; i++) {
                        const vineZ = pos.z - i;
                        if (!map[vineZ]) map[vineZ] = []; if(!map[vineZ][pos.y]) map[vineZ][pos.y] = [];
                        if (vineZ > 0 && map[vineZ]?.[pos.y]?.[pos.x] === null) {
                            map[vineZ][pos.y][pos.x] = { type: BlockType.VINE, hp: BLOCK_DEFINITIONS[BlockType.VINE].hp, isNatural: true };
                        } else {
                            break; 
                        }
                    }
                }
            });
        }
    }

  public resize() {
    const w = window.innerWidth || document.documentElement.clientWidth || 0;
    const h = window.innerHeight || document.documentElement.clientHeight || 0;
    if (w === 0 || h === 0) return;

    this.width = w;
    this.height = h;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(this.width * dpr);
    this.canvas.height = Math.floor(this.height * dpr);
    this.ctx.scale(dpr, dpr);
    this.ctx.imageSmoothingEnabled = false; 
  }

  public navigateTo(direction: NavigationDirection): ChunkCoordinates {
    switch (direction) {
      case 'north': this.currentChunkCoords.y -= 1; break;
      case 'south': this.currentChunkCoords.y += 1; break;
      case 'west': this.currentChunkCoords.x -= 1; break;
      case 'east': this.currentChunkCoords.x += 1; break;
    }
    this.currentChunk = this.loadChunk(this.currentChunkCoords.x, this.currentChunkCoords.y);
    this.visitedChunks.add(this.getChunkKey(this.currentChunkCoords.x, this.currentChunkCoords.y));
    this.hoveredBlock = null;
    this.hoveredFace = null;
    this.isMining = false;
    this.miningTarget = null;
    return { ...this.currentChunkCoords };
  }

  public getCurrentChunkAverageHeight(): number {
    return this.currentChunk.averageSurfaceHeight;
  }
  
  public getExplorationData(): ExplorationData {
    return {
      visited: this.visitedChunks,
      current: this.currentChunkCoords
    };
  }

  public setCamera(camera: Partial<CameraState>) {
    this.camera = { ...this.camera, ...camera };
    this.camera.angle = (this.camera.angle + Math.PI * 2) % (Math.PI * 2);
    this.camera.pitch = Math.max(0.1, Math.min(Math.PI / 2, this.camera.pitch));
  }

  public rotateCameraAroundScreenCenter(newAngle: number): CameraState {
        const { x: camX, y: camY, zoom, pitch } = this.camera;
        const oldAngle = this.camera.angle;
        
        const scale = TILE_SIZE * zoom;
        const isoRatio = Math.sin(pitch);
        const wz = this.currentChunk.averageSurfaceHeight;
        
        const safeIsoRatio = Math.max(0.1, isoRatio); 
        const termX = -camX / scale;
        const termY = (-camY + wz * scale) / (scale * safeIsoRatio);
        
        const cosA = Math.cos(oldAngle);
        const sinA = Math.sin(oldAngle);
        
        const wx = termX * cosA + termY * sinA;
        const wy = -termX * sinA + termY * cosA;
        
        const newCos = Math.cos(newAngle);
        const newSin = Math.sin(newAngle);
        
        const newSx = (wx * newCos - wy * newSin) * scale;
        const newSy = (wx * newSin + wy * newCos) * scale * safeIsoRatio - wz * scale;
        
        const newCamX = -newSx;
        const newCamY = -newSy;
        
        const nextState = { ...this.camera, x: newCamX, y: newCamY, angle: newAngle };
        nextState.angle = (nextState.angle + Math.PI * 2) % (Math.PI * 2);
        
        this.camera = nextState;
        return this.camera;
  }

  public setRenderHeight(height: number) {
    this.renderHeight = Math.max(1, Math.min(WORLD_HEIGHT, height));
    // When render height changes, we need to re-render all visible chunks
    this.chunks.forEach(chunk => chunk.isDirty = true);
  }

  public setMode(mode: GameMode) {
    this.mode = mode;
    this.isMining = false;
    this.miningTarget = null;
    this.miningStartTime = 0;
  }
  
  public get isInputActive(): boolean {
      return this.isInputDown;
  }

  public handleInput(isDown: boolean) {
    this.isInputDown = isDown; // Track the input state permanently

    if (this.mode === GameMode.EDIT) {
      if (isDown) {
        // Force immediate hit test to ensure we capture the block under the finger instantly
        this.performHitTest();
        if (this.hoveredBlock) {
          this.isMining = true;
          this.miningTarget = { ...this.hoveredBlock };
          this.miningStartTime = performance.now();
        }
      } else {
        this.isMining = false;
        this.miningTarget = null;
        this.miningStartTime = 0;
      }
    }
  }

  public updateMousePosition(x: number, y: number, pointerType: 'mouse' | 'touch' = 'mouse') {
      this.mouseX = x;
      this.mouseY = y;
      this.pointerType = pointerType;
  }

  private shadeColor(hex: string, brightness: number): string {
      if (!hex.startsWith('#') || hex.length !== 7) return hex;
      
      let r = parseInt(hex.slice(1, 3), 16);
      let g = parseInt(hex.slice(3, 5), 16);
      let b = parseInt(hex.slice(5, 7), 16);
      
      r = Math.floor(r * brightness);
      g = Math.floor(g * brightness);
      b = Math.floor(b * brightness);
      
      const toHex = (c: number) => `0${c.toString(16)}`.slice(-2);

      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  
  // --- CHUNK CACHING SYSTEM ---

  private prerenderChunk(chunk: Chunk) {
      // 1. Check if we have a valid canvas
      if (!chunk.cacheCanvas) {
          chunk.cacheCanvas = document.createElement('canvas');
          chunk.cacheCtx = chunk.cacheCanvas.getContext('2d', { alpha: true }) as CanvasRenderingContext2D;
      }

      // 2. Setup Camera params for this specific render
      const { angle, zoom, pitch } = this.camera;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const scale = TILE_SIZE * zoom;
      const isoRatio = Math.sin(pitch);
      
      // 3. Update Camera Hash and Dirty Flag
      chunk.lastCameraHash = `${angle.toFixed(4)}-${pitch.toFixed(4)}-${zoom.toFixed(4)}`;
      chunk.isDirty = false;

      // 4. Calculate Bounding Box of the Chunk geometry in Screen Space (relative to chunk center)
      // We check the 8 corners of the chunk volume to determine canvas size.
      const size = chunk.size;
      const h = WORLD_HEIGHT; 
      
      // Chunk Local corners: (0,0,0) -> (size, size, h)
      // But coordinates in draw logic are centered: (x - size/2)
      const half = size / 2;
      const corners3D = [
          { x: -half, y: -half, z: 0 },
          { x: half, y: -half, z: 0 },
          { x: half, y: half, z: 0 },
          { x: -half, y: half, z: 0 },
          { x: -half, y: -half, z: h },
          { x: half, y: -half, z: h },
          { x: half, y: half, z: h },
          { x: -half, y: half, z: h }
      ];

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

      corners3D.forEach(p => {
          const rx = p.x * cosA - p.y * sinA;
          const ry = p.x * sinA + p.y * cosA;
          const sx = rx * scale;
          const sy = ry * scale * isoRatio - p.z * scale;
          
          if (sx < minX) minX = sx;
          if (sx > maxX) maxX = sx;
          if (sy < minY) minY = sy;
          if (sy > maxY) maxY = sy;
      });
      
      // Add padding for block width/height (approx TILE_SIZE * 2)
      const padding = scale * 2;
      minX -= padding; maxX += padding;
      minY -= padding; maxY += padding;

      const width = Math.ceil(maxX - minX);
      const height = Math.ceil(maxY - minY);

      // Resize Canvas (clears it too)
      chunk.cacheCanvas.width = width;
      chunk.cacheCanvas.height = height;
      
      const ctx = chunk.cacheCtx!;
      ctx.imageSmoothingEnabled = false;

      // 5. Calculate Render Offset
      // The canvas origin (0,0) corresponds to (minX, minY) in world-screen-space
      // So if we draw at (0,0,0) -> projected (0,0), that should be at (-minX, -minY) on canvas
      const offsetX = -minX;
      const offsetY = -minY;
      chunk.drawOffset = { x: minX, y: minY };

      // 6. Draw Blocks to Cache
      // Optimized loops: X/Y inside, Z outside is standard for Iso but we can just use the generic loop
      
      // Setup projection helper
      // FIX: Add small epsilon to corners to prevent bleeding lines/gaps between blocks
      const GAP_FIX = 0.05; // 5% overlap
      const localCorners = [
        { x: -0.5 - GAP_FIX, y: -0.5 - GAP_FIX }, 
        { x: 0.5 + GAP_FIX, y: -0.5 - GAP_FIX }, 
        { x: 0.5 + GAP_FIX, y: 0.5 + GAP_FIX }, 
        { x: -0.5 - GAP_FIX, y: 0.5 + GAP_FIX }
      ];
      const cornerOffsets = localCorners.map(p => ({
            x: (p.x * cosA - p.y * sinA) * scale,
            y: (p.x * sinA + p.y * cosA) * scale * isoRatio
      }));
      
      // Pre-calc normals for this angle
      const normals = [{ x: sinA, y: -cosA }, { x: cosA, y: sinA }, { x: -sinA, y: cosA }, { x: -cosA, y: -sinA }];
      const faceVisibility = normals.map(n => n.y > -0.01);
      const faceShadows = normals.map(n => Math.max(0, Math.min(0.7, (1 - (n.x * -0.7 + n.y * -0.7)) * 0.35)));

      // Render Loop Direction
      let startX = 0, endX = size, stepX = 1;
      if (sinA < 0) { startX = size - 1; endX = -1; stepX = -1; }
      let startY = 0, endY = size, stepY = 1;
      if (cosA < 0) { startY = size - 1; endY = -1; stepY = -1; }
      
      // We only render up to the global renderHeight
      const renderLimit = Math.min(WORLD_HEIGHT, this.renderHeight);
      
      const world = chunk.map;
      
      const renderBlock = (x: number, y: number, z: number) => {
          const block = world[z]?.[y]?.[x];
          if (!block) return;
          
          const isTopLayer = z === renderLimit - 1;
          const hasTop = !isTopLayer && !!world[z + 1]?.[y]?.[x];
          
          let neighborsExist = true;
            if (hasTop) {
              if (faceVisibility[0] && (!world[z][y - 1] || !world[z][y - 1][x])) neighborsExist = false;
              else if (faceVisibility[1] && (!world[z][y][x + 1])) neighborsExist = false;
              else if (faceVisibility[2] && (!world[z][y + 1] || !world[z][y + 1][x])) neighborsExist = false;
              else if (faceVisibility[3] && (!world[z][y][x - 1])) neighborsExist = false;
            } else {
              neighborsExist = false;
            }
          if (hasTop && neighborsExist && block.type !== BlockType.VINE) return;

          // Projection
          const ox = x - half;
          const oy = y - half;
          const rx = ox * cosA - oy * sinA;
          const ry = ox * sinA + oy * cosA;
          
          // Canvas Coordinates
          const cx = offsetX + rx * scale;
          const cy = offsetY + ry * scale * isoRatio - z * scale;
          
          const config = BLOCK_DEFINITIONS[block.type];
          const lightVal = this.getLight(chunk.lightMap, x, y, z, size);
          // Scale light to 0-1 range roughly, 15 is max
          const light = Math.max(0.1, lightVal / 15);

          // Draw TOP Face
          // If there is a block on top, we might skip drawing top face if we are culling efficiently,
          // but here we only skip if fully surrounded.
          if (!hasTop || block.type === BlockType.VINE) {
              ctx.beginPath();
              ctx.moveTo(cx + cornerOffsets[0].x, cy + cornerOffsets[0].y);
              for (let i = 1; i < 4; i++) {
                 ctx.lineTo(cx + cornerOffsets[i].x, cy + cornerOffsets[i].y);
              }
              ctx.closePath();
              ctx.fillStyle = this.shadeColor(config.colors.top, light * 0.05 + 0.2 + light * 0.8);
              ctx.fill();
          }

          // Draw SIDE Faces
          // To fix gaps, we extend the side faces slightly down and ensure they are wide enough (handled by localCorners)
          const sideHeight = scale * (1 + GAP_FIX);

          const drawSide = (idx1: number, idx2: number, color: string, shadow: number) => {
              ctx.beginPath();
              ctx.moveTo(cx + cornerOffsets[idx1].x, cy + cornerOffsets[idx1].y);
              ctx.lineTo(cx + cornerOffsets[idx2].x, cy + cornerOffsets[idx2].y);
              ctx.lineTo(cx + cornerOffsets[idx2].x, cy + cornerOffsets[idx2].y + sideHeight);
              ctx.lineTo(cx + cornerOffsets[idx1].x, cy + cornerOffsets[idx1].y + sideHeight);
              ctx.closePath();
              
              const brightness = Math.max(0, light - shadow);
              ctx.fillStyle = this.shadeColor(color, brightness);
              ctx.fill();
          };

          if (faceVisibility[0] && (!world[z][y - 1]?.[x] || world[z][y - 1][x]!.type === BlockType.VINE)) {
              drawSide(0, 1, config.colors.side1, faceShadows[0]);
          }
          if (faceVisibility[1] && (!world[z]?.[y]?.[x + 1] || world[z][y][x + 1]!.type === BlockType.VINE)) {
              drawSide(1, 2, config.colors.side2, faceShadows[1]);
          }
          if (faceVisibility[2] && (!world[z]?.[y + 1]?.[x] || world[z][y + 1][x]!.type === BlockType.VINE)) {
              drawSide(2, 3, config.colors.side1, faceShadows[2]);
          }
          if (faceVisibility[3] && (!world[z]?.[y]?.[x - 1] || world[z][y][x - 1]!.type === BlockType.VINE)) {
               drawSide(3, 0, config.colors.side2, faceShadows[3]);
          }
      };

      for (let z = 0; z < renderLimit; z++) {
          for (let y = startY; y !== endY + stepY; y += stepY) {
              for (let x = startX; x !== endX + stepX; x += stepX) {
                 renderBlock(x, y, z);
              }
          }
      }
  }

  public render(time: number) {
      const now = performance.now();
      const dt = now - this.lastTime;
      this.lastTime = now;
      this.frameCount++;

      if (Math.random() < 0.05 && this.onStatsUpdate) {
         this.onStatsUpdate(Math.round(1000/dt), this.visibleBlockCount, this.currentChunkCoords);
      }

      this.timeService.update(dt);
      const timeState = this.timeService.getState();
      if (this.onTimeUpdate) this.onTimeUpdate(timeState);
      
      this.ambientLightLevel = timeState.ambientLight;
      this.skyColor = timeState.skyColor;

      this.ctx.fillStyle = this.skyColor;
      this.ctx.fillRect(0, 0, this.width, this.height);

      const { x: camX, y: camY } = this.camera;
      const centerX = this.width / 2;
      const centerY = this.height / 2;

      if (this.currentChunk.isDirty || this.currentChunk.lastCameraHash !== `${this.camera.angle.toFixed(4)}-${this.camera.pitch.toFixed(4)}-${this.camera.zoom.toFixed(4)}`) {
          this.prerenderChunk(this.currentChunk);
      }

      const chunk = this.currentChunk;
      if (chunk.cacheCanvas) {
          const destX = Math.floor(centerX + camX + chunk.drawOffset.x);
          const destY = Math.floor(centerY + camY + chunk.drawOffset.y);
          this.ctx.drawImage(chunk.cacheCanvas, destX, destY);
      }
      
      this.drawCursor();
  }

  private drawCursor() {
      if (!this.hoveredBlock || !this.hoveredFace) return;
      
      // We need to project the hovered block to screen space
      const { x, y, z } = this.hoveredBlock;
      const { x: camX, y: camY, zoom, pitch, angle } = this.camera;
      const scale = TILE_SIZE * zoom;
      const isoRatio = Math.sin(pitch);
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      
      const centerX = this.width / 2;
      const centerY = this.height / 2;
      
      const half = this.currentChunk.size / 2;
      const ox = x - half;
      const oy = y - half;
      const rx = ox * cosA - oy * sinA;
      const ry = ox * sinA + oy * cosA;
      
      const cx = centerX + camX + rx * scale;
      const cy = centerY + camY + ry * scale * isoRatio - z * scale;
      
      // Draw wireframe around hovered block
      // We utilize the same logic for offsets
      const GAP_FIX = 0; // No gap fix for cursor, we want it tight or slightly larger?
      const localCorners = [
        { x: -0.5, y: -0.5 }, { x: 0.5, y: -0.5 }, 
        { x: 0.5, y: 0.5 }, { x: -0.5, y: 0.5 }
      ];
      const offsets = localCorners.map(p => ({
            x: (p.x * cosA - p.y * sinA) * scale,
            y: (p.x * sinA + p.y * cosA) * scale * isoRatio
      }));
      
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(cx + offsets[0].x, cy + offsets[0].y);
      for (let i = 1; i < 4; i++) this.ctx.lineTo(cx + offsets[i].x, cy + offsets[i].y);
      this.ctx.closePath();
      this.ctx.stroke();

      // If Edit Mode, show face highlight
      if (this.mode === GameMode.EDIT) {
          // Determine face center for highlight
          // This is a simplification. A full face highlight would require checking hoveredFace normal.
          // For now, just a lighter box on top
          this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
          this.ctx.fill();
      }
  }

  public performHitTest() {
      if (this.mouseX === -1) {
          this.hoveredBlock = null;
          return;
      }
      
      const { x: camX, y: camY, zoom, angle, pitch } = this.camera;
      const scale = TILE_SIZE * zoom;
      const isoRatio = Math.sin(pitch);
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      
      const centerX = this.width / 2;
      const centerY = this.height / 2;
      const scrX = this.mouseX - (centerX + camX);
      const scrY = this.mouseY - (centerY + camY);

      const size = this.currentChunk.size;
      const half = size / 2;
      const map = this.currentChunk.map;

      this.hoveredBlock = null;
      this.hoveredFace = null;

      // Iterating from top to bottom is efficient for finding the first hit
      const renderLimit = Math.min(WORLD_HEIGHT, this.renderHeight);

      // Create a ray-like check by iterating projected positions
      // A more robust way: iterate all blocks? Too slow.
      // Raycast?
      // Simplified: We assume we hit the Top Face of a block.
      // The projection of (x,y,z) top face is at (scrX, scrY).
      // We reverse project scrX, scrY at level Z to find x,y.
      
      for (let z = renderLimit - 1; z >= 0; z--) {
          // Reverse projection for this Z plane
          // cy = ry * scale * isoRatio - z * scale
          // => ry = (cy + z * scale) / (scale * isoRatio)
          const adjY = scrY + z * scale;
          const ry = adjY / (scale * isoRatio);
          const rx = scrX / scale;
          
          // ox = rx * cos + ry * sin
          // oy = -rx * sin + ry * cos
          const ox = rx * cosA + ry * sinA;
          const oy = -rx * sinA + ry * cosA;
          
          const bx = Math.floor(ox + half + 0.5); // Rounding to nearest integer coord
          const by = Math.floor(oy + half + 0.5);
          
          // Check if within bounds of the 1x1 block surface
          // ox, oy are centered at 0.0 relative to block center? No, ox is coordinate relative to chunk center.
          // bx is integer index.
          // block center is at (bx - half).
          // Local coord: lx = ox - (bx - half). Should be within -0.5 to 0.5
          
          if (Math.abs(ox - (bx - half)) <= 0.5 && Math.abs(oy - (by - half)) <= 0.5) {
               if (bx >= 0 && bx < size && by >= 0 && by < size) {
                   if (map[z]?.[by]?.[bx]) {
                       this.hoveredBlock = { x: bx, y: by, z };
                       
                       // Simple face detection based on hit position relative to center
                       // If we are here, we hit the top face logic.
                       // However, we might actually be hovering the side of a block above us if we didn't check Z+1?
                       // We iterate Z down. If Z+1 was hit, we would have returned.
                       // So if we are here, Z+1 was NOT hit (or empty).
                       this.hoveredFace = { x: 0, y: 0, z: 1 };
                       return;
                   }
               }
          }
      }
  }
}
