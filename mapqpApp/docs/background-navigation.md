# Background directions

Selecting a route checks notification and background location permissions. Missing permissions are requested once; declining or choosing Not now is remembered across routes and app launches. Permissions granted later in system Settings are detected automatically. With both granted, mapQP follows the saved route while the screen is locked or another app is open. Android's persistent foreground-service notification shows the next direction and remaining distance while backgrounded. Opening the app removes it; leaving the app restores it. iOS direction notifications appear in the background on a new maneuver and when within 30 and 10 meters. Cancelling a route stops tracking and clears its notification. Arrival stops tracking; abandoned sessions expire after at least two hours.

Android uses the local `modules/navigation-notification` Expo module to update the existing location-service notification in place without restarting tracking from the background. It preserves the notification ID, channel, icon and tap action, expands long instructions, and quietly updates the distance. After adding or changing this module, rebuild and reinstall the app (a Metro reload is insufficient). If the native updater is unavailable, a separate persistent direction card provides fallback guidance.

The notification uses the next direction as its heading, an arrival-time estimate, a large maneuver arrow, route progress, and an Exit navigation action. Android 16+ uses the system ProgressStyle and requests Live Update promotion; older Android versions use the system progress bar and expandable text. Android controls the final card shape, colors and button placement. No Google branding is used. ETA uses remaining route distance and the route's planned walking duration, rather than traffic data. Off-route guidance replaces the ETA with a prompt to reopen mapQP.

Navigation card refreshes are silent: ordinary GPS fixes update the existing notification without reposting Expo's default service card. The native card suppresses sound/vibration alerts even on a previously configured channel. Local fallback and arrival notifications disable sound, and Android fallback uses a new silent channel so older channel sound/vibration settings are not reused. Spoken navigation is configured separately.

Exit navigation runs an unexported native broadcast receiver which unregisters only mapQP's navigation location task, stopping tracking even if JavaScript is suspended. It records an exit request, clears the native service binding, and informs the navigation screen. Queued location fixes cannot revive the exited session; if the screen was suspended, it clears the selected route when the app resumes.

The native controller binds to Expo's existing location service without creating a new one. While the activity is foregrounded it removes the service's foreground status and notification; before the activity leaves it promotes the same service again. This preserves Android's required foreground-service notification during background tracking. Local direction/arrival cards and sounds are also suppressed while the app is active, and returning to the app clears any existing direction card. An older binary without this native controller may still show Expo's service notification until rebuilt.

Background guidance automatically recalculates after two distinct off-route GPS fixes with accuracy within 20 meters. It restores the saved campus graph in headless execution, routes from the latest position to the selected entrance, and preserves all accepted routing restrictions and direction/distance preferences. The direction card silently switches to the replacement route and updates its ETA and progress. The app adopts the replacement route when reopened.

If no permitted route can be found, the card says it will retry automatically, keeps the original route data, and retries after a 15-second backoff. It never silently relaxes accessibility or indoor/crosswalk restrictions. Poor or stale GPS fixes do not trigger rerouting or generate new directions. Web navigation remains foreground-only.

The navigation card allows public lock-screen content. Screen off/on and unlock events refresh its visibility, including when the activity remains resumed behind the keyguard. Unlocking into mapQP hides the card; unlocking into another app leaves it visible. The phone's own lock-screen notification/privacy settings still take precedence. If notifications are disabled on the lock screen, enable them for mapQP in Android Settings. The app does not turn on the display or keep it awake.

Power-button locks use an Expo activity lifecycle listener that promotes the bound service before React Native's pause event. The controller saves the service notification's identity before hiding it, so restoration does not depend on Android's asynchronous active-notification lookup. A bounded native refresh reapplies the navigation layout once the default service card has posted, without waiting for another GPS fix. This requires a new native APK; updating JavaScript alone cannot apply it.

This requires a rebuilt development or release app, not Expo Go. Run `npx expo prebuild` before building so the location and notification config plugins update native permissions. The existing local Android manifest has also been updated, but generated native folders are ignored by Git.

A powered-off phone cannot navigate. Force-stopping the app stops background tracking; swiping it away also stops it on iOS and may stop it on some Android devices. Route state is saved for the background task, but the navigation screen does not restore a route after a cold launch.

## Device validation

1. Build and install on physical Android and iOS devices. Select a route and grant notifications and background location (Allow all the time on Android).
2. Lock the screen and walk a route with turns. Check upcoming, near-turn, and immediate guidance; check arrival stops the location indicator/service.
3. Repeat with another app open, notification permission denied, and background location denied. Foreground navigation should remain usable.
4. Cancel a route and confirm the service and direction notification disappear. Change destinations and confirm notifications describe the new route.
5. Leave the route with the screen locked and verify the card briefly shows recalculation, then new directions without reopening the app. Reopen and confirm the map adopts the replacement route. Repeat with stair/indoor/crosswalk restrictions enabled, and check automatic retry when no permitted route exists.
6. Check screen-reader notification behavior, battery restrictions, and swipe-away behavior on supported phones.
7. With a route active, repeatedly open the app, go Home, and lock/unlock. Check the service notification is absent in the app and returns outside it without losing GPS updates.
8. Route several times with granted permissions, and after declining each permission. Confirm prompts do not repeat, including after restarting the app. Enable permissions in system Settings and confirm subsequent navigation works.

Automated guidance, rerouting and notification checks: `node --test scripts/test-background-guidance.cjs scripts/test-background-navigation.cjs scripts/test-background-rerouting.cjs`.
