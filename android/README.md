# CampusKit Android APK

This is a lightweight Android WebView wrapper for the CampusKit website.

## Build
Run the **Build CampusKit Android APK** workflow from GitHub Actions, or push a change under `android/`. The workflow builds a debug-signed APK and publishes it as a GitHub Release asset.

## Install
Download `app-debug.apk` from the latest CampusKit Android APK release and install it on an Android device. You may need to allow installation from the browser or file manager used to open the APK.

The app loads the live website at https://campuskit-six.vercel.app/. An internet connection is required. Website data stored in WebView is kept locally on the device.
