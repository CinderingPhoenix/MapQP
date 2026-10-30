import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hour timeout
const ATTEMPTS_KEY = "auth_failed_attempts";
const LOCKOUT_KEY = "auth_lockout_until";

export function useKeyLockout() {
  const [attempts, setAttempts] = useState<number>(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [isLockedOut, setIsLockedOut] = useState<boolean>(false);

  useEffect(() => {
    async function loadLockoutState() {
      try {
        const [savedAttempts, savedLockout] = await Promise.all([
          SecureStore.getItemAsync(ATTEMPTS_KEY),
          SecureStore.getItemAsync(LOCKOUT_KEY),
        ]);

        const parsedAttempts = savedAttempts ? Number.parseInt(savedAttempts, 10) : 0;
        const parsedLockout = savedLockout ? Number.parseInt(savedLockout, 10) : null;
        const now = Date.now();

        if (parsedLockout && parsedLockout > now) {
          setLockoutUntil(parsedLockout);
          setIsLockedOut(true);
          setRemainingSeconds(Math.ceil((parsedLockout - now) / 1000));
        } else if (parsedLockout && parsedLockout <= now) {
          await resetLockout();
        } else {
          setAttempts(parsedAttempts);
        }
      } catch (error) {
        console.error("Failed to load lockout state:", error);
      }
    }

    void loadLockoutState();
  }, []);

  useEffect(() => {
    if (!lockoutUntil) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const diff = Math.max(0, Math.ceil((lockoutUntil - now) / 1000));

      setRemainingSeconds(diff);

      if (diff <= 0) {
        void resetLockout();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lockoutUntil]);

  const resetLockout = async () => {
    setAttempts(0);
    setLockoutUntil(null);
    setIsLockedOut(false);
    setRemainingSeconds(0);

    await Promise.all([
      SecureStore.deleteItemAsync(ATTEMPTS_KEY),
      SecureStore.deleteItemAsync(LOCKOUT_KEY),
    ]);
  };

  const registerFailedAttempt = useCallback(async (): Promise<{
    lockedOut: boolean;
    remaining: number;
  }> => {
    const now = Date.now();

    if (lockoutUntil && lockoutUntil > now) {
      return { lockedOut: true, remaining: 0 };
    }

    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);

    if (nextAttempts >= MAX_ATTEMPTS) {
      const expiration = now + LOCKOUT_DURATION_MS;
      setLockoutUntil(expiration);
      setIsLockedOut(true);
      setRemainingSeconds(Math.ceil(LOCKOUT_DURATION_MS / 1000));

      await Promise.all([
        SecureStore.setItemAsync(ATTEMPTS_KEY, nextAttempts.toString()),
        SecureStore.setItemAsync(LOCKOUT_KEY, expiration.toString()),
      ]);

      return { lockedOut: true, remaining: 0 };
    }

    await SecureStore.setItemAsync(ATTEMPTS_KEY, nextAttempts.toString());
    return { lockedOut: false, remaining: MAX_ATTEMPTS - nextAttempts };
  }, [attempts, lockoutUntil]);

  const registerSuccess = useCallback(async () => {
    await resetLockout();
  }, []);

  const formatTimeRemaining = (): string => {
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  return {
    isLockedOut,
    attempts,
    remainingAttempts: Math.max(0, MAX_ATTEMPTS - attempts),
    remainingSeconds,
    formattedRemainingTime: formatTimeRemaining(),
    registerFailedAttempt,
    registerSuccess,
  };
}