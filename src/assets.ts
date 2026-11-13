// Catálogo de recursos (lo leen la app y el editor de IWSDK: sin efectos).
import { AssetType, defineAssets } from '@iwsdk/core';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

const glb = (archivo: string, name: string) => ({
  url: publicAssetUrl(`models/${archivo}.glb`),
  type: AssetType.GLTF,
  name,
  priority: 'critical' as const,
});

export default defineAssets({
  // Panel espacial (UIKitML) con las opciones del centro de acopio.
  'centro-acopio': {
    url: publicAssetUrl('ui/centro-acopio.uikitml'),
    type: AssetType.UIKitML,
    name: 'Panel del centro de acopio',
  },
  gato: glb('gato', 'Gato guía'),
  estanteria: glb('estanteria', 'Estantería'),
  casa_roja: glb('casa_roja', 'Casa urgente'),
  casa_amarilla: glb('casa_amarilla', 'Casa desabastecida'),
  agua: glb('agua', 'Agua'),
  alimento_no_perecedero: glb('alimento_no_perecedero', 'No perecederos'),
  comida_bebe: glb('comida_bebe', 'Comida de bebé'),
  comida_animal: glb('comida_animal', 'Comida para animales'),
  papel_higienico: glb('papel_higienico', 'Higiene corporal'),
  higiene_bucal: glb('higiene_bucal', 'Higiene bucal'),
  jabon: glb('jabon', 'Limpieza del hogar'),
  camisa: glb('camisa', 'Ropa de hombre'),
  vestido: glb('vestido', 'Ropa de mujer'),
  overol: glb('overol', 'Ropa de niños'),
  analgesicos: glb('analgesicos', 'Analgésicos'),
  antibioticos: glb('antibioticos', 'Antibióticos'),
  cronico: glb('cronico', 'Crónicos'),
  herramientas: glb('herramientas', 'Herramientas'),
  material_construccion: glb('material_construccion', 'Material de construcción'),
  proteccion_personal: glb('proteccion_personal', 'Protección personal'),
});
