export type Coordinates = { latitude: number; longitude: number };

export interface MapProvider {
  readonly name: string;
  embedUrl(coordinates: Coordinates): string;
  externalUrl(coordinates: Coordinates): string;
}

/** Map display only; this provider never fetches vessel tracking data. */
export class GoogleMapsProvider implements MapProvider {
  readonly name = 'Google Maps';

  embedUrl({ latitude, longitude }: Coordinates): string {
    return `https://maps.google.com/maps?q=${latitude},${longitude}&z=5&output=embed`;
  }

  externalUrl({ latitude, longitude }: Coordinates): string {
    return `https://www.google.com/maps?q=${latitude},${longitude}`;
  }
}

export const mapProvider: MapProvider = new GoogleMapsProvider();
