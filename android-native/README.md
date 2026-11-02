# CampusKit Native Android

This is the native Android migration track. It is intentionally separate from the existing website and legacy WebView wrapper so the current CampusKit experience remains untouched.

## Current native foundation
- Native Jetpack Compose application shell
- Dashboard summary
- Assignment create / complete / delete with local persistence
- Timetable create / delete with local persistence
- Notes create / delete with local persistence
- Focus timer
- Native laboratory catalogue and migration placeholders

## Build
Open this folder as an Android project in Android Studio, or run:
`gradle assembleDebug`

APK output:
`app/build/outputs/apk/debug/app-debug.apk`

## Migration status
This is the first native milestone, not a feature-complete replacement yet. The original website and its experiment implementations remain unchanged. Google sign-in, AI assistant, music, full experiment simulations, records, search, attachments, and remaining dashboard capabilities still need native migration and testing.
