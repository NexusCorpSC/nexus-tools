"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Object3D, PerspectiveCamera, Vector3 } from "three";

/** Une focale plutôt longue : moins de fuyantes, une coque qui se lit. */
const FIELD_OF_VIEW = 32;

/** Hauteur du point de vue au-dessus de l'horizon, en radians. */
const ELEVATION = 0.42;

/** Nombre de sommets retenus pour cadrer : au-delà, la mesure ne bouge plus. */
const SAMPLE = 3000;

/**
 * Un échantillon des sommets de la coque, déjà placés dans la scène. La boîte
 * englobante ferait un cadrage plus simple et bien plus lâche : entre le bout
 * d'une aile et la pointe du nez, ses coins ne contiennent que du vide, et
 * cadrer sur ce vide laisserait le vaisseau minuscule au milieu de l'écran.
 */
function hullPoints(
  THREE: typeof import("three"),
  root: Object3D,
): Vector3[] {
  const meshes: import("three").Mesh[] = [];
  root.updateWorldMatrix(true, true);
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });

  const total = meshes.reduce(
    (count, mesh) => count + mesh.geometry.getAttribute("position").count,
    0,
  );
  const stride = Math.max(1, Math.ceil(total / SAMPLE));

  const points: Vector3[] = [];
  const vertex = new THREE.Vector3();
  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute("position");
    for (let index = 0; index < position.count; index += stride) {
      points.push(
        vertex
          .fromBufferAttribute(position, index)
          .applyMatrix4(mesh.matrixWorld)
          .clone(),
      );
    }
  }
  return points;
}

/**
 * À quelle distance reculer pour que la coque tienne dans le cadre — pas
 * seulement à l'arrêt, mais tout au long du tour qu'elle fait sur elle-même.
 *
 * Chaque point doit rester dans le cône de la caméra : pour un point `p` et une
 * direction de vue `d`, la caméra placée à la distance `D` le voit à la
 * profondeur `D - p·d` et à l'écart `|p·droite|`, ce qui tient tant que
 * `D ≥ p·d + |p·droite| / tan(champ / 2)`. On prend le pire point, sur un tour
 * complet — un vaisseau est long et plat, sa silhouette change du tout au tout
 * entre le travers et l'enfilade.
 */
function framingDistance(
  THREE: typeof import("three"),
  camera: PerspectiveCamera,
  points: Vector3[],
): number {
  const vTan = Math.tan((camera.fov * Math.PI) / 360);
  const hTan = vTan * camera.aspect;

  const up = new THREE.Vector3(0, 1, 0);
  const direction = new THREE.Vector3();
  const right = new THREE.Vector3();
  const camUp = new THREE.Vector3();

  let distance = 0;
  for (let step = 0; step < 24; step++) {
    const azimuth = (step / 24) * Math.PI * 2;
    direction.setFromSphericalCoords(1, Math.PI / 2 - ELEVATION, azimuth);
    right.crossVectors(direction, up).normalize();
    camUp.crossVectors(right, direction).normalize();

    for (const point of points) {
      const depth = point.dot(direction);
      distance = Math.max(
        distance,
        depth + Math.abs(point.dot(right)) / hTan,
        depth + Math.abs(point.dot(camUp)) / vTan,
      );
    }
  }

  // Une marge, pour que la coque ne frôle pas les bords — et pour couvrir les
  // sommets que l'échantillonnage a sautés.
  return (distance || 1) * 1.06;
}

/**
 * Le modèle 3D du véhicule, tel que Fleetyards l'extrait du jeu : un glTF
 * unique, maillage compressé en Draco, sans texture — de la géométrie et deux
 * matériaux. C'est un plan qu'on tourne, pas une carte postale.
 *
 * Tout est chargé à la demande : three pèse plus lourd que la fiche entière, et
 * le modèle lui-même se compte en mégaoctets. Rien ne part tant que personne
 * n'a ouvert la vue, et le composant n'est monté que là.
 */
export function ShipViewer({ url, accent }: { url: string; accent: string }) {
  const t = useTranslations("Items.Vehicle");
  const host = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    const container = host.current;
    if (!container) return;

    // Le montage peut être défait avant que three ait fini d'arriver : tout ce
    // qui suit vérifie ce drapeau avant de toucher au DOM ou de dessiner.
    let disposed = false;
    let cleanup: (() => void) | undefined;

    void (async () => {
      const [THREE, { GLTFLoader }, { DRACOLoader }, { OrbitControls }] =
        await Promise.all([
          import("three"),
          import("three/examples/jsm/loaders/GLTFLoader.js"),
          import("three/examples/jsm/loaders/DRACOLoader.js"),
          import("three/examples/jsm/controls/OrbitControls.js"),
        ]);
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(container.clientWidth, container.clientHeight);
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(
        FIELD_OF_VIEW,
        container.clientWidth / Math.max(container.clientHeight, 1),
        0.01,
        10000,
      );

      // Une lumière franche au-dessus, deux appoints teintés de l'accent de la
      // fiche : la coque garde ses volumes, la vue garde sa couleur.
      const tint = new THREE.Color(accent);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x0a3350, 1.6));
      const key = new THREE.DirectionalLight(0xffffff, 2.2);
      key.position.set(4, 8, 6);
      scene.add(key);
      const rimLeft = new THREE.DirectionalLight(tint, 1.4);
      rimLeft.position.set(-8, 2, -4);
      scene.add(rimLeft);
      const rimRight = new THREE.DirectionalLight(tint, 0.9);
      rimRight.position.set(6, -4, -6);
      scene.add(rimRight);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.9;

      const draco = new DRACOLoader();
      draco.setDecoderPath("/draco/");
      const loader = new GLTFLoader();
      loader.setDRACOLoader(draco);

      let frame = 0;
      const render = () => {
        frame = requestAnimationFrame(render);
        controls.update();
        renderer.render(scene, camera);
      };

      const resize = () => {
        const { clientWidth, clientHeight } = container;
        if (!clientWidth || !clientHeight) return;
        camera.aspect = clientWidth / clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(clientWidth, clientHeight);
      };
      const observer = new ResizeObserver(resize);
      observer.observe(container);

      cleanup = () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        controls.dispose();
        draco.dispose();
        scene.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.geometry.dispose();
          for (const material of [object.material].flat()) material.dispose();
        });
        renderer.dispose();
        renderer.domElement.remove();
      };

      loader.load(
        url,
        (gltf) => {
          if (disposed) return;

          // Le modèle arrive dans le repère du jeu, à sa taille et à sa place :
          // on le recentre sur l'origine, et c'est la caméra qu'on recule assez
          // pour que la coque tienne dans le cadre, quelle que soit sa taille.
          const box = new THREE.Box3().setFromObject(gltf.scene);
          gltf.scene.position.sub(box.getCenter(new THREE.Vector3()));

          const distance = framingDistance(
            THREE,
            camera,
            hullPoints(THREE, gltf.scene),
          );
          camera.position.setFromSphericalCoords(
            distance,
            Math.PI / 2 - ELEVATION,
            // Un vaisseau est long : de trois quarts avant, il se lit d'un coup
            // d'œil — de face, il n'est qu'une tranche.
            Math.PI / 3,
          );
          camera.near = distance / 100;
          camera.far = distance * 100;
          camera.updateProjectionMatrix();
          controls.minDistance = distance * 0.35;
          controls.maxDistance = distance * 3;
          controls.target.set(0, 0, 0);

          scene.add(gltf.scene);
          setState("ready");
          render();
        },
        (event) => {
          if (disposed || !event.lengthComputable) return;
          setProgress(Math.round((event.loaded / event.total) * 100));
        },
        () => {
          if (!disposed) setState("failed");
        },
      );
    })().catch(() => {
      if (!disposed) setState("failed");
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [url, accent]);

  return (
    <div className="relative h-full w-full">
      <div ref={host} className="h-full w-full [&>canvas]:touch-none" />

      {state !== "ready" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-nexus/70">
          {state === "failed" ? (
            <p>{t("holoFailed")}</p>
          ) : (
            <>
              <p>{t("holoLoading")}</p>
              <div className="h-0.5 w-32 overflow-hidden rounded-full bg-[#9ED0FF]/15">
                <div
                  className="h-full transition-[width] duration-200"
                  style={{ width: `${progress}%`, backgroundColor: accent }}
                />
              </div>
            </>
          )}
        </div>
      )}

      {state === "ready" && (
        <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[10px] uppercase tracking-[0.14em] text-nexus/45">
          {t("holoHint")}
        </p>
      )}
    </div>
  );
}
