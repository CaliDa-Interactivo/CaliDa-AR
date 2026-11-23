// Prueba de las reglas compartidas del multijugador (sin three.js ni red).
// Se corre con: npm run prueba:compartido
import assert from 'node:assert/strict';
import { aplicarOp, estadoInicial, sumar, vistaRepisa, type OpRepisa } from '../src/oficina/compartido.js';
import { CATEGORIAS, INVENTARIO_INICIAL, JORNADAS, TOPE } from '../src/oficina/datos.js';
import { cuentaNueva } from '../src/oficina/modelo.js';

let pruebas = 0;
const prueba = (nombre: string, fn: () => void) => {
  fn();
  pruebas++;
  console.log(`✓ ${nombre}`);
};

const iAlimento = CATEGORIAS.findIndex((c) => c.id === 'alimento');
const iRopa = CATEGORIAS.findIndex((c) => c.id === 'ropa');

prueba('inventario inicial de la página', () => {
  const c = estadoInicial();
  assert.equal(c.cantidades[iAlimento], INVENTARIO_INICIAL.alimento);
  assert.equal(c.cantidades[iRopa], 26);
  assert.equal(c.fase, 'espera');
});

prueba('la jornada empieza cuando los dos están listos', () => {
  let c = estadoInicial();
  c = aplicarOp(c, { tipo: 'listo' }, true).comp;
  assert.equal(c.fase, 'espera');
  c = aplicarOp(c, { tipo: 'listo' }, false).comp;
  assert.equal(c.fase, 'jornada');
});

prueba('repisa compartida: confirmaciones seq/ack sin saltos', () => {
  const c = estadoInicial();
  const pendientes: OpRepisa[] = [
    { tipo: 'repisa', seq: 1, i: iAlimento, d: 1, danado: false },
    { tipo: 'repisa', seq: 2, i: iAlimento, d: 1, danado: true },
  ];
  // El invitado ve sus cambios al instante, antes de la confirmación.
  assert.equal(vistaRepisa(c, pendientes).cantidades[iAlimento], 12);
  // El anfitrión aplica el primero: la vista no cambia (sin saltos).
  aplicarOp(c, pendientes[0], false);
  assert.equal(c.ack, 1);
  assert.equal(vistaRepisa(c, pendientes).cantidades[iAlimento], 12);
  aplicarOp(c, pendientes[1], false);
  assert.equal(c.ack, 2);
  assert.equal(c.danados[iAlimento], 1);
  assert.equal(vistaRepisa(c, pendientes).cantidades[iAlimento], 12);
  // Sacar un objeto también se comparte.
  aplicarOp(c, { tipo: 'repisa', seq: 3, i: iAlimento, d: -1, danado: true }, false);
  assert.equal(c.cantidades[iAlimento], 11);
  assert.equal(c.danados[iAlimento], 0);
});

prueba(`tope de ${TOPE} por categoría`, () => {
  const c = estadoInicial();
  for (let k = 0; k < 10; k++) {
    aplicarOp(c, { tipo: 'repisa', seq: k + 1, i: iRopa, d: 1, danado: false }, true);
  }
  assert.equal(c.cantidades[iRopa], TOPE);
  assert.equal(vistaRepisa(c, [{ tipo: 'repisa', seq: 99, i: iRopa, d: 1, danado: false }]).cantidades[iRopa], TOPE);
});

prueba('mensajes con ícono y hora del reloj del juego', () => {
  const c = estadoInicial();
  aplicarOp(c, { tipo: 'chat', de: 'despachador', texto: 'Necesito Alimento', cat: 'alimento', hora: '9:15 a. m.' }, true);
  aplicarOp(c, { tipo: 'chat', de: 'receptor', texto: '¡Hola!', clave: 'hola', hora: '9:16 a. m.' }, false);
  assert.equal(c.chat.length, 2);
  assert.equal(c.chat[0].cat, 'alimento');
  assert.equal(c.chat[0].hora, '9:15 a. m.');
  assert.equal(c.chat[1].clave, 'hola');
  assert.equal(c.chat[1].id, 2);
});

prueba('cuenta del invitado y suma del resumen', () => {
  const c = estadoInicial();
  const b = cuentaNueva();
  b.aTiempo = 2;
  const r = aplicarOp(c, { tipo: 'cuenta', dia: 0, cuenta: b }, false);
  assert.equal(r.cuentaInvitado?.aTiempo, 2);
  const a = cuentaNueva();
  a.aTiempo = 1;
  assert.equal(sumar(a, b).aTiempo, 3);
});

prueba('continuar, finalizar y volver al inicio', () => {
  let c = estadoInicial();
  c.fase = 'resumen';
  c = aplicarOp(c, { tipo: 'siguiente' }, true).comp;
  assert.equal(c.fase, 'jornada');
  assert.equal(c.dia, 1);
  c.fase = 'resumen';
  c = aplicarOp(c, { tipo: 'finalizar' }, true).comp;
  assert.equal(c.fase, 'semana');
  aplicarOp(c, { tipo: 'chat', de: 'receptor', texto: 'Listo, enviado', clave: 'enviado' }, true);
  c = aplicarOp(c, { tipo: 'siguiente' }, true).comp;
  assert.equal(c.fase, 'espera');
  assert.equal(c.dia, 0);
  assert.equal(c.chat.length, 1, 'los mensajes se conservan');
  // El viernes, "Continuar" lleva al resumen total.
  c.fase = 'resumen';
  c.dia = JORNADAS.length - 1;
  c = aplicarOp(c, { tipo: 'siguiente' }, true).comp;
  assert.equal(c.fase, 'semana');
});

console.log(`\n${pruebas} pruebas de compartido.ts en verde.`);
