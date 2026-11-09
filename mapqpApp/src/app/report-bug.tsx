import { router } from "expo-router";
import { useRef, useState, type ComponentRef } from "react";
import {
  AccessibilityInfo,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSettings } from "../context/settings-context";
import { useAccessibilityPreferences } from "../hooks/use-accessibility-preferences";
import { useAuthGuard } from "../hooks/use-auth-guard";
import {
  BUG_REPORT_CATEGORIES,
  BUG_REPORT_TEXT_LIMIT,
  validateBugReport,
  collectBugReportMetadata,
  prepareBugReport,
  submitBugReport,
  type BugReportDraft,
} from "../utils/bug-reports";

// Keep this component stable so editing and preference changes retain input focus.
function ReportText({ bold, style, ...props }: TextProps & { bold: boolean }) {
  return <Text {...props} style={[style, bold && styles.boldText]} />;
}

export default function ReportBugPage() {
  useAuthGuard();
  const { fontSize, navigationMode } = useSettings();
  const preferences = useAccessibilityPreferences();
  const contrast = preferences.darkerSystemColorsEnabled || preferences.highTextContrastEnabled;
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [draft, setDraft] = useState<BugReportDraft>({
    category: null, description: "", stepsToReproduce: "",
  });
  const [checked, setChecked] = useState(false);
  const submitting = useRef(false);
  const [sending, setSending] = useState(false);
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const errors = validateBugReport(draft);
  const submitDisabled = sending || Object.keys(errors).length > 0;
  const descriptionError = checked || descriptionTouched ? errors.description : undefined;
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

  const checkReport = () => {
    setChecked(true);
    const messages = Object.values(errors);
    AccessibilityInfo.announceForAccessibility(messages.length
      ? messages.join(" ")
      : "Required fields are complete. Your report is ready to submit.");
    if (errors.category) {
      scroll.current?.scrollTo({ y: 0, animated: !preferences.reduceMotionEnabled });
    }
  };

  const sendReport = async () => {
    if (submitting.current) return;
    checkReport();
    const report = prepareBugReport(draft, collectBugReportMetadata());
    if (!report.valid) return;
    submitting.current = true;
    setSending(true);
    try {
      await submitBugReport(report.payload);
      setDraft({ category: null, description: "", stepsToReproduce: "" });
      setChecked(false);
      setDescriptionTouched(false);
      Alert.alert(
        "Report sent",
        "Your bug report was sent. Thank you.",
        [{ text: "OK", onPress: () => router.replace(
          navigationMode === "accessibility" ? "/accessibility-navigation" : "/standard-navigation"
        ) }],
        { cancelable: false },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send your report. Please try again.";
      Alert.alert("Report not sent", message);
    } finally {
      submitting.current = false;
      setSending(false);
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
              Report a problem
            </ReportText>
            <ReportText bold={preferences.boldTextEnabled} style={textStyle}>
              Submit this form to send a bug report to the mapQP team.
              Your draft is discarded when you leave this page.
            </ReportText>
          </View>

          <View style={[styles.card, contrast && styles.highContrastBorder]}>
            <ReportText bold={preferences.boldTextEnabled} accessibilityRole="header" style={labelStyle}>
              Category (required)
            </ReportText>
            <ReportText bold={preferences.boldTextEnabled} style={textStyle}>Choose one category.</ReportText>
            <View accessibilityRole="radiogroup" accessibilityLabel="Problem category, required">
              {BUG_REPORT_CATEGORIES.map(({ value, label }) => (
                <TouchableOpacity key={value}
                  disabled={sending}
                  style={[styles.category, contrast && styles.highContrastBorder,
                    draft.category === value && styles.selectedCategory]}
                  onPress={() => setDraft((previous) => ({ ...previous, category: value }))}
                  accessibilityRole="radio" accessibilityLabel={label}
                  accessibilityHint="Selects this problem category"
                  accessibilityState={{ checked: draft.category === value }}>
                  <View accessible={false} style={[styles.radio, draft.category === value && styles.radioSelected]}>
                    {draft.category === value && <View style={styles.radioDot} />}
                  </View>
                  <ReportText bold={preferences.boldTextEnabled} style={[textStyle, styles.categoryLabel]}>
                    {label}
                  </ReportText>
                </TouchableOpacity>
              ))}
            </View>
            {checked && errors.category && <ReportText bold={preferences.boldTextEnabled} style={errorStyle}>
              {errors.category}
            </ReportText>}
          </View>

          <View style={[styles.card, contrast && styles.highContrastBorder]}>
            <ReportText bold={preferences.boldTextEnabled} nativeID="bug-description-label" style={labelStyle}>
              Description (required)
            </ReportText>
            <TextInput style={[inputStyle, descriptionError && styles.invalidInput]}
              editable={!sending}
              value={draft.description}
              onChangeText={(description) => setDraft((previous) => ({ ...previous, description }))}
              onBlur={() => setDescriptionTouched(true)}
              multiline textAlignVertical="top" maxLength={BUG_REPORT_TEXT_LIMIT}
              allowFontScaling
              accessibilityLabel="Description, required"
              accessibilityLabelledBy="bug-description-label"
              accessibilityHint={`Describe the problem. Maximum 5,000 characters.${descriptionError ? ` ${descriptionError}` : ""}`}
              aria-invalid={Boolean(descriptionError)} />
            <ReportText bold={preferences.boldTextEnabled} style={textStyle}>
              {draft.description.length.toLocaleString()} / 5,000 characters
            </ReportText>
            {descriptionError && <ReportText bold={preferences.boldTextEnabled} style={errorStyle}>
              {descriptionError}
            </ReportText>}

            <ReportText bold={preferences.boldTextEnabled} nativeID="bug-steps-label" style={[labelStyle, styles.stepsLabel]}>
              Steps to Reproduce (optional)
            </ReportText>
            <TextInput style={inputStyle} value={draft.stepsToReproduce}
              editable={!sending}
              onChangeText={(stepsToReproduce) => setDraft((previous) => ({ ...previous, stepsToReproduce }))}
              multiline textAlignVertical="top" maxLength={BUG_REPORT_TEXT_LIMIT}
              allowFontScaling
              accessibilityLabel="Steps to Reproduce, optional"
              accessibilityLabelledBy="bug-steps-label"
              accessibilityHint="Describe what you did before the problem occurred. Maximum 5,000 characters." />
            <ReportText bold={preferences.boldTextEnabled} style={textStyle}>
              {draft.stepsToReproduce.length.toLocaleString()} / 5,000 characters
            </ReportText>
            {checked && errors.stepsToReproduce && <ReportText bold={preferences.boldTextEnabled} style={errorStyle}>
              {errors.stepsToReproduce}
            </ReportText>}
          </View>

          <ReportText bold={preferences.boldTextEnabled} style={textStyle}>
            Please do not include passwords, personal information, or precise location details.
            Reports include your chosen category, description, optional steps, platform, and app version.
            Reports are submitted using your signed-in session.
          </ReportText>

          <TouchableOpacity style={[styles.submitButton, submitDisabled && styles.submitButtonDisabled,
            contrast && styles.highContrastBorder]}
            onPress={sendReport} disabled={submitDisabled} accessibilityRole="button" accessibilityLabel="Submit Report"
            accessibilityHint={submitDisabled && !sending
              ? "Choose a category and enter a description to submit your report."
              : "Sends your bug report to the mapQP team."}
            accessibilityState={{ disabled: submitDisabled, busy: sending }}>
            <ReportText bold={preferences.boldTextEnabled} style={[textStyle, styles.submitButtonText,
              submitDisabled && styles.submitButtonTextDisabled]}>
              {sending ? "Sending report…" : "Submit Report"}
            </ReportText>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: "#374151", alignItems: "center", justifyContent: "center" },
  radioSelected: { borderColor: "#761723" },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#761723" },
  input: { backgroundColor: "#FFFFFF", color: "#111827", borderWidth: 1.5, borderColor: "#6B7280", borderRadius: 10, padding: 12 },
  invalidInput: { borderColor: "#B42318", borderWidth: 2 },
  error: { color: "#B42318", fontWeight: "700" },
  stepsLabel: { marginTop: 14 },
  submitButton: { minHeight: 48, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#761723", backgroundColor: "#AC2B37", alignItems: "center", justifyContent: "center" },
  submitButtonDisabled: { borderColor: "#6B7280", backgroundColor: "#E5E7EB" },
  submitButtonText: { color: "#FFFFFF", fontWeight: "700", textAlign: "center" },
  submitButtonTextDisabled: { color: "#374151" },
});
