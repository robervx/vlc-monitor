// Foco de distrito — spec 036.
//
// Un distrito seleccionado en el mapa se convierte en "foco": los paneles que
// tienen dato por distrito (contexto mediático, Pulso) se filtran/resaltan a
// ese distrito. Store compartido para que las funciones de render (nivel de
// módulo) lean el foco sin depender del estado local de `main()`.

export interface FocoDistrito {
  codigo: string;
  nombre: string;
}

let foco: FocoDistrito | null = null;
const subs = new Set<(f: FocoDistrito | null) => void>();

export function getFocoDistrito(): FocoDistrito | null {
  return foco;
}

export function setFocoDistrito(nuevo: FocoDistrito | null): void {
  const cambia = (foco?.codigo ?? null) !== (nuevo?.codigo ?? null);
  foco = nuevo;
  if (cambia) subs.forEach((cb) => cb(foco));
}

export function onCambioFoco(cb: (f: FocoDistrito | null) => void): void {
  subs.add(cb);
}

/**
 * Monta el chip "Foco: <distrito> ✕". `onLimpiar` se invoca al pulsar ✕
 * (main.ts lo usa para también deseleccionar el distrito en el mapa).
 */
export function montarChipFoco(onLimpiar: () => void): void {
  const chip = document.createElement('div');
  chip.id = 'foco-distrito-chip';
  chip.hidden = true;

  const texto = document.createElement('span');
  const cerrar = document.createElement('button');
  cerrar.type = 'button';
  cerrar.textContent = '✕';
  cerrar.setAttribute('aria-label', 'Quitar el foco de distrito');
  cerrar.addEventListener('click', onLimpiar);
  chip.append(texto, cerrar);
  document.body.appendChild(chip);

  onCambioFoco((f) => {
    chip.hidden = f === null;
    texto.textContent = f ? `Foco: ${f.nombre}` : '';
  });
}
