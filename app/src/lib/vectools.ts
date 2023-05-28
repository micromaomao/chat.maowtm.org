export type Vector = Float64Array | number[];

export function assertLengthEqual(vector1: Vector, vector2: Vector): void {
  if (vector1.length !== vector2.length) {
    throw new Error(`Cannot compare vectors of different lengths: ${vector1.length} and ${vector2.length}`);
  }
}

export function dot(a: Vector, b: Vector): number {
  assertLengthEqual(a, b);
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result += a[i] * b[i];
  }
  return result;
}

export function norm(v: Vector): number {
  let result = 0;
  for (let i = 0; i < v.length; i++) {
    result += v[i] * v[i];
  }
  return Math.sqrt(result);
}

export function similarity(a: Vector, b: Vector): number {
  return dot(a, b) / (norm(a) * norm(b));
}
