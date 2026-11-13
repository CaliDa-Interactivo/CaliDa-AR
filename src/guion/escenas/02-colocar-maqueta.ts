// ============================================================
// Escena 2 · COLOCAR_MAQUETA
// Una semilla brillante flota sobre la mesa. La persona la
// pellizca y la suelta donde quiere: ahí se crea un ancla de
// WebXR y crecen el centro de acopio "CA" (su puesto) y, aparte,
// el mapa de Cali con sus 5 zonas. Después puede agrandarlos o
// achicarlos con las dos manos.
// ============================================================
import {
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  type Entity,
} from '@iwsdk/core';
import { COLOR } from '../../datos.js';
import { Etiqueta, PastillaBoton } from '../../texto.js';
import { OCULTO, type Contexto, type Escena } from '../contexto.js';
import { sonidos } from '../sonidos.js';

export function crearColocarMaqueta(): Escena {
  let semilla: Entity | null = null;
  let pista: Entity;
  let textoPista: Etiqueta;
  let listo: Entity;
  let fase: 'semilla' | 'creciendo' | 'ajuste' = 'semilla';
  // Gesto de dos manos.
  let girando = false;
  let separacion0 = 1;
  let escala0 = 1;

  function armar(c: Contexto): void {
    const grupo = new Group();
    grupo.add(
      new Mesh(
        new SphereGeometry(0.03, 24, 16),
        new MeshStandardMaterial({
          color: COLOR.amarillo,
          emissive: '#FFC94A',
          emissiveIntensity: 0.9,
          roughness: 0.5,
        }),
      ),
    );
    // Halo: lo que la hace "brillar" y una zona más fácil de pellizcar.
    grupo.add(
      new Mesh(
        new SphereGeometry(0.055, 20, 14),
        new MeshBasicMaterial({ color: '#FFE9A8', transparent: true, opacity: 0.28, depthWrite: false }),
      ),
    );
    semilla = c.crearSuelto(grupo);
    c.tocable(semilla, 'semilla', true);

    textoPista = new Etiqueta(0.46);
    pista = c.crearSuelto(textoPista.malla);

    const boton = new PastillaBoton();
    boton.escribir('Listo');
    boton.malla.scale.setScalar(0.7);
    listo = c.crear(boton.malla);
    c.tocable(listo, 'listo');
    void document.fonts
      ?.load('700 40px Roboto')
      .then(() => {
        boton.dibujar();
        textoPista.dibujar();
      })
      .catch(() => undefined);
  }

  function colocar(c: Contexto, x: number, z: number): void {
    fase = 'creciendo';
    sonidos.pop();
    c.mostrar(semilla!, false);
    c.plantar(x, c.superficie.y + 0.004, z);
    // Crece la base y, una por una, las zonas y el centro de acopio.
    const maqueta = c.maquetaEnt.object3D!;
    maqueta.rotation.y = 0;
    maqueta.visible = true;
    maqueta.scale.setScalar(0.02);
    c.anim.mover(maqueta, null, 0.45, { escala: 1 });
    c.maqueta.crecen.forEach((grupo, i) => {
      grupo.scale.setScalar(OCULTO);
      c.anim.mover(grupo, null, 0.45, {
        escala: 1,
        espera: 0.45 + i * 0.22,
        fin: () => sonidos.pop(),
      });
    });
    textoPista.escribir('Agrándala o achícala con las dos manos', COLOR.petroleo);
    c.tEscena = 0;
  }

  return {
    nombre: 'COLOCAR_MAQUETA',

    entrar(c) {
      if (!semilla) {
        armar(c);
      }
      fase = 'semilla';
      girando = false;
      c.mostrar(c.maquetaEnt, false);
      c.mostrarPanel(false);
      c.mostrar(listo, false);
      c.mostrar(semilla!, true);
      semilla!.object3D!.position.copy(c.superficie);
      semilla!.object3D!.position.y += 0.16;
      textoPista.escribir('Pellizca la semilla y suéltala en la mesa', COLOR.petroleo);
      c.mostrar(pista, true);
    },

    actualizar(c) {
      const raiz = c.raiz.object3D!;
      const pistaObj = pista.object3D!;
      if (fase === 'semilla') {
        const s = semilla!.object3D!;
        // El halo late; la pista va encima de la semilla.
        s.children[1].scale.setScalar(1 + Math.sin(c.tiempo * 4) * 0.18);
        pistaObj.position.set(s.position.x, s.position.y + 0.11, s.position.z);
        c.mirar(pistaObj);
        return;
      }
      pistaObj.position.copy(raiz.position);
      pistaObj.position.y += 0.44;
      c.mirar(pistaObj);

      if (fase === 'creciendo') {
        if (c.tEscena > 0.45 + c.maqueta.crecen.length * 0.22 + 0.5) {
          fase = 'ajuste';
          c.tEscena = 0;
          const boton = listo.object3D!;
          boton.position.set(0.4, 0.3, 0.1);
          c.mostrar(listo, true);
          c.mostrarPanel(true);
        }
        return;
      }

      // Ajuste: con los dos pellizcos a la vez se agranda o se achica.
      const maqueta = c.maquetaEnt.object3D!;
      c.mirar(listo.object3D!);
      if (c.manos.dosManos()) {
        if (!girando) {
          girando = true;
          separacion0 = Math.max(0.05, c.manos.separacion());
          escala0 = maqueta.scale.x;
        }
        // (No gira: el mapa y el centro de acopio quedan de frente.)
        const escala = (escala0 * c.manos.separacion()) / separacion0;
        maqueta.scale.setScalar(Math.min(1.5, Math.max(0.6, escala)));
      } else {
        girando = false;
      }
      if (c.tEscena > 25) {
        c.siguiente();
      }
    },

    alSoltar(c, id, entidad) {
      if (id === 'semilla' && fase === 'semilla') {
        const p = entidad.object3D!.position;
        colocar(c, p.x, p.z);
      }
    },

    alTocar(c, id) {
      if (id === 'listo' && fase === 'ajuste') {
        sonidos.clic();
        c.siguiente();
      }
    },

    salir(c) {
      c.mostrar(pista, false);
      c.mostrar(listo, false);
      c.mostrar(semilla!, false);
    },
  };
}
