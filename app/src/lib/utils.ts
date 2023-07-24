export function nestProperties(obj: object): object {
  let ret = {};
  for (let [key, value] of Object.entries(obj)) {
    let parts = key.split(".");
    let last = parts.pop();
    let cur = ret;
    for (let part of parts) {
      if (!cur.hasOwnProperty(part)) {
        cur[part] = {};
      }
      cur = cur[part];
    }
    cur[last] = value;
  }
  return ret;
}

export function input2log(input: string | null | undefined): string {
  if (input === null) {
    return "null";
  }
  if (input === undefined) {
    return "undefined";
  }
  if (input.length > 100) {
    input = input.slice(0, 100) + "...";
  }
  return JSON.stringify(input);
}
