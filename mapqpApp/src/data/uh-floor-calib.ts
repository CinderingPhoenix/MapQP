export const UNITY_FLOOR_CALIBRATION = {
    buildingId: "Unity",
    variabilityType: "variance",

    transitions: [
    {
      fromFloor: 1,
      toFloor: 2,
      meanDifference: 0.522836830,
      variance: 0.082168191,
    },
    {
      fromFloor: 2,
      toFloor: 3,
      meanDifference: 0.430366566,
      variance: 0.083979602,
    },
    {
      fromFloor: 3,
      toFloor: 4,
      meanDifference: 0.503539783,
      variance: 0.062140140,
    },
    {
      fromFloor: 4,
      toFloor: 5,
      meanDifference: 0.662535344,
      variance: 0.065836213,
    }
  ]
} as const;

export const UNITY_ELEVATOR_TIMING = {
    buildingId: "Unity",
    normal: {
        measuredTotalSeconds: 32.825,
        secondsPerFloorInterval: 6.565
    },
    rush: {
        measuredTotalSeconds: 92.755,
        secondsPerFloorInterval: 18.551
    },

    rushWindow: {
        startMinute: 45,
        endMinute: 15
    },

    intervalBasisConfirmed: false
} as const;