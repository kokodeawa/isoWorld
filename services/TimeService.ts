
import { TimeOfDay, TimeState } from '../types';

const DAY_DURATION = 10 * 60 * 1000; // 10 minutes
const SUNRISE_DURATION = 1 * 60 * 1000; // 1 minute
const NIGHT_DURATION = 6 * 60 * 1000; // 6 minutes
const SUNSET_DURATION = 1 * 60 * 1000; // 1 minute

const TOTAL_CYCLE_DURATION = DAY_DURATION + SUNRISE_DURATION + NIGHT_DURATION + SUNSET_DURATION;

const SUNRISE_START = 0;
const DAY_START = SUNRISE_START + SUNRISE_DURATION;
const SUNSET_START = DAY_START + DAY_DURATION;
const NIGHT_START = SUNSET_START + SUNSET_DURATION;

const MIN_LIGHT = 4;
const MAX_LIGHT = 15;

// Sky Colors
const SUNRISE_COLOR = { r: 251, g: 146, b: 60 };  // Orange 400
const DAY_COLOR = { r: 56, g: 189, b: 248 };    // Sky 400
const SUNSET_COLOR = { r: 192, g: 38, b: 211 };     // Fuchsia 600
const NIGHT_COLOR = { r: 30, g: 41, b: 59 };      // Slate 800

export class TimeService {
  private currentTime: number;

  constructor(startTime: number = DAY_START) {
    this.currentTime = startTime;
  }

  public update(deltaTime: number) {
    this.currentTime = (this.currentTime + deltaTime) % TOTAL_CYCLE_DURATION;
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }
  
  private lerpColor(colorA: {r:number,g:number,b:number}, colorB: {r:number,g:number,b:number}, t: number): string {
      const r = Math.round(this.lerp(colorA.r, colorB.r, t));
      const g = Math.round(this.lerp(colorA.g, colorB.g, t));
      const b = Math.round(this.lerp(colorA.b, colorB.b, t));
      return `rgb(${r},${g},${b})`;
  }

  public getState(): TimeState {
    let timeOfDay: TimeOfDay;
    let ambientLight: number;
    let skyColor: string;
    let cycleProgress: number;

    if (this.currentTime >= SUNRISE_START && this.currentTime < DAY_START) {
      timeOfDay = TimeOfDay.SUNRISE;
      const progress = (this.currentTime - SUNRISE_START) / SUNRISE_DURATION;
      ambientLight = Math.round(MAX_LIGHT / 2);
      skyColor = this.lerpColor(NIGHT_COLOR, SUNRISE_COLOR, progress);
      cycleProgress = this.currentTime / TOTAL_CYCLE_DURATION;
    } else if (this.currentTime >= DAY_START && this.currentTime < SUNSET_START) {
      timeOfDay = TimeOfDay.DAY;
      ambientLight = MAX_LIGHT;
      skyColor = this.lerpColor(SUNRISE_COLOR, DAY_COLOR, (this.currentTime - DAY_START) / (DAY_DURATION / 4)); // Quick fade to blue
      cycleProgress = this.currentTime / TOTAL_CYCLE_DURATION;
    } else if (this.currentTime >= SUNSET_START && this.currentTime < NIGHT_START) {
      timeOfDay = TimeOfDay.SUNSET;
      const progress = (this.currentTime - SUNSET_START) / SUNSET_DURATION;
      ambientLight = Math.round(MAX_LIGHT / 2);
      skyColor = this.lerpColor(SUNSET_COLOR, NIGHT_COLOR, progress);
      cycleProgress = this.currentTime / TOTAL_CYCLE_DURATION;
    } else {
      timeOfDay = TimeOfDay.NIGHT;
      ambientLight = MIN_LIGHT;
      skyColor = `rgb(${NIGHT_COLOR.r},${NIGHT_COLOR.g},${NIGHT_COLOR.b})`;
      cycleProgress = this.currentTime / TOTAL_CYCLE_DURATION;
    }

    return {
      timeOfDay,
      ambientLight,
      skyColor,
      cycleProgress
    };
  }
}