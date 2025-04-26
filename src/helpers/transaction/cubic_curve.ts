/**
 * Class for calculating cubic bezier curve values
 */
export class Cubic {
  private curves: number[];

  /**
   * Creates a new cubic bezier curve
   * @param curves - The control points for the bezier curve
   */
  constructor(curves: number[]) {
    this.curves = curves;
  }

  /**
   * Gets the interpolated value at a specific time
   * @param time - The time value (0.0 to 1.0)
   * @returns The interpolated value at the given time
   */
  getValue(time: number): number {
    let startGradient = 0.0;
    let endGradient = 0.0;
    let start = 0.0;
    let mid = 0.0;
    let end = 1.0;

    if (time <= 0.0) {
      if (this.curves[0] > 0.0) {
        startGradient = this.curves[1] / this.curves[0];
      } else if (this.curves[1] === 0.0 && this.curves[2] > 0.0) {
        startGradient = this.curves[3] / this.curves[2];
      }
      return startGradient * time;
    }

    if (time >= 1.0) {
      if (this.curves[2] < 1.0) {
        endGradient = (this.curves[3] - 1.0) / (this.curves[2] - 1.0);
      } else if (this.curves[2] === 1.0 && this.curves[0] < 1.0) {
        endGradient = (this.curves[1] - 1.0) / (this.curves[0] - 1.0);
      }
      return 1.0 + endGradient * (time - 1.0);
    }

    while (start < end) {
      mid = (start + end) / 2;
      const xEst = Cubic.calculate(this.curves[0], this.curves[2], mid);
      if (Math.abs(time - xEst) < 0.00001) {
        return Cubic.calculate(this.curves[1], this.curves[3], mid);
      }
      if (xEst < time) {
        start = mid;
      } else {
        end = mid;
      }
    }
    
    return Cubic.calculate(this.curves[1], this.curves[3], mid);
  }

  /**
   * Calculates a point on the cubic bezier curve
   * @param a - First control point
   * @param b - Second control point
   * @param m - Time parameter (0.0 to 1.0)
   * @returns The calculated value
   */
  static calculate(a: number, b: number, m: number): number {
    return 3.0 * a * (1 - m) * (1 - m) * m + 3.0 * b * (1 - m) * m * m + m * m * m;
  }
} 