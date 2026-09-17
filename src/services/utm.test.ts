import { describe, expect, it } from 'vitest';
import { utmToLatLon } from './utm';

describe('utmToLatLon', () => {
  it('convierte la estación real "VALENCIA" del SAIH (ETRS89 huso 30N) a un punto dentro de la ciudad', () => {
    const { lat, lon } = utmToLatLon(727259.535981726, 4372971.936624126);
    expect(lat).toBeCloseTo(39.4763, 3);
    expect(lon).toBeCloseTo(-0.3579, 3);
  });

  it('convierte la estación real "Tancat de la Pipa" (Albufera, al sur de la ciudad)', () => {
    const { lat, lon } = utmToLatLon(728585.4040088308, 4360134.870698724);
    expect(lat).toBeCloseTo(39.3604, 3);
    expect(lon).toBeCloseTo(-0.3469, 3);
  });
});
