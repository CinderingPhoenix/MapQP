import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ComponentProps, type ComponentRef, type Ref } from "react";
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextProps,
  type LayoutChangeEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSettings } from "../context/settings-context";
import { useAccessibilityPreferences } from "../hooks/use-accessibility-preferences";
import { useAuthGuard } from "../hooks/use-auth-guard";
import {
  BUG_REPORT_CATEGORIES,
  BUG_REPORT_TEXT_LIMIT,
  validateBugReport,
  type BugReportDraft,
  type BugReportCategory,
} from "../utils/bug-reports";

const categoryIcons: Record<BugReportCategory, ComponentProps<typeof MaterialCommunityIcons>["name"]> = {
  navigation: "navigation-outline",
  accessibility: "wheelchair-accessibility",
  settings: "cog-outline",
  login: "login",
  other: "dots-horizontal-circle-outline",
};

// Keep this component stable so editing and preference changes retain input focus.
function ReportText({ bold, style, ref, ...props }: TextProps & { bold: boolean; ref?: Ref<ComponentRef<typeof Text>> }) {
  return <Text {...props} ref={ref} style={[style, bold && styles.boldText]} />;
}

function InlineError({ message, fontSize, bold, onLayout }: {
  message: string; fontSize: number; bold: boolean; onLayout: (event: LayoutChangeEvent) => void;
}) {
  return <View style={styles.errorRow} onLayout={onLayout}>
    <MaterialCommunityIcons name="alert-outline" size={20} color="#B42332" accessible={false}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants" allowFontScaling={false} />
    <ReportText bold={bold} style={[styles.error, { fontSize: 15 * fontSize, lineHeight: Math.ceil(23 * fontSize) }]}>{message}</ReportText>
  </View>;
}

export default function ReportBugPage() {
  useAuthGuard();
  const { fontSize } = useSettings();
  const preferences = useAccessibilityPreferences();
  const contrast = preferences.darkerSystemColorsEnabled || preferences.highTextContrastEnabled;
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const content = useRef<ComponentRef<typeof View>>(null);
  type Field = keyof BugReportDraft;
  type FocusTarget = ComponentRef<typeof Text> | ComponentRef<typeof TextInput>;
  const targets = useRef<Partial<Record<Field, FocusTarget | null>>>({});
  const sections = useRef<Partial<Record<Field, ComponentRef<typeof View> | null>>>({});
  const focusGeneration = useRef(0);
  const applyingFocus = useRef(false);
  const targetReady = useRef<Partial<Record<Field, boolean>>>({});
  const positions = useRef<Partial<Record<Field | "form", number>>>({});
  const pendingFocus = useRef<Field | null>(null);
  const focusFrame = useRef<number | null>(null);
  const pageFocused = useRef(false);
  const editingField = useRef<Field | null>(null);
  const categoryRef = useCallback((node: ComponentRef<typeof Text> | null) => {
    targets.current.category = node;
    if (!node) targetReady.current.category = false;
  }, []);
  const descriptionRef = useCallback((node: ComponentRef<typeof TextInput> | null) => {
    targets.current.description = node;
    if (!node) targetReady.current.description = false;
  }, []);
  const stepsRef = useCallback((node: ComponentRef<typeof TextInput> | null) => {
    targets.current.stepsToReproduce = node;
    if (!node) targetReady.current.stepsToReproduce = false;
  }, []);
  const [focusRequest, setFocusRequest] = useState<{ field: Field; sequence: number } | null>(null);
  const cancelFocus = useCallback(() => {
    focusGeneration.current += 1;
    pendingFocus.current = null;
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    focusFrame.current = null;
  }, []);
  useFocusEffect(useCallback(() => {
    pageFocused.current = true;
    return () => { pageFocused.current = false; editingField.current = null; cancelFocus(); };
  }, [cancelFocus]));
  const sectionY = (field: Field) => {
    const y = positions.current[field];
    if (y === undefined) return undefined;
    if (field === "category") return y;
    const formY = positions.current.form;
    return formY === undefined ? undefined : formY + y;
  };
  const revealSection = (field: Field) => {
    const y = sectionY(field);
    if (y === undefined || !pageFocused.current) return false;
    // Screen-reader focus must follow an immediate scroll, not race an animation.
    scroll.current?.scrollTo({ y: Math.max(0, y - 12),
      animated: !preferences.reduceMotionEnabled && !preferences.screenReaderEnabled });
    return true;
  };
  useEffect(() => {
    const listener = Keyboard.addListener("keyboardDidShow", () => {
      if (editingField.current) revealSection(editingField.current);
    });
    return () => listener.remove();
  }, [preferences.reduceMotionEnabled, preferences.screenReaderEnabled]);
  const focusInvalidField = () => {
    const field = pendingFocus.current;
    if (!field || !targetReady.current[field] || !targets.current[field] || sectionY(field) === undefined) return;
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    const generation = focusGeneration.current;
    const current = () => pageFocused.current && pendingFocus.current === field && focusGeneration.current === generation;
    focusFrame.current = requestAnimationFrame(() => {
      focusFrame.current = null;
      if (!current()) return;
      const revealAndFocus = (y: number) => {
        if (!current()) return;
        scroll.current?.scrollTo({ y: Math.max(0, y - 12), animated: false });
        focusFrame.current = requestAnimationFrame(() => {
          focusFrame.current = null;
          if (!current() || !targetReady.current[field]) return;
          const target = targets.current[field];
          if (preferences.screenReaderEnabled && target) {
            applyingFocus.current = true;
            try {
              if (Platform.OS === "web") {
                (target as unknown as { focus: (options: { preventScroll: boolean }) => void }).focus({ preventScroll: true });
              } else AccessibilityInfo.sendAccessibilityEvent(target, "focus");
            } finally { applyingFocus.current = false; }
          }
          pendingFocus.current = null;
          setFocusRequest(null);
        });
      };
      // Native measurement avoids stale cached offsets when an earlier error
      // disappears or enlarged text reflows. It also works in React Native Web.
      const section = sections.current[field];
      const parent = content.current;
      if (section && parent) {
        section.measureLayout(parent, (_x, y) => revealAndFocus(y), () => {
          const y = sectionY(field);
          if (y !== undefined) revealAndFocus(y);
        });
      }
    });
  };
  const beginEditing = (field: Field) => {
    editingField.current = field;
    // DOM focus during validation must not undo the freshly measured scroll.
    if (applyingFocus.current) return;
    cancelFocus();
    revealSection(field);
  };
  const measureError = () => {
    focusInvalidField();
  };
  const measureSection = (field: Field | "form", event: LayoutChangeEvent) => {
    positions.current[field] = event.nativeEvent.layout.y;
    focusInvalidField();
  };
  const measureTarget = (field: Field, event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    targetReady.current[field] = width > 0 && height > 0;
    focusInvalidField();
  };
  useEffect(() => {
    if (!focusRequest || !pageFocused.current) return;
    pendingFocus.current = focusRequest.field;
    focusInvalidField();
    return cancelFocus;
  }, [focusRequest, preferences.screenReaderEnabled, preferences.reduceMotionEnabled]);
  const [draft, setDraft] = useState<BugReportDraft>({
    category: null, description: "", stepsToReproduce: "",
  });
  const [checked, setChecked] = useState(false);
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const errors = validateBugReport(draft);
  const descriptionError = checked || descriptionTouched ? errors.description : undefined;
  const stepsError = checked ? errors.stepsToReproduce : undefined;
  const descriptionHelp = "What went wrong? Tell us what you expected to happen.";
  const stepsHelp = "List the actions that led to the problem.";
  const textStyle = [
    styles.body,
    { fontSize: 16 * fontSize, lineHeight: Math.ceil(24 * fontSize) },
    contrast && styles.highContrastText,
  ];
  const labelStyle = [textStyle, styles.label, { fontSize: 22 * fontSize, lineHeight: Math.ceil(30 * fontSize) }];
  const metaStyle = [textStyle, styles.meta, { fontSize: 14 * fontSize, lineHeight: Math.ceil(21 * fontSize) }];
  const indicatorStyle = [textStyle, styles.meta, styles.indicator, { fontSize: 16 * fontSize, lineHeight: Math.ceil(24 * fontSize) }];
  const countStyle = [metaStyle, styles.counter];
  const inputStyle = [
    styles.input,
    { fontSize: 17 * fontSize, lineHeight: Math.ceil(26 * fontSize), minHeight: 144 * fontSize },
    preferences.boldTextEnabled && styles.boldText,
    contrast && styles.highContrastBorder,
  ];
  const formTextStyle = [textStyle, styles.wrappingText];

  const checkReport = () => {
    setChecked(true);
    cancelFocus();
    const field = (["category", "description", "stepsToReproduce"] as const).find((key) => errors[key]);
    if (field) {
      // The focused control reads its label and error; don't interrupt it with
      // a second announcement of the same errors.
      setFocusRequest((previous) => ({ field, sequence: (previous?.sequence ?? 0) + 1 }));
    } else {
      setFocusRequest(null);
      AccessibilityInfo.announceForAccessibility("Required fields are complete. Submission is not yet available. Nothing has been sent.");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}
            accessibilityRole="button" accessibilityLabel="Back to Settings"
            accessibilityHint="Returns to the previous screen. This draft is not saved after leaving.">
            <MaterialCommunityIcons name="chevron-left" size={20} color="#741B2B" accessible={false}
              accessibilityElementsHidden importantForAccessibility="no-hide-descendants" allowFontScaling={false} />
            <ReportText bold={preferences.boldTextEnabled} accessible={false}
              style={[textStyle, styles.backText]}>Back to Settings</ReportText>
          </TouchableOpacity>
        </View>
        <ScrollView ref={scroll} style={styles.flex}
          keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}>
          <View ref={content} collapsable={false} style={styles.content}>
          <View style={styles.titleGroup}>
            <View style={styles.titleRow}>
              <View style={styles.bugTile} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <MaterialCommunityIcons name="bug-outline" size={25} color="#741B2B" accessible={false}
                  accessibilityElementsHidden importantForAccessibility="no-hide-descendants" allowFontScaling={false} />
              </View>
              <ReportText bold={preferences.boldTextEnabled} accessibilityRole="header"
                style={[styles.title, { fontSize: 32 * fontSize, lineHeight: Math.ceil(39 * fontSize) }, contrast && styles.highContrastText]}>Report a bug</ReportText>
            </View>
            <ReportText bold={preferences.boldTextEnabled} style={textStyle}>Help us improve your campus navigation experience.</ReportText>
          </View>
          <View style={[styles.notice, contrast && styles.highContrastBorder]}>
            <MaterialCommunityIcons name="information-outline" size={20} color="#741B2B" accessible={false}
              accessibilityElementsHidden importantForAccessibility="no-hide-descendants" allowFontScaling={false} />
            <View style={styles.noticeCopy}>
              <ReportText bold={preferences.boldTextEnabled} accessibilityRole="header"
                style={[textStyle, styles.noticeTitle]}>Not sending reports yet</ReportText>
              <ReportText bold={preferences.boldTextEnabled} style={[textStyle, { fontSize: 15 * fontSize, lineHeight: Math.ceil(22 * fontSize) }]}>
                You can check this form for missing information. Submission is not available yet, and nothing will be uploaded.
              </ReportText>
            </View>
          </View>

          <View style={styles.section} testID="bug-category-section" collapsable={false} ref={(node) => { sections.current.category = node; }}
            onLayout={(event) => measureSection("category", event)}>
            <View style={styles.labelRow}>
            <ReportText ref={categoryRef} onLayout={(event) => measureTarget("category", event)}
              bold={preferences.boldTextEnabled} accessible accessibilityRole="header"
              accessibilityLabel="Category, required" accessibilityHint={checked && errors.category ? errors.category : undefined} style={labelStyle}>
              Category
            </ReportText>
            <ReportText bold={preferences.boldTextEnabled} style={indicatorStyle} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">Required</ReportText>
            </View>
            <ReportText bold={preferences.boldTextEnabled} style={textStyle}>Choose the closest match.</ReportText>
            <View style={[styles.categoryGroup, contrast && styles.highContrastBorder]} accessible={false} accessibilityRole="radiogroup" accessibilityLabel="Problem category, required">
              {BUG_REPORT_CATEGORIES.map(({ value, label }, index) => (
                <TouchableOpacity key={value}
                  style={[styles.category, index > 0 && styles.categorySeparator,
                    draft.category === value && styles.selectedCategory,
                    draft.category === value && contrast && styles.selectedCategoryContrast]}
                  onPress={() => { cancelFocus(); setFocusRequest(null); setDraft((previous) => ({ ...previous, category: value })); }}
                  accessible accessibilityRole="radio" accessibilityLabel={label}
                  accessibilityHint={`Selects this problem category.${checked && errors.category ? ` ${errors.category}` : ""}`}
                  aria-invalid={Boolean(checked && errors.category)}
                  accessibilityState={{ checked: draft.category === value }}>
                  <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
                    style={[styles.radio, contrast && styles.contrastRadio, draft.category === value && styles.radioSelected]}>
                    {draft.category === value && <View style={styles.radioDot} />}
                  </View>
                  <View style={styles.categoryIcon} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <MaterialCommunityIcons name={categoryIcons[value]} size={20} color="#805563" accessible={false}
                      accessibilityElementsHidden importantForAccessibility="no-hide-descendants" allowFontScaling={false} />
                  </View>
                  <ReportText bold={preferences.boldTextEnabled} accessible={false}
                    accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
                    style={[formTextStyle, styles.categoryLabel, { fontSize: 17 * fontSize }]}>
                    {label}
                  </ReportText>
                </TouchableOpacity>
              ))}
            </View>
            {checked && errors.category && <InlineError key={`category-${focusRequest?.sequence ?? 0}`}
              message={errors.category} fontSize={fontSize} bold={preferences.boldTextEnabled} onLayout={measureError} />}
          </View>

          <View style={styles.form} testID="bug-form-section"
            onLayout={(event) => measureSection("form", event)}>
            <View style={styles.fieldSection} testID="bug-description-section" collapsable={false} ref={(node) => { sections.current.description = node; }} onLayout={(event) => measureSection("description", event)}>
              <View style={styles.labelRow}>
              <ReportText bold={preferences.boldTextEnabled} accessibilityRole="header" nativeID="bug-description-label" accessibilityLabel="Description, required" style={[labelStyle, styles.wrappingText]}>
                Description
              </ReportText>
              <ReportText bold={preferences.boldTextEnabled} style={indicatorStyle} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">Required</ReportText>
              </View>
              <ReportText bold={preferences.boldTextEnabled} style={formTextStyle}>{descriptionHelp}</ReportText>
              <TextInput style={[inputStyle, descriptionError && styles.invalidInput]}
                ref={descriptionRef}
                onLayout={(event) => measureTarget("description", event)}
                onFocus={() => beginEditing("description")}
                value={draft.description}
                onChangeText={(description) => setDraft((previous) => ({ ...previous, description }))}
                onBlur={() => { editingField.current = null; setDescriptionTouched(true); }}
                multiline textAlignVertical="top" maxLength={BUG_REPORT_TEXT_LIMIT}
                placeholder="Describe the problem..." placeholderTextColor="#70655F" allowFontScaling
                accessibilityLabel="Description, required"
                accessibilityLabelledBy="bug-description-label"
                accessibilityHint={`Describe what went wrong. Maximum 5,000 characters.${descriptionError ? ` ${descriptionError}` : ""}`}
                aria-invalid={Boolean(descriptionError)} />
              {descriptionError && <InlineError key={`description-${focusRequest?.sequence ?? 0}`}
                message={descriptionError} fontSize={fontSize} bold={preferences.boldTextEnabled} onLayout={measureError} />}
              <ReportText bold={preferences.boldTextEnabled} style={countStyle}>
                {draft.description.length.toLocaleString()} / 5,000 characters
              </ReportText>

            </View>

            <View style={styles.fieldSection} testID="bug-steps-section" collapsable={false} ref={(node) => { sections.current.stepsToReproduce = node; }} onLayout={(event) => measureSection("stepsToReproduce", event)}>
              <View style={styles.labelRow}>
              <ReportText bold={preferences.boldTextEnabled} accessibilityRole="header" nativeID="bug-steps-label" accessibilityLabel="Steps to Reproduce, optional" style={[labelStyle, styles.wrappingText]}>
                Steps to reproduce
              </ReportText>
              <ReportText bold={preferences.boldTextEnabled} style={indicatorStyle} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">Optional</ReportText>
              </View>
              <ReportText bold={preferences.boldTextEnabled} style={formTextStyle}>{stepsHelp}</ReportText>
              <TextInput style={[inputStyle, stepsError && styles.invalidInput]} value={draft.stepsToReproduce}
                ref={stepsRef}
                onLayout={(event) => measureTarget("stepsToReproduce", event)}
                onFocus={() => beginEditing("stepsToReproduce")}
                onBlur={() => { editingField.current = null; }}
                onChangeText={(stepsToReproduce) => setDraft((previous) => ({ ...previous, stepsToReproduce }))}
                multiline textAlignVertical="top" maxLength={BUG_REPORT_TEXT_LIMIT}
                placeholder="Add the steps..." placeholderTextColor="#70655F" allowFontScaling
                accessibilityLabel="Steps to Reproduce, optional"
                accessibilityLabelledBy="bug-steps-label"
                accessibilityHint={`List the actions that led to the problem. Maximum 5,000 characters.${stepsError ? ` ${stepsError}` : ""}`}
                aria-invalid={Boolean(stepsError)} />
              {stepsError && <InlineError key={`steps-${focusRequest?.sequence ?? 0}`}
                message={stepsError} fontSize={fontSize} bold={preferences.boldTextEnabled} onLayout={measureError} />}
              <ReportText bold={preferences.boldTextEnabled} style={countStyle}>
                {draft.stepsToReproduce.length.toLocaleString()} / 5,000 characters
              </ReportText>

            </View>
          </View>

          <View style={styles.actions}>
          <ReportText bold={preferences.boldTextEnabled} style={metaStyle}>
            Please do not include passwords, personal information, or precise location details.
            When reporting becomes available, reports will include only your chosen category,
            description, optional steps, platform, app version, and OS version when available.
            GPS coordinates, navigation history, and account information are not attached.
          </ReportText>

          <ReportText bold={preferences.boldTextEnabled} style={metaStyle}>Your draft is discarded when you leave.</ReportText>
          <TouchableOpacity activeOpacity={0.9} style={[styles.checkButton, contrast && styles.highContrastBorder]}
            onPress={checkReport} accessibilityRole="button" accessibilityLabel="Check report"
            accessibilityHint="Checks required fields without sending or saving your report">
            <MaterialCommunityIcons name="check" size={20} color="#FFFFFF" accessible={false}
              accessibilityElementsHidden importantForAccessibility="no-hide-descendants" allowFontScaling={false} />
            <ReportText bold={preferences.boldTextEnabled} accessible={false}
              style={[textStyle, styles.checkButtonText]}>Check report</ReportText>
          </TouchableOpacity>
          {checked && !Object.keys(errors).length && <ReportText bold={preferences.boldTextEnabled} style={textStyle}>
            Required fields are complete. Submission is not yet available. Nothing has been sent.
          </ReportText>}
          <TouchableOpacity style={[styles.submitButton, contrast && styles.highContrastBorder]}
            disabled accessibilityRole="button" accessibilityLabel="Submit Report, reporting is not yet available"
            accessibilityState={{ disabled: true }}>
            <ReportText bold={preferences.boldTextEnabled} style={[textStyle, styles.submitButtonText]}>
              Submit Report
            </ReportText>
          </TouchableOpacity>
          <ReportText bold={preferences.boldTextEnabled} style={[metaStyle, styles.centered]}>Sending reports is not yet available.</ReportText>
          </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, container: { flex: 1, backgroundColor: "#F7F6F2" },
  header: { paddingHorizontal: 20, paddingTop: 4 },
  backButton: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "stretch", maxWidth: "100%" },
  backText: { flex: 1, minWidth: 0, color: "#741B2B", fontWeight: "500" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  bugTile: { width: 44, height: 44, flexShrink: 0, borderRadius: 12, backgroundColor: "#F2E5E9", alignItems: "center", justifyContent: "center" },
  titleGroup: { gap: 12 }, title: { flex: 1, minWidth: 0, color: "#211E1C", fontWeight: "700", flexShrink: 1 },
  content: { width: "100%", maxWidth: 600, alignSelf: "center", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32, gap: 24 },
  section: { gap: 12 }, form: { gap: 24 }, fieldSection: { gap: 12, borderTopWidth: 1, borderTopColor: "#DED7D2", paddingTop: 28 },
  labelRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: 8 },
  label: { fontWeight: "700", color: "#211E1C" }, body: { color: "#45403B", flexShrink: 1 },
  indicator: { fontWeight: "500" },
  meta: { color: "#514B48" }, counter: { textAlign: "right" }, centered: { textAlign: "center" },
  wrappingText: { flexShrink: 0, maxWidth: "100%" }, boldText: { fontWeight: "900" },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 12, borderWidth: 1, borderColor: "#A87582", backgroundColor: "#F5ECEE", borderRadius: 12, padding: 16 },
  noticeCopy: { flex: 1, minWidth: 0, gap: 4 }, noticeTitle: { color: "#211E1C", fontWeight: "600" },
  highContrastText: { color: "#000000" }, highContrastBorder: { borderWidth: 2, borderColor: "#272423" },
  categoryGroup: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#70655F", borderRadius: 14, overflow: "hidden" },
  category: { flexDirection: "row", alignItems: "center", minHeight: 56, paddingHorizontal: 14, paddingVertical: 12, gap: 12, borderWidth: 2, borderColor: "transparent" },
  categorySeparator: { borderTopWidth: 1, borderTopColor: "#DEDAD5" },
  categoryIcon: { width: 24, height: 24, flexShrink: 0, alignItems: "center", justifyContent: "center" },
  categoryLabel: { flex: 1, minWidth: 0, fontSize: 17, fontWeight: "500" },
  selectedCategory: { backgroundColor: "#F5ECEE", borderColor: "#741B2B", borderTopWidth: 2 },
  selectedCategoryContrast: { backgroundColor: "#F5ECEE", borderColor: "#272423" },
  radio: { width: 24, height: 24, flexShrink: 0, borderRadius: 12, borderWidth: 2, borderColor: "#70655F", backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  contrastRadio: { borderColor: "#272423" }, radioSelected: { borderColor: "#741B2B" },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#741B2B" },
  input: { backgroundColor: "#FFFFFF", color: "#211E1C", borderWidth: 1, borderColor: "#70655F", borderRadius: 14, padding: 16 },
  invalidInput: { borderColor: "#B42332", borderWidth: 2 },
  errorRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  error: { flex: 1, minWidth: 0, color: "#B42332", fontWeight: "600" },
  actions: { borderTopWidth: 1, borderTopColor: "#D0CDC9", paddingTop: 20, gap: 12 },
  checkButton: { minHeight: 56, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: "#741B2B", backgroundColor: "#741B2B", flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  checkButtonText: { flexShrink: 1, color: "#FFFFFF", fontWeight: "700", textAlign: "center" },
  submitButton: { minHeight: 56, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: "#70655F", backgroundColor: "#E6E2DC", alignItems: "center", justifyContent: "center" },
  submitButtonText: { color: "#514B48", fontWeight: "700", textAlign: "center" },
});
