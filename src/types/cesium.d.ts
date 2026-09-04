declare module "cesium" {
  export * from "cesium/Source/Cesium";
  export default Cesium;
}

declare namespace Cesium {
  interface ViewerOptions {
    [key: string]: any;
  }
  class Viewer {
    constructor(container: string | HTMLElement, options?: ViewerOptions);
    scene: Scene;
    camera: Camera;
    entities: EntityCollection;
    dataSources: DataSourceCollection;
    globe: Globe;
    destroy(): void;
    isDestroyed(): boolean;
    zoomTo(target: any, offset?: any): Promise<boolean>;
    flyTo(target: any, options?: any): Promise<boolean>;
  }
  class Scene {
    backgroundColor: Color;
    fog: Fog;
    globe: Globe;
    skyAtmosphere: SkyAtmosphere;
    skyBox: SkyBox;
    sun: Sun;
    groundPrimitives: PrimitiveCollection;
    primitives: PrimitiveCollection;
    highDynamicRange: boolean;
    fxaa: boolean;
    camera: Camera;
    screenSpaceCameraController: ScreenSpaceCameraController;
  }
  class Camera {
    position: Cartesian3;
    direction: Cartesian3;
    up: Cartesian3;
    heading: number;
    pitch: number;
    roll: number;
    flyTo(destination: any, options?: any): Promise<boolean>;
    setPositionOrientation(options: any): void;
    computeViewRectangle(): Rectangle;
  }
  class EntityCollection {
    add(options: any): Entity;
    remove(entity: Entity): boolean;
    removeAll(): void;
    getById(id: string): Entity | undefined;
    values: Entity[];
  }
  class Entity {
    id: string;
    name: string;
    position: any;
    point: any;
    polyline: any;
    polygon: any;
    label: any;
    billboard: any;
    ellipse: any;
    corridor: any;
    show: boolean;
  }
  class DataSourceCollection {
    add(dataSource: DataSource | Promise<DataSource>): Promise<DataSource>;
    remove(dataSource: DataSource, destroy?: boolean): boolean;
    removeAll(destroy?: boolean): void;
  }
  class DataSource {
    name: string;
    entities: EntityCollection;
    show: boolean;
  }
  class PrimitiveCollection {
    add(primitive: any): any;
    remove(primitive: any): boolean;
    removeAll(): void;
  }
  class Globe {
    enableLighting: boolean;
    baseColor: Color;
    depthTestAgainstTerrain: boolean;
    maximumScreenSpaceError: number;
  }
  class ScreenSpaceCameraController {
    enableInputs: boolean;
    enableRotate: boolean;
    enableZoom: boolean;
    enablePan: boolean;
    minimumZoomDistance: number;
    maximumZoomDistance: number;
    inertiaSpinTime: number;
    inertiaZoomTime: number;
    inertiaPanTime: number;
    zoomEventTypes: any[];
    tiltEventTypes: any[];
  }
  class SkyAtmosphere {
    show: boolean;
  }
  class SkyBox {
    sources: any;
    show: boolean;
  }
  class Sun {
    show: boolean;
  }
  class Fog {
    enabled: boolean;
    density: number;
    screenSpaceErrorFactor: number;
    minimumBrightness: number;
  }
  class Color {
    static WHITE: Color;
    static BLACK: Color;
    static RED: Color;
    static YELLOW: Color;
    static GREEN: Color;
    static CYAN: Color;
    static BLUE: Color;
    static ORANGE: Color;
    static fromCssColorString(cssColor: string): Color;
    constructor(red?: number, green?: number, blue?: number, alpha?: number);
    withAlpha(alpha: number): Color;
    toCssColorString(): string;
  }
  class Cartesian3 {
    x: number;
    y: number;
    z: number;
    constructor(x?: number, y?: number, z?: number);
    static fromDegrees(longitude: number, latitude: number, height?: number, ellipsoid?: Ellipsoid): Cartesian3;
    static fromDegreesArray(coordinates: number[], ellipsoid?: Ellipsoid): Cartesian3[];
    static subtract(left: Cartesian3, right: Cartesian3, result?: Cartesian3): Cartesian3;
    static add(left: Cartesian3, right: Cartesian3, result?: Cartesian3): Cartesian3;
    static multiplyByScalar(cartesian: Cartesian3, scalar: number, result?: Cartesian3): Cartesian3;
    static magnitude(cartesian: Cartesian3): number;
    static normalize(cartesian: Cartesian3, result?: Cartesian3): Cartesian3;
    static cross(left: Cartesian3, right: Cartesian3, result?: Cartesian3): Cartesian3;
    static dot(left: Cartesian3, right: Cartesian3): number;
  }
  class Cartesian2 {
    x: number;
    y: number;
    constructor(x?: number, y?: number);
  }
  class Ellipsoid {
    static WGS84: Ellipsoid;
    constructor(x?: number, y?: number, z?: number);
  }
  class Rectangle {
    static fromDegrees(west: number, south: number, east: number, north: number): Rectangle;
    west: number;
    south: number;
    east: number;
    north: number;
  }
  class PolygonGeometry {
    constructor(options: any);
    static fromPositions(options: any): PolygonGeometry;
  }
  class PolylineGeometry {
    constructor(options: any);
  }
  class EllipseGeometry {
    constructor(options: any);
  }
  class CorridorGeometry {
    constructor(options: any);
  }
  class GeometryInstance {
    constructor(options: any);
  }
  class Appearance {
    constructor(options: any);
  }
  class MaterialAppearance {
    constructor(options: any);
  }
  class Primitive {
    constructor(options: any);
  }
  class PointPrimitiveCollection {
    add(options: any): any;
    remove(point: any): boolean;
    removeAll(): void;
  }
  class BillboardCollection {
    add(options: any): any;
    remove(billboard: any): boolean;
    removeAll(): void;
  }
  class LabelCollection {
    add(options: any): any;
    remove(label: any): boolean;
    removeAll(): void;
  }
  class Label {
    text: string;
    font: string;
    fillColor: Color;
    outlineColor: Color;
    outlineWidth: number;
    style: any;
    showBackground: boolean;
    backgroundColor: Color;
    verticalOrigin: any;
    horizontalOrigin: any;
    pixelOffset: Cartesian2;
    scale: number;
    translucencyByDistance: any;
    disableDepthTestDistance: any;
  }
  class Billboard {
    image: string | HTMLCanvasElement;
    width: number;
    height: number;
    verticalOrigin: any;
    horizontalOrigin: any;
    pixelOffset: Cartesian2;
    scale: number;
    disableDepthTestDistance: any;
  }
  class PointPrimitive {
    position: Cartesian3;
    color: Color;
    pixelSize: number;
    outlineColor: Color;
    outlineWidth: number;
    disableDepthTestDistance: any;
  }
  class CallbackProperty {
    constructor(callback: () => any, isConstant?: boolean);
  }
  class ConstantPositionProperty {
    constructor(value?: Cartesian3, referenceFrame?: any);
    getValue(time?: any): Cartesian3;
    setValue(value: Cartesian3, referenceFrame?: any): void;
  }
  class ConstantProperty {
    constructor(value?: any);
    getValue(): any;
    setValue(value: any): void;
  }
  class HeadingPitchRoll {
    constructor(heading?: number, pitch?: number, roll?: number);
    heading: number;
    pitch: number;
    roll: number;
  }
  class Transforms {
    static eastNorthUpToFixedFrame(origin: Cartesian3, ellipsoid?: Ellipsoid, result?: Matrix4): Matrix4;
    static headingPitchRollToFixedFrame(origin: Cartesian3, headingPitchRoll: HeadingPitchRoll, ellipsoid?: Ellipsoid, result?: Matrix4): Matrix4;
  }
  class Matrix4 {
    static IDENTITY: Matrix4;
  }
  class ScreenSpaceEventHandler {
    constructor(canvas: HTMLCanvasElement);
    setInputAction(action: (event: any) => void, type: any): void;
    removeInputAction(type: any): void;
    destroy(): void;
  }
  class ScreenSpaceEventType {
    static LEFT_CLICK: number;
    static RIGHT_CLICK: number;
    static MOUSE_MOVE: number;
    static LEFT_DOUBLE_CLICK: number;
    static WHEEL: number;
  }
  class Cartesian3 {
    static fromDegreesArrayHeights(coordinates: number[]): Cartesian3;
  }
  class Ion {
    static defaultAccessToken: string;
  }
  class ImageryLayer {
    constructor(imageryProvider: any, options?: any);
    show: boolean;
    alpha: number;
  }
  class UrlTemplateImageryProvider {
    constructor(options: any);
  }
  class Viewer {
    imageryLayers: any;
  }
  class WallGeometry {
    constructor(options: any);
  }
  class Plane {
    static fromNormalAndPointDistance(normal: Cartesian3, distance: number): Plane;
  }
  class IntersectionTests {
    static rayPlane(ray: any, plane: Plane): Cartesian3;
  }
  class Ray {
    origin: Cartesian3;
    direction: Cartesian3;
    constructor(origin: Cartesian3, direction: Cartesian3);
  }
  class HeightReference {
    static CLAMP_TO_GROUND: number;
    static RELATIVE_TO_GROUND: number;
    static NONE: number;
  }
  class VerticalOrigin {
    static BOTTOM: number;
    static CENTER: number;
    static TOP: number;
  }
  class Cartesian3 {
    static distance(left: Cartesian3, right: Cartesian3): number;
  }
  class GeometryAttribute {
    constructor(options: any);
  }
  class VertexFormat {
    static POSITION_ONLY: any;
    static POSITION_NORMAL: any;
  }
  class Primitive {
    readyPromise: Promise<Primitive>;
  }
  class EllipsoidTerrainProvider {
    constructor(options?: any);
  }
  class CesiumTerrainProvider {
    constructor(options: any);
  }
  class TerrainProvider {
    static fromWorldTerrain(options?: any): Promise<any>;
  }
  class ArcGisMapServerImageryProvider {
    constructor(options: any);
  }
  class OpenStreetMapImageryProvider {
    constructor(options: any);
  }
  class CreditDisplay {
    container: HTMLElement;
  }
  class DataSourceCollection {
    length: number;
  }
  class PropertyArray {
    constructor();
  }
  class PositionPropertyArray {
    constructor();
  }
  class SampledPositionProperty {
    constructor(referenceFrame?: any, interpolationAlgorithm?: any, interpolationDegree?: number);
    addSample(time: any, position: Cartesian3): void;
  }
  class SampledProperty {
    constructor(type: any, interpolationAlgorithm?: any, interpolationDegree?: number);
    addSample(time: any, value: any): void;
  }
  class JulianDate {
    static fromIso8601(isoString: string): JulianDate;
    static fromDate(date: Date): JulianDate;
    static now(): JulianDate;
    static lessThan(left: JulianDate, right: JulianDate): boolean;
    static addSeconds(date: JulianDate, seconds: number, result?: JulianDate): JulianDate;
    static subtract(left: JulianDate, right: JulianDate, result?: any): any;
    toIso8601(): string;
  }
  class TimeInterval {
    start: JulianDate;
    stop: JulianDate;
    data: any;
    static fromIso8601(options: any): TimeInterval;
  }
  class TimeIntervalCollection {
    addInterval(interval: TimeInterval): void;
  }
  class ClockRange {
    static LOOP_STOP: number;
    static CLAMPED: number;
    static UNBOUNDED: number;
  }
  class ClockStep {
    static SYSTEM_CLOCK: number;
    static SYSTEM_CLOCK_MULTIPLIER: number;
  }
  class DataSourceDisplay {
    constructor(options: any);
    update(): void;
    destroy(): void;
  }
  class CustomDataSource extends DataSource {
    constructor(name?: string);
  }
}
