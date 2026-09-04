// Lightweight ArcGIS type declarations — skip heavy @arcgis/core types
declare module "@arcgis/core/config.js" {
  const config: { assetsPath: string };
  export default config;
}

declare module "@arcgis/core/Map.js" {
  export default class Map {
    constructor(options: any);
  }
}

declare module "@arcgis/core/views/SceneView.js" {
  export default class SceneView {
    constructor(options: any);
    when(): Promise<void>;
    destroy(): void;
    goTo(target: any, options?: any): Promise<void>;
  }
}

declare module "@arcgis/core/layers/GraphicsLayer.js" {
  export default class GraphicsLayer {
    constructor(options?: any);
    add(graphic: any): void;
    removeAll(): void;
  }
}

declare module "@arcgis/core/Graphic.js" {
  export default class Graphic {
    constructor(options: any);
  }
}

declare module "@arcgis/core/geometry/Polygon.js" {
  export default class Polygon {
    constructor(options: any);
  }
}

declare module "@arcgis/core/geometry/Polyline.js" {
  export default class Polyline {
    constructor(options: any);
  }
}

declare module "@arcgis/core/geometry/Point.js" {
  export default class Point {
    constructor(options: any);
  }
}

declare module "@arcgis/core/symbols/SimpleFillSymbol.js" {
  export default class SimpleFillSymbol {
    constructor(options: any);
  }
}

declare module "@arcgis/core/symbols/SimpleLineSymbol.js" {
  export default class SimpleLineSymbol {
    constructor(options: any);
  }
}

declare module "@arcgis/core/symbols/PictureMarkerSymbol.js" {
  export default class PictureMarkerSymbol {
    constructor(options: any);
  }
}

declare module "@arcgis/core/symbols/TextSymbol.js" {
  export default class TextSymbol {
    constructor(options: any);
  }
}
