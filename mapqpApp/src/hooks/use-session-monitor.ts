import { useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { router, usePathname } from 'expo-router';

const TEMP_CODE_STORAGE_KEY = 'mapqp_temp_code_session';
const TEMP_CODE_EXPIRES_AT_KEY = 'mapqp_temp_code_expires_at';

export function useSessionMonitor() {
  const pathname = usePathname();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkAndScheduleExpiration = useCallback(async () => {
    try {
      const expiresAtStr = await SecureStore.getItemAsync(TEMP_CODE_EXPIRES_AT_KEY);
      if (!expiresAtStr) return;

      let expiresAt = Number.parseInt(expiresAtStr, 10);
      
      // Fallback in case ISO string was stored instead of epoch milliseconds
      if (Number.isNaN(expiresAt)) {
        expiresAt = new Date(expiresAtStr).getTime();
      }

      if (Number.isNaN(expiresAt)) return;

      const now = Date.now();
      const timeRemaining = expiresAt - now;

      if (timeRemaining <= 0) {
        await handleSessionExpired();
      } else {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          void handleSessionExpired();
        }, timeRemaining);
      }
    } catch (error) {
      console.error('Session monitor error:', error);
    }
  }, []);

  const handleSessionExpired = async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(TEMP_CODE_STORAGE_KEY),
      SecureStore.deleteItemAsync(TEMP_CODE_EXPIRES_AT_KEY),
    ]);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    Alert.alert(
      'Session Expired',
      'Your temporary access code has expired. Please log in again.'
    );

    router.replace('/');
  };

  // Re-evaluate expiration whenever screen path changes or app foregrounds
  useEffect(() => {
    void checkAndScheduleExpiration();

    const subscription = AppState.addEventListener(
      'change',
      (nextAppState: AppStateStatus) => {
        if (nextAppState === 'active') {
          void checkAndScheduleExpiration();
        }
      }
    );

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      subscription.remove();
    };
  }, [pathname, checkAndScheduleExpiration]);

  return { refreshSessionTimer: checkAndScheduleExpiration };
}