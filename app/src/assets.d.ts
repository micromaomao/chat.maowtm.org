declare module "*.module.css" {
  const classes: Record<string, string>;
  export = classes;
}

declare module "*.svg" {
  const url: string;
  export default url;
}

declare module "*.png" {
  const url: string;
  export default url;
}
