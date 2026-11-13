// ============================================================
// Escena 12 · CIERRE
// Hay una perilla para avanzar los días. El "cielo" de la maqueta
// (un sol que recorre un arco sobre el mapa y se vuelve luna) pasa
// de día a noche, sin tapar el cuarto real. Al llegar al domingo
// el gato trae un sobre; la persona lo abre con la mano y ve la
// carta con el resumen del lote y el botón "Ver centros", que
// lleva a la página principal de CaliDa. No hay botón de donar:
// la donación se registra en el centro físico.
// ============================================================
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
  type Entity,
} from '@iwsdk/core';
import { COLOR } from '../../datos.js';
import { Etiqueta, Letrero, PastillaBoton } from '../../texto.js';
import { OCULTO, type Contexto, type Escena } from '../contexto.js';
import { DIAS } from '../eventos.js';
import { POS_GATO, POS_MAPA } from '../maqueta.js';
import { sonidos } from '../sonidos.js';

/** Página principal de CaliDa (la plataforma de donaciones). */
const URL_CALIDA = 'https://calida-interactivo.github.io/CaliDa/';
const FUENTE = 'Roboto, "Segoe UI", Arial, sans-serif';
const DOMINGO = 6;

/** La carta con el resumen del lote. */
class Carta extends Letrero {
  constructor() {
    super(900, 760, 0.5);
  }

  escribir(lineas: [string, string][], lote: number): void {
    const { ctx, lienzo } = this;
    const w = lienzo.width;
    const h = lienzo.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(1, 30, 65, 0.22)';
    ctx.beginPath();
    ctx.roundRect(10, 20, w - 20, h - 30, 44);
    ctx.fill();
    ctx.fillStyle = COLOR.crema;
    ctx.beginPath();
    ctx.roundRect(10, 8, w - 20, h - 30, 44);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = COLOR.rojo;
    ctx.font = `900 62px ${FUENTE}`;
    ctx.fillText(`Carta del lote ${lote}`, w / 2, 110);
    let y = 210;
    for (const [rotulo, valor] of lineas) {
      ctx.fillStyle = COLOR.carbon;
      ctx.font = `400 40px ${FUENTE}`;
      ctx.textAlign = 'left';
      ctx.fillText(rotulo, 90, y);
      ctx.fillStyle = COLOR.azul;
      ctx.font = `700 40px ${FUENTE}`;
      ctx.textAlign = 'right';
      ctx.fillText(valor, w - 90, y);
      y += 78;
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = COLOR.azul;
    ctx.font = `400 34px ${FUENTE}`;
    ctx.fillText('Tu donación se registra en el centro de acopio físico.', w / 2, h - 170);
    this.listo();
  }
}

export function crearCierre(): Escena {
  let perilla: Entity | null = null;
  let dia: Etiqueta;
  let diaEnt: Entity;
  let astro: Mesh;
  let luzAstro: MeshBasicMaterial;
  let sobre: Entity;
  let carta: Carta;
  let cartaEnt: Entity;
  let verCentros: Entity;
  let fase: 'girando' | 'sobre' | 'carta' = 'girando';
  let giroPrevio = 0;
  let acumulado = 0;
  const v = new Vector3();
  const w = new Vector3();
  const posPerilla = new Vector3(POS_MAPA.x - 0.3, 0, POS_MAPA.z + 0.33);

  function armar(c: Contexto): void {
    const padre = c.maquetaEnt;
    // Perilla: un disco con una marca, y una zona fácil de agarrar.
    const grupo = new Group();
    const cuerpo = new Mesh(
      new CylinderGeometry(0.04, 0.045, 0.03, 28),
      new MeshStandardMaterial({ color: COLOR.petroleo, roughness: 0.8 }),
    );
    cuerpo.position.y = 0.015;
    const marca = new Mesh(new BoxGeometry(0.008, 0.006, 0.035), new MeshStandardMaterial({ color: COLOR.crema }));
    marca.position.set(0, 0.033, -0.02);
    const zona = new Mesh(
      new CylinderGeometry(0.065, 0.065, 0.09, 12),
      new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    zona.position.y = 0.045;
    grupo.add(cuerpo, marca, zona);
    perilla = c.crear(grupo, padre);
    perilla.object3D!.position.copy(posPerilla);
    c.tocable(perilla, 'perilla');
    dia = new Etiqueta(0.2);
    diaEnt = c.crear(dia.malla, padre);
    diaEnt.object3D!.position.set(posPerilla.x, 0.13, posPerilla.z);

    // Sol / luna: recorre un arco sobre el mapa.
    luzAstro = new MeshBasicMaterial({ color: '#FFC94A' });
    astro = new Mesh(new SphereGeometry(0.035, 20, 14), luzAstro);
    c.maqueta.raiz.add(astro);

    // Sobre que trae el gato.
    const grupoSobre = new Group();
    const papel = new Mesh(new BoxGeometry(0.13, 0.085, 0.008), new MeshStandardMaterial({ color: COLOR.crema, roughness: 0.9 }));
    const sello = new Mesh(new CylinderGeometry(0.014, 0.014, 0.006, 20), new MeshStandardMaterial({ color: COLOR.rojo }));
    sello.rotation.x = Math.PI / 2;
    sello.position.z = 0.006;
    const zonaSobre = new Mesh(
      new BoxGeometry(0.17, 0.12, 0.06),
      new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    grupoSobre.add(papel, sello, zonaSobre);
    sobre = c.crear(grupoSobre, c.raiz);
    c.tocable(sobre, 'sobre');

    carta = new Carta();
    const grupoCarta = new Group();
    grupoCarta.add(carta.malla);
    cartaEnt = c.crear(grupoCarta, c.raiz);
    const boton = new PastillaBoton();
    boton.escribir('Ver centros');
    boton.malla.scale.setScalar(0.62);
    boton.malla.renderOrder = 12;
    verCentros = c.mundo.createTransformEntity(boton.malla, { parent: cartaEnt });
    verCentros.object3D!.position.set(0, -0.155, 0.012);
    c.tocable(verCentros, 'ver-centros');
    void document.fonts
      ?.load('700 40px Roboto')
      .then(() => boton.dibujar())
      .catch(() => undefined);
  }

  function pintarDia(c: Contexto): void {
    const n = c.estado.dia;
    dia.escribir(DIAS[n], n === DOMINGO ? '#3E7A6C' : COLOR.petroleo);
    // De jueves a domingo el sol baja por su arco y se vuelve luna.
    const k = Math.min(1, Math.max(0, (n - 3) / 3));
    const angulo = Math.PI * (0.35 + k * 0.6);
    astro.position.set(POS_MAPA.x + Math.cos(angulo) * 0.34, 0.12 + Math.sin(angulo) * 0.3, POS_MAPA.z - 0.18);
    luzAstro.color.set(k > 0.6 ? '#E8E1D5' : '#FFC94A');
    astro.scale.setScalar(k > 0.6 ? 0.8 : 1);
  }

  function avanzar(c: Contexto): void {
    if (fase !== 'girando' || c.estado.dia >= DOMINGO) {
      return;
    }
    c.estado.dia++;
    sonidos.clic();
    const obj = perilla!.object3D!;
    obj.rotation.y -= (Math.PI * 2) / 7;
    pintarDia(c);
    if (c.estado.dia === DOMINGO) {
      // Fin de la semana: el gato trae el sobre.
      fase = 'sobre';
      sonidos.logro();
      const gato = c.gato.objeto.position;
      const s = sobre.object3D!;
      s.position.set(gato.x - 0.16, 0.12, gato.z + 0.06);
      s.visible = true;
      s.scale.setScalar(0.02);
      c.anim.mover(s, null, 0.5, { escala: 1 });
      c.gato.animar('saludar', 3, c.tiempo);
      c.gato.decir('¡Se acabó la semana! Te traje una carta: ábrela con la mano.');
    }
  }

  function abrirCarta(c: Contexto): void {
    if (fase !== 'sobre') {
      return;
    }
    fase = 'carta';
    sonidos.pop();
    c.mostrar(sobre, false);
    const d = c.estado.descartados;
    const hoy = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
    carta.escribir(
      [
        ['Fecha', hoy],
        ['Número de lote', `${c.estado.lote} (semana del año)`],
        ['Familias atendidas', String(c.estado.familiasAtendidas)],
        ['Objetos descartados', String(d.roto + d.vencido)],
        ['Rotos / vencidos', `${d.roto} / ${d.vencido}`],
      ],
      c.estado.lote,
    );
    const obj = cartaEnt.object3D!;
    obj.position.set(POS_MAPA.x - 0.2, 0.42, 0.12);
    obj.visible = true;
    obj.scale.setScalar(0.02);
    c.anim.mover(obj, null, 0.4, { escala: 1 });
    c.gato.decir('Así se gestiona tu donación. Llévala al centro de acopio más cercano.');
  }

  return {
    nombre: 'CIERRE',

    entrar(c) {
      if (!perilla) {
        armar(c);
      }
      fase = 'girando';
      acumulado = 0;
      c.estado.dia = 3; // la entrega fue el jueves
      c.mostrar(perilla!, true);
      c.mostrar(diaEnt, true);
      c.mostrar(sobre, false);
      c.mostrar(cartaEnt, false);
      astro.visible = true;
      perilla!.object3D!.rotation.y = 0;
      pintarDia(c);
      // El gato vuelve a su sitio por si se movió.
      c.gato.objeto.position.copy(POS_GATO).multiplyScalar(c.maquetaEnt.object3D!.scale.x);
      c.gato.animar('quieto');
      c.gato.decir('Ya entregaste el lote. Gira la perilla para avanzar los días hasta el domingo.');
    },

    actualizar(c) {
      c.mirar(diaEnt.object3D!);
      if (fase === 'carta') {
        c.mirar(cartaEnt.object3D!);
        return;
      }
      if (fase === 'sobre') {
        const s = sobre.object3D!;
        s.position.y = 0.12 + Math.sin(c.tiempo * 2.2) * 0.012;
        c.mirar(s);
        // Abrir el sobre tocándolo con el índice.
        s.getWorldPosition(v);
        for (const mano of [c.manos.derecha, c.manos.izquierda]) {
          if (mano.presente && mano.indice.distanceTo(v) < 0.06) {
            abrirCarta(c);
          }
        }
        return;
      }
      // Girar la perilla: con el pellizco sobre ella, el giro de la muñeca
      // (visto desde arriba) avanza un día cada cuarto de vuelta más o menos.
      const mano = c.manos.derecha.presente ? c.manos.derecha : c.manos.izquierda;
      perilla!.object3D!.getWorldPosition(v);
      if (mano.presente && mano.pellizco && mano.indice.distanceTo(v) < 0.1) {
        w.set(0, 0, -1).applyQuaternion(mano.giro);
        const giro = Math.atan2(w.x, -w.z);
        if (mano.pellizcoInicio) {
          giroPrevio = giro;
          acumulado = 0;
        }
        let paso = giro - giroPrevio;
        paso = Math.atan2(Math.sin(paso), Math.cos(paso));
        giroPrevio = giro;
        acumulado += Math.abs(paso);
        if (acumulado > 0.45) {
          acumulado = 0;
          avanzar(c);
        }
      }
    },

    alTocar(c, id) {
      if (id === 'perilla') {
        // Sin manos (control, rayo o mouse): cada toque avanza un día.
        avanzar(c);
      } else if (id === 'sobre') {
        abrirCarta(c);
      } else if (id === 'ver-centros' && fase === 'carta') {
        // Sale de la realidad aumentada y abre la página de CaliDa.
        sonidos.clic();
        c.mundo.exitXR();
        window.location.href = URL_CALIDA;
      }
    },

    salir(c) {
      if (perilla) {
        c.mostrar(perilla, false);
        c.mostrar(diaEnt, false);
        c.mostrar(sobre, false);
        c.mostrar(cartaEnt, false);
        astro.visible = false;
        astro.scale.setScalar(OCULTO);
      }
    },
  };
}
