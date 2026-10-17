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
  PRIVATE_MARKER_COLOR,
  STAR_MAP_LANES,
  STAR_MAP_SYSTEMS,
  SYSTEM_LOOK,
  markerShape,
  type LaidOutPlace,
  type StarMapPlayer,
  type StarMapSystem,
} from "@/lib/star-map-layout";
import { bodyLook, hashOf } from "@/lib/star-map-bodies";

export type StarMapScene = {
  /** Regarder un lieu ; `null` : les trois systèmes. */
  focus(slug: string | null, instant?: boolean): void;
  /** Le nombre de lots sous chaque lieu, pour les pastilles. */
  setCounts(counts: Map<string, number>): void;
  setOutposts(visible: boolean): void;
  /** Les joueurs en jeu, à leur dernière position ; remplace les précédents. */
  setPlayers(players: StarMapPlayer[], selected: string | null): void;
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
  /** Un clic sur un joueur, par son id. */
  onPlayer: (id: string) => void;
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
uniform vec3 r0; uniform vec3 r1; uniform vec3 r2; uniform vec3 patchCol; uniform vec3 cloudCol; uniform vec3 atmo;
uniform float gas; uniform float scale; uniform float swirl; uniform float bands; uniform float patchCover;
uniform float cloudCover; uniform float ice; uniform float lights; uniform float glow; uniform float seed;
uniform vec3 starPos; uniform vec3 starCol;
varying vec3 vN; varying vec3 vP; varying vec3 vW;
vec3 ramp(float t){ return t < 0.5 ? mix(r0, r1, t*2.0) : mix(r1, r2, t*2.0-1.0); }
void main(){
  vec3 s = normalize(vP);
  // Les bandes : le motif s'écrase le long des parallèles.
  float stretch = max(gas, bands);
  vec3 q = vec3(s.x*(1.0-0.75*stretch), s.y*(1.0+5.0*stretch), s.z*(1.0-0.75*stretch))*scale + seed;
  vec3 w = vec3(fbm(q*0.9+1.7), fbm(q*0.9+8.3), fbm(q*0.9+4.1)) - 0.5;
  vec3 qq = q + w*swirl*2.5;
  float h = fbm(qq);
  float detail = fbm(qq*4.0+3.0);
  float fine = fbm(qq*14.0+7.0);
  vec3 col;
  if (gas > 0.5) {
    float b = sin(s.y*scale*5.0 + (h-0.5)*(2.0+swirl*12.0))*0.5 + 0.5;
    float t = clamp(mix(b, (h-0.25)*2.0, 0.4) + (detail-0.5)*0.35, 0.0, 1.0);
    col = ramp(smoothstep(0.0, 1.0, t));
  } else {
    col = ramp(clamp((h-0.3)/0.4 + (detail-0.5)*0.6, 0.0, 1.0));
  }
  // Une seconde matière en taches : mers, laves, plaques.
  float pm = 0.0;
  if (patchCover > 0.0) {
    float m = fbm(qq*1.1 + 11.0 + w*swirl) + (detail-0.5)*0.18;
    float thr = mix(0.62, 0.36, patchCover);
    pm = smoothstep(thr-0.012, thr+0.012, m);
    col = mix(col, patchCol*(0.88 + 0.24*detail), pm);
  }
  if (ice > 0.0) {
    float lat = abs(s.y) + (detail-0.5)*0.18;
    col = mix(col, vec3(0.94,0.96,0.99), smoothstep(ice, ice+0.05, lat));
  }
  float cm = 0.0;
  if (cloudCover > 0.0) {
    float c = fbm(vec3(s.x*3.0, s.y*6.0, s.z*3.0) + seed*1.3 + w*3.0);
    float thr = mix(0.72, 0.32, cloudCover);
    cm = smoothstep(thr-0.05, thr+0.1, c)*0.92;
    col = mix(col, cloudCol, cm);
  }
  col *= 0.9 + 0.2*fine;
  vec3 N = normalize(vN); vec3 L = normalize(starPos - vW); vec3 Vd = normalize(cameraPosition - vW);
  float d = dot(N,L); float diff = smoothstep(-0.08, 0.6, d); float dark = 1.0 - smoothstep(-0.2, 0.15, d);
  vec3 lit = col * (0.045 + 1.05*diff*starCol + 0.16*max(dot(N,Vd),0.0));
  if (lights > 0.0) {
    float city = smoothstep(0.58, 0.72, fbm(s*38.0 + seed)) * smoothstep(0.35, 0.6, fbm(s*6.0 + seed*2.0));
    lit += vec3(1.0,0.78,0.45) * city * lights * (1.0-pm) * (1.0-cm) * dark * 1.4;
  }
  lit += patchCol * pm * glow * (0.35 + 0.9*dark) * (0.6 + 0.8*detail);
  float fr = pow(1.0 - max(dot(N,Vd),0.0), 3.0);
  lit += atmo * fr * (0.15 + 1.1*smoothstep(-0.3,0.5,d));
  gl_FragColor = vec4(lit, 1.0);
}`;

const RING_VERTEX = /* glsl */ `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;

const RING_FRAGMENT =
  NOISE +
  /* glsl */ `
uniform vec3 color; uniform vec3 starCol; uniform float inner; uniform float outer; uniform float opacity; uniform float seed;
varying vec3 vP;
void main(){
  float t = (length(vP.xy) - inner) / (outer - inner);
  float rings = 0.35 + 0.65*noise(vec3(t*48.0, seed, 0.0)) * (0.6 + 0.4*noise(vec3(t*160.0, seed, 3.0)));
  float edge = smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.82, t);
  gl_FragColor = vec4(color * (0.45 + 0.65*starCol) * (0.75 + 0.5*rings), opacity * edge * rings);
}`;

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
  onPlayer,
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
    const look = bodyLook(place.slug, place.type);
    const seed = (hashOf(place.slug) % 1000) / 100;
    // La lumière de l'étoile, à peine teintée : les couleurs du corps restent celles du jeu.
    const tint = new THREE.Color(SYSTEM_LOOK[place.system].color).lerp(
      new THREE.Color(1, 1, 1),
      0.78,
    );
    const starCol = new THREE.Color().setRGB(
      tint.r,
      tint.g,
      tint.b,
      THREE.LinearSRGBColorSpace,
    );
    const mesh = new THREE.Mesh(
      sphere,
      track(
        new THREE.ShaderMaterial({
          vertexShader: BODY_VERTEX,
          fragmentShader: BODY_FRAGMENT,
          uniforms: {
            r0: { value: raw(look.ramp[0]) },
            r1: { value: raw(look.ramp[1]) },
            r2: { value: raw(look.ramp[2]) },
            patchCol: { value: raw(look.patches?.color ?? "#000000") },
            patchCover: { value: look.patches?.cover ?? 0 },
            cloudCol: { value: raw(look.clouds?.color ?? "#f4f6f8") },
            cloudCover: { value: look.clouds?.cover ?? 0 },
            gas: { value: look.kind === "gas" ? 1 : 0 },
            scale: { value: look.scale ?? 2.5 },
            swirl: { value: look.swirl ?? 0 },
            bands: { value: look.bands ?? 0 },
            ice: { value: look.ice ?? 0 },
            lights: { value: look.lights ?? 0 },
            glow: { value: look.glow ?? 0 },
            atmo: {
              value: look.atmosphere
                ? raw(look.atmosphere.color).multiplyScalar(
                    0.8 * (look.atmosphere.strength ?? 1),
                  )
                : raw("#000000"),
            },
            starPos: { value: starWorld.get(place.system) },
            starCol: { value: starCol },
            seed: { value: seed },
          },
        }),
      ),
    );
    // L'axe penche un peu, l'anneau avec ; la longitude varie d'un corps à l'autre.
    mesh.rotation.set(0, seed * 0.6, ((look.tilt ?? 0) * Math.PI) / 180);
    if (look.ring) {
      const { inner, outer, color, opacity = 0.6 } = look.ring;
      const ring = new THREE.Mesh(
        track(new THREE.RingGeometry(inner, outer, 160, 1)),
        track(
          new THREE.ShaderMaterial({
            vertexShader: RING_VERTEX,
            fragmentShader: RING_FRAGMENT,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            uniforms: {
              color: { value: raw(color) },
              starCol: { value: starCol },
              inner: { value: inner },
              outer: { value: outer },
              opacity: { value: opacity },
              seed: { value: seed },
            },
          }),
        ),
      );
      ring.rotation.x = -Math.PI / 2;
      mesh.add(ring);
    }
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
            place.marker?.color ??
              MARKER_COLOR[place.type] ??
              MARKER_COLOR.outpost,
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
    // Un lieu privé ou un marqueur montre toujours son nom : c'est le sien.
    const minor =
      !place.private &&
      !place.marker &&
      (place.type === "outpost" ||
        (place.type === "station" &&
          !!place.parentSlug &&
          isSpacePoint(place)));
    element.className =
      "star-map-label" +
      (minor ? " minor" : "") +
      (STAR_MAP_SYSTEMS.includes(place.slug as StarMapSystem)
        ? " system"
        : "") +
      (place.type === "planet" || place.type === "city" ? " major" : "") +
      (place.private ? " private" : "") +
      (place.marker ? " marker" : "");
    element.setAttribute("aria-label", `${typeLabel(place)} ${place.name}`);
    if (place.marker)
      element.style.setProperty("--marker-color", place.marker.color);
    const marker = document.createElement("i");
    marker.className = place.marker
      ? "star-map-marker pin"
      : place.private
        ? "star-map-marker private"
        : `star-map-marker ${markerShape(place.type)}`;
    marker.style.setProperty(
      "--c",
      place.marker
        ? place.marker.color
        : place.private
          ? PRIVATE_MARKER_COLOR
          : place.system &&
              STAR_MAP_SYSTEMS.includes(place.slug as StarMapSystem)
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
  // ── Joueurs : leurs étiquettes vivent à part, remplacées à chaque relevé ──
  type PlayerLabel = {
    el: HTMLElement;
    player: StarMapPlayer;
    shown: boolean;
    x: number;
    y: number;
  };
  let playerLabels: PlayerLabel[] = [];
  function setPlayers(players: StarMapPlayer[], selected: string | null) {
    const previous = new Map(
      playerLabels.map((label) => [label.player.id, label]),
    );
    playerLabels = players.map((player) => {
      let label = previous.get(player.id);
      previous.delete(player.id);
      if (!label) {
        const element = document.createElement("button");
        element.type = "button";
        const avatar = document.createElement("i");
        avatar.className = "star-map-player";
        const text = document.createElement("span");
        text.className = "star-map-text";
        element.append(avatar, text);
        element.addEventListener("click", (event) => {
          event.stopPropagation();
          onPlayer(label!.player.id);
        });
        labels.appendChild(element);
        label = { el: element, player, shown: false, x: 0, y: 0 };
      }
      label.player = player;
      const element = label.el;
      element.className =
        `star-map-label player ${player.kind}` +
        (player.stale ? " stale" : "") +
        (player.id === selected ? " selected" : "") +
        " hidden";
      element.setAttribute("aria-label", player.label);
      const avatar = element.firstElementChild as HTMLElement;
      avatar.textContent = player.avatar
        ? ""
        : (player.name.trim()[0] ?? "?").toUpperCase();
      avatar.style.backgroundImage = player.avatar
        ? `url("${player.avatar.replace(/"/g, "%22")}")`
        : "";
      (element.lastElementChild as HTMLElement).textContent = player.name;
      return label;
    });
    previous.forEach((label) => label.el.remove());
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
        !place.marker &&
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
    for (const label of playerLabels) {
      const player = label.player;
      let show =
        focusSlug === null ||
        visible.has(player.anchor) ||
        player.anchor === focusSlug ||
        player.anchor === get(focusSlug)?.system;
      if (show && player.normal) {
        toCamera.copy(camera.position).sub(new V(...player.world));
        const normal = new V(...player.normal);
        if (toCamera.dot(normal) < 0.02 * toCamera.length()) show = false;
      }
      let x = 0;
      let y = 0;
      if (show) {
        projected.set(...player.world).project(camera);
        x = (projected.x * 0.5 + 0.5) * width;
        y = (-projected.y * 0.5 + 0.5) * height;
        if (
          projected.z > 1 ||
          x < -50 ||
          x > width + 50 ||
          y < -20 ||
          y > height + 20
        )
          show = false;
      }
      label.shown = show;
      label.x = x;
      label.y = y;
    }
    // Deux joueurs côte à côte (une sortie minage) : le second se décale vers
    // le bas, pour que chaque nom se lise.
    const shownPlayers = playerLabels
      .filter((label) => label.shown)
      .sort((a, b) => a.y - b.y || a.x - b.x);
    const taken: { x: number; y: number }[] = [];
    for (const label of shownPlayers) {
      let y = label.y;
      for (let tries = 0; tries < 6; tries++) {
        const hit = taken.find(
          (other) =>
            Math.abs(other.y - y) < 24 && Math.abs(other.x - label.x) < 90,
        );
        if (!hit) break;
        y = hit.y + 26;
      }
      label.y = y;
      taken.push({ x: label.x, y });
    }
    for (const label of playerLabels) {
      label.el.classList.toggle("hidden", !label.shown);
      label.el.classList.toggle("compact", focusSlug === null);
      label.el.tabIndex = label.shown ? 0 : -1;
      if (label.shown)
        label.el.style.transform = `translate(${(label.x - 11).toFixed(1)}px, ${(label.y - 11).toFixed(1)}px)`;
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
    setPlayers,
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
      playerLabels.forEach((label) => label.el.remove());
      disposables.forEach((thing) => thing.dispose());
    },
  };
}
