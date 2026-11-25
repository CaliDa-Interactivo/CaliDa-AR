// Prueba que la oclusión no pueda volver a dejar la escena invisible en las
// gafas (lo que pasó en nov 2026). Corre con: npm run prueba:oclusion
// y en GitHub antes de publicar: si falla, no se publica.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DISTANCIA_MAX_MUNECA,
  RADIO_MAX,
  RADIO_MIN,
  manoValida,
  pedirProfundidad,
  radioSeguro,
  usarOclusionIWSDK,
} from '../src/oficina/seguridad-oclusion.js';

let pruebas = 0;
const prueba = (nombre: string, fn: () => void) => {
  fn();
  pruebas++;
  console.log(`✓ ${nombre}`);
};

/** Lee un archivo del proyecto (las pruebas corren desde la raíz). */
const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8');
/** El código sin comentarios (para no contar menciones en las explicaciones). */
const codigo = (ruta: string) =>
  leer(ruta)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
const params = (q: string) => new URLSearchParams(q);

prueba('por defecto no se usa la oclusión de IWSDK ni se pide la profundidad', () => {
  assert.equal(usarOclusionIWSDK(params('')), false);
  assert.equal(pedirProfundidad(params('')), false);
  assert.equal(usarOclusionIWSDK(params('?prueba')), false);
  assert.equal(pedirProfundidad(params('?prueba&multi=crear')), false);
});

prueba('solo ?oclusionsuave activa la oclusión; ?diagnostico solo pide la profundidad', () => {
  assert.equal(usarOclusionIWSDK(params('?oclusionsuave')), true);
  assert.equal(pedirProfundidad(params('?oclusionsuave')), true);
  assert.equal(usarOclusionIWSDK(params('?diagnostico')), false);
  assert.equal(pedirProfundidad(params('?diagnostico')), true);
});

prueba('index.ts: DepthSensingSystem solo dentro de usarOclusionIWSDK y profundidad quitada por defecto', () => {
  const src = codigo('src/index.ts');
  const registros = src.match(/registerSystem\(\s*DepthSensingSystem/g) ?? [];
  assert.equal(registros.length, 1, 'DepthSensingSystem se registra en un solo lugar');
  const guarda = src.indexOf('if (usarOclusionIWSDK(parametros))');
  const registro = src.indexOf('registerSystem(DepthSensingSystem');
  assert.ok(guarda >= 0 && registro > guarda && registro - guarda < 200, 'el registro está justo dentro de la guarda');
  assert.match(src, /if \(funciones && !pedirProfundidad\(parametros\)\) \{\s*delete funciones\.depthSensing;/);
});

prueba('juego.ts: DepthOccludable solo dentro de usarOclusionIWSDK', () => {
  const src = codigo('src/oficina/juego.ts');
  const usos = src.match(/addComponent\(\s*DepthOccludable/g) ?? [];
  assert.equal(usos.length, 1);
  const guarda = src.indexOf('if (usarOclusionIWSDK(');
  const uso = src.indexOf('addComponent(DepthOccludable');
  assert.ok(guarda >= 0 && uso > guarda && uso - guarda < 200, 'DepthOccludable está justo dentro de la guarda');
});

prueba('ningún archivo usa el modo MinMax ni registra la profundidad en otro lugar', () => {
  for (const ruta of [
    'src/index.ts',
    'src/oficina/juego.ts',
    'src/oficina/multi.ts',
    'src/oficina/oclusion.ts',
    'src/oficina/escena.ts',
    'src/oficina/repisa.ts',
    'src/oficina/objetos.ts',
  ]) {
    const src = codigo(ruta);
    assert.ok(!/MinMaxSoftOcclusion/.test(src), `${ruta} usa MinMaxSoftOcclusion`);
    if (ruta !== 'src/index.ts') {
      assert.ok(!/registerSystem\(\s*DepthSensingSystem/.test(src), `${ruta} registra DepthSensingSystem`);
    }
    if (ruta !== 'src/oficina/juego.ts') {
      assert.ok(!/addComponent\(\s*DepthOccludable/.test(src), `${ruta} agrega DepthOccludable`);
    }
  }
});

prueba('la configuración pide la profundidad como opcional (nunca obligatoria)', () => {
  const config = JSON.parse(leer('iwsdk.config.json')) as {
    world: { xr: { features: { depthSensing?: { required?: boolean } | boolean } } };
  };
  const d = config.world.xr.features.depthSensing;
  assert.ok(d === undefined || d === false || (typeof d === 'object' && d.required === false));
});

prueba('radios de la mano invisible acotados', () => {
  assert.equal(radioSeguro(0.008), 0.008);
  assert.equal(radioSeguro(5), RADIO_MAX);
  assert.equal(radioSeguro(-1), RADIO_MIN);
  assert.equal(radioSeguro(0), RADIO_MIN);
  assert.equal(radioSeguro(Number.NaN), 0.008);
  assert.equal(radioSeguro(Number.POSITIVE_INFINITY), 0.008);
});

prueba('solo manos posibles: finitas y a menos de 30 cm de la muñeca', () => {
  const mano = new Float32Array(75);
  for (let i = 0; i < 25; i++) {
    mano[i * 3] = 0.1 + i * 0.004;
    mano[i * 3 + 1] = 1.2;
    mano[i * 3 + 2] = -0.4 - i * 0.003;
  }
  assert.equal(manoValida(mano), true);
  const lejos = Float32Array.from(mano);
  lejos[40] = 1.2 + DISTANCIA_MAX_MUNECA + 0.1;
  assert.equal(manoValida(lejos), false);
  const rota = Float32Array.from(mano);
  rota[10] = Number.NaN;
  assert.equal(manoValida(rota), false);
  assert.equal(manoValida(new Float32Array(10)), false);
});

prueba('manos.ts y oclusion.ts usan los datos acotados', () => {
  const manos = codigo('src/oficina/manos.ts');
  assert.match(manos, /radioSeguro\(pj\.radius/);
  assert.match(manos, /manoValida\(mano\.articulaciones\)/);
  const oclusion = codigo('src/oficina/oclusion.ts');
  assert.ok((oclusion.match(/radioSeguro\(r\[/g) ?? []).length >= 2);
});

console.log(`\n${pruebas} pruebas de oclusión en verde.`);
