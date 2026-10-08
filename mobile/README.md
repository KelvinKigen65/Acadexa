# Acadexa Mobile

An Expo / React Native version of Acadexa's source-grounded study assistant. It uses NativeWind (Tailwind utilities) for UI styling and the existing Django API for accounts, courses, PDF upload, and cited answers.

## Run it

```bash
cd mobile
npm install
cp .env.example .env
# Update EXPO_PUBLIC_API_BASE_URL for a physical device.
npm start
```

For an Android emulator, the app defaults to `http://10.0.2.2:8000/api`; iOS simulator and web default to `http://localhost:8000/api`. A physical device must use your computer's LAN IP in `.env`.

## What is included

- source-backed chat with the existing preview mode when signed out
- secure JWT session storage and account restoration
- course and PDF library, including the system PDF picker
- cited-answer evidence sheet and optional focus topic
- dedicated mobile navigation and motion-aware sheets/entrances

## Verify

```bash
npm run verify
```
