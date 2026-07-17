/**
 * Transfer the first resource out of a cleanup-owned array. The receiver becomes its sole closer;
 * cleanup retains ownership only of the remaining entries.
 */
export function takeFirstOwned<T>(owned: T[]): T | undefined {
  return owned.shift();
}
