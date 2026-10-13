export const CONTINENTS = [
  'Africa',
  'Asia',
  'Europe',
  'North America',
  'South America',
  'Oceania',
  'Antarctica',
] as const;

export type Continent = (typeof CONTINENTS)[number];
export type EventType = 'history' | 'myth';
export type Era = 'before' | 'after';

export interface Waypoint {
  lat: number;
  lng: number;
}

export interface HistoryEvent {
  id: string;
  title: string;
  type: EventType;
  /** Inclusive historical year. Negative years are BCE: -500 is 500 BCE. There is no year 0. */
  start: number;
  /** Inclusive historical year. */
  end: number;
  lat: number;
  lng: number;
  place: string;
  continent: Continent;
  /** Two to four sentences. */
  summary: string;
  /**
   * Dating note shown in the pop-up.
   * Include the word "approximate" when the year is uncertain so the date line gains "approx.".
   * Myths use a traditional date when one exists; otherwise the earliest written source.
   * Say which, in this note.
   */
  dateNote: string;
  /**
   * Migration or movement, drawn as a curved arrow when the pin is selected.
   * A list of lines is a branching route: each line gets its own arrow.
   */
  path?: Waypoint[] | Waypoint[][];
}

export interface Period {
  era: Era;
  /** Inclusive. */
  start: number;
  /** Inclusive. */
  end: number;
  index: number;
}
