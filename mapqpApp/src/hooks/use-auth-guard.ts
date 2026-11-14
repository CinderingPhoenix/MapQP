import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { isReviewSession } from '../utils/review-access';

const AUTH_STORAGE_KEY = 'mapqp_microsoft_session';
const TEMP_CODE_STORAGE_KEY = 'mapqp_temp_code_session';
const TEMP_CODE_EXPIRES_AT_KEY = 'mapqp_temp_code_expires_at';

export function useAuthGuard() {
  const [isChecking, setIsChecking] = useState(true);
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    // Prevent running multiple times across re-renders
    if (hasCheckedRef.current) return;
    hasCheckedRef.current = true;

    async function checkAuth() {
      try {
        const [msSession, tempCode, expiresAtStr] = await Promise.all([
          SecureStore.getItemAsync(AUTH_STORAGE_KEY),
          SecureStore.getItemAsync(TEMP_CODE_STORAGE_KEY),
          SecureStore.getItemAsync(TEMP_CODE_EXPIRES_AT_KEY),
        ]);

        // Valid Microsoft Session
        if (msSession || isReviewSession(tempCode)) {
          setIsChecking(false);
          return;
        }

        // Valid Temporary Code Session
        if (tempCode && expiresAtStr) {
          const expiresAt = Number(expiresAtStr);
          if (!Number.isNaN(expiresAt) && Date.now() < expiresAt) {
            setIsChecking(false);
            return;
          }
        }

        // Unauthorized: clear storage and redirect back to login
        await Promise.all([
          SecureStore.deleteItemAsync('mapqp_access_token'),
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
