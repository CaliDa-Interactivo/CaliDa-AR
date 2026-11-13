// ============================================================
// zonas.ts — lo que pasa sobre el mapa de Cali: la burbuja de
// estado de cada zona, la lista de lo que necesita, la lluvia y
// el agua que sube en una zona, y el temporizador de la misión.
// Lo usan las escenas 7 (necesidades), 8 (urgencia), 10 y 11.
// ============================================================
import {
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  RingGeometry,
  SphereGeometry,
  Vector3,
  type Entity,
} from '@iwsdk/core';
import { COLOR } from '../datos.js';
import { Etiqueta, Globo, Letrero } from '../texto.js';
import { OCULTO, type Contexto } from './contexto.js';
import { ZONAS, type EstadoZona, type Zona } from './estado.js';
import { GROSOR_ZONA, POS_MAPA } from './maqueta.js';

const FUENTE = 'Roboto, "Segoe UI", Arial, sans-serif';

const ESTILO: Record<EstadoZona, { fondo: string; texto: string; rotulo: string }> = {
  necesita: { fondo: '#3E7A6C', texto: '#FFFFFF', rotulo: 'Se necesita' },
  no_necesita: { fondo: '#E8E1D5', texto: '#514B46', rotulo: 'No se necesita' },
  urgente: { fondo: '#FCE8E8', texto: '#A5121A', rotulo: 'Urgente' },
  entregado: { fondo: '#3E7A6C', texto: '#FFFFFF', rotulo: 'Entregado ✓' },
};

/** Lo que pide cada zona (nombres de las repisas del centro de acopio). */
export const NECESIDADES: Record<Zona, string[]> = {
  Norte: [],
  Sur: ['Comida de bebé', 'Higiene corporal'],
  Oriente: ['Agua', 'Ropa de niños'],
  Occidente: [],
  Centro: ['No perecederos', 'Analgésicos'],
};

class Burbuja extends Letrero {
  constructor() {
    super(420, 190, 0.13);
  }

  escribir(nombre: string, estado: EstadoZona): void {
    const { ctx, lienzo } = this;
    const w = lienzo.width;
    const estilo = ESTILO[estado];
    ctx.clearRect(0, 0, w, lienzo.height);
    ctx.fillStyle = 'rgba(1, 30, 65, 0.22)';
    ctx.beginPath();
    ctx.roundRect(8, 16, w - 16, 134, 60);
    ctx.fill();
    ctx.fillStyle = estilo.fondo;
    ctx.beginPath();
    ctx.roundRect(8, 6, w - 16, 134, 60);
    ctx.fill();
    // Piquito de la burbuja, hacia la zona.
    ctx.beginPath();
    ctx.moveTo(w / 2 - 26, 136);
    ctx.lineTo(w / 2, 184);
    ctx.lineTo(w / 2 + 26, 136);
    ctx.fill();
    ctx.fillStyle = estilo.texto;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 46px ${FUENTE}`;
    ctx.fillText(nombre, w / 2, 52);
    ctx.font = `700 34px ${FUENTE}`;
    ctx.fillText(estilo.rotulo, w / 2, 102);
    this.listo();
  }
}

interface BurbujaZona {
  entidad: Entity;
  dibujo: Burbuja;
  anillo: Mesh;
  parpadeaHasta: number;
  tamano: number;
}

export class Zonas {
  private burbujas = {} as Record<Zona, BurbujaZona>;
  private lista = new Globo();
  private listaEnt: Entity;
  private listaHasta = 0;
  private lluvia: Entity;
  private gotas: Points;
  private agua: Mesh;
  /** Nivel del agua en la zona con lluvia (0 = seco). */
  nivelAgua = 0;
  zonaLluvia: Zona | null = null;
  private reloj = new Etiqueta(0.2);
  private relojEnt: Entity;
  private toqueEn = -1;
  private v = new Vector3();

  constructor(private c: Contexto) {
    const padre = c.maquetaEnt;
    for (const nombre of ZONAS) {
      const dibujo = new Burbuja();
      const grupo = new Group();
      grupo.add(dibujo.malla);
      // Anillo que palpita debajo de las urgentes.
      const anillo = new Mesh(
        new RingGeometry(0.05, 0.062, 40),
        new MeshBasicMaterial({ color: COLOR.rojoProfundo, transparent: true, opacity: 0.8, depthWrite: false }),
      );
      anillo.rotation.x = -Math.PI / 2;
      anillo.visible = false;
      c.maqueta.raiz.add(anillo);
      const centro = c.maqueta.zonas[nombre].centro;
      anillo.position.set(centro.x, GROSOR_ZONA + 0.004, centro.z);
      const entidad = c.crear(grupo, padre);
      entidad.object3D!.position.set(centro.x, 0.15, centro.z);
      c.tocable(entidad, `zona:${nombre}`);
      this.burbujas[nombre] = { entidad, dibujo, anillo, parpadeaHasta: 0, tamano: 1 };
    }

    // Lista flotante de lo que necesita una zona.
    this.lista.malla.scale.setScalar(0.62);
    const grupoLista = new Group();
    grupoLista.add(this.lista.malla);
    this.listaEnt = c.crear(grupoLista, padre);
    this.listaEnt.object3D!.position.set(POS_MAPA.x, 0.5, POS_MAPA.z - 0.12);

    // Nube, lluvia y agua.
    const nube = new Group();
    const gris = new MeshStandardMaterial({ color: '#D5DCE2', roughness: 1 });
    for (const [x, y, z, r] of [[0, 0, 0, 0.045], [0.045, -0.005, 0.01, 0.035], [-0.045, -0.006, 0, 0.032], [0.01, 0.02, -0.01, 0.034]]) {
      const bola = new Mesh(new SphereGeometry(r, 16, 12), gris);
      bola.position.set(x, y, z);
      nube.add(bola);
    }
    const puntos: number[] = [];
    for (let i = 0; i < 70; i++) {
      puntos.push((Math.sin(i * 12.9) * 0.5) * 0.14, -Math.abs(Math.sin(i * 7.3)) * 0.2, (Math.cos(i * 4.7) * 0.5) * 0.12);
    }
    const geometria = new BufferGeometry();
    geometria.setAttribute('position', new Float32BufferAttribute(puntos, 3));
    this.gotas = new Points(geometria, new PointsMaterial({ color: COLOR.petroleo, size: 0.007 }));
    nube.add(this.gotas);
    this.lluvia = c.crear(nube, padre);
    this.agua = new Mesh(
      new CylinderGeometry(1, 1, 1, 40),
      new MeshStandardMaterial({ color: COLOR.petroleo, transparent: true, opacity: 0.62, roughness: 0.3, depthWrite: false }),
    );
    this.agua.visible = false;
    c.maqueta.raiz.add(this.agua);

    this.relojEnt = c.crear(this.reloj.malla, padre);
    this.reiniciar();
  }

  reiniciar(): void {
    this.mostrar(false);
    this.zonaLluvia = null;
    this.nivelAgua = 0;
    this.agua.visible = false;
    this.c.mostrar(this.lluvia, false);
    this.c.mostrar(this.relojEnt, false);
    this.c.mostrar(this.listaEnt, false);
    for (const nombre of ZONAS) {
      this.burbujas[nombre].tamano = 1;
      this.burbujas[nombre].parpadeaHasta = 0;
    }
  }

  /** Muestra u oculta las burbujas de todas las zonas. */
  mostrar(visible: boolean): void {
    for (const nombre of ZONAS) {
      this.c.mostrar(this.burbujas[nombre].entidad, visible);
      this.burbujas[nombre].anillo.visible = false;
    }
    if (visible) {
      this.pintar();
    }
  }

  /** Deja a la vista solo la burbuja de una zona (las demás estorban al
   *  apuntar al mapa mientras se dibuja la ruta o se entrega). */
  soloZona(zona: Zona): void {
    for (const nombre of ZONAS) {
      this.c.mostrar(this.burbujas[nombre].entidad, nombre === zona);
    }
    this.pintar();
  }

  /** Vuelve a dibujar las burbujas según el estado de cada zona. */
  pintar(): void {
    for (const nombre of ZONAS) {
      const estado = this.c.estado.necesidades[nombre];
      this.burbujas[nombre].dibujo.escribir(nombre, estado);
      this.burbujas[nombre].anillo.visible =
        estado === 'urgente' && this.burbujas[nombre].entidad.object3D!.visible;
    }
  }

  cambiar(zona: Zona, estado: EstadoZona): void {
    this.c.estado.necesidades[zona] = estado;
    this.pintar();
  }

  parpadear(zona: Zona, segundos: number): void {
    this.burbujas[zona].parpadeaHasta = this.c.tiempo + segundos;
  }

  agrandar(zona: Zona, tamano: number): void {
    this.burbujas[zona].tamano = tamano;
  }

  /** Abre el panel con la lista de lo que necesita esa zona. */
  abrirLista(zona: Zona): void {
    const pide = NECESIDADES[zona];
    const estado = this.c.estado.necesidades[zona];
    this.lista.escribir(
      `Zona ${zona}`,
      estado === 'entregado'
        ? 'Ya recibió su lote esta semana.'
        : pide.length === 0
          ? 'Por ahora no necesita nada.'
          : `${estado === 'urgente' ? 'URGENTE. ' : ''}Necesita: ${pide.join(' y ').toLowerCase()}.`,
    );
    this.c.mostrar(this.listaEnt, true);
    this.listaHasta = this.c.tiempo + 7;
  }

  /** Nube, lluvia y agua sobre una zona. */
  llover(zona: Zona | null): void {
    this.zonaLluvia = zona;
    this.c.mostrar(this.lluvia, zona !== null);
    this.agua.visible = zona !== null;
    if (zona) {
      const centro = this.c.maqueta.zonas[zona].centro;
      this.lluvia.object3D!.position.set(centro.x, 0.3, centro.z);
      this.agua.position.set(centro.x, GROSOR_ZONA, centro.z);
    }
  }

  actualizar(dt: number): void {
    const c = this.c;
    const t = c.tiempo;
    for (const nombre of ZONAS) {
      const b = this.burbujas[nombre];
      const obj = b.entidad.object3D!;
      if (!obj.visible) {
        continue;
      }
      c.mirar(obj);
      const urgente = c.estado.necesidades[nombre] === 'urgente';
      // Parpadeo ("Ver zona") y latido de las urgentes.
      const parpadea = t < b.parpadeaHasta;
      const pulso = parpadea ? 1 + Math.sin(t * 14) * 0.16 : urgente ? 1 + Math.sin(t * 5) * 0.05 : 1;
      obj.scale.setScalar(b.tamano * pulso);
      b.dibujo.malla.visible = !parpadea || Math.sin(t * 14) > -0.4;
      if (b.anillo.visible) {
        const k = (t * 0.9) % 1;
        b.anillo.scale.setScalar(0.7 + k * 1.3);
        (b.anillo.material as MeshBasicMaterial).opacity = 0.8 * (1 - k);
      }
      // Tocar la burbuja con la punta del índice.
      if (t - this.toqueEn > 1) {
        obj.getWorldPosition(this.v);
        for (const mano of [c.manos.derecha, c.manos.izquierda]) {
          if (mano.presente && mano.indice.distanceTo(this.v) < 0.05) {
            this.toqueEn = t;
            c.pulsar(`zona:${nombre}`, b.entidad);
            break;
          }
        }
      }
    }
    const lista = this.listaEnt.object3D!;
    if (lista.visible) {
      c.mirar(lista);
      if (t > this.listaHasta) {
        c.mostrar(this.listaEnt, false);
      }
    }

    // Lluvia: las gotas caen en bucle; el agua sube con el nivel.
    if (this.zonaLluvia) {
      const pos = this.gotas.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - dt * 0.28;
        if (y < -0.27) {
          y = -0.02;
        }
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
      const radio = 0.07 + this.nivelAgua * 0.035;
      const alto = 0.004 + this.nivelAgua * 0.02;
      this.agua.scale.set(radio, alto, radio);
      this.agua.position.y = GROSOR_ZONA + alto / 2;
    }

    // Misión con tiempo límite: reloj visible sobre la zona.
    const mision = c.estado.misiones[0];
    const reloj = this.relojEnt.object3D!;
    if (mision) {
      mision.tiempo -= dt;
      // Mientras no se despache, el agua sube (más rápido si se venció).
      this.nivelAgua = Math.min(2.2, this.nivelAgua + dt * (mision.tiempo > 0 ? 0.008 : 0.03));
      const centro = c.maqueta.zonas[mision.zona].centro;
      reloj.position.set(centro.x, 0.26, centro.z);
      if (!reloj.visible) {
        c.mostrar(this.relojEnt, true);
      }
      c.mirar(reloj);
      const quedan = Math.max(0, Math.ceil(mision.tiempo));
      const texto = quedan > 0 ? `${Math.floor(quedan / 60)}:${String(quedan % 60).padStart(2, '0')}` : '¡Tiempo!';
      if (texto !== this.textoReloj) {
        this.textoReloj = texto;
        this.reloj.escribir(texto, COLOR.rojo);
      }
      if (mision.tiempo <= 0 && !this.vencida) {
        // Se venció: la zona empeora y llega un aviso nuevo.
        this.vencida = true;
        this.agrandar(mision.zona, 1.3);
        c.avisos.disparar('vencida');
      }
    } else if (reloj.visible) {
      c.mostrar(this.relojEnt, false);
      this.vencida = false;
      reloj.scale.setScalar(OCULTO);
    }
  }

  private textoReloj = '';
  private vencida = false;
}
