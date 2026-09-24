# MapQP




# Commands

Expo Go allows scanning the QR code to test the app for testing
Voice and speech to text does not work on Expo Go


```
npx expo start
```
Starts the app on the computer's network

```
npx expo start --tunnel
```
Using ngrok to tunnel the app to access outside the network (Necessary to use to test on WPI network)

When running on a computer, press a to launch a connected Android Emulator and connect the app to the emulator
press s to switch between Expo Go and development build


```
npm install -g eas-cli
```
Installs eas cli to connect to eas services and compile the apk

```
eas login
```
login to expo account to compile to your account

```
eas build --profile development --platform android
```
Compiles to an apk to run on your android device which allows scanning the QR code of a development build to run on your device (Cannot do on WPI network, need to use emulator or disconnect from WPI wifi while scanning the qr code in the app)