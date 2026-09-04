// Prevent tsc from scanning the massive @arcgis/core package
declare module "@arcgis/core/*" {
  const value: any;
  export default value;
}
