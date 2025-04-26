/**
 * Converts a rotation angle to a transformation matrix
 * @param rotation - The rotation angle in degrees
 * @returns Array containing the matrix components [cos(r), -sin(r), sin(r), cos(r)]
 */
export function convertRotationToMatrix(rotation: number): number[] {
  const rad = (rotation * Math.PI) / 180;
  return [Math.cos(rad), -Math.sin(rad), Math.sin(rad), Math.cos(rad)];
}

/**
 * Alternative rotation matrix calculation that includes additional matrix components
 * @param degrees - The rotation angle in degrees
 * @returns Array containing the transformation matrix components [cos(r), sin(r), -sin(r), cos(r), 0, 0]
 */
export function convertRotationToMatrixAlt(degrees: number): number[] {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [cos, sin, -sin, cos, 0, 0];
} 