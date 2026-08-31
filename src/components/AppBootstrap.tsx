import { Fraunces_400Regular } from '@expo-google-fonts/fraunces/400Regular';
import { Fraunces_500Medium } from '@expo-google-fonts/fraunces/500Medium';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { useFonts } from 'expo-font';
import { NavigationBar } from 'expo-navigation-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useReducedMotion } from '../hooks/motion';
import LaunchSplash from './LaunchSplash';

const FONT_STARTUP_FALLBACK_MS = 1600;

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function AppBootstrap({ children }: { children: ReactNode }) {
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_400Regular,
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
  });
  const reduceMotion = useReducedMotion();
  const [fontStartupTimedOut, setFontStartupTimedOut] = useState(false);
  const canRenderApp = fontsLoaded || Boolean(fontError);
  const shouldShowStartupFallback = !canRenderApp && fontStartupTimedOut;

  useEffect(() => {
    const timer = setTimeout(() => setFontStartupTimedOut(true), FONT_STARTUP_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!canRenderApp && !shouldShowStartupFallback) {
      return undefined;
    }
    SplashScreen.hideAsync().catch(() => undefined);
    return undefined;
  }, [canRenderApp, shouldShowStartupFallback]);

  if (!canRenderApp) {
    if (!shouldShowStartupFallback) {
      return null;
    }
    return (
      <LaunchSplash
        reduceMotion={reduceMotion}
        message="Starting Rituals..."
        fontsReady={false}
      />
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <NavigationBar hidden={false} style="light" />
        {children}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#EFF3FA',
  },
});
