"use client";

import { useEffect, useRef } from "react";
import {
  AmbientLight,
  Clock,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { PERIOD_FLIGHT_DURATION_S } from "@/lib/motion";

/* ═══════════════════════════════════════════════════════════════
   LILITA VUELA

   Entra abajo a la izquierda, pasa cerca de cámara a mitad de camino
   — el único motivo real para hacer esto en 3D, en 2D no existe
   "cerca" — y sale arriba a la derecha, puño por delante como
   Superman.

   Geometría de primitivas, no una réplica exacta del SVG: el color y
   la silueta bastan para que se la reconozca. Se dispone todo al
   terminar porque esto se dispara muchas veces a lo largo de meses
   de uso, no una vez en la vida del componente.
   ═══════════════════════════════════════════════════════════════ */

const DURATION_S = PERIOD_FLIGHT_DURATION_S;
const BODY_RED = 0xc0392b;
const LINE_DARK = 0x3d0f0a;
const CREAM = 0xfdf3ea;

function easeInOutQuart(t: number): number {
  return t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2;
}

function buildLilita(): Group {
  const g = new Group();
  const body = new MeshStandardMaterial({ color: BODY_RED, roughness: 0.55 });
  const line = new MeshStandardMaterial({ color: LINE_DARK, roughness: 0.6 });
  const white = new MeshStandardMaterial({ color: CREAM, roughness: 0.4 });

  // Cuerpo: cono + esfera, la misma silueta de gota que el icono 2D.
  const cone = new Mesh(new ConeGeometry(0.62, 0.9, 20), body);
  cone.position.y = 0.55;
  const belly = new Mesh(new SphereGeometry(0.62, 20, 16), body);
  belly.position.y = -0.05;
  g.add(cone, belly);

  // Ojos, mirando al frente del vuelo.
  for (const side of [-1, 1]) {
    const sclera = new Mesh(new SphereGeometry(0.16, 12, 10), white);
    sclera.position.set(side * 0.24, 0.05, 0.52);
    const pupil = new Mesh(new SphereGeometry(0.07, 8, 8), line);
    pupil.position.set(side * 0.24 + side * 0.02, 0.05, 0.64);
    g.add(sclera, pupil);
  }

  // Brazo adelantado, puño al frente: la pose de Superman.
  const armFront = new Mesh(new CylinderGeometry(0.09, 0.09, 0.85, 8), body);
  armFront.position.set(0.1, 0.25, 0.75);
  armFront.rotation.x = Math.PI / 2.1;
  const fist = new Mesh(new SphereGeometry(0.13, 10, 8), body);
  fist.position.set(0.1, 0.25, 1.15);

  // Brazo trasero, pegado al cuerpo para partir el viento.
  const armBack = new Mesh(new CylinderGeometry(0.09, 0.09, 0.7, 8), body);
  armBack.position.set(-0.45, -0.05, -0.35);
  armBack.rotation.x = -Math.PI / 3;
  armBack.rotation.z = Math.PI / 10;
  g.add(armFront, fist, armBack);

  // Piernas juntas y hacia atrás: perfil de vuelo, no de paseo.
  for (const side of [-1, 1]) {
    const leg = new Mesh(new CylinderGeometry(0.11, 0.08, 0.9, 8), body);
    leg.position.set(side * 0.14, -0.55, -0.65);
    leg.rotation.x = -Math.PI / 2.6;
    const shoe = new Mesh(new SphereGeometry(0.14, 8, 6), white);
    shoe.position.set(side * 0.14, -0.75, -1.05);
    g.add(leg, shoe);
  }

  g.rotation.x = -0.15; // morro ligeramente arriba, ya en pose de vuelo
  return g;
}

export function PeriodStartScene({ onDone }: { onDone: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  // onDone puede llegar como una función nueva en cada render del
  // padre; una ref evita reconstruir toda la escena por eso.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new Scene();
    const camera = new PerspectiveCamera(
      55,
      host.clientWidth / host.clientHeight,
      0.1,
      100,
    );
    camera.position.set(0, 0, 6);

    const renderer = new WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = SRGBColorSpace;
    host.appendChild(renderer.domElement);

    scene.add(new AmbientLight(0xffffff, 0.7));
    const key = new DirectionalLight(0xfff1e8, 1.1);
    key.position.set(2, 3, 4);
    scene.add(key);

    const lilita = buildLilita();
    scene.add(lilita);

    function onResize() {
      if (!host) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    }
    window.addEventListener("resize", onResize);

    // Media altura del frustum a una distancia dada de cámara — para
    // situar a Lilita como FRACCIÓN del encuadre real en cada
    // profundidad, no en unidades de mundo fijas. Con unidades fijas,
    // el primer intento la cruzaba de punta a punta en 4 de 81
    // frames: el encuadre visible a esa distancia es muchísimo más
    // estrecho de lo que "se siente" mirando la escena desde fuera.
    const tanHalfV = Math.tan((camera.fov * Math.PI) / 360);
    function halfExtentsAt(z: number) {
      const dist = camera.position.z - z;
      const halfH = dist * tanHalfV;
      return { halfW: halfH * camera.aspect, halfH };
    }

    const clock = new Clock();
    let raf = 0;
    let stopped = false;

    function frame() {
      const t = Math.min(clock.getElapsedTime() / DURATION_S, 1);
      const e = easeInOutQuart(t);
      const bulge = Math.sin(t * Math.PI); // 0 en los bordes, 1 a mitad de camino

      // De lejos (-9) a cerca de cámara (2) y otra vez lejos: el
      // "pasa rozándote" que en 2D no se puede fingir con una simple
      // traslación en pantalla.
      const z = -9 + bulge * 11;
      const { halfW, halfH } = halfExtentsAt(z);

      // -1.15 → 0 → 1.15 del ancho/alto visible EN ESA PROFUNDIDAD:
      // entra fuera de cuadro, cruza por dentro, sale fuera de
      // cuadro — proporcional siempre, así que se ve igual de bien
      // de cerca que de lejos.
      const xFrac = -1.15 + e * 2.3;
      const yFrac = -1.05 + e * 1.85 + bulge * 0.15;

      lilita.position.set(xFrac * halfW, yFrac * halfH, z);

      lilita.rotation.z = -0.5 + e * 1.0;
      lilita.rotation.y = -0.3;

      // Estiramiento en la dirección del vuelo justo en el punto de
      // más velocidad — Disney: squash & stretch, nunca en los
      // extremos, donde casi no se mueve.
      lilita.scale.set(1 - bulge * 0.08, 1 - bulge * 0.08, 1 + bulge * 0.22);

      renderer.render(scene, camera);

      if (t < 1 && !stopped) {
        raf = requestAnimationFrame(frame);
      } else if (!stopped) {
        stopped = true;
        onDoneRef.current();
      }
    }
    raf = requestAnimationFrame(frame);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      scene.traverse((obj) => {
        if (obj instanceof Mesh) {
          obj.geometry.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === host) {
        host.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={hostRef} className="absolute inset-0" />;
}
