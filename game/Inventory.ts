
import { InventorySlot } from '../types';
import { ITEMS } from './itemRegistry';

/**
 * Clase 'Inventory'
 * Gestiona una colección de slots para almacenar ítems.
 */
export class Inventory {
  public slots: (InventorySlot | null)[];
  public readonly size: number;

  /**
   * @param size El número total de huecos en el inventario.
   * @param existingSlots Opcional, para restaurar un inventario existente.
   */
  constructor(size: number, existingSlots?: (InventorySlot | null)[]) {
    this.size = size;
    if (existingSlots && existingSlots.length === size) {
        // Clona los slots para evitar mutaciones inesperadas
        this.slots = existingSlots.map(slot => slot ? {...slot} : null);
    } else {
        this.slots = new Array(size).fill(null);
    }
  }

  /**
   * Añade un ítem al inventario, intentando apilarlo primero en slots existentes.
   * Si no es posible, busca un slot vacío.
   * @param itemId El ID del ítem a añadir.
   * @param count La cantidad a añadir.
   * @returns `true` si se pudo guardar toda la cantidad, `false` si el inventario estaba lleno y no cupo todo.
   */
  addItem(itemId: number, count: number): boolean {
    const itemDef = ITEMS[itemId];
    if (!itemDef) return false;

    let remainingCount = count;

    // 1. Intentar apilar en slots existentes
    for (let i = 0; i < this.size && remainingCount > 0; i++) {
      const slot = this.slots[i];
      if (slot && slot.itemId === itemId && slot.count < itemDef.maxStack) {
        const canAdd = itemDef.maxStack - slot.count;
        const toAdd = Math.min(remainingCount, canAdd);
        slot.count += toAdd;
        remainingCount -= toAdd;
      }
    }

    // 2. Si todavía quedan ítems, buscar un slot vacío
    for (let i = 0; i < this.size && remainingCount > 0; i++) {
      if (this.slots[i] === null) {
        const toAdd = Math.min(remainingCount, itemDef.maxStack);
        this.slots[i] = { itemId, count: toAdd };
        remainingCount -= toAdd;
      }
    }

    return remainingCount === 0;
  }

  /**
   * Quita una cantidad de un ítem de un slot específico.
   * @param slotIndex El índice del slot del que se quitará el ítem.
   * @param count La cantidad a quitar.
   * @returns `true` si la operación fue exitosa.
   */
  removeItemFromSlot(slotIndex: number, count: number): boolean {
      if (slotIndex < 0 || slotIndex >= this.size) return false;
      const slot = this.slots[slotIndex];
      if (!slot || slot.count < count) return false;

      slot.count -= count;
      if (slot.count <= 0) {
          this.slots[slotIndex] = null;
      }
      return true;
  }
  
  /**
   * Quita una cantidad de un tipo de ítem de cualquier parte del inventario.
   * Útil para recetas de crafteo que consumen materiales.
   * @param itemId El ID del ítem a quitar.
   * @param count La cantidad a quitar.
   * @returns `true` si se tenían suficientes ítems y la operación fue exitosa.
   */
  removeItem(itemId: number, count: number): boolean {
      // Primero, verificar si hay suficientes ítems en total
      const totalCount = this.slots.reduce((acc, slot) => {
          return (slot && slot.itemId === itemId) ? acc + slot.count : acc;
      }, 0);

      if (totalCount < count) return false;

      let remainingToRemove = count;
      // Iterar hacia atrás para quitar de los stacks más lejanos primero
      for (let i = this.size - 1; i >= 0 && remainingToRemove > 0; i--) {
          const slot = this.slots[i];
          if (slot && slot.itemId === itemId) {
              const toRemove = Math.min(remainingToRemove, slot.count);
              slot.count -= toRemove;
              remainingToRemove -= toRemove;
              if (slot.count <= 0) {
                  this.slots[i] = null;
              }
          }
      }
      return true;
  }

  /**
   * Devuelve el contenido de un slot específico.
   * @param index El índice del slot a consultar.
   * @returns El `InventorySlot` o `null` si está vacío.
   */
  getSlot(index: number): InventorySlot | null {
    if (index < 0 || index >= this.size) return null;
    return this.slots[index];
  }
}
