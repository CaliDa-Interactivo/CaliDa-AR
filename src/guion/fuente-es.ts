// ============================================================
// fuente-es.ts — tildes y eñes en los paneles UIKitML.
// UIKit convierte la fuente TTF en un atlas de letras y, si no se
// le dice otra cosa, solo genera las del inglés (sin á, é, í, ó, ú,
// ñ, ¿ ni ¡). UIKitML no deja pasar esa opción desde el archivo del
// panel, así que aquí se le agrega el juego de caracteres del
// español a toda fuente TTF que se cargue.
// Debe importarse antes de crear el mundo (ver index.ts).
// ============================================================
import { TTFLoader, type TTFInput } from '@pmndrs/uikit';

const ESPANOL =
  ' \tABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' +
  '!?.,;:\'"()-[]{}@#$%&*+=/\<>' +
  'áéíóúüñÁÉÍÓÚÜÑ¿¡·…°–';

const cargarOriginal = TTFLoader.prototype.loadAsync;

TTFLoader.prototype.loadAsync = function cargarConEspanol(
  this: TTFLoader,
  entrada: TTFInput,
  alAvanzar?: (evento: ProgressEvent) => void,
) {
  const lista = (typeof entrada === 'string' ? [entrada] : entrada).map((fuente) =>
    typeof fuente === 'string'
      ? { url: fuente, charset: ESPANOL }
      : { charset: ESPANOL, ...fuente },
  );
  return cargarOriginal.call(this, lista, alAvanzar);
};
