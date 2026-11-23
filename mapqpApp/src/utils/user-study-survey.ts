import * as Linking from "expo-linking";
import { Alert } from "react-native";

export const USER_STUDY_SURVEY_URL = "https://forms.gle/e8HDoRkfronCx8uX7";
let opening = false;

/** Shared by both Settings layouts and the post-navigation invitation. */
export async function openUserStudySurvey(): Promise<void> {
  if (opening) return;
  opening = true;
  try {
    await Linking.openURL(USER_STUDY_SURVEY_URL);
  } catch {
    Alert.alert("Could not open survey", "Please try again using Share Your Feedback in Settings.");
  } finally {
    opening = false;
  }
}
