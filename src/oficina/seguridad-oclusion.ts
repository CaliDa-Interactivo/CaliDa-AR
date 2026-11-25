// ============================================================
// seguridad-oclusion.ts — reglas para que la escena NUNCA vuelva a
// quedar invisible en las gafas por la oclusión (sin three.js: se
// prueba con node en pruebas/oclusion.prueba.ts y en GitHub antes de
// publicar).
//
// Lo que pasó (nov 2026): con la oclusión por profundidad de IWSDK
// (DepthSensingSystem + DepthOccludable), en el Quest 3 toda la escena
// virtual quedaba recortada: solo se veía el entorno real. Por eso:
//  · Por defecto NO se pide la profundidad del visor ni se usa la
//    oclusión de IWSDK. Las manos tapan con la "mano invisible"
//    (OclusorManos), que no depende de la profundidad.
//  · La profundidad y la oclusión de IWSDK solo se activan con
//    ?oclusionsuave (o ?diagnostico, que solo lee datos) para probar.
//  · La mano invisible solo usa datos sanos: radios acotados y
//    articulaciones cerca de la muñeca. Un dato raro del visor no puede
//    taparlo todo.
// ============================================================

/** Parámetros de la dirección que activan cosas de profundidad (solo para pruebas). */
export interface ParametrosOclusion {
  has(nombre: string): boolean;
}

/** ¿Se usa la oclusión por profundidad de IWSDK? Solo con ?oclusionsuave. */
export const usarOclusionIWSDK = (p: ParametrosOclusion): boolean => p.has('oclusionsuave');

/** ¿Se le pide la profundidad al visor? Solo para la oclusión de prueba o el diagnóstico. */
export const pedirProfundidad = (p: ParametrosOclusion): boolean => p.has('oclusionsuave') || p.has('diagnostico');

/** Radio mínimo y máximo (m) de una articulación de la mano invisible. */
export const RADIO_MIN = 0.002;
export const RADIO_MAX = 0.03;

/** Radio acotado: un valor raro del visor (enorme, negativo o NaN) no puede taparlo todo. */
export function radioSeguro(r: number): number {
  if (!Number.isFinite(r)) {
    return 0.008;
  }
  return Math.min(RADIO_MAX, Math.max(RADIO_MIN, r));
}

/** Distancia máxima (m) de una articulación a la muñeca en una mano real. */
export const DISTANCIA_MAX_MUNECA = 0.3;

/**
 * ¿Las 25 articulaciones (x, y, z seguidos) son una mano posible? Todas
 * finitas y a menos de 30 cm de la muñeca (la primera).
 */
export function manoValida(art: ArrayLike<number>): boolean {
  if (art.length < 75) {
    return false;
  }
  const mx = art[0];
  const my = art[1];
  const mz = art[2];
  for (let i = 0; i < 75; i += 3) {
    const x = art[i];
    const y = art[i + 1];
    const z = art[i + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return false;
    }
    const dx = x - mx;
    const dy = y - my;
    const dz = z - mz;
    if (dx * dx + dy * dy + dz * dz > DISTANCIA_MAX_MUNECA * DISTANCIA_MAX_MUNECA) {
      return false;
    }
  }
  return true;
}
