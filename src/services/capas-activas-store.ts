// Copia en memoria de los últimos datos cargados de las capas de tráfico,
// Valenbisi y aparcamiento — spec 012. Nunca persistido (ni localStorage ni
// caché): solo vive mientras dura la sesión del navegador, y existe
// únicamente para que el panel de proximidad pueda calcular contra los
// mismos datos que main.ts ya tiene en memoria, sin duplicar llamadas de red.
import type { TramoTrafico } from './trafico';
import type { EstacionValenbisi } from './valenbisi';
import type { Aparcamiento } from './aparcamiento';

export interface CapasActivas {
  tramosTrafico: TramoTrafico[];
  estacionesValenbisi: EstacionValenbisi[];
  aparcamientos: Aparcamiento[];
}

const store: CapasActivas = {
  tramosTrafico: [],
  estacionesValenbisi: [],
  aparcamientos: [],
};

export function actualizarTramosTrafico(tramos: TramoTrafico[]): void {
  store.tramosTrafico = tramos;
}

export function actualizarEstacionesValenbisi(estaciones: EstacionValenbisi[]): void {
  store.estacionesValenbisi = estaciones;
}

export function actualizarAparcamientos(aparcamientos: Aparcamiento[]): void {
  store.aparcamientos = aparcamientos;
}

export function getCapasActivas(): CapasActivas {
  return store;
}
