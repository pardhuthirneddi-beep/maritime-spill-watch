declare module "@deck.gl/core" {
  export class Deck {}
  export class Layer {}
}

declare module "@deck.gl/layers" {
  class BaseLayer {
    constructor(props: Record<string, unknown>);
  }
  export class PolygonLayer extends BaseLayer {}
  export class PathLayer extends BaseLayer {}
  export class ScatterplotLayer extends BaseLayer {}
  export class IconLayer extends BaseLayer {}
  export class TextLayer extends BaseLayer {}
}

declare module "@deck.gl/mapbox" {
  export class MapboxOverlay {
    constructor(props: { interleaved: boolean; layers: unknown[] });
    setProps(props: { layers: unknown[] }): void;
  }
}

declare module "@deck.gl/react" {
  export class DeckGL {}
}
