export type IndoorEntrance = {
  latitude: number | null;
  longitude: number | null;
  name: string;
  floor: number;
  accessibility: boolean | null;
};

export type IndoorRoom = {
  roomNum: string;
  name: string;
  entrances: IndoorEntrance[];
};