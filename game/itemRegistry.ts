
import { BlockType, ItemDefinition } from '../types';

/**
 * REGISTRO DE ÍTEMS (ItemRegistry)
 * Un objeto constante que define todos los ítems disponibles en el juego.
 * Es la fuente de verdad para las propiedades de cada ítem.
 */
export const ITEMS: Record<number, ItemDefinition> = {
  // --- Bloques ---
  1: { id: 1, name: 'Piedra', type: 'BLOCK', maxStack: 64, texture: '#cbd5e1', blockType: BlockType.STONE },
  2: { id: 2, name: 'Tierra', type: 'BLOCK', maxStack: 64, texture: '#b45309', blockType: BlockType.DIRT },
  3: { id: 3, name: 'Bloque de Hierba', type: 'BLOCK', maxStack: 64, texture: '#4ade80', blockType: BlockType.GRASS },
  4: { id: 4, name: 'Tronco de Roble', type: 'BLOCK', maxStack: 64, texture: '#d4a373', blockType: BlockType.LOG },
  5: { id: 5, name: 'Hojas de Roble', type: 'BLOCK', maxStack: 64, texture: '#86efac', blockType: BlockType.LEAVES },
  6: { id: 6, name: 'Arena', type: 'BLOCK', maxStack: 64, texture: '#fde047', blockType: BlockType.SAND },
  7: { id: 7, name: 'Tronco de Abeto', type: 'BLOCK', maxStack: 64, texture: '#5c4033', blockType: BlockType.SPRUCE_LOG },
  8: { id: 8, name: 'Hojas de Abeto', type: 'BLOCK', maxStack: 64, texture: '#2f4f4f', blockType: BlockType.SPRUCE_LEAVES },
  9: { id: 9, name: 'Tablones de Madera', type: 'BLOCK', maxStack: 64, texture: '#fef3c7', blockType: BlockType.WOODEN_PLANKS },
  
  // --- Materiales / Ítems ---
  101: { id: 101, name: 'Palo', type: 'ITEM', maxStack: 64, texture: '#92400e' },

  // --- Herramientas ---
  201: { id: 201, name: 'Pico de Madera', type: 'TOOL', maxStack: 1, texture: '#c084fc' }, // Color morado como placeholder
};

/**
 * Mapea un tipo de bloque minado al ID del ítem que el jugador debe recibir.
 * Esto permite, por ejemplo, que al picar un bloque de hierba se obtenga tierra.
 */
export const BLOCK_TO_ITEM: Partial<Record<BlockType, number>> = {
    [BlockType.STONE]: 1,
    [BlockType.DIRT]: 2,
    [BlockType.GRASS]: 2, // Picar hierba da tierra
    [BlockType.LOG]: 4,
    [BlockType.SAND]: 6,
    [BlockType.SPRUCE_LOG]: 7,
    [BlockType.WOODEN_PLANKS]: 9,
    // Las hojas y las lianas no dan nada por ahora
};
