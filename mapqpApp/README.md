# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.


### Smaller Android builds

- `npm run build:android:phone`: optimized release APK for ARM64 phones.
- `npm run build:android:emulator`: optimized release APK for x86_64 emulators.
- `npm run build:android:bundle`: release AAB for Google Play, retaining all configured architectures.
- EAS equivalents: `eas build -p android --profile preview`, `--profile preview-emulator`, or `--profile production`.

Phone and emulator release APKs run independently of Metro. Keep the development profile for debugging.
The ARM64 APK does not support 32-bit phones or x86 emulators. The production AAB lets Play deliver device-specific libraries.
Release builds enable R8, resource shrinking, and JavaScript bundle compression. These settings live in app.json for prebuild and in the existing Android Gradle properties for local builds.
Original tutorial PNGs are retained as source artwork; tutorial code references resized WebP files only.
After installing dependencies, rebuild the native app to remove unused native modules. Test sign-in, speech, location, maps, and tutorials on the release build.
Local and EAS production builds use the private upload signing credentials described below.

The local Android wrapper was updated to Gradle 9.4.1 for the installed Expo 58 Android plugin. Fresh native projects should be generated with the matching Expo version.

The Windows Ninja object-path failure is addressed by `plugins/with-short-cmake-paths.js`, which sets CMAKE_OBJECT_PATH_MAX=250 for Android library modules. The formerly failing ARM64 Worklets native task now passes. The complete APK size has not yet been measured.
The existing local Android project also needed `android.builtInKotlin=false` and `android.newDsl=false` for its legacy Kotlin plugin setup with AGP 9. These local native files are gitignored; fresh EAS native projects use the Expo template.

The CMake path plugin also covers the app module and registers before Expo finalizes Android modules. App CMake intermediates use the shorter workspace-root `.cxx` directory (gitignored). Both the Worklets and app ARM64 native build tasks have been verified successfully.

The staging directory is resolved to its canonical absolute path to avoid extra `..` segments. The app native task has also been verified successfully for armeabi-v7a, which is included in the production bundle.


### Android upload signing

Local release builds read `credentials.json` and use the upload key in `.credentials/upload.jks`. Both are ignored by Git. Back up these files securely and keep the same key for future Play Store uploads.
`npm run signing:android:init` creates a key only for a new app; it refuses to overwrite an existing key. EAS production builds use these same local credentials.
Rebuild with `npm run build:android:bundle` and upload `android/app/build/outputs/bundle/release/app-release.aab`. Previously generated debug-signed files must not be uploaded.
