
import { BLOCK_DEFINITIONS, TILE_SIZE, WORLD_HEIGHT, MINE_SPEED, MIN_CHUNK_SIZE, MAX_CHUNK_SIZE } from '../constants';
import { BlockInstance, BlockType, CameraState, GameMode, Point2D, Point3D, WorldMap, ChunkCoordinates, ExplorationData } from '../types';

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

type Chunk = {
  map: WorldMap;
  size: number;
}

export class IsoEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number = 0;
  private height: number = 0;
  private worldSeed: string;
  
  // Chunk Management
  private chunks: Map<string, Chunk> = new Map();
  private currentChunkCoords: ChunkCoordinates = { x: 0, y: 0 };
  private currentChunk: Chunk;
  private visitedChunks: Set<string> = new Set();

  // State
  private camera: CameraState = { x: 0, y: 150, zoom: 1, angle: Math.PI / 4 };
  private hoveredBlock: Point3D | null = null;
  private mode: GameMode = GameMode.CAMERA;
  private renderHeight: number = WORLD_HEIGHT;
  
  // Mining State
  private isMining: boolean = false;
  private miningTarget: Point3D | null = null;
  
  // Callbacks
  public onInventoryUpdate: ((block: BlockType) => void) | null = null;
  public onStatsUpdate: ((fps: number, blocks: number, chunk: ChunkCoordinates) => void) | null = null;

  // Performance vars
  private frameCount = 0;
  private lastTime = 0;
  private visibleBlockCount = 0;

  // Frame Calculation Cache
  private cornerOffsets: Point2D[] = [];
  private faceVisibility: boolean[] = [false, false, false, false]; // N, E, S, W
  private faceShadows: number[] = [0, 0, 0, 0]; // N, E, S, W opacity

  constructor(canvas: HTMLCanvasElement, seed: string = 'default') {
    this.canvas = canvas;
    this.worldSeed = seed;
    
    let context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Could not get 2D context.');
    this.ctx = context;

    this.visitedChunks.add(this.getChunkKey(0,0));
    this.currentChunk = this.loadChunk(0, 0);
    this.resize();
  }
  
  private getChunkKey(x: number, y: number): string {
    return `${x},${y}`;
  }

  private loadChunk(x: number, y: number): Chunk {
    const key = this.getChunkKey(x, y);
    if (this.chunks.has(key)) {
      return this.chunks.get(key)!;
    }
    const newChunk = this.generateChunk(x, y);
    this.chunks.set(key, newChunk);
    return newChunk;
  }

  private generateChunk(chunkX: number, chunkY: number): Chunk {
    const chunkSeed = `${this.worldSeed}_${chunkX},${chunkY}`;
    const prng = new SeededRandom(chunkSeed);
    
    const size = MIN_CHUNK_SIZE + Math.floor(prng.next() * (MAX_CHUNK_SIZE - MIN_CHUNK_SIZE + 1));
    const map: WorldMap = [];

    const noise = (x: number, y: number) => {
      const globalX = chunkX * size + x;
      const globalY = chunkY * size + y;
      return Math.sin(globalX * 0.15) * Math.cos(globalY * 0.15) * 2 + Math.sin(globalX * 0.3 + globalY * 0.1) * 1.5;
    };

    const baseHeight = Math.floor(WORLD_HEIGHT * 0.65);

    for (let z = 0; z < WORLD_HEIGHT; z++) {
      map[z] = [];
      for (let y = 0; y < size; y++) {
        map[z][y] = [];
        for (let x = 0; x < size; x++) {
          let block: BlockInstance | null = null;
          if (z === 0) {
            block = { type: BlockType.BEDROCK, hp: BLOCK_DEFINITIONS[BlockType.BEDROCK].hp };
          } else {
            const surfaceHeight = Math.floor(baseHeight + noise(x, y));
            if (z < surfaceHeight) {
              const isCave = z > 1 && z < surfaceHeight - 4 && prng.next() > 0.96;
              if (!isCave) {
                if (z < surfaceHeight - 4) block = { type: BlockType.STONE, hp: BLOCK_DEFINITIONS[BlockType.STONE].hp };
                else if (z < surfaceHeight - 1) block = { type: BlockType.DIRT, hp: BLOCK_DEFINITIONS[BlockType.DIRT].hp };
                else block = { type: BlockType.GRASS, hp: BLOCK_DEFINITIONS[BlockType.GRASS].hp };
              }
            }
          }
          map[z][y][x] = block;
        }
      }
    }

    const numTrees = 3 + Math.floor(prng.next() * 10);
    let treesPlaced = 0;
    for(let i=0; i < 200 && treesPlaced < numTrees; i++) {
      const x = 2 + Math.floor(prng.next() * (size - 4));
      const y = 2 + Math.floor(prng.next() * (size - 4));

      let surfaceZ = -1;
      for (let z = WORLD_HEIGHT - 1; z >= 0; z--) {
        if (map[z][y][x] !== null) {
          surfaceZ = z;
          break;
        }
      }

      if (surfaceZ > 0 && map[surfaceZ][y][x]?.type === BlockType.GRASS) {
        this.growTree(map, x, y, surfaceZ + 1, size, prng);
        treesPlaced++;
      }
    }

    return { map, size };
  }

  private growTree(map: WorldMap, x: number, y: number, startZ: number, chunkSize: number, prng: SeededRandom) {
    const treeHeight = 3 + Math.floor(prng.next() * 3);
    if (startZ + treeHeight + 2 >= WORLD_HEIGHT) return;

    for (let h = 0; h < treeHeight; h++) {
      const z = startZ + h;
      if (z < WORLD_HEIGHT) {
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
            if (map[lz][ly][lx] === null) {
              map[lz][ly][lx] = { type: BlockType.LEAVES, hp: BLOCK_DEFINITIONS[BlockType.LEAVES].hp, isNatural: true };
            }
          }
        }
      }
    }
    if (startZ + treeHeight < WORLD_HEIGHT) {
        map[startZ + treeHeight][y][x] = { type: BlockType.LEAVES, hp: BLOCK_DEFINITIONS[BlockType.LEAVES].hp, isNatural: true };
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

  public navigateTo(direction: 'north' | 'south' | 'east' | 'west'): ChunkCoordinates {
    switch (direction) {
      case 'north': this.currentChunkCoords.y -= 1; break;
      case 'south': this.currentChunkCoords.y += 1; break;
      case 'west': this.currentChunkCoords.x -= 1; break;
      case 'east': this.currentChunkCoords.x += 1; break;
    }
    this.currentChunk = this.loadChunk(this.currentChunkCoords.x, this.currentChunkCoords.y);
    this.visitedChunks.add(this.getChunkKey(this.currentChunkCoords.x, this.currentChunkCoords.y));
    this.setCamera({ x: 0, y: 150 }); // Recenter camera
    this.hoveredBlock = null;
    this.isMining = false;
    this.miningTarget = null;
    return { ...this.currentChunkCoords };
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
  }

  public setRenderHeight(height: number) {
    this.renderHeight = Math.max(1, Math.min(WORLD_HEIGHT, height));
  }

  public setMode(mode: GameMode) {
    this.mode = mode;
    this.isMining = false;
    this.miningTarget = null;
  }

  public handleInput(isDown: boolean) {
    if (this.mode === GameMode.MINING) {
      if (isDown && this.hoveredBlock) {
        this.isMining = true;
        this.miningTarget = { ...this.hoveredBlock };
      } else {
        this.isMining = false;
        this.miningTarget = null;
      }
    }
  }

  public render(time: number) {
    if (this.width === 0 || this.height === 0) return;

    this.ctx.fillStyle = '#0f172a';
    this.ctx.fillRect(0, 0, this.width, this.height);

    const world = this.currentChunk.map;
    const worldSize = this.currentChunk.size;

    if (this.isMining && this.miningTarget && this.mode === GameMode.MINING) {
      const { x, y, z } = this.miningTarget;
      if (z < this.renderHeight) {
        const block = world[z]?.[y]?.[x];
        if (block) {
          block.hp -= MINE_SPEED;
          if (block.hp <= 0) {
            const blockType = block.type;
            const isNaturalLog = block.type === BlockType.LOG && block.isNatural;
            world[z][y][x] = null;
            if (this.onInventoryUpdate) this.onInventoryUpdate(blockType);
            if (isNaturalLog) this.fellTree(x, y, z);
            this.isMining = false;
            this.miningTarget = null;
            this.hoveredBlock = null; 
          }
        } else {
          this.isMining = false;
          this.miningTarget = null;
        }
      } else {
        this.isMining = false;
        this.miningTarget = null;
      }
    }

    const { angle, zoom, x: camX, y: camY } = this.camera;
    const centerX = this.width / 2 + camX;
    const centerY = this.height / 2 + camY;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const scale = TILE_SIZE * zoom;

    const localCorners = [{ x: -0.5, y: -0.5 }, { x: 0.5, y: -0.5 }, { x: 0.5, y: 0.5 }, { x: -0.5, y: 0.5 }];
    this.cornerOffsets = localCorners.map(p => ({
        x: (p.x * cosA - p.y * sinA) * scale,
        y: (p.x * sinA + p.y * cosA) * scale * 0.5
    }));

    const normals = [{ x: sinA, y: -cosA }, { x: cosA, y: sinA }, { x: -sinA, y: cosA }, { x: -cosA, y: -sinA }];
    for(let i=0; i<4; i++) {
        this.faceVisibility[i] = normals[i].y > -0.01;
        const dot = normals[i].x * (-0.7) + normals[i].y * (-0.7); 
        this.faceShadows[i] = Math.max(0, Math.min(0.7, (1 - dot) * 0.35));
    }

    let startX = 0, endX = worldSize, stepX = 1;
    if (sinA < 0) { startX = worldSize - 1; endX = -1; stepX = -1; }
    let startY = 0, endY = worldSize, stepY = 1;
    if (cosA < 0) { startY = worldSize - 1; endY = -1; stepY = -1; }
    const xDominant = Math.abs(sinA) > Math.abs(cosA);

    this.visibleBlockCount = 0;

    const renderBlock = (x: number, y: number, z: number) => {
        const block = world[z]?.[y]?.[x];
        if (!block) return;

        const isTopLayer = z === this.renderHeight - 1;
        const hasTop = !isTopLayer && !!world[z + 1]?.[y]?.[x];
        
        let neighborsExist = true;
        if (hasTop) {
          if (this.faceVisibility[0] && (!world[z][y - 1] || !world[z][y - 1][x])) neighborsExist = false;
          else if (this.faceVisibility[1] && (!world[z][y][x + 1])) neighborsExist = false;
          else if (this.faceVisibility[2] && (!world[z][y + 1] || !world[z][y + 1][x])) neighborsExist = false;
          else if (this.faceVisibility[3] && (!world[z][y][x - 1])) neighborsExist = false;
        } else {
          neighborsExist = false;
        }
        if (hasTop && neighborsExist) return;

        const ox = x - worldSize / 2;
        const oy = y - worldSize / 2;
        const rx = ox * cosA - oy * sinA;
        const ry = ox * sinA + oy * cosA;
        const screenX = centerX + rx * scale;
        const screenY = centerY + ry * scale * 0.5 - z * scale;

        if (screenX < -scale || screenX > this.width + scale || screenY < -scale * 2 || screenY > this.height + scale) return;

        const neighborFlags = [false, false, false, false];
        if (!hasTop || this.faceVisibility.some(v => v)) {
            if (this.faceVisibility[0]) neighborFlags[0] = y > 0 && !!world[z][y - 1]?.[x];
            if (this.faceVisibility[1]) neighborFlags[1] = x < worldSize - 1 && !!world[z][y]?.[x + 1];
            if (this.faceVisibility[2]) neighborFlags[2] = y < worldSize - 1 && !!world[z][y + 1]?.[x];
            if (this.faceVisibility[3]) neighborFlags[3] = x > 0 && !!world[z][y]?.[x - 1];
        }

        this.drawBlockGeometry(block, x, y, z, screenX, screenY, scale, hasTop, neighborFlags);
        this.visibleBlockCount++;
    };

    for (let z = 0; z < this.renderHeight; z++) {
        if (xDominant) {
            for (let x = startX; x !== endX; x += stepX) {
                for (let y = startY; y !== endY; y += stepY) renderBlock(x, y, z);
            }
        } else {
            for (let y = startY; y !== endY; y += stepY) {
                for (let x = startX; x !== endX; x += stepX) renderBlock(x, y, z);
            }
        }
    }

    if (time - this.lastTime > 1000) {
      if (this.onStatsUpdate) this.onStatsUpdate(Math.round(this.frameCount * 1000 / (time - this.lastTime)), this.visibleBlockCount, this.currentChunkCoords);
      this.lastTime = time;
      this.frameCount = 0;
    }
    this.frameCount++;
  }

  private drawBlockGeometry(
    block: BlockInstance,
    bx: number, by: number, bz: number,
    cx: number, cy: number, scale: number,
    hasTop: boolean,
    neighbors: boolean[]
  ) {
    const config = BLOCK_DEFINITIONS[block.type];
    const isHovered = this.hoveredBlock?.x === bx && this.hoveredBlock?.y === by && this.hoveredBlock?.z === bz;
    const corners = this.cornerOffsets.map(off => ({ x: cx + off.x, y: cy + off.y }));
    
    let overlayAlpha = 0;
    if (this.isMining && this.miningTarget?.x === bx && this.miningTarget?.y === by && this.miningTarget?.z === bz) {
       overlayAlpha = Math.min(0.7, ((config.hp - block.hp) / config.hp) * 0.8 + 0.1); 
    }

    if (!hasTop) {
      this.ctx.fillStyle = config.colors.top;
      this.ctx.beginPath();
      this.ctx.moveTo(corners[0].x, corners[0].y);
      this.ctx.lineTo(corners[1].x, corners[1].y);
      this.ctx.lineTo(corners[2].x, corners[2].y);
      this.ctx.lineTo(corners[3].x, corners[3].y);
      this.ctx.closePath();
      this.ctx.fill();

      if (bz === this.renderHeight - 1 && bz < WORLD_HEIGHT - 1) {
         this.ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
         this.ctx.fill();
      }
      if (isHovered) {
        this.ctx.fillStyle = 'rgba(255,255,255,0.25)';
        this.ctx.fill();
      }
      if (overlayAlpha > 0) {
        this.ctx.fillStyle = `rgba(0,0,0,${overlayAlpha})`;
        this.ctx.fill();
      }
    }

    const height = scale; 
    for (let i = 0; i < 4; i++) {
        if (!this.faceVisibility[i] || neighbors[i]) continue;
        const c1 = corners[i], c2 = corners[(i + 1) % 4];
        this.ctx.fillStyle = config.colors.side1;
        this.ctx.beginPath();
        this.ctx.moveTo(c1.x, c1.y);
        this.ctx.lineTo(c2.x, c2.y);
        this.ctx.lineTo(c2.x, c2.y + height);
        this.ctx.lineTo(c1.x, c1.y + height);
        this.ctx.closePath();
        this.ctx.fill();

        if (this.faceShadows[i] > 0.05) {
            this.ctx.fillStyle = `rgba(0,0,0,${this.faceShadows[i]})`;
            this.ctx.fill();
        }
        const depthFactor = Math.max(0, (WORLD_HEIGHT - bz) * 0.005);
        if (depthFactor > 0) {
            this.ctx.fillStyle = `rgba(0,0,0,${depthFactor})`;
            this.ctx.fill();
        }
        if (overlayAlpha > 0) {
            this.ctx.fillStyle = `rgba(0,0,0,${overlayAlpha})`;
            this.ctx.fill();
        }
    }
  }

  public checkInteraction(mouseX: number, mouseY: number) {
    if (this.width === 0 || this.height === 0) {
      this.hoveredBlock = null;
      return;
    }

    const world = this.currentChunk.map;
    const worldSize = this.currentChunk.size;

    const { angle, zoom, x: camX, y: camY } = this.camera;
    const centerX = this.width / 2 + camX;
    const centerY = this.height / 2 + camY;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const scale = TILE_SIZE * zoom;

    const localCorners = [{ x: -0.5, y: -0.5 }, { x: 0.5, y: -0.5 }, { x: 0.5, y: 0.5 }, { x: -0.5, y: 0.5 }];
    const cornerOffsets = localCorners.map(p => ({
        x: (p.x * cosA - p.y * sinA) * scale,
        y: (p.x * sinA + p.y * cosA) * scale * 0.5
    }));

    const normals = [{ x: sinA, y: -cosA }, { x: cosA, y: sinA }, { x: -sinA, y: cosA }, { x: -cosA, y: -sinA }];
    const faceVisibility: boolean[] = normals.map(n => n.y > -0.01);

    const reversedStartX = (sinA < 0) ? 0 : worldSize - 1;
    const reversedEndX = (sinA < 0) ? worldSize : -1;
    const reversedStepX = (sinA < 0) ? 1 : -1;

    const reversedStartY = (cosA < 0) ? 0 : worldSize - 1;
    const reversedEndY = (cosA < 0) ? worldSize : -1;
    const reversedStepY = (cosA < 0) ? 1 : -1;
    
    const xDominant = Math.abs(sinA) > Math.abs(cosA);
    let hit: Point3D | null = null;
    
    const hitTestBlock = (x: number, y: number, z: number): boolean => {
        const block = world[z]?.[y]?.[x];
        if (!block) return false;

        const isTopLayer = z === this.renderHeight - 1;
        const hasTopBlock = !isTopLayer && !!world[z + 1]?.[y]?.[x];
        const neighbors = [
            y > 0 && !!world[z][y - 1]?.[x],
            x < worldSize - 1 && !!world[z][y]?.[x + 1],
            y < worldSize - 1 && !!world[z][y + 1]?.[x],
            x > 0 && !!world[z][y]?.[x - 1]
        ];
        const hasExposedSide = faceVisibility.some((visible, i) => visible && !neighbors[i]);
        if (hasTopBlock && !hasExposedSide) return false;
        
        const ox = x - worldSize / 2;
        const oy = y - worldSize / 2;
        const rx = ox * cosA - oy * sinA;
        const ry = ox * sinA + oy * cosA;
        const screenX = centerX + rx * scale;
        const screenY = centerY + ry * scale * 0.5 - z * scale;

        if (mouseX < screenX - scale || mouseX > screenX + scale || mouseY < screenY - scale || mouseY > screenY + scale * 2) return false;

        const topCorners = cornerOffsets.map(off => ({ x: screenX + off.x, y: screenY + off.y }));
        if (!hasTopBlock && this.pointInPoly(mouseX, mouseY, topCorners)) {
            hit = { x, y, z };
            return true;
        }
        
        const bottomCorners = topCorners.map(c => ({ x: c.x, y: c.y + scale }));
        for (let i = 0; i < 4; i++) {
            if (faceVisibility[i] && !neighbors[i]) {
                const sidePolygon = [topCorners[i], topCorners[(i + 1) % 4], bottomCorners[(i + 1) % 4], bottomCorners[i]];
                if (this.pointInPoly(mouseX, mouseY, sidePolygon)) {
                    hit = { x, y, z };
                    return true;
                }
            }
        }
        return false;
    }

    hitTestLoop:
    for (let z = this.renderHeight - 1; z >= 0; z--) {
        if (xDominant) {
            for (let x = reversedStartX; x !== reversedEndX; x += reversedStepX) {
                for (let y = reversedStartY; y !== reversedEndY; y += reversedStepY) {
                    if (hitTestBlock(x, y, z)) break hitTestLoop;
                }
            }
        } else {
            for (let y = reversedStartY; y !== reversedEndY; y += reversedStepY) {
                for (let x = reversedStartX; x !== reversedEndX; x += reversedStepX) {
                    if (hitTestBlock(x, y, z)) break hitTestLoop;
                }
            }
        }
    }
    
    this.hoveredBlock = hit;
  }

  private pointInPoly(x: number, y: number, vs: Point2D[]): boolean {
      let inside = false;
      for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
          const xi = vs[i].x, yi = vs[i].y;
          const xj = vs[j].x, yj = vs[j].y;
          const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
          if (intersect) inside = !inside;
      }
      return inside;
  }
  
  private startLeafDecay(seedLeaves: Point3D[]) {
    const visited = new Set<string>();
    const key = (p: Point3D) => `${p.x},${p.y},${p.z}`;
    const world = this.currentChunk.map;
    const prng = new SeededRandom(this.worldSeed + this.getChunkKey(this.currentChunkCoords.x, this.currentChunkCoords.y));


    for (const seed of seedLeaves) {
      const seedKey = key(seed);
      if (visited.has(seedKey)) continue;

      const block = world[seed.z]?.[seed.y]?.[seed.x];
      if (!block || block.type !== BlockType.LEAVES) continue;
      
      const cluster = new Set<string>();
      const queue: Point3D[] = [seed];
      visited.add(seedKey);
      cluster.add(seedKey);
      let isSupported = false;
      let head = 0;

      const supportOffsets: Point3D[] = [];
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        supportOffsets.push({x: dx, y: dy, z: dz});
      }

      const spreadOffsets: Point3D[] = [
        {x:1,y:0,z:0}, {x:-1,y:0,z:0}, {x:0,y:1,z:0},
        {x:0,y:-1,z:0}, {x:0,y:0,z:1}, {x:0,y:0,z:-1}
      ];

      while(head < queue.length) {
        const current = queue[head++];
        for (const offset of supportOffsets) {
            const checkPos = { x: current.x + offset.x, y: current.y + offset.y, z: current.z + offset.z };
            if (world[checkPos.z]?.[checkPos.y]?.[checkPos.x]?.type === BlockType.LOG) {
                isSupported = true;
                break;
            }
        }
        if (isSupported) break;

        for (const offset of spreadOffsets) {
          const nextPos = { x: current.x + offset.x, y: current.y + offset.y, z: current.z + offset.z };
          const nextKey = key(nextPos);
          if (visited.has(nextKey)) continue;
          if (world[nextPos.z]?.[nextPos.y]?.[nextPos.x]?.type === BlockType.LEAVES) {
              visited.add(nextKey);
              cluster.add(nextKey);
              queue.push(nextPos);
          }
        }
      }

      if (!isSupported) {
        const decayDelay = 150, initialDelay = 300;
        let i = 0;
        const clusterArray = Array.from(cluster).sort(() => prng.next() - 0.5);
        for (const leafKey of clusterArray) {
          setTimeout(() => {
              const [x, y, z] = leafKey.split(',').map(Number);
              if (world[z]?.[y]?.[x]?.type === BlockType.LEAVES) {
                  world[z][y][x] = null;
              }
          }, initialDelay + i * decayDelay + prng.next() * 100);
          i++;
        }
      }
    }
  }

  private fellTree(startX: number, startY: number, startZ: number) {
    const blocksToFell: Point3D[] = [];
    const queue: Point3D[] = [];
    const visited = new Set<string>();
    const key = (p: Point3D) => `${p.x},${p.y},${p.z}`;
    const world = this.currentChunk.map;

    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0 && dz === 0) continue;
      const neighborPos = { x: startX + dx, y: startY + dy, z: startZ + dz };
      const neighborKey = key(neighborPos);
      if (!visited.has(neighborKey) && world[neighborPos.z]?.[neighborPos.y]?.[neighborPos.x]?.type === BlockType.LOG) {
        visited.add(neighborKey);
        queue.push(neighborPos);
      }
    }

    let head = 0;
    while (head < queue.length) {
      const current = queue[head++];
      blocksToFell.push(current);
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        const nextPos = { x: current.x + dx, y: current.y + dy, z: current.z + dz };
        const nextKey = key(nextPos);
        if (!visited.has(nextKey) && world[nextPos.z]?.[nextPos.y]?.[nextPos.x]?.type === BlockType.LOG) {
          visited.add(nextKey);
          queue.push(nextPos);
        }
      }
    }
    
    const adjacentLeaves = new Set<string>();
    const allTreeLogPositions = [{ x: startX, y: startY, z: startZ }, ...blocksToFell];

    for (const logPos of allTreeLogPositions) {
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        const checkPos = { x: logPos.x + dx, y: logPos.y + dy, z: logPos.z + dz };
        if (world[checkPos.z]?.[checkPos.y]?.[checkPos.x]?.type === BlockType.LEAVES) {
          adjacentLeaves.add(key(checkPos));
        }
      }
    }

    blocksToFell.sort((a, b) => a.z - b.z);
    blocksToFell.forEach((pos, index) => {
      setTimeout(() => {
        const block = world[pos.z]?.[pos.y]?.[pos.x];
        if (block?.type === BlockType.LOG) {
          if (this.onInventoryUpdate) this.onInventoryUpdate(block.type);
          world[pos.z][pos.y][pos.x] = null;
        }
      }, index * 35);
    });
    
    setTimeout(() => {
      const seedLeaves = Array.from(adjacentLeaves).map(k => {
        const [x, y, z] = k.split(',').map(Number);
        return { x, y, z };
      });
      this.startLeafDecay(seedLeaves);
    }, blocksToFell.length * 35 + 250);
    
    this.hoveredBlock = null;
  }
}
