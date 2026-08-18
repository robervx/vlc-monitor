import { defineConfig } from 'vite';

// Config mínima de arranque (fase F0). Amplíar solo cuando una spec lo requiera
// explícitamente (p. ej. plugin de servidor de API local para las funciones
// edge de api/, siguiendo el patrón sebufApiPlugin documentado en
// docs/investigacion/WORLDMONITOR_TEARDOWN_VLC_PROPUESTA.md).
export default defineConfig({
  server: {
    port: Number(process.env.DEV_PORT) || 3000,
  },
});
