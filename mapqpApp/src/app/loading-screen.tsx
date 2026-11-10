import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  ImageSourcePropType,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { File, Paths } from 'expo-file-system';
import Constants from 'expo-constants';
import {
  exchangeCodeAsync,
  makeRedirectUri,
  ResponseType,
  useAuthRequest,
} from 'expo-auth-session';
import type { DiscoveryDocument } from 'expo-auth-session';

import defaultRoutePoints from '../data/route-points.json';
import defaultBuildings from '../data/wpi-buildings.json';
import { useLocationWarmup } from '../hooks/use-location-warmup';
import { useSettings } from '../context/settings-context';
import { useKeyLockout } from '../hooks/use-key-lockout';
import { useAccessibilityPreferences } from '../hooks/use-accessibility-preferences';
import { isServerOnline, setServerOnline } from '../utils/server-status';
import { ensureBackendSession } from '../utils/backend-session';
import { initRoutingGraph, validateMapData } from '../utils/routing';

const AUTH_STORAGE_KEY = 'mapqp_microsoft_session';
const TEMP_CODE_STORAGE_KEY = 'mapqp_temp_code_session';
const TEMP_CODE_EXPIRES_AT_KEY = 'mapqp_temp_code_expires_at';
const ACCESS_TOKEN_KEY = 'mapqp_access_token';

const extra = Constants.expoConfig?.extra as {
  SERVER_IP?: string;
  PORT?: string;
  PUBLIC_KEY?: string
} | undefined;
const SERVER_IP = extra?.SERVER_IP ?? process.env.SERVER_IP;
const PORT = extra?.PORT ?? process.env.PORT;

const IS_SERVER_CONFIGURED = Boolean(SERVER_IP && PORT);
const API_BASE_URL = IS_SERVER_CONFIGURED ? `http://${SERVER_IP}:${PORT}` : null;
const MICROSOFT_AUTHORITY = Constants.expoConfig?.extra?.AUTHORITY;
const MICROSOFT_CLIENT_ID = Constants.expoConfig?.extra?.CLIENT_ID;
const AUTH_CONFIGURATION_MISSING = !MICROSOFT_AUTHORITY || !MICROSOFT_CLIENT_ID;
const DISCOVERY_ISSUER = MICROSOFT_AUTHORITY ?? 'https://login.microsoftonline.com/common';


// Hardened public key fetcher and local caching for cryptographic verification
async function fetchAndCachePublicKey(): Promise<boolean> {
  if (!API_BASE_URL) {
    setServerOnline(false);
    return false;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${API_BASE_URL}/auth/public-key`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.public_key) {
        try {
          const publicKeyFile = new File(Paths.document, 'public-key.pem');
          if (!publicKeyFile.exists) {
            publicKeyFile.create();
          }
          publicKeyFile.write(data.public_key);
        } catch (fileErr) {
          console.warn('Could not cache public key locally:', fileErr);
        }
        
        setServerOnline(true);
        return true;
      }
    }
  } catch (error) {
    console.warn('Failed to fetch public key from server:', error);
  }

  try {
    const publicKeyFile = new File(Paths.document, 'public-key.pem');
    if (publicKeyFile.exists) {
      setServerOnline(false);
      return true; 
    }
  } catch (e) {
    // ignore file read error
  }

  setServerOnline(false);
  return false;
}

export interface MapQPProps {
  firstImage?: ImageSourcePropType;
  secondImage?: ImageSourcePropType;
  duration?: number;
  onFinish?: () => void;
  showSpinner?: boolean;
}

export default function LoadingScreen({
  firstImage,
  secondImage,
  duration = 3000,
  onFinish,
  showSpinner = true,
}: MapQPProps) {
  useLocationWarmup();
  const { reduceMotionEnabled, loaded: accessibilityLoaded } = useAccessibilityPreferences();
  const { hasSelectedMode, navigationMode, settingsLoaded } = useSettings();
  const {
    isLockedOut,
    remainingAttempts,
    formattedRemainingTime,
    registerFailedAttempt,
    registerSuccess,
  } = useKeyLockout();

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;
  const [authLoaded, setAuthLoaded] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);

  const [debugStatus, setDebugStatus] = useState<string>(
    `Target: ${API_BASE_URL ?? 'Not Configured'}`
  );

  const loginAttemptedRef = useRef(false);
  const exchangeInProgressRef = useRef(false);

  const discovery = useMemo<DiscoveryDocument | null> (() => {
    if (AUTH_CONFIGURATION_MISSING) return null;
    const issuer = DISCOVERY_ISSUER.replace(/\/$/, '');
    return {
      authorizationEndpoint: `${issuer}/oauth2/v2.0/authorize`,
      tokenEndpoint: `${issuer}/oauth2/v2.0/token`,
    };
  }, []);

  const redirectUri = makeRedirectUri({
    scheme: 'mapqpapp',
    path: 'auth',
  });

  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId: MICROSOFT_CLIENT_ID ?? '',
      responseType: ResponseType.Code,
      scopes: ['openid', 'profile', 'email', 'offline_access'],
      redirectUri,
      usePKCE: true,
      extraParams: {
        prompt: 'login',
      },
    },
    discovery
  );

  const continueToApp = useCallback(() => {
    if (onFinish) {
      onFinish();
    } else if (hasSelectedMode) {
      router.replace(
        navigationMode === 'standard'
          ? '/standard-navigation'
          : '/accessibility-navigation'
      );
    } else {
      router.replace('/landing-page');
    }
  }, [hasSelectedMode, navigationMode, onFinish]);

  const syncMapData = async (): Promise<boolean> => {
    if (!API_BASE_URL || !isServerOnline()) {
      setDebugStatus(`Target: ${API_BASE_URL} (Offline)`);
      return false;
    }

    try {
      const accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
      if (!accessToken) {
        setDebugStatus(`Target: ${API_BASE_URL} (No Token)`);
        return false;
      }

      const routeFile = new File(Paths.document, 'route-points.json');
      const buildingsFile = new File(Paths.document, 'wpi-buildings.json');

      let currentVersion = defaultRoutePoints.version ? parseFloat(defaultRoutePoints.version) : 0;

      if (routeFile.exists) {
        const existingContent = await routeFile.text();
        const parsed = JSON.parse(existingContent);
        if (parsed.version) {
          currentVersion = parseFloat(parsed.version);
        }
      }

      setDebugStatus(`Connecting to ${API_BASE_URL} (v${currentVersion})...`);
      const res = await fetch(`${API_BASE_URL}/route-points?version=${currentVersion}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.update_required && data.route_points) {
          const buildings = data.wpi_buildings ?? (buildingsFile.exists
            ? JSON.parse(await buildingsFile.text()) : defaultBuildings);
          
(data.route_points, buildings);
          if (!routeFile.exists) routeFile.create();
          routeFile.write(JSON.stringify(data.route_points, null, 2));

          if (data.wpi_buildings) {
            if (!buildingsFile.exists) buildingsFile.create();
            buildingsFile.write(JSON.stringify(data.wpi_buildings, null, 2));
          }
          setDebugStatus(`Updated successfully to v${data.current_version}!`);
          return true;
        } else {
          setDebugStatus(`Up to date (v${data.current_version}).`);
        }
      } else {
        setDebugStatus(`Server error: HTTP ${res.status}`);
      }
    } catch (error) {
      setDebugStatus(`Sync error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error('Error syncing map data files:', error);
    }
    return false;
  };

  const prepareAndContinue = useCallback(async () => {
    try {
      await syncMapData();

      let routeData = defaultRoutePoints;
      let buildingData = defaultBuildings;
      try {

        const routeFile = new File(Paths.document, 'route-points.json');
        const buildingsFile = new File(Paths.document, 'wpi-buildings.json');

        if (routeFile.exists) {
          const routeContent = await routeFile.text();
          routeData = JSON.parse(routeContent);
        }

        if (buildingsFile.exists) {
          const buildingContent = await buildingsFile.text();
          buildingData = JSON.parse(buildingContent);
        }

        initRoutingGraph(routeData, buildingData);
      } catch (cacheError) {
        console.warn("Cached map data is unusable; using bundled map data.", cacheError);
        routeData = defaultRoutePoints;
        buildingData = defaultBuildings;
        initRoutingGraph(routeData, buildingData);
      }
    } catch (err) {
      console.error('Pre-load map data error:', err);
    } finally {
      continueToApp();
    }
  }, [continueToApp]);

  const isAuthenticatedRef = useRef(isAuthenticated);
  isAuthenticatedRef.current = isAuthenticated;

  const continueToAppRef = useRef(prepareAndContinue);
  continueToAppRef.current = prepareAndContinue;

  const img1 = firstImage ?? require('../../assets/images/wpi-logo.png');
  const img2 = secondImage ?? require('../../assets/images/mapqp-logo.png');

  useEffect(() => {
    const loadSessionAndSync = async () => {
      try {
        const msSession = await SecureStore.getItemAsync(AUTH_STORAGE_KEY);
        const savedTempCode = await SecureStore.getItemAsync(TEMP_CODE_STORAGE_KEY);
        const localAccessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);

        const expiry = Number(await SecureStore.getItemAsync(TEMP_CODE_EXPIRES_AT_KEY));
        const validTempSession = savedTempCode && localAccessToken && Number.isFinite(expiry) && expiry > Date.now();
        if (savedTempCode && !validTempSession && !msSession) {
          await Promise.all([
            SecureStore.deleteItemAsync(TEMP_CODE_STORAGE_KEY),
            SecureStore.deleteItemAsync(TEMP_CODE_EXPIRES_AT_KEY),
            SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
          ]);
        }
        if (msSession || validTempSession) {
          setIsAuthenticated(true);
          setAuthLoaded(true);

          const serverIsUp = await fetchAndCachePublicKey();
          if (serverIsUp) {
            if (isServerOnline()) await ensureBackendSession().catch(() => {});
            await syncMapData();
          } else {
            setDebugStatus(`Target: ${API_BASE_URL} (Cached Session Mode)`);
          }
          return;
        }

        const serverIsUp = await fetchAndCachePublicKey();
        if (!serverIsUp) {
          setDebugStatus(`Target: ${API_BASE_URL} (Offline Mode)`);
          setIsAuthenticated(false);
          setAuthLoaded(true);
          return;
        }

        await syncMapData();
        setIsAuthenticated(false);
      } catch (error) {
        console.error('Failed to load session and sync:', error);
        setIsAuthenticated(false);
      } finally {
        setAuthLoaded(true);
      }
    };

    void loadSessionAndSync();
  }, []);

  useEffect(() => {
    if (
      AUTH_CONFIGURATION_MISSING ||
      !loginAttemptedRef.current ||
      response?.type !== 'success' ||
      !response.params.code ||
      !request ||
      !discovery
    ) {
      if (response?.type === 'error' && loginAttemptedRef.current) {
        loginAttemptedRef.current = false;
        Alert.alert(
          'WPI login failed',
          response.error?.message ?? 'Microsoft could not complete the login.'
        );
      }
      return;
    }

    if (exchangeInProgressRef.current) return;
    exchangeInProgressRef.current = true;

    const exchangeCode = async () => {
      try {
        const tokenResponse = await exchangeCodeAsync(
          {
            clientId: MICROSOFT_CLIENT_ID,
            code: response.params.code,
            redirectUri,
            extraParams: {
              code_verifier: request.codeVerifier ?? '',
            },
          },
          discovery
        );

        await SecureStore.setItemAsync(
          AUTH_STORAGE_KEY,
          JSON.stringify(tokenResponse)
        );
        await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);

        if (API_BASE_URL && isServerOnline()) {
          try {
            await ensureBackendSession();
          } catch (e) {
            console.error('Failed to obtain backend session token:', e);
          }
        }

        // Reset failed attempt count upon successful Microsoft login
        await registerSuccess();

        loginAttemptedRef.current = false;
        setIsAuthenticated(true);
        setShowLogin(false);
        await prepareAndContinue();
      } catch (error) {
        console.error('Failed to complete Microsoft login:', error);
        Alert.alert(
          'WPI login failed',
          'The login response could not be verified. Please try again.'
        );
      } finally {
        loginAttemptedRef.current = false;
        exchangeInProgressRef.current = false;
      }
    };

    void exchangeCode();
  }, [prepareAndContinue, discovery, redirectUri, request, response, registerSuccess]);

  const handleCodeLogin = async () => {
    if (isLockedOut || verificationCode.length !== 6 || isVerifyingCode) return;

    if (!API_BASE_URL) {
      Alert.alert('Server Offline', 'API_BASE_URL is not configured.');
      return;
    }

    setIsVerifyingCode(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/temp-login/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: verificationCode }),
      });

      if (res.ok) {
        const data = await res.json();
        const absoluteExpiry = Date.parse(data.expires_at);
        const seconds = data.expires_in_seconds === undefined
          ? (absoluteExpiry - Date.now()) / 1000 : data.expires_in_seconds;
        if (data.valid !== true || typeof seconds !== 'number' || !Number.isFinite(seconds)
          || seconds <= 0 || !Number.isFinite(absoluteExpiry) || !data.access_token) {
          Alert.alert('Login Failed', 'This code has expired or has invalid session details.');
          return;
        }
        // Relative time may shorten the session, but never extend the server deadline.
        const expiresAtMs = Math.min(Date.now() + seconds * 1000, absoluteExpiry);
        if (expiresAtMs <= Date.now()) {
          Alert.alert('Login Failed', 'This code has expired. Please log in again.');
          return;
        }

        await Promise.all([
          SecureStore.setItemAsync(TEMP_CODE_STORAGE_KEY, verificationCode),
          SecureStore.setItemAsync(TEMP_CODE_EXPIRES_AT_KEY, expiresAtMs.toString()),
          ...(data.access_token ? [SecureStore.setItemAsync(ACCESS_TOKEN_KEY, data.access_token)] : []),
        ]);

        // Reset failed attempt count upon successful temporary code login
        await registerSuccess();

        setIsAuthenticated(true);
        setShowLogin(false);
        await prepareAndContinue();
      } else {
        const { lockedOut, remaining } = await registerFailedAttempt();
        const errorData = await res.json().catch(() => ({}));

        if (lockedOut) {
          Alert.alert('Account Locked', 'You have entered 5 incorrect codes. Please wait 15 minutes before trying again.');
        } else {
          Alert.alert('Login Failed', `${errorData.detail ?? 'Invalid code.'}\nYou have ${remaining} attempts remaining.`);
        }
      }
    } catch (error) {
      Alert.alert('Connection Error', `Unable to reach backend server at ${API_BASE_URL}.`);
    } finally {
      setIsVerifyingCode(false);
    }
  };

  useEffect(() => {
    if (!accessibilityLoaded || reduceMotionEnabled) {
      pulseAnim.setValue(1);
      opacityAnim.setValue(1);
      return;
    }

    const pulseLoop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.02, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.96, duration: 1000, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacityAnim, { toValue: 1.0, duration: 1000, useNativeDriver: true }),
          Animated.timing(opacityAnim, { toValue: 0.75, duration: 1000, useNativeDriver: true }),
        ]),
      ])
    );

    pulseLoop.start();

    return () => pulseLoop.stop();
  }, [accessibilityLoaded, reduceMotionEnabled, pulseAnim, opacityAnim]);

  useEffect(() => {
    if (!settingsLoaded || !authLoaded) {
      return;
    }

    if (!isAuthenticatedRef.current) {
      setShowLogin(true);
      return;
    }

    const timer = setTimeout(() => {
      continueToAppRef.current();
    }, duration);

    return () => {
      clearTimeout(timer);
    };
  }, [duration, settingsLoaded, authLoaded]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.centerWrapper}>
        <Animated.View style={[styles.imageGroup, { transform: [{ scale: pulseAnim }], opacity: opacityAnim }]}>
          <Image source={img1} style={styles.squareImage} resizeMode="contain" />
          <Image source={img2} style={styles.squareImage} resizeMode="contain" />
        </Animated.View>
      </View>

      {showLogin && !isAuthenticated && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.loginOverlay}>
          <View style={styles.loginCard}>
            <Text style={styles.loginTitle}>WPI login required</Text>
            <Text style={styles.loginMessage}>Sign in with your WPI Microsoft account or enter a temporary code to continue.</Text>

            <Pressable
              accessibilityRole="button"
              disabled={!request || AUTH_CONFIGURATION_MISSING}
              onPress={() => {
                loginAttemptedRef.current = true;
                void promptAsync();
              }}
              style={({ pressed }) => [
                styles.loginButton,
                pressed && styles.loginButtonPressed,
                (!request || AUTH_CONFIGURATION_MISSING) && styles.loginButtonDisabled,
              ]}
            >
              <Text style={styles.loginButtonText}>Log in with WPI</Text>
            </Pressable>

            <Text style={styles.orText}>Or enter your 6-character code</Text>

            <TextInput
              accessibilityLabel="WPI six-character code"
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!isLockedOut}
              maxLength={6}
              onChangeText={(text) => setVerificationCode(text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())}
              placeholder={isLockedOut ? 'LOCKED' : 'ABC123'}
              style={[styles.codeInput, isLockedOut && styles.codeInputDisabled]}
              value={verificationCode}
            />

            {isLockedOut ? (
              <Text style={styles.lockoutText}>Too many incorrect attempts. Try again in {formattedRemainingTime}</Text>
            ) : (
              remainingAttempts < 5 && <Text style={styles.attemptsText}>Attempts remaining: {remainingAttempts}</Text>
            )}

            <Pressable
              accessibilityRole="button"
              disabled={verificationCode.length !== 6 || isVerifyingCode || isLockedOut}
              onPress={handleCodeLogin}
              style={({ pressed }) => [
                styles.codeButton,
                (verificationCode.length !== 6 || isVerifyingCode || isLockedOut) && styles.codeButtonDisabled,
                pressed && styles.codeButtonPressed,
              ]}
            >
              {isVerifyingCode ? <ActivityIndicator size="small" color="#1464A5" /> : <Text style={styles.codeButtonText}>Continue with code</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}

      {AUTH_CONFIGURATION_MISSING && (
        <View style={styles.loginOverlay}>
          <View style={styles.loginCard}>
            <Text style={styles.loginTitle}>Configuration not found</Text>
            <Text style={styles.loginMessage}>Microsoft login configuration could not be found.</Text>
          </View>
        </View>
      )}

      {showSpinner && !showLogin && (
        <View style={styles.spinnerWrapper}>
          <ActivityIndicator size="small" color="#1A1A1A" />
          <Text style={{ marginTop: 8, fontSize: 12, color: '#666', textAlign: 'center', paddingHorizontal: 20 }}>
            {debugStatus}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const { width } = Dimensions.get('window');
const MAX_IMAGE_WIDTH = Math.min((width - 64) / 2, 160);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  centerWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  imageGroup: {
    alignItems: 'center',
    justifyContent: 'center',
    rowGap: 16,
  },
  squareImage: {
    width: MAX_IMAGE_WIDTH,
    height: MAX_IMAGE_WIDTH,
    aspectRatio: 1,
  },
  spinnerWrapper: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  loginOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
  },
  loginCard: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    padding: 24,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  loginTitle: {
    color: '#1A1A1A',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  loginMessage: {
    color: '#4A4A4A',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    textAlign: 'center',
  },
  loginButton: {
    alignItems: 'center',
    backgroundColor: '#1464A5',
    borderRadius: 10,
    marginTop: 22,
    paddingVertical: 14,
  },
  loginButtonPressed: {
    opacity: 0.8,
  },
  loginButtonDisabled: {
    opacity: 0.5,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  orText: {
    color: '#666666',
    fontSize: 14,
    marginVertical: 18,
    textAlign: 'center',
  },
  codeInput: {
    borderColor: '#B8B8B8',
    borderRadius: 10,
    borderWidth: 1,
    color: '#1A1A1A',
    fontSize: 18,
    letterSpacing: 3,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlign: 'center',
  },
  codeInputDisabled: {
    backgroundColor: '#F3F3F3',
    borderColor: '#D0D0D0',
    color: '#A0A0A0',
  },
  lockoutText: {
    color: '#D9534F',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  attemptsText: {
    color: '#888888',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  codeButton: {
    alignItems: 'center',
    borderColor: '#1464A5',
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 12,
    paddingVertical: 12,
  },
  codeButtonPressed: {
    opacity: 0.8,
  },
  codeButtonDisabled: {
    borderColor: '#B8B8B8',
    opacity: 0.55,
  },
  codeButtonText: {
    color: '#1464A5',
    fontSize: 15,
    fontWeight: '700',
  },
});
