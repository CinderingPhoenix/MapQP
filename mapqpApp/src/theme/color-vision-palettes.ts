import type {
    ColorVisionPresets,
} from "../context/settings-context";

export type AppPalette = {
    background: string;
    surface: string;
    text: string;
    secondaryText: string;
    primary: string;
    onPrimary: string;
    border: string;
};

export const COLOR_VISION_PALETTES: Record<ColorVisionPresets, AppPalette> = {
    default: {
        background: "#F3F5F8",
        surface: "#FFFFFF",
        text: "#171A1F",
        secondaryText: "#425466",
        primary: "#AC2837",
        onPrimary: "#FFFFFF",
        border: "#761723"
    },

    protanopia: {
        background: "#F2F5F8",
        surface: "#FFFFFF",
        text: "#171A1F",
        secondaryText: "#546269",
        primary: "#293FAE",
        onPrimary: "#FFFFFF",
        border: "#FF7B0B"
    },

    deuteranopia: {
        background: "#F2F6F8",
        surface: "#FFFFFF",
        text: "#171A1F",
        secondaryText: "#556269",
        primary: "#1D43AE",
        onPrimary: "#FFFFFF",
        border: "#FF564F"
    },

    tritanopia: {
        background: "#F3F5FA",
        surface: "#FFFFFF",
        text: "#171A1F",
        secondaryText: "#5D606A",
        primary: "#AC2A30",
        onPrimary: "#FFFFFF",
        border: "#022AFF"
    },

    achromatopsia: {
        background: "#F2F5F8",
        surface: "#FFFFFF",
        text: "#111111",
        secondaryText: "#444444",
        primary: "#222222",
        onPrimary: "#FFFFFF",
        border: "#222222"
    },
}