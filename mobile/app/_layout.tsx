import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { LogBox, Platform } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/hooks/useAuth';

// Ignore non-critical system and web warnings
LogBox.ignoreLogs([
  'Unable to activate keep awake',
  'Unknown event handler property',
  'onResponderTerminate',
  'shadow* style props are deprecated',
  'props.pointerEvents is deprecated',
]);

if (typeof window !== 'undefined') {
  const isIgnored = (args: any[]) => {
    try {
      const fullText = args
        .map(a => {
          if (!a) return '';
          if (typeof a === 'string') return a;
          if (typeof a === 'object') {
            let json = '';
            try { json = JSON.stringify(a); } catch (e) {}
            return (a.message || '') + ' ' + (a.stack || '') + ' ' + (a.name || '') + ' ' + json;
          }
          return String(a);
        })
        .join(' ')
        .toLowerCase();

      return (
        fullText.includes('onresponder') ||
        fullText.includes('unknown event handler') ||
        fullText.includes('invalid dom property') ||
        fullText.includes('transform-origin') ||
        fullText.includes('transformorigin') ||
        fullText.includes('shadow') ||
        fullText.includes('pointerevents') ||
        fullText.includes('touchablemixin') ||
        fullText.includes('401') ||
        fullText.includes('axioserror')
      );
    } catch (e) {
      return false;
    }
  };

  const origError = console.error;
  console.error = (...args: any[]) => {
    if (isIgnored(args)) return;
    origError(...args);
  };

  const origWarn = console.warn;
  console.warn = (...args: any[]) => {
    if (isIgnored(args)) return;
    origWarn(...args);
  };
}


export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </AuthProvider>
  );
}


