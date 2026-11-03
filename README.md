# MapQP

.env file variables

SERVER_IP=...

PORT=...

AUTHORITY=...

CLIENT_ID=...


# Commands

Expo Go allows scanning the QR code to test the app for testing
Voice and speech to text does not work on Expo Go

Must use Java 17
NDK Version 27.1.12297006 (Should automatically install version)
SDK Version 36 (Should automatically install version)

```
npx expo prebuild -p android
```
Creates the android folder in the directory

```
npx expo run:android
```
Starts the app using a connected android emulator

```
cd android
./gradlew clean
```
Optional step to clean out the android folder for compiling new versions

```
cd android
./gradlew assembleRelease
```
Compiles the code into an apk

```
npm run build:android:phone
```
optimized release APK for ARM64 phones.

```
npm run build:android:emulator
```
optimized release APK for x86_64 emulators.

```
npm run build:android:bundle
```
release AAB for Google Play, retaining all configured architectures.