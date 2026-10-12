/**
 * La scène 3D de la Star Map : Three.js, les étiquettes en DOM par-dessus, la
 * caméra qui vole d'un lieu à l'autre. Impérative à dessein : React tient le
 * lieu regardé et le panneau, cette scène ne fait que dessiner et signaler un
 * clic. Chargée à la demande (`import()`), comme Three.js.
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  BODY_TYPES,
  MARKER_COLOR,
  STAR_MAP_LANES,
  STAR_MAP_SYSTEMS,
  SYSTEM_LOOK,
  markerShape,
  type LaidOutPlace,
  type StarMapSystem,
} from "@/lib/star-map-layout";

export type StarMapScene = {
  /** Regarder un lieu ; `null` : les trois systèmes. */
  focus(slug: string | null, instant?: boolean): void;
  /** Le nombre de lots sous chaque lieu, pour les pastilles. */
  setCounts(counts: Map<string, number>): void;
  setOutposts(visible: boolean): void;
  /** La place que le panneau prend à droite et en bas, en pixels. */
  setInset(right: number, bottom: number): void;
  dispose(): void;
};

type Options = {
  canvas: HTMLCanvasElement;
  labels: HTMLElement;
  places: Map<string, LaidOutPlace>;
  typeLabel: (place: LaidOutPlace) => string;
  onSelect: (slug: string | null) => void;
};

/** Une couleur prise telle quelle, sans conversion : les shaders écrivent en sRGB. */
const raw = (hex: string) =>
  new THREE.Color().setStyle(hex, THREE.LinearSRGBColorSpace);

const NOISE = /* glsl */ `
float hash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float v=0.0; float a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=0.5; } return v; }
`;

const SKY_FRAGMENT =
  NOISE +
  /* glsl */ `
varying vec3 vDir; uniform vec3 uA; uniform vec3 uB; uniform vec3 uC;
float stars(vec3 d, float scale, float thr){ vec3 c = floor(d*scale); float h = hash(c+11.0); if(h<thr) return 0.0;
  vec3 p = (c+0.5+0.35*(vec3(hash(c+1.0),hash(c+2.0),hash(c+3.0))-0.5))/scale; float dd = length(d-p)*scale; return smoothstep(0.5,0.0,dd)*(h-thr)/(1.0-thr); }
void main(){
  vec3 d = normalize(vDir);
  float band = exp(-pow(d.y*2.2 + 0.35*sin(d.x*2.0), 2.0));
  float n1 = fbm(d*2.2 + vec3(3.1,0.0,1.7));
  float n2 = fbm(d*4.5 + vec3(n1*1.6));
  float n3 = fbm(d*9.0 + n2);
  float neb = smoothstep(0.35, 0.95, n2) * (0.35 + 0.9*band);
  vec3 col = vec3(0.004,0.010,0.022);
  col += uA * neb * 0.55;
  col += uB * smoothstep(0.5, 1.0, n1*n2*1.9) * 0.55 * (0.4+band);
  col += uC * smoothstep(0.55, 0.9, n3) * neb * 0.7;
  float dust = smoothstep(0.45, 0.75, fbm(d*7.0+5.0));
  col *= 1.0 - 0.55*dust*band;
  col += vec3(0.75,0.85,1.0) * band * 0.035;
  float s = stars(d, 180.0, 0.985) + stars(d, 420.0, 0.992)*0.7 + stars(d, 900.0, 0.996)*0.5;
  col += vec3(0.9,0.95,1.0) * s * (1.0 - 0.6*dust*band);
  gl_FragColor = vec4(col, 1.0);
}`;

const BODY_VERTEX = /* glsl */ `varying vec3 vN; varying vec3 vP; varying vec3 vW;
void main(){ vP = position; vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`;

const BODY_FRAGMENT =
  NOISE +
  /* glsl */ `
uniform vec3 c1; uniform vec3 c2; uniform vec3 c3; uniform int look; uniform vec3 starPos; uniform vec3 starCol; uniform float seed; uniform vec3 atmo;
varying vec3 vN; varying vec3 vP; varying vec3 vW;
void main(){
  vec3 p = normalize(vP) + seed;
  vec3 col; float night = 0.0; float emis = 0.0;
  float n = fbm(p*2.6);
  if (look == 1) {
    float b = sin(normalize(vP).y*14.0 + fbm(p*3.0)*4.0);
    col = mix(c1, c2, b*0.5+0.5); col = mix(col, c3, smoothstep(0.55,0.8,fbm(p*5.0+b)));
  } else if (look == 2) {
    col = mix(c2, c1, smoothstep(0.35,0.6,n)); col = mix(col, c3, smoothstep(0.55,0.75,fbm(p*7.0)));
    col = mix(col, vec3(1.0), smoothstep(0.75,0.95,abs(normalize(vP).y)));
  } else if (look == 4) {
    col = mix(c1, c3, smoothstep(0.3,0.7,n)); float cr = abs(fbm(p*5.0)-0.5); emis = smoothstep(0.035,0.0,cr);
  } else if (look == 5) {
    col = mix(c2, c1, smoothstep(0.35,0.6,n)); col = mix(col, c3, smoothstep(0.62,0.72,fbm(p*4.0)));
  } else if (look == 6) {
    col = mix(c2, c1, smoothstep(0.3,0.7,n)); float cr = fbm(p*11.0); col = mix(col, c3, smoothstep(0.62,0.7,cr)*0.6); col *= 0.75+0.25*fbm(p*24.0);
  } else {
    col = mix(c3, c1, smoothstep(0.3,0.65,n)); col = mix(col, c2, smoothstep(0.55,0.75,fbm(p*6.0)));
    if (look == 3) night = smoothstep(0.55,0.75,fbm(p*18.0))*smoothstep(0.4,0.6,n);
  }
  vec3 N = normalize(vN); vec3 L = normalize(starPos - vW); vec3 Vd = normalize(cameraPosition - vW);
  float d = dot(N,L); float diff = smoothstep(-0.08, 0.6, d);
  vec3 lit = col * (0.045 + 1.05*diff*starCol + 0.16*max(dot(N,Vd),0.0));
  lit += vec3(1.0,0.75,0.4) * night * (1.0-smoothstep(-0.2,0.15,d)) * 1.2;
  lit += vec3(1.0,0.45,0.1) * emis * (0.5+0.5*(1.0-diff));
  float fr = pow(1.0 - max(dot(N,Vd),0.0), 3.0);
  lit += atmo * fr * (0.15 + 1.1*smoothstep(-0.3,0.5,d));
  gl_FragColor = vec4(lit, 1.0);
}`;

/**
 * L'allure d'un corps : sa palette et son type de surface. Les corps connus
 * ont la leur ; les autres en tirent une de leur slug, stable d'une visite à
 * l'autre.
 */
const LOOKS: Record<string, [number, string, string, string]> = {
  crusader: [1, "#d9a77a", "#f2dcc0", "#a8714f"],
  hurston: [0, "#8b6a4a", "#c49b6b", "#5a4632"],
  arccorp: [3, "#b8573a", "#e0a070", "#3a2a2a"],
  microtech: [2, "#d8ecff", "#9cc4e8", "#ffffff"],
  "pyro-i": [4, "#3a1c12", "#ff6a1a", "#7a2e12"],
  monox: [0, "#8a8f87", "#5c625a", "#b5b8ad"],
  bloom: [5, "#4f7a3a", "#2f5a3a", "#a8a070"],
  "pyro-iv": [0, "#9c7a5a", "#6a5040", "#c0a080"],
  "pyro-v": [1, "#c26a3a", "#f0b070", "#7a3a2a"],
  terminus: [2, "#b0c8d8", "#e8f0f4", "#7090a8"],
  "nyx-i": [0, "#6a5a7a", "#9a88aa", "#3a3048"],
  "nyx-ii": [2, "#c8d8f0", "#8aa0c8", "#eef4ff"],
  "nyx-iii": [0, "#5a4a3a", "#8a7a6a", "#2a2420"],
  delamar: [6, "#6a6460", "#8a847a", "#403a36"],
};
const MOON_PALETTES: [string, string, string][] = [
  ["#a89a8a", "#7a6e62", "#cfc4b6"],
  ["#c9b48a", "#8a7a5a", "#e6d6b0"],
  ["#9ab0b8", "#6a8088", "#d0e0e6"],
];
const PLANET_PALETTES: [number, string, string, string][] = [
  [0, "#8b7a6a", "#b39b80", "#5a4c40"],
  [2, "#c8d8f0", "#8aa0c8", "#eef4ff"],
  [5, "#5f7a4a", "#3a5a40", "#a8a070"],
];

function hashOf(text: string): number {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return hash >>> 0;
}

function lookOf(place: LaidOutPlace): [number, string, string, string] {
  const known = LOOKS[place.slug];
  if (known) return known;
  if (place.type === "moon")
    return [6, ...MOON_PALETTES[hashOf(place.slug) % 3]];
  return PLANET_PALETTES[hashOf(place.slug) % 3];
}

function glowTexture(stops: [number, string][]): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function flareTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const context = canvas.getContext("2d")!;
  context.translate(256, 256);
  context.globalCompositeOperation = "lighter";
  for (const [reach, width, alpha] of [
    [250, 3, 0.55],
    [180, 1.5, 0.35],
  ]) {
    for (const angle of [0, Math.PI / 2]) {
      context.save();
      context.rotate(angle);
      const gradient = context.createLinearGradient(-reach, 0, reach, 0);
      gradient.addColorStop(0, "rgba(255,255,255,0)");
      gradient.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = gradient;
      context.fillRect(-reach, -width, reach * 2, width * 2);
      context.restore();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const ease = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const UNIVERSE_TARGET = new THREE.Vector3(0, -10, -20);
const UNIVERSE_DISTANCE = 820;

export function createStarMap({
  canvas,
  labels,
  places,
  typeLabel,
  onSelect,
}: Options): StarMapScene {
  const V = THREE.Vector3;
  const world = (place: LaidOutPlace) => new V(...place.world!);
  const get = (slug?: string) => (slug ? places.get(slug) : undefined);
  const ancestors = (place: LaidOutPlace) => {
    const chain: LaidOutPlace[] = [];
    let current: LaidOutPlace | undefined = place;
    while (current && chain.length < 12) {
      chain.unshift(current);
      current = get(current.parentSlug);
    }
    return chain;
  };
  /** Le lieu dessiné le plus proche, en remontant : un magasin se regarde depuis sa ville. */
  const drawn = (place: LaidOutPlace) => {
    let current: LaidOutPlace | undefined = place;
    while (current && !current.world) current = get(current.parentSlug);
    return current;
  };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.005, 20000);
  camera.position.set(0, 420, 760);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  // Clic gauche pour tourner, clic droit pour déplacer, molette pour zoomer.
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  };
  controls.screenSpacePanning = true;
  controls.rotateSpeed = 0.6;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = Math.PI - 0.15;
  controls.target.copy(UNIVERSE_TARGET);

  const disposables: { dispose(): void }[] = [renderer, controls];
  const track = <T extends { dispose(): void }>(thing: T) => {
    disposables.push(thing);
    return thing;
  };

  // ── Ciel : nébuleuse procédurale teintée par le système regardé ──
  const skyUniforms = {
    uA: { value: raw("#1b3a8a") },
    uB: { value: raw("#0c6f8a") },
    uC: { value: raw("#5a1f6e") },
  };
  const sky = new THREE.Mesh(
    track(new THREE.SphereGeometry(6000, 64, 32)),
    track(
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: skyUniforms,
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: SKY_FRAGMENT,
      }),
    ),
  );
  sky.renderOrder = -10;
  scene.add(sky);
  {
    const count = 1400;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let index = 0; index < count; index++) {
      const t = random() * Math.PI * 2;
      const u = random() * 2 - 1;
      const y = random() < 0.5 ? u * 0.35 : u;
      const ring = Math.sqrt(1 - y * y);
      positions.set(
        [5000 * ring * Math.cos(t), 5000 * y, 5000 * ring * Math.sin(t)],
        index * 3,
      );
      const tint = random();
      const base =
        tint < 0.2 ? [1, 0.82, 0.65] : tint < 0.4 ? [0.7, 0.82, 1] : [1, 1, 1];
      const bright = 0.4 + random() * 0.6;
      colors.set(
        base.map((value) => value * bright),
        index * 3,
      );
    }
    const geometry = track(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const stars = new THREE.Points(
      geometry,
      track(
        new THREE.PointsMaterial({
          size: 1.6,
          sizeAttenuation: false,
          vertexColors: true,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
        }),
      ),
    );
    stars.renderOrder = -9;
    sky.add(stars);
  }

  const glow = track(
    glowTexture([
      [0, "rgba(255,255,255,1)"],
      [0.12, "rgba(255,255,255,0.65)"],
      [0.35, "rgba(255,255,255,0.16)"],
      [1, "rgba(255,255,255,0)"],
    ]),
  );
  const dot = track(
    glowTexture([
      [0, "rgba(255,255,255,1)"],
      [0.45, "rgba(255,255,255,0.9)"],
      [0.6, "rgba(255,255,255,0)"],
      [1, "rgba(255,255,255,0)"],
    ]),
  );
  const flare = track(flareTexture());
  const sprite = (
    texture: THREE.Texture,
    color: THREE.ColorRepresentation,
    size: number,
    opacity = 1,
  ) => {
    const material = track(
      new THREE.SpriteMaterial({
        map: texture,
        color,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        opacity,
      }),
    );
    const object = new THREE.Sprite(material);
    object.scale.setScalar(size);
    return object;
  };

  // ── Étoiles, une par système ──
  const starWorld = new Map<StarMapSystem, THREE.Vector3>();
  const meshes: THREE.Object3D[] = [];
  const sphere = track(new THREE.SphereGeometry(1, 72, 48));
  for (const system of STAR_MAP_SYSTEMS) {
    const look = SYSTEM_LOOK[system];
    const center = new V(...look.center);
    starWorld.set(system, center);
    if (!places.has(system)) continue;
    const color = new THREE.Color(look.color);
    const size = system === "nyx" ? 2.6 : 3.2;
    const core = new THREE.Mesh(
      sphere,
      track(
        new THREE.MeshBasicMaterial({
          color: color.clone().lerp(new THREE.Color(1, 1, 1), 0.7),
        }),
      ),
    );
    core.scale.setScalar(size * 0.38);
    core.position.copy(center);
    core.userData.slug = system;
    scene.add(core);
    meshes.push(core);
    for (const [texture, factor, opacity] of [
      [glow, 7, 1],
      [glow, 26, 0.35],
      [flare, 16, 0.55],
    ] as const) {
      const object = sprite(texture, color, size * factor, opacity);
      object.position.copy(center);
      scene.add(object);
    }
  }

  // ── Planètes et lunes ──
  for (const place of places.values()) {
    if (!BODY_TYPES.has(place.type) || !place.world || !place.system) continue;
    const [look, c1, c2, c3] = lookOf(place);
    const tint = new THREE.Color(SYSTEM_LOOK[place.system].color).lerp(
      new THREE.Color(1, 1, 1),
      0.6,
    );
    const atmosphere =
      look === 6
        ? raw("#000000")
        : raw(c1).lerp(raw("#8fc8ff"), 0.6).multiplyScalar(0.8);
    const mesh = new THREE.Mesh(
      sphere,
      track(
        new THREE.ShaderMaterial({
          vertexShader: BODY_VERTEX,
          fragmentShader: BODY_FRAGMENT,
          uniforms: {
            c1: { value: raw(c1) },
            c2: { value: raw(c2) },
            c3: { value: raw(c3) },
            look: { value: look },
            starPos: { value: starWorld.get(place.system) },
            starCol: {
              value: new THREE.Color().setRGB(
                tint.r,
                tint.g,
                tint.b,
                THREE.LinearSRGBColorSpace,
              ),
            },
            seed: { value: (hashOf(place.slug) % 1000) / 100 },
            atmo: { value: atmosphere },
          },
        }),
      ),
    );
    mesh.scale.setScalar(place.r);
    mesh.position.copy(world(place));
    mesh.userData.slug = place.slug;
    scene.add(mesh);
    meshes.push(mesh);
  }

  // ── Stations : un octaèdre qui luit ──
  const spinning: THREE.Object3D[] = [];
  const octahedron = track(new THREE.OctahedronGeometry(0.06));
  const stationMaterial = track(
    new THREE.MeshBasicMaterial({ color: MARKER_COLOR.station }),
  );
  for (const place of places.values()) {
    if (place.type !== "station" || !place.world || place.normal) continue;
    const mesh = new THREE.Mesh(octahedron, stationMaterial);
    mesh.add(sprite(glow, MARKER_COLOR.station, 0.6, 0.6));
    mesh.position.copy(world(place));
    scene.add(mesh);
    spinning.push(mesh);
  }

  // ── Lieux au sol : un nuage de points par corps ──
  const surfaceClouds: THREE.Points[] = [];
  {
    const groups = new Map<string, LaidOutPlace[]>();
    for (const place of places.values()) {
      if (!place.normal || !place.world) continue;
      const body = drawnBody(place);
      if (!body) continue;
      groups.set(body.slug, [...(groups.get(body.slug) ?? []), place]);
    }
    for (const [body, list] of groups) {
      const positions = new Float32Array(list.length * 3);
      const colors = new Float32Array(list.length * 3);
      list.forEach((place, index) => {
        positions.set(place.world!, index * 3);
        colors.set(
          new THREE.Color(
            MARKER_COLOR[place.type] ?? MARKER_COLOR.outpost,
          ).toArray(),
          index * 3,
        );
      });
      const geometry = track(new THREE.BufferGeometry());
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3),
      );
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const cloud = new THREE.Points(
        geometry,
        track(
          new THREE.PointsMaterial({
            size: 6,
            map: dot,
            transparent: true,
            sizeAttenuation: false,
            vertexColors: true,
            depthWrite: false,
          }),
        ),
      );
      cloud.userData.body = body;
      scene.add(cloud);
      surfaceClouds.push(cloud);
    }
  }
  function drawnBody(place: LaidOutPlace): LaidOutPlace | undefined {
    let current = get(place.parentSlug);
    while (current && !BODY_TYPES.has(current.type))
      current = get(current.parentSlug);
    return current;
  }

  // ── Orbites ──
  const circle = (
    center: THREE.Vector3,
    radius: number,
    color: THREE.ColorRepresentation,
    opacity: number,
    segments = 256,
  ) => {
    const points: THREE.Vector3[] = [];
    for (let index = 0; index <= segments; index++) {
      const angle = (index / segments) * Math.PI * 2;
      points.push(
        new V(
          center.x + Math.cos(angle) * radius,
          center.y,
          center.z + Math.sin(angle) * radius,
        ),
      );
    }
    return new THREE.Line(
      track(new THREE.BufferGeometry().setFromPoints(points)),
      track(
        new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity,
          depthWrite: false,
        }),
      ),
    );
  };
  for (const place of places.values()) {
    if (!BODY_TYPES.has(place.type) || !place.world || !place.system) continue;
    const parent = drawnBody(place);
    if (parent?.world) {
      scene.add(
        circle(
          world(parent),
          world(place).distanceTo(world(parent)),
          "#9ed0ff",
          0.14,
          128,
        ),
      );
    } else {
      const center = starWorld.get(place.system)!;
      const at = world(place);
      const orbit = circle(
        center,
        Math.hypot(at.x - center.x, at.z - center.z),
        SYSTEM_LOOK[place.system].color,
        0.22,
      );
      orbit.position.y = at.y - center.y;
      scene.add(orbit);
    }
  }

  // ── Couloirs de saut, visibles depuis la vue d'ensemble ──
  const lanes: THREE.Line[] = [];
  for (const [from, to] of STAR_MAP_LANES) {
    const a = starWorld.get(from)!;
    const b = starWorld.get(to)!;
    const middle = a
      .clone()
      .add(b)
      .multiplyScalar(0.5)
      .add(new V(0, 40, 0));
    const curve = new THREE.QuadraticBezierCurve3(a, middle, b);
    const line = new THREE.Line(
      track(new THREE.BufferGeometry().setFromPoints(curve.getPoints(120))),
      track(
        new THREE.LineDashedMaterial({
          color: "#9ed0ff",
          dashSize: 8,
          gapSize: 6,
          transparent: true,
          opacity: 0.35,
        }),
      ),
    );
    line.computeLineDistances();
    scene.add(line);
    lanes.push(line);
  }

  // ── Étiquettes ──
  type Label = {
    el: HTMLElement;
    chip: HTMLElement;
    place: LaidOutPlace;
    shown: boolean;
    x: number;
    y: number;
    minor: boolean;
  };
  const labelList: Label[] = [];
  const labelBySlug = new Map<string, Label>();
  for (const place of places.values()) {
    if (!place.world || !place.system) continue;
    const element = document.createElement("button");
    element.type = "button";
    const minor =
      place.type === "outpost" ||
      (place.type === "station" && !!place.parentSlug && isSpacePoint(place));
    element.className =
      "star-map-label" +
      (minor ? " minor" : "") +
      (STAR_MAP_SYSTEMS.includes(place.slug as StarMapSystem)
        ? " system"
        : "") +
      (place.type === "planet" || place.type === "city" ? " major" : "");
    element.setAttribute("aria-label", `${typeLabel(place)} ${place.name}`);
    const marker = document.createElement("i");
    marker.className = `star-map-marker ${markerShape(place.type)}`;
    marker.style.setProperty(
      "--c",
      place.system && STAR_MAP_SYSTEMS.includes(place.slug as StarMapSystem)
        ? SYSTEM_LOOK[place.slug as StarMapSystem].color
        : (MARKER_COLOR[place.type] ?? MARKER_COLOR.planet),
    );
    const text = document.createElement("span");
    text.className = "star-map-text";
    text.textContent = place.name;
    const chip = document.createElement("span");
    chip.className = "star-map-chip";
    chip.hidden = true;
    element.append(marker, text, chip);
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      onSelect(place.slug);
    });
    labels.appendChild(element);
    const label = { el: element, chip, place, shown: false, x: 0, y: 0, minor };
    labelList.push(label);
    labelBySlug.set(place.slug, label);
  }
  /** Une station posée dans le vide du système, loin de tout corps. */
  function isSpacePoint(place: LaidOutPlace) {
    const body = drawnBody(place);
    return !body?.world || world(place).distanceTo(world(body)) > body.r * 6;
  }

  // ── Navigation ──
  let focusSlug: string | null = null;
  let showOutposts = true;
  let inset = { right: 0, bottom: 0 };
  let skyTarget = ["#1b3a8a", "#0c6f8a", "#5a1f6e"].map(raw);

  const maxChildDistance = (place: LaidOutPlace) => {
    let max = 0;
    const center = world(place);
    for (const slug of place.children) {
      const child = get(slug);
      if (!child?.world || child.normal) continue;
      // Une station lointaine rattachée à un corps (Checkmate à Pyro I) ne
      // dicte pas le cadrage : elle se trouve à un point de Lagrange.
      if (
        !BODY_TYPES.has(child.type) &&
        BODY_TYPES.has(place.type) &&
        isSpacePoint(child)
      )
        continue;
      max = Math.max(max, world(child).distanceTo(center) + child.r);
    }
    return max;
  };

  function viewFor(place: LaidOutPlace | undefined): {
    target: THREE.Vector3;
    distance: number;
    normal?: THREE.Vector3;
  } {
    if (!place)
      return { target: UNIVERSE_TARGET.clone(), distance: UNIVERSE_DISTANCE };
    if (STAR_MAP_SYSTEMS.includes(place.slug as StarMapSystem)) {
      return {
        target: world(place),
        distance: maxChildDistance(place) * 2.25 + 12,
      };
    }
    if (place.type === "planet")
      return {
        target: world(place),
        distance: Math.max(place.r * 7, maxChildDistance(place) * 2.5),
      };
    if (place.type === "moon")
      return {
        target: world(place),
        distance: Math.max(place.r * 4.2, maxChildDistance(place) * 2.4),
      };
    if (place.normal) {
      const body = drawnBody(place);
      return {
        target: world(place),
        distance: (body?.r ?? 0.5) * 1.5,
        normal: new V(...place.normal),
      };
    }
    if (place.type === "station")
      return { target: world(place), distance: 1.6 };
    return { target: world(place), distance: 3 };
  }

  let animation: {
    start: number;
    duration: number;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    fromDistance: number;
    toDistance: number;
    fromDirection: THREE.Vector3;
    toDirection: THREE.Vector3;
  } | null = null;

  function focus(slug: string | null, instant = false) {
    focusSlug = slug && places.has(slug) ? slug : null;
    const place = focusSlug ? places.get(focusSlug)! : undefined;
    const shown = place ? drawn(place) : undefined;
    const view = viewFor(shown);
    if (camera.aspect < 1 && shown)
      view.distance /= Math.max(0.55, camera.aspect * 1.1);

    const fromTarget = controls.target.clone();
    const offset = camera.position.clone().sub(fromTarget);
    const fromDistance = offset.length();
    const fromDirection = offset.normalize();
    let toDirection = fromDirection.clone().setY(0);
    if (toDirection.lengthSq() < 1e-4) toDirection.set(0, 0, 1);
    toDirection
      .normalize()
      .multiplyScalar(Math.cos(0.62))
      .add(new V(0, Math.sin(0.62), 0));

    if (view.normal)
      toDirection = view.normal
        .clone()
        .add(new V(0, 0.5, 0))
        .normalize();
    else if (shown && BODY_TYPES.has(shown.type) && shown.system) {
      // La face où se trouvent les villes d'une lune, sinon la face éclairée.
      const ground = shown.children
        .map(get)
        .filter((child): child is LaidOutPlace => !!child?.normal);
      const towns = ground.filter(
        (child) => child.type === "city" || child.type === "spaceport",
      );
      const average = new V();
      (towns.length ? towns : ground).forEach((child) =>
        average.add(new V(...child.normal!)),
      );
      if (
        shown.type === "moon" &&
        average.length() > 0.25 * Math.max(1, towns.length || ground.length)
      ) {
        toDirection = average
          .normalize()
          .add(new V(0, 0.35, 0))
          .normalize();
      } else {
        const toStar = starWorld
          .get(shown.system)!
          .clone()
          .sub(world(shown))
          .setY(0)
          .normalize();
        toDirection = toStar
          .applyAxisAngle(new V(0, 1, 0), 0.7)
          .multiplyScalar(Math.cos(0.45))
          .add(new V(0, Math.sin(0.45), 0))
          .normalize();
      }
    }

    controls.minDistance = shown
      ? Math.max((shown.r || 0.05) * 1.15, view.distance * 0.08)
      : 200;
    controls.maxDistance = shown ? view.distance * 3.5 : 2400;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (instant || reduced) {
      controls.target.copy(view.target);
      camera.position
        .copy(view.target)
        .addScaledVector(toDirection, view.distance);
      animation = null;
    } else {
      animation = {
        start: performance.now(),
        duration: 1500,
        fromTarget,
        toTarget: view.target,
        fromDistance,
        toDistance: view.distance,
        fromDirection,
        toDirection,
      };
    }
    const system = place?.system ?? null;
    skyTarget = (
      system ? SYSTEM_LOOK[system].sky : ["#1b3a8a", "#0c6f8a", "#5a1f6e"]
    ).map(raw);
  }

  function step(now: number) {
    if (!animation) return;
    const t = Math.min(1, (now - animation.start) / animation.duration);
    const e = ease(t);
    const target = animation.fromTarget.clone().lerp(animation.toTarget, e);
    const distance = Math.exp(
      Math.log(animation.fromDistance) * (1 - e) +
        Math.log(animation.toDistance) * e,
    );
    const direction = animation.fromDirection
      .clone()
      .lerp(animation.toDirection, e)
      .normalize();
    controls.target.copy(target);
    camera.position.copy(target).addScaledVector(direction, distance);
    if (t >= 1) animation = null;
  }

  // ── Ce qui s'étiquette, selon le lieu regardé ──
  function visibleSet(): Set<string> {
    const visible = new Set<string>();
    const place = focusSlug ? places.get(focusSlug) : undefined;
    if (!place) {
      STAR_MAP_SYSTEMS.forEach((slug) => visible.add(slug));
      return visible;
    }
    const host = drawn(place);
    if (!host) return visible;
    if (STAR_MAP_SYSTEMS.includes(host.slug as StarMapSystem)) {
      host.children.forEach((slug) => visible.add(slug));
      return visible;
    }
    // Un lieu au sol ou une station : on voit ce que porte son corps.
    let anchor = host;
    if (host.normal || (!BODY_TYPES.has(host.type) && host.type !== "station"))
      anchor = drawnBody(host) ?? host;
    if (
      host.type === "station" &&
      !host.children.some((slug) => get(slug)?.world)
    )
      anchor = get(host.parentSlug) ?? host;
    anchor.children.forEach((slug) => visible.add(slug));
    visible.add(anchor.slug);
    if (anchor.type === "moon") {
      const planet = drawnBody(anchor);
      if (planet) {
        visible.add(planet.slug);
        planet.children.forEach((slug) => {
          if (!get(slug)?.normal) visible.add(slug);
        });
      }
    }
    ancestors(place).forEach((ancestor) => {
      if (!STAR_MAP_SYSTEMS.includes(ancestor.slug as StarMapSystem))
        visible.add(ancestor.slug);
    });
    return visible;
  }

  const projected = new V();
  const toCamera = new V();
  function placeLabels(width: number, height: number) {
    const visible = visibleSet();
    for (const label of labelList) {
      const place = label.place;
      let show = visible.has(place.slug);
      if (
        show &&
        place.type === "outpost" &&
        !showOutposts &&
        place.slug !== focusSlug
      )
        show = false;
      if (show && place.normal) {
        // La face cachée d'un corps n'étiquette rien.
        toCamera.copy(camera.position).sub(world(place));
        const normal = new V(...place.normal);
        if (toCamera.dot(normal) < 0.02 * toCamera.length()) show = false;
      }
      if (show) {
        projected.set(...place.world!).project(camera);
        const x = (projected.x * 0.5 + 0.5) * width;
        const y = (-projected.y * 0.5 + 0.5) * height;
        if (
          projected.z > 1 ||
          x < -50 ||
          x > width + 50 ||
          y < -20 ||
          y > height + 20
        )
          show = false;
        else {
          label.x = x;
          label.y = y;
        }
      }
      label.shown = show;
    }
    // Les grandes étiquettes qui se chevauchent se décalent vers le bas.
    const majors = labelList
      .filter((label) => label.shown && !label.minor)
      .sort((a, b) => a.y - b.y);
    const placed: { x: number; y: number; w: number }[] = [];
    for (const label of majors) {
      const w = label.place.name.length * 7.5 + 30;
      let y = label.y;
      for (let tries = 0; tries < 4; tries++) {
        const hit = placed.find(
          (other) =>
            Math.abs(other.y - y) < 17 &&
            label.x < other.x + other.w &&
            other.x < label.x + w,
        );
        if (!hit) break;
        y = hit.y + 18;
      }
      label.y = y;
      placed.push({ x: label.x, y, w });
    }
    // Une petite étiquette trop près d'une grande s'efface.
    for (const label of labelList) {
      if (
        label.shown &&
        label.minor &&
        majors.some(
          (major) =>
            Math.abs(major.x - label.x) < 70 &&
            Math.abs(major.y - label.y) < 16,
        )
      ) {
        label.shown = false;
      }
      label.el.classList.toggle("hidden", !label.shown);
      label.el.tabIndex = label.shown ? 0 : -1;
      if (label.shown)
        label.el.style.transform = `translate(${label.x.toFixed(1)}px, ${(label.y - 10).toFixed(1)}px)`;
    }
    for (const cloud of surfaceClouds) {
      cloud.visible = showOutposts || cloud.userData.body === focusSlug;
    }
    const lanesOn = focusSlug === null;
    for (const lane of lanes) {
      const material = lane.material as THREE.LineDashedMaterial;
      material.opacity += ((lanesOn ? 0.35 : 0) - material.opacity) * 0.08;
      lane.visible = material.opacity > 0.01;
    }
  }

  // ── Taille, clics, rendu ──
  let size = { width: 1, height: 1 };
  function resize() {
    const parent = canvas.parentElement!;
    size = { width: parent.clientWidth, height: parent.clientHeight };
    renderer.setSize(size.width, size.height, false);
    camera.aspect = size.width / size.height;
    // Le panneau couvre un bord : on recentre la vue sur l'espace libre.
    camera.setViewOffset(
      size.width,
      size.height,
      inset.right / 2,
      inset.bottom / 2,
      size.width,
      size.height,
    );
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas.parentElement!);
  resize();

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let down: { x: number; y: number } | null = null;
  const onDown = (event: PointerEvent) => {
    // Seul le clic gauche choisit : le droit déplace la vue.
    down = event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
  };
  const onUp = (event: PointerEvent) => {
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5)
      return;
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(meshes, false)[0];
    if (hit) onSelect(hit.object.userData.slug as string);
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);
  // La molette sur une étiquette zoome comme sur la scène, au lieu de rien.
  const onLabelWheel = (event: WheelEvent) => {
    event.preventDefault();
    canvas.dispatchEvent(new WheelEvent("wheel", event));
  };
  labels.addEventListener("wheel", onLabelWheel, { passive: false });

  let frame = 0;
  let last = performance.now();
  const loop = (now: number) => {
    frame = requestAnimationFrame(loop);
    const delta = Math.min(0.1, (now - last) / 1000);
    last = now;
    step(now);
    skyUniforms.uA.value.lerp(skyTarget[0], 0.03);
    skyUniforms.uB.value.lerp(skyTarget[1], 0.03);
    skyUniforms.uC.value.lerp(skyTarget[2], 0.03);
    for (const object of spinning) {
      object.rotation.y += delta * 0.6;
      // Une station garde une taille lisible, de près comme de loin.
      object.scale.setScalar(
        Math.min(1, camera.position.distanceTo(object.position) * 0.11),
      );
    }
    if (!animation) controls.update();
    const distance = camera.position.distanceTo(controls.target);
    camera.near = Math.max(0.0008, distance * 0.01);
    camera.far = Math.max(distance * 40, 3000);
    camera.updateProjectionMatrix();
    sky.position.copy(camera.position);
    sky.scale.setScalar((camera.far * 0.8) / 6000);
    renderer.render(scene, camera);
    placeLabels(size.width, size.height);
  };
  frame = requestAnimationFrame(loop);

  return {
    focus,
    setCounts(counts) {
      for (const label of labelList) {
        const count = counts.get(label.place.slug) ?? 0;
        label.chip.hidden = count === 0;
        label.chip.textContent = String(count);
      }
    },
    setOutposts(visible) {
      showOutposts = visible;
    },
    setInset(right, bottom) {
      inset = { right, bottom };
      resize();
    },
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      labels.removeEventListener("wheel", onLabelWheel);
      labelList.forEach((label) => label.el.remove());
      disposables.forEach((thing) => thing.dispose());
    },
  };
}
