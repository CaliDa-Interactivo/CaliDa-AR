# CaliDa RA · Centro de acopio

Experiencia de **realidad aumentada para Meta Quest 3** del proyecto universitario CaliDa
(Diseño Interactivo, Cali, Colombia). Es un juego de gestión: después del terremoto de Cali
(10 ago 2026) la persona maneja un centro de acopio de la Cruz Roja durante una semana, de lunes a
viernes, cada día más difícil.

Es un proyecto **aparte** de la página web CaliDa (`CaliDa-Interactivo/CaliDa`): no se publica en su
repositorio ni en su enlace.

**Enlace:** https://calida-interactivo.github.io/CaliDa-AR/

## Cómo abrirlo en las gafas

1. En el Meta Quest 3, abre el navegador y entra a https://calida-interactivo.github.io/CaliDa-AR/
2. Elige **Un jugador** o **Multijugador** y toca **Entrar en RA** (acepta los permisos de manos y
   espacio). Si ves la versión vieja, recarga la página.
3. El gato y el botón **Colocar aquí** siguen tu mirada. Párate derecho, mira al frente y empuja el
   botón con la punta del índice: la oficina se calibra a tu estatura y queda anclada a ese lugar.

Para que encuentre el piso, las gafas deben tener hecha la configuración del espacio
(Ajustes → Entorno → Configuración del espacio). Si no hay planos, se usa hit-test o el piso del
espacio de referencia.

## Controles

Con **pinza** y sin rayos: todo con las manos.

| Acción | Cómo |
| --- | --- |
| Resaltar un objeto (hover) | Acerca la pinza (pulgar e índice) a menos de 5 cm: contorno blanco. Solo se agarra lo que está resaltado; en la estantería hay que meter la pinza en el compartimiento |
| Agarrar | Junta el **pulgar y el índice** (menos de 1,8 cm) |
| Soltar | Separa los dedos (más de 3,5 cm). Encaja en un puesto válido (verde) o cae a la mesa o al piso |
| Botones | Empújalos con la **punta del índice**: se hunden hasta 1,5 cm |
| Con controles | Gatillo (o gatillo lateral) = cerrar la pinza |
| Computador (`?prueba`) | Arrastrar y hacer clic con el mouse, sin pantalla de entrada |

Menú bajo el panel de avisos: **Mover oficina**, **Recalibrar altura** y **Saltar tutorial**.

## El juego

- **Oficina en U** flotante (sin patas): a la izquierda el panel de avisos en la pantalla de un
  monitor; al frente la **estantería de madera de la página** (5 categorías, tope 30, alerta en 25)
  con los productos grandes (de a dos apilados al frente y el resto hacia atrás), el gato encima con
  el reloj y la caneca de descarte a su izquierda, hacia el frente; la pila de cajas (máx. 8), la
  zona de trabajo y la caja del pedido; a la derecha el camión de la Cruz Roja (la caja entra por
  sus puertas traseras) y el botón **Despachar**.
- **Ejemplos:** junto a "Colocar aquí", una mano de ejemplo empuja con el índice un botón de muestra
  (el de verdad lo empuja la persona). Justo después de colocar la oficina, sobre la mesa, otra mano
  de ejemplo muestra cómo se agarra con la pinza (unas vueltas o hasta que se agarra algo). Las manos reales se ven tal cual, con una línea blanca fina alrededor (como en el Quest).
- **Pedidos por producto** (subcategoría): "2 higiene bucal", "1 agua"…; solo vale ese producto.
- **Oclusión:** la mano real tapa lo virtual a ras: una mano invisible con las articulaciones y radios reales de WebXR;
  la malla genérica de la mano no se dibuja, así los objetos no cambian de color ni de forma.
- **Flujo:** campana → aviso → llegan cajas → quitar la tapa → revisar cada objeto a mano (contorno
  rojo y letrero = dañado) → a su compartimiento o a la caneca. Llegan pedidos de municipios del Valle
  del Cauca con reloj → aceptar → elegir municipio → llenar la caja desde la estantería → al camión →
  Despachar.
- **Inventario inicial:** Alimento 10, Aseo 9, Ropa 26, Medicamentos 7, Construcción 6.
- **Cada día** tiene más cajas, más dañados (15 % → 35 %), relojes más cortos y urgencias por lluvias
  o inundaciones. Entre los eventos grandes llegan cajas sueltas y **encargos rápidos** (pedidos de 1
  o 2 cosas) para que siempre haya algo que hacer. Al final, resumen con estrellas y **Continuar** / **Finalizar experiencia** (el
  viernes solo Finalizar). El resumen total lleva a **Volver al inicio**.
- **Tutorial** el lunes con pistas del gato y una flecha.

### Multijugador (2 Quest)

En la entrada, **Multijugador** → quien crea la sala elige su rol (**receptor** o **despachador**) y
recibe un código de 4 dígitos; el otro lo escribe y queda con el rol contrario. La conexión es
WebRTC con PeerJS (el servidor público solo presenta a los dos equipos).

- El **anfitrión manda** el reloj, la estantería, los estados de las categorías, los mensajes y los
  resúmenes (4 veces por segundo). Los cambios del invitado en la estantería se ven al instante y se
  confirman con número de secuencia (seq/ack). Reconexión automática.
- **Receptor:** donantes en fila con paciencia y tarjeta (datos **inventados**), formulario con teclado
  virtual (nombre, cédula de 8 a 10 dígitos, categoría, cantidad) → Registrar o Rechazar; abre cajas,
  clasifica y surte la estantería; panel de estado a la derecha.
- **Despachador:** pedidos con reloj, caja de pedido infinita, camión y botón (sin caneca ni teclado).
- **Mensajes solo con botones:** uno por categoría ("Necesito [ícono] [categoría]") y cuatro fijos:
  "¡Hola!", "Pedido urgente", "Categoría llena" y "Listo, enviado". Se ven los últimos 5 con hora.

## Herramientas

| Herramienta | Uso |
| --- | --- |
| **IWSDK** `@iwsdk/core` 1.1.0-rc.2 | Immersive Web SDK de Meta: ECS (entidades, componentes y sistemas), sesión WebXR, manos, oclusión por profundidad. `iwsdk.config.json` manda sobre la configuración |
| **WebXR** | Uso directo en `src/webxr.ts`: soporte, anclas (`createAnchor`), planos del piso, hit-test. Articulaciones de la mano en `src/oficina/manos.ts` |
| **three.js** (super-three 0.185) | Viene con IWSDK; siempre se importa de `@iwsdk/core` |
| **IWER** | Emulador de Quest 3 de IWSDK, se abre con `npm run dev` |
| **PeerJS** 1.5 | Multijugador por WebRTC |
| **Vite** 7 + **TypeScript** 5 | Compilación |
| **Roboto** | Única tipografía (texto 2D, letreros 3D y lienzos) |
| Web Audio | Sonidos sin archivos (`src/guion/sonidos.ts`) |
| glTF Transform | Simplificar los modelos para el Quest (`public/models/ra/`) |

## Desarrollo

Hace falta Node 22 LTS (o 20.19+ / 24).

```bash
npm install
npm run dev              # emulador IWER con un Quest 3 simulado
npm run typecheck        # siempre antes de probar
npm run build            # compila a dist/
npm run prueba:compartido  # pruebas de las reglas del multijugador (node)
```

Las manos reales tapan lo virtual con una "mano invisible" armada con las articulaciones y radios
reales que da WebXR (`OclusorManos` en `oclusion.ts`). Parámetros de prueba en las gafas:
`?diagnostico` (datos e imágenes de la profundidad del visor), `?oclusionsuave` (oclusión de IWSDK)
y `?sinoclusormano` (sin la mano invisible).

Modo prueba con el mouse: `?prueba` (un jugador), `?prueba&multi=crear&rol=despachador` y
`?prueba&multi=unir&sala=CÓDIGO`. Para el multijugador usa **dos ventanas lado a lado** (no pestañas:
la de atrás se congela).

Simplificar un modelo pesado:

```bash
npx -y @gltf-transform/cli@4.1.1 simplify --ratio 0.1 --error 0.01 entrada.glb salida.glb
```

## Estructura

| Archivo | Qué tiene |
| --- | --- |
| `index.html` | Pantalla de entrada (modo, multijugador, "Entrar en RA") |
| `src/index.ts` | Crea el mundo, registra `DepthSensingSystem` y el sistema del modo |
| `src/assets.ts` | Manifiesto de GLB |
| `src/webxr.ts` | `comprobarWebXR`, `AnclaWebXR`, `SondaPiso` |
| `src/guion/` | Gato (modelo, globo y animaciones), animador, sonidos, tildes para UIKit |
| `src/oficina/datos.ts` | Categorías, productos, jornadas, municipios |
| `src/oficina/modelo.ts` | Aviso, Pedido, Cuenta, estrellas |
| `src/oficina/escena.ts` | Oficina en U y ergonomía |
| `src/oficina/repisa.ts` | Góndola, bandejas, placas y etiquetas |
| `src/oficina/objetos.ts` | Productos, contorno, daño, caja, camión (`camion.glb`), monitor (`escritorio.glb`) y sombras |
| `src/oficina/manos.ts` · `interaccion.ts` | Pinza, índice; hover, agarrar, soltar, gravedad, botones |
| `src/oficina/oclusion.ts` | Profundidad, oclusor de mano y objeto siempre encima |
| `src/oficina/ui.ts` · `panel.ts` | Lienzos, botones 3D, panel de avisos |
| `src/oficina/juego.ts` | `OficinaSystem` (un jugador) |
| `src/oficina/red.ts` · `compartido.ts` · `multi.ts` · `multi-ui.ts` | Multijugador |
| `src/oficina/miniaturas.ts` | Fotos de los productos para íconos |
| `pruebas/compartido.prueba.ts` | Pruebas de `compartido.ts` con node |

## Publicación

Cada push a `main` ejecuta `.github/workflows/pages.yml` (Node 22, `npm ci --ignore-scripts`,
typecheck, build) y publica `dist/` en GitHub Pages. La versión anterior quedó en la etiqueta
`version-anterior`.
