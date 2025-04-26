/**
 * Interpolates between two arrays of values
 * @param fromList - The source array of values
 * @param toList - The target array of values
 * @param f - The interpolation factor (0.0 to 1.0)
 * @returns An array with interpolated values
 */
export function interpolate(
  fromList: Array<number | boolean>,
  toList: Array<number | boolean>,
  f: number
): Array<number | boolean> {
  if (fromList.length !== toList.length) {
    throw new Error(`Mismatched interpolation arguments ${fromList}: ${toList}`);
  }
  
  const out: Array<number | boolean> = [];
  for (let i = 0; i < fromList.length; i++) {
    out.push(interpolateNum(fromList[i], toList[i], f));
  }
  
  return out;
}

/**
 * Interpolates between two values
 * @param fromVal - The source value
 * @param toVal - The target value
 * @param f - The interpolation factor (0.0 to 1.0)
 * @returns The interpolated value
 */
export function interpolateNum(
  fromVal: number | boolean,
  toVal: number | boolean,
  f: number
): number | boolean {
  if (typeof fromVal === 'number' && typeof toVal === 'number') {
    return fromVal * (1 - f) + toVal * f;
  }

  if (typeof fromVal === 'boolean' && typeof toVal === 'boolean') {
    return f < 0.5 ? fromVal : toVal;
  }
  
  throw new Error(`Cannot interpolate between ${typeof fromVal} and ${typeof toVal}`);
} 