import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ComponentRef, type Ref } from "react";
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
} from "../utils/bug-reports";

// Keep this component stable so editing and preference changes retain input focus.
function ReportText({ bold, style, ref, ...props }: TextProps & { bold: boolean; ref?: Ref<ComponentRef<typeof Text>> }) {
  return <Text {...props} ref={ref} style={[style, bold && styles.boldText]} />;
}

export default function ReportBugPage() {
  useAuthGuard();
  const { fontSize } = useSettings();
  const preferences = useAccessibilityPreferences();
  const contrast = preferences.darkerSystemColorsEnabled || preferences.highTextContrastEnabled;
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  type Field = keyof BugReportDraft;
  type FocusTarget = ComponentRef<typeof Text> | ComponentRef<typeof TextInput>;
  const targets = useRef<Partial<Record<Field, FocusTarget | null>>>({});
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
    if (!field || !targetReady.current[field] || !targets.current[field] || !revealSection(field)) return;
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    focusFrame.current = requestAnimationFrame(() => {
      focusFrame.current = null;
      if (!pageFocused.current || pendingFocus.current !== field || !targetReady.current[field]) return;
      pendingFocus.current = null;
      setFocusRequest(null);
      const target = targets.current[field];
      if (preferences.screenReaderEnabled && target) AccessibilityInfo.sendAccessibilityEvent(target, "focus");
    });
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
  const descriptionHelp = "What went wrong? Example: The destination search did not show results.";
  const stepsHelp = "List what you did before the problem. Example: Opened the map, searched for a building, then selected it.";
  const textStyle = [
    styles.body,
    { fontSize: 16 * fontSize },
    contrast && styles.highContrastText,
  ];
  const labelStyle = [textStyle, styles.label];
  const inputStyle = [
    styles.input,
    { fontSize: 16 * fontSize, minHeight: 130 * fontSize },
    preferences.boldTextEnabled && styles.boldText,
    contrast && styles.highContrastBorder,
  ];
  const errorStyle = [styles.error, { fontSize: 15 * fontSize }];
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
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back to Settings"
            accessibilityHint="Returns to the previous screen. This draft is not saved after leaving."
          >
            <Text style={styles.backArrow} allowFontScaling={false} accessible={false}>‹</Text>
          </TouchableOpacity>
          <ReportText bold={preferences.boldTextEnabled} accessibilityRole="header"
            style={[styles.title, { fontSize: 21 * fontSize }]}>
            Report a Bug
          </ReportText>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView ref={scroll} style={styles.flex} contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}>
          <View style={[styles.notice, contrast && styles.highContrastBorder]}>
            <ReportText bold={preferences.boldTextEnabled} accessibilityRole="header" style={labelStyle}>
              Reporting is not yet available
            </ReportText>
            <ReportText bold={preferences.boldTextEnabled} style={textStyle}>
              You can fill in and check this form, but reports cannot be sent yet. Nothing is uploaded.
              Your draft stays here while you edit, and is discarded when you leave this page.
            </ReportText>
          </View>

          <View style={[styles.card, contrast && styles.highContrastBorder]}
            onLayout={(event) => measureSection("category", event)}>
            <ReportText ref={categoryRef} onLayout={(event) => measureTarget("category", event)}
              bold={preferences.boldTextEnabled} accessible accessibilityRole="header"
              accessibilityHint={checked && errors.category ? errors.category : undefined} style={labelStyle}>
              Category (required)
            </ReportText>
            <ReportText bold={preferences.boldTextEnabled} style={textStyle}>Choose one category.</ReportText>
            <View accessible={false} accessibilityRole="radiogroup" accessibilityLabel="Problem category, required">
              {BUG_REPORT_CATEGORIES.map(({ value, label }) => (
                <TouchableOpacity key={value}
                  style={[styles.category, contrast && styles.highContrastBorder,
                    draft.category === value && styles.selectedCategory]}
                  onPress={() => { cancelFocus(); setFocusRequest(null); setDraft((previous) => ({ ...previous, category: value })); }}
                  accessible accessibilityRole="radio" accessibilityLabel={label}
                  accessibilityHint={`Selects this problem category.${checked && errors.category ? ` ${errors.category}` : ""}`}
                  aria-invalid={Boolean(checked && errors.category)}
                  accessibilityState={{ checked: draft.category === value }}>
                  <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
                    style={[styles.radio, draft.category === value && styles.radioSelected]}>
                    {draft.category === value && <View style={styles.radioDot} />}
                  </View>
                  <ReportText bold={preferences.boldTextEnabled} accessible={false}
                    accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
                    style={[formTextStyle, styles.categoryLabel]}>
                    {label}
                  </ReportText>
                </TouchableOpacity>
              ))}
            </View>
            {checked && errors.category && <ReportText bold={preferences.boldTextEnabled} style={errorStyle}>
              {errors.category}
            </ReportText>}
          </View>

          <View style={[styles.card, contrast && styles.highContrastBorder]}
            onLayout={(event) => measureSection("form", event)}>
            <View style={styles.fieldSection} onLayout={(event) => measureSection("description", event)}>
              <ReportText bold={preferences.boldTextEnabled} accessibilityRole="header" nativeID="bug-description-label" style={[labelStyle, styles.wrappingText]}>
                Description (required)
              </ReportText>
              <ReportText bold={preferences.boldTextEnabled} style={formTextStyle}>{descriptionHelp}</ReportText>
              <TextInput style={[inputStyle, descriptionError && styles.invalidInput]}
                ref={descriptionRef}
                onLayout={(event) => measureTarget("description", event)}
                onFocus={() => { editingField.current = "description"; cancelFocus(); revealSection("description"); }}
                value={draft.description}
                onChangeText={(description) => setDraft((previous) => ({ ...previous, description }))}
                onBlur={() => { editingField.current = null; setDescriptionTouched(true); }}
                multiline textAlignVertical="top" maxLength={BUG_REPORT_TEXT_LIMIT}
                allowFontScaling
                accessibilityLabel="Description, required"
                accessibilityLabelledBy="bug-description-label"
                accessibilityHint={`Describe what went wrong. Maximum 5,000 characters.${descriptionError ? ` ${descriptionError}` : ""}`}
                aria-invalid={Boolean(descriptionError)} />
              <ReportText bold={preferences.boldTextEnabled} style={textStyle}>
                {draft.description.length.toLocaleString()} / 5,000 characters
              </ReportText>
              {descriptionError && <ReportText bold={preferences.boldTextEnabled} style={errorStyle}>
                {descriptionError}
              </ReportText>}
            </View>

            <View style={styles.fieldSection} onLayout={(event) => measureSection("stepsToReproduce", event)}>
              <ReportText bold={preferences.boldTextEnabled} accessibilityRole="header" nativeID="bug-steps-label" style={[labelStyle, styles.stepsLabel, styles.wrappingText]}>
                Steps to Reproduce (optional)
              </ReportText>
              <ReportText bold={preferences.boldTextEnabled} style={formTextStyle}>{stepsHelp}</ReportText>
              <TextInput style={[inputStyle, stepsError && styles.invalidInput]} value={draft.stepsToReproduce}
                ref={stepsRef}
                onLayout={(event) => measureTarget("stepsToReproduce", event)}
                onFocus={() => { editingField.current = "stepsToReproduce"; cancelFocus(); revealSection("stepsToReproduce"); }}
                onBlur={() => { editingField.current = null; }}
                onChangeText={(stepsToReproduce) => setDraft((previous) => ({ ...previous, stepsToReproduce }))}
                multiline textAlignVertical="top" maxLength={BUG_REPORT_TEXT_LIMIT}
                allowFontScaling
                accessibilityLabel="Steps to Reproduce, optional"
                accessibilityLabelledBy="bug-steps-label"
                accessibilityHint={`List the actions that led to the problem. Maximum 5,000 characters.${stepsError ? ` ${stepsError}` : ""}`}
                aria-invalid={Boolean(stepsError)} />
              <ReportText bold={preferences.boldTextEnabled} style={textStyle}>
                {draft.stepsToReproduce.length.toLocaleString()} / 5,000 characters
              </ReportText>
              {checked && errors.stepsToReproduce && <ReportText bold={preferences.boldTextEnabled} style={errorStyle}>
                {errors.stepsToReproduce}
              </ReportText>}
            </View>
          </View>

          <ReportText bold={preferences.boldTextEnabled} style={textStyle}>
            Please do not include passwords, personal information, or precise location details.
            When reporting becomes available, reports will include only your chosen category,
            description, optional steps, platform, app version, and OS version when available.
            GPS coordinates, navigation history, and account information are not attached.
          </ReportText>

          <TouchableOpacity style={[styles.checkButton, contrast && styles.highContrastBorder]}
            onPress={checkReport} accessibilityRole="button" accessibilityLabel="Check report"
            accessibilityHint="Checks required fields without sending or saving your report">
            <ReportText bold={preferences.boldTextEnabled} style={[textStyle, styles.checkButtonText]}>Check report</ReportText>
          </TouchableOpacity>
          {checked && !Object.keys(errors).length && <ReportText bold={preferences.boldTextEnabled} style={textStyle}>
            Required fields are complete. Submission is not yet available. Nothing has been sent.
          </ReportText>}
          <TouchableOpacity style={[styles.submitButton, contrast && styles.highContrastBorder]}
            disabled accessibilityRole="button" accessibilityLabel="Submit Report, reporting is not yet available"
            accessibilityState={{ disabled: true }}>
            <ReportText bold={preferences.boldTextEnabled} style={[textStyle, styles.submitButtonText]}>
              Submit Report (unavailable)
            </ReportText>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fieldSection: { gap: 10 },
  wrappingText: { flexShrink: 0 },
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: "#F3F5F8" },
  header: { minHeight: 68, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: "#AC2B37", flexDirection: "row", alignItems: "center" },
  backButton: { width: 48, height: 48, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  backArrow: { color: "#FFFFFF", fontSize: 38 },
  headerSpacer: { width: 48 },
  title: { flex: 1, flexShrink: 1, color: "#FFFFFF", fontWeight: "800", textAlign: "center" },
  content: { paddingHorizontal: 18, paddingTop: 24, paddingBottom: 40, gap: 20 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 18, gap: 10 },
  notice: { backgroundColor: "#F9E5E7", borderLeftWidth: 5, borderColor: "#AC2B37", borderRadius: 12, padding: 16, gap: 10 },
  body: { color: "#374151", flexShrink: 1 },
  label: { fontWeight: "700", color: "#111827" },
  boldText: { fontWeight: "900" },
  highContrastText: { color: "#111827" },
  highContrastBorder: { borderWidth: 2, borderColor: "#111827" },
  category: { flexDirection: "row", alignItems: "center", minHeight: 48, padding: 12, marginTop: 10, borderWidth: 1, borderColor: "#6B7280", borderRadius: 10, gap: 12 },
  categoryLabel: { flex: 1 },
  selectedCategory: { backgroundColor: "#F9E5E7", borderColor: "#761723", borderWidth: 2 },
  radio: { width: 24, height: 24, flexShrink: 0, borderRadius: 12, borderWidth: 2, borderColor: "#374151", alignItems: "center", justifyContent: "center" },
  radioSelected: { borderColor: "#761723" },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#761723" },
  input: { backgroundColor: "#FFFFFF", color: "#111827", borderWidth: 1.5, borderColor: "#6B7280", borderRadius: 10, padding: 12 },
  invalidInput: { borderColor: "#B42318", borderWidth: 2 },
  error: { color: "#B42318", fontWeight: "700" },
  stepsLabel: { marginTop: 14 },
  checkButton: { minHeight: 48, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: "#761723", backgroundColor: "#F9E5E7", alignItems: "center", justifyContent: "center" },
  checkButtonText: { color: "#761723", fontWeight: "700", textAlign: "center" },
  submitButton: { minHeight: 48, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#6B7280", backgroundColor: "#E5E7EB", alignItems: "center", justifyContent: "center" },
  submitButtonText: { color: "#374151", fontWeight: "700", textAlign: "center" },
});
