export type UnityOutdoorEntrance = {
  outdoorNodeId: string;
  indoorNodeId: string;
  latitude: number;
  longitude: number;
  name: string;
  floor: 1 | 2 | 5;
  accessibility: boolean;
};

export const UNITY_OUTDOOR_ENTRANCES: UnityOutdoorEntrance[] = [
    {
    outdoorNodeId: "unity-upper-washburn",
    indoorNodeId: "Unity-Fiv-Entr",
    latitude: 42.273798,
    longitude: -71.806686,
    name: "Unity Hall fifth-floor entrance",
    floor: 5,
    accessibility: true
    },
    {
    outdoorNodeId: "unity-upper",
    indoorNodeId: "Unity-Two-Entr",
    latitude: 42.273803,
    longitude: -71.806718,
    name: "Unity Hall fifth-floor entrance",
    floor: 2,
    accessibility: true
    },
    {
    outdoorNodeId: "unity-lower",
    indoorNodeId: "Unity-One-Entr",
    latitude: 42.273622,
    longitude: -71.805623,
    name: "Unity Hall fifth-floor entrance",
    floor: 1,
    accessibility: true
    },

];