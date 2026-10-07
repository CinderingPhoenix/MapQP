import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

const AUTH_STORAGE_KEY = 'mapqp_microsoft_session';
const TEMP_CODE_STORAGE_KEY = 'mapqp_temp_code_session';
const TEMP_CODE_EXPIRES_AT_KEY = 'mapqp_temp_code_expires_at';

export function useAuthGuard() {
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      try {
        const [msSession, tempCode, expiresAtStr] = await Promise.all([
          SecureStore.getItemAsync(AUTH_STORAGE_KEY),
          SecureStore.getItemAsync(TEMP_CODE_STORAGE_KEY),
          SecureStore.getItemAsync(TEMP_CODE_EXPIRES_AT_KEY),
        ]);

        // Check for active Microsoft OAuth session
        if (msSession) {
          setIsChecking(false);
          return;
        }

        // Check for temporary code validity and local timestamp
        if (tempCode && expiresAtStr) {
          const expiresAt = Number.parseInt(expiresAtStr, 10);
          if (!Number.isNaN(expiresAt) && Date.now() < expiresAt) {
            setIsChecking(false);
            return;
          }
        }

        // If invalid or missing, purge and bounce to loading screen
        await Promise.all([
          SecureStore.deleteItemAsync(AUTH_STORAGE_KEY),
          SecureStore.deleteItemAsync(TEMP_CODE_STORAGE_KEY),
          SecureStore.deleteItemAsync(TEMP_CODE_EXPIRES_AT_KEY),
        ]);

        router.replace('/');
      } catch (error) {
        console.error('Auth guard error:', error);
        router.replace('/');
      } finally {
        setIsChecking(false);
      }
    }

    void checkAuth();
  }, []);

  return { isChecking };
}