import { LogBox } from 'react-native';

// Imported FIRST in App.tsx so it runs before any module that touches expo-av
// (sounds preload at import time). expo-av still works on SDK 54; without this
// the deprecation banner covers the bottom of every screen in dev builds.
LogBox.ignoreLogs(['Expo AV has been deprecated']);
