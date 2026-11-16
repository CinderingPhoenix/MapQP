# Background directions

Selecting a route checks notification and background location permissions. Missing permissions are requested once; declining or choosing Not now is remembered across routes and app launches. Permissions granted later in system Settings are detected automatically. With both granted, mapQP follows the saved route while the screen is locked or another app is open. Android's persistent foreground-service notification shows the next direction and remaining distance while backgrounded. Opening the app removes it; leaving the app restores it. iOS direction notifications appear in the background on a new maneuver and when within 30 and 10 meters. Cancelling a route stops tracking and clears its notification. Arrival stops tracking; abandoned sessions expire after at least two hours.

Android uses the local `modules/navigation-notification` Expo module to update the existing location-service notification in place without restarting tracking from the background. It preserves the notification ID, channel, icon and tap action, expands long instructions, and quietly updates the distance. After adding or changing this module, rebuild and reinstall the app (a Metro reload is insufficient). If the native updater is unavailable, a separate persistent direction card provides fallback guidance.

The notification uses the next direction as its heading, an arrival-time estimate, a large maneuver arrow, route progress, and an Exit navigation action. Android 16+ uses the system ProgressStyle and requests Live Update promotion; older Android versions use the system progress bar and expandable text. Android controls the final card shape, colors and button placement. No Google branding is used. ETA uses remaining route distance and the route's planned walking duration, rather than traffic data. Off-route guidance replaces the ETA with a prompt to reopen mapQP.

Exit navigation runs an unexported native broadcast receiver which unregisters only mapQP's navigation location task, stopping tracking even if JavaScript is suspended. It records an exit request, clears the native service binding, and informs the navigation screen. Queued location fixes cannot revive the exited session; if the screen was suspended, it clears the selected route when the app resumes.

The native controller binds to Expo's existing location service without creating a new one. While the activity is foregrounded it removes the service's foreground status and notification; before the activity leaves it promotes the same service again. This preserves Android's required foreground-service notification during background tracking. Local direction/arrival cards and sounds are also suppressed while the app is active, and returning to the app clears any existing direction card. An older binary without this native controller may still show Expo's service notification until rebuilt.

Background guidance follows the selected route. If the user leaves it, a notification asks them to open mapQP to recalculate. Poor or stale GPS fixes do not generate directions. Web navigation remains foreground-only.

This requires a rebuilt development or release app, not Expo Go. Run `npx expo prebuild` before building so the location and notification config plugins update native permissions. The existing local Android manifest has also been updated, but generated native folders are ignored by Git.

A powered-off phone cannot navigate. Force-stopping the app stops background tracking; swiping it away also stops it on iOS and may stop it on some Android devices. Route state is saved for the background task, but the navigation screen does not restore a route after a cold launch.

## Device validation

1. Build and install on physical Android and iOS devices. Select a route and grant notifications and background location (Allow all the time on Android).
2. Lock the screen and walk a route with turns. Check upcoming, near-turn, and immediate guidance; check arrival stops the location indicator/service.
3. Repeat with another app open, notification permission denied, and background location denied. Foreground navigation should remain usable.
4. Cancel a route and confirm the service and direction notification disappear. Change destinations and confirm notifications describe the new route.
5. Leave the route and verify the notification asks to reopen mapQP. Reopen and confirm foreground navigation recalculates.
6. Check screen-reader notification behavior, battery restrictions, and swipe-away behavior on supported phones.
7. With a route active, repeatedly open the app, go Home, and lock/unlock. Check the service notification is absent in the app and returns outside it without losing GPS updates.
8. Route several times with granted permissions, and after declining each permission. Confirm prompts do not repeat, including after restarting the app. Enable permissions in system Settings and confirm subsequent navigation works.

Automated guidance and notification checks: `node --test scripts/test-background-guidance.cjs scripts/test-background-navigation.cjs`.
