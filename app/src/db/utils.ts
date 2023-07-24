export function ulidArrayToSPgStr(arr: string[]): string {
  for (let elem of arr) {
    if (!/^[a-zA-Z0-9]+$/.test(elem)) {
      throw new Error(`Invalid ULID: ${elem}`);
    }
  }
  return "{" + arr.join(",") + "}";
}

export function PgStrToUlidArr(pgstr: string): string[] {
  if (!pgstr.startsWith("{") || !pgstr.endsWith("}")) {
    throw new Error(`Invalid ULID array: ${pgstr}`);
  }
  let middle = pgstr.slice(1, -1);
  if (/[^A-Za-z0-9,]/.test(middle)) {
    throw new Error(`Invalid ULID array: ${pgstr}`);
  }
  return middle.split(",");
}
