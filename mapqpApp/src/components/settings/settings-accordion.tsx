import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useCallback, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { AccessibilityInfo, Platform, Text, TouchableOpacity, View, useWindowDimensions,
  type StyleProp, type TextProps, type ViewStyle } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSettings } from "../../context/settings-context";
import { useAccessibilityPreferences } from "../../hooks/use-accessibility-preferences";
import { useSettingsPalette } from "../../hooks/use-settings-theme";

export type HeaderIcon = { name: keyof typeof MaterialCommunityIcons.glyphMap; color: string; background: string };
export const HEADER_ICONS = {
  display: { name: "tune-variant", color: "#245B8F", background: "#EAF1F8" },
  text: { name: "format-size", color: "#245B8F", background: "#EAF1F8" },
  accessibility: { name: "human", color: "#65418C", background: "#F1EBF7" },
  routing: { name: "routes", color: "#286341", background: "#EAF3ED" },
  support: { name: "cog-outline", color: "#741B2B", background: "#F5ECEE" },
} as const satisfies Record<string, HeaderIcon>;

export const SETTINGS_SECTION_TITLES = {
  appearance: "Appearance", text: "Text & Navigation Preferences", accessibility: "Accessibility",
  routing: "Routing & Spoken Guidance", support: "App & Support",
} as const;

type StyleName = "panel" | "strongPanel" | "accordionHeader" | "expandedHeader" | "stackedRow" |
  "accordionHeading" | "wrappedIconLabel" | "headerIcon" | "fullWidth" | "flex" | "chevronEnd" |
  "collapseFooter" | "collapseButton" | "strongBoundary";
type Props = {
  title: string; icon: HeaderIcon; children: ReactNode;
  appearance?: "standard" | "accessible";
  styles: Record<StyleName, StyleProp<ViewStyle>>;
  ink: string; contrastInk: string;
  renderText: (props: TextProps & { size: number }) => ReactNode;
};

function focusControl(target: ComponentRef<typeof TouchableOpacity> | ComponentRef<typeof Text> | null) {
  if (!target) return;
  if (Platform.OS === "web") target.focus();
  else AccessibilityInfo.sendAccessibilityEvent(target, "focus");
}

// Each disclosure owns only its open state. Preferences remain in SettingsProvider.
export function Accordion({ title, icon, children, styles: s, ink, contrastInk, renderText, appearance = "accessible" }: Props) {
  const vision = useSettingsPalette();
  const [expanded, setExpanded] = useState(false);
  const { screenReaderEnabled, darkerSystemColorsEnabled, highTextContrastEnabled } = useAccessibilityPreferences();
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const { fontSize } = useSettings();
  const increasedContrast = darkerSystemColorsEnabled || highTextContrastEnabled;
  const compact = appearance === "standard";
  const width = compact ? Math.min(windowWidth, 600) : windowWidth;
  const scale = fontSize * fontScale;
  const gutter = compact ? 20 : width < 360 ? 12 : 20;
  const headingSize = compact ? 18 : 22;
  const stackHeading = Math.max(...title.split(/\s+/).map((word) => word.length)) * headingSize * scale * 0.58
    > width - gutter * 2 - 32 - 40 - 48;
  const header = useRef<ComponentRef<typeof TouchableOpacity>>(null);
  const frame = useRef<number | null>(null);
  const pendingBottomFocus = useRef(false);
  const active = useRef(false);
  const cancelCollapse = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    pendingBottomFocus.current = false;
  }, []);
  useFocusEffect(useCallback(() => {
    active.current = true;
    return () => { active.current = false; cancelCollapse(); };
  }, [cancelCollapse]));
  const collapse = () => {
    cancelCollapse();
    if (!expanded) return;
    if (screenReaderEnabled) {
      // Header activation already focuses it. Escape from a descendant must also
      // return there BEFORE removing that descendant from the native tree.
      focusControl(header.current);
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        if (active.current) setExpanded(false);
      });
    } else setExpanded(false);
  };
  const collapseFromBottom = () => {
    if (!active.current || !expanded || pendingBottomFocus.current) return;
    cancelCollapse();
    pendingBottomFocus.current = screenReaderEnabled || Platform.OS === "web";
    setExpanded(false);
  };
  const focusCollapsedHeader = () => {
    if (expanded || !active.current || !pendingBottomFocus.current || frame.current !== null) return;
    // The panel has its collapsed native layout now. Request focus only once,
    // letting VoiceOver/TalkBack reveal that target through native scrolling.
    // Web focus also brings the header into view for keyboard activation.
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (active.current && pendingBottomFocus.current) {
        pendingBottomFocus.current = false;
        focusControl(header.current);
      }
    });
  };
  return <View style={[s.panel, increasedContrast && s.strongPanel]} onLayout={focusCollapsedHeader}
    onAccessibilityEscape={expanded ? collapse : undefined}>
    <TouchableOpacity ref={header} accessible accessibilityRole="button" accessibilityLabel={title}
      accessibilityState={{ expanded }} accessibilityHint={expanded ? "Collapses this section" : "Expands this section"}
      onPress={() => { if (expanded) collapse(); else { cancelCollapse(); setExpanded(true); } }}
      activeOpacity={1} style={[s.accordionHeader, expanded && s.expandedHeader, stackHeading && s.stackedRow]}>
      <View style={[s.accordionHeading, stackHeading && s.wrappedIconLabel]}>
        <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
          pointerEvents="none" style={[s.headerIcon, { backgroundColor: vision.iconColors(icon.background, icon.color).background }]}>
          <MaterialCommunityIcons name={icon.name} size={compact ? 20 : 24} color={vision.iconColors(icon.background, icon.color).foreground} accessible={false} allowFontScaling={false} />
        </View>
        {renderText({ size: headingSize, accessible: false, style: stackHeading ? s.fullWidth : s.flex, children: title })}
      </View>
      <MaterialCommunityIcons name={expanded ? "chevron-up" : "chevron-down"} size={compact ? 24 : 28}
        color={vision.color(increasedContrast ? contrastInk : ink, "iconColor")} accessible={false} allowFontScaling={false} style={stackHeading ? s.chevronEnd : undefined} />
    </TouchableOpacity>
    {expanded && <View>
      {children}
      {!compact && <View style={s.collapseFooter}>
        <TouchableOpacity accessible accessibilityRole="button" accessibilityLabel={`Collapse ${title}`}
          onPress={collapseFromBottom} activeOpacity={1}
          style={[s.collapseButton, increasedContrast && s.strongBoundary]}>
          {renderText({ size: compact ? 17 : 20, accessible: false, style: s.flex, children: "Collapse Section" })}
          <MaterialCommunityIcons name="chevron-up" size={24}
            color={vision.color(increasedContrast ? contrastInk : ink, "iconColor")} accessible={false} allowFontScaling={false} />
        </TouchableOpacity>
      </View>}
    </View>}
  </View>;
}

