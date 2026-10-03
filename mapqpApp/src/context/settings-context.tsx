import AsyncStorage from "@react-native-async-storage/async-storage";
import {
    createContext,
    ReactNode,
    useContext,
    useEffect,
    useState,
} from "react";

export type DistanceUnits = "imperial" | "metric";
export type DirectionStyle = "natural" | "degrees";

type AppSettings = {
  distanceUnits: DistanceUnits;
  directionStyle: DirectionStyle;
  fontSize: number;
};

type SettingsContextType = AppSettings & {
  setDistanceUnits: (units: DistanceUnits) => void;
  setDirectionStyle: (style: DirectionStyle) => void;
  setFontSize: (size: number) => void;
  settingsLoaded: boolean;
};

const SETTINGS_STORAGE_KEY = "@mapqp_settings";

const DEFAULT_SETTINGS: AppSettings = {
  distanceUnits: "imperial",
  directionStyle: "natural",
  fontSize: 1,
};

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined
);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [distanceUnits, setDistanceUnits] = useState<DistanceUnits>(
    DEFAULT_SETTINGS.distanceUnits
  );

  const [directionStyle, setDirectionStyle] = useState<DirectionStyle>(
    DEFAULT_SETTINGS.directionStyle
  );

  const [fontSize, setFontSize] = useState(DEFAULT_SETTINGS.fontSize);

  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedSettings = await AsyncStorage.getItem(
          SETTINGS_STORAGE_KEY
        );

        if (savedSettings) {
          const parsedSettings: Partial<AppSettings> =
            JSON.parse(savedSettings);

          if (
            parsedSettings.distanceUnits === "imperial" ||
            parsedSettings.distanceUnits === "metric"
          ) {
            setDistanceUnits(parsedSettings.distanceUnits);
          }

          if (
            parsedSettings.directionStyle === "natural" ||
            parsedSettings.directionStyle === "degrees"
          ) {
            setDirectionStyle(parsedSettings.directionStyle);
          }

          if (
            typeof parsedSettings.fontSize === "number" &&
            parsedSettings.fontSize >= 0.8 &&
            parsedSettings.fontSize <= 1.4
          ) {
            setFontSize(parsedSettings.fontSize);
          }
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
      } finally {
        setSettingsLoaded(true);
      }
    };

    void loadSettings();
  }, []);

  useEffect(() => {
    if (!settingsLoaded) {
      return;
    }

    const saveSettings = async () => {
      try {
        const settings: AppSettings = {
          distanceUnits,
          directionStyle,
          fontSize,
        };

        await AsyncStorage.setItem(
          SETTINGS_STORAGE_KEY,
          JSON.stringify(settings)
        );
      } catch (error) {
        console.error("Failed to save settings:", error);
      }
    };

    void saveSettings();
  }, [
    distanceUnits,
    directionStyle,
    fontSize,
    settingsLoaded,
  ]);

  return (
    <SettingsContext.Provider
      value={{
        distanceUnits,
        directionStyle,
        fontSize,
        setDistanceUnits,
        setDirectionStyle,
        setFontSize,
        settingsLoaded,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);

  if (!context) {
    throw new Error(
      "useSettings must be used inside a SettingsProvider"
    );
  }

  return context;
}