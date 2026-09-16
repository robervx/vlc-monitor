// Store compartido para "centrar el mapa en [lon, lat]" — spec 041.
//
// El panel de apoyo a decisión vive en /inteligencia, donde el mapa está
// oculto (spec 040) — no puede llamar a la instancia de MapLibre
// directamente. En vez de crear una segunda instancia de mapa (fuera de
// alcance, spec 000/040), el botón "Ver en el mapa" pide un centrado aquí y
// cambia a la vista /mapa; `main()` (dueño de la única instancia del mapa)
// escucha la petición y hace el `flyTo` real.
export interface PeticionCentrado {
  coordenadas: [number, number];
  zoom?: number;
}

const subs = new Set<(p: PeticionCentrado) => void>();

export function pedirCentrarMapa(peticion: PeticionCentrado): void {
  subs.forEach((cb) => cb(peticion));
}

export function onPeticionCentrarMapa(cb: (p: PeticionCentrado) => void): void {
  subs.add(cb);
}
