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
  // Los 16 productos de la estantería de la página, simplificados para el Quest.
  ra_agua: glb('ra/agua', 'agua (RA)'),
  ra_alimento_no_perecedero: glb('ra/alimento_no_perecedero', 'alimento_no_perecedero (RA)'),
  ra_comida_bebe: glb('ra/comida_bebe', 'comida_bebe (RA)'),
  ra_comida_animal: glb('ra/comida_animal', 'comida_animal (RA)'),
  ra_papel_higienico: glb('ra/papel_higienico', 'papel_higienico (RA)'),
  ra_higiene_bucal: glb('ra/higiene_bucal', 'higiene_bucal (RA)'),
  ra_jabon: glb('ra/jabon', 'jabon (RA)'),
  ra_camisa: glb('ra/camisa', 'camisa (RA)'),
  ra_vestido: glb('ra/vestido', 'vestido (RA)'),
  ra_overol: glb('ra/overol', 'overol (RA)'),
  ra_analgesicos: glb('ra/analgesicos', 'analgesicos (RA)'),
  ra_antibioticos: glb('ra/antibioticos', 'antibioticos (RA)'),
  ra_cronico: glb('ra/cronico', 'cronico (RA)'),
  ra_herramientas: glb('ra/herramientas', 'herramientas (RA)'),
  ra_material_construccion: glb('ra/material_construccion', 'material_construccion (RA)'),
  ra_proteccion_personal: glb('ra/proteccion_personal', 'proteccion_personal (RA)'),
  gato: glb('gato', 'Gato guía'),
  estanteria: glb('estanteria', 'Estantería'),
});
