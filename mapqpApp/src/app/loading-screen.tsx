import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  View,
  Image,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Dimensions,
  ImageSourcePropType,
  Platform,
  Pressable,
  Text,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
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
import { useLocationWarmup } from '../hooks/use-location-warmup';
import { useSettings } from '../context/settings-context';
import { useKeyLockout } from '../hooks/use-key-lockout';

import { initRoutingGraph } from '../utils/routing';
import { parseBuildingData } from '../utils/map-logic';
import defaultBuildings from '../data/wpi-buildings.json';

const AUTH_STORAGE_KEY = 'mapqp_microsoft_session';
const TEMP_CODE_STORAGE_KEY = 'mapqp_temp_code_session';
const TEMP_CODE_EXPIRES_AT_KEY = 'mapqp_temp_code_expires_at';
const ACCESS_TOKEN_KEY = 'mapqp_access_token';

const extra = Constants.expoConfig?.extra as { SERVER_IP?: string; PORT?: string } | undefined;
const SERVER_IP = extra?.SERVER_IP ?? process.env.SERVER_IP;
const PORT = extra?.PORT ?? process.env.PORT;

const IS_SERVER_CONFIGURED = Boolean(SERVER_IP && PORT);
const API_BASE_URL = IS_SERVER_CONFIGURED ? `http://${SERVER_IP}:${PORT}` : null;

const MICROSOFT_AUTHORITY = Constants.expoConfig?.extra?.AUTHORITY;
const MICROSOFT_CLIENT_ID = Constants.expoConfig?.extra?.CLIENT_ID;
const AUTH_CONFIGURATION_MISSING =
  !MICROSOFT_AUTHORITY || !MICROSOFT_CLIENT_ID;
const DISCOVERY_ISSUER =
  MICROSOFT_AUTHORITY ?? 'https://login.microsoftonline.com/common';

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
  const { hasSelectedMode, navigationMode, settingsLoaded } = useSettings();
  const {
    isLockedOut,
    remainingAttempts,
    formattedRemainingTime,
    registerFailedAttempt,
    registerSuccess,
  } = useKeyLockout();

  const pulseAnim = useRef(new Animated.Value(0.96)).current;
  const opacityAnim = useRef(new Animated.Value(0.75)).current;
  const [authLoaded, setAuthLoaded] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);

  const [debugStatus, setDebugStatus] = useState<string>('Initializing...');

  const loginAttemptedRef = useRef(false);
  const exchangeInProgressRef = useRef(false);

  const discovery = useMemo<DiscoveryDocument | null>(() => {
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

  // Pre-load local map data, sync if needed, and graph
  const prepareAndContinue = useCallback(async () => {
    try {
      // Pull latest map updates from server right after login if token is ready
      await syncMapData();

      let routeData = defaultRoutePoints;
      let buildingData = defaultBuildings;

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
  const img2 = secondImage ?? require('../../assets/images/splash-icon.png');

  // Sync map data dynamically, returns true if a download occurred
  const syncMapData = async (): Promise<boolean> => {
    if (!API_BASE_URL) {
      setDebugStatus('Sync skipped: API_BASE_URL not configured.');
      return false;
    }

    try {
      const accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
      if (!accessToken) {
        setDebugStatus('Sync skipped: No access token found in SecureStore.');
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

      setDebugStatus(`Calling server with v${currentVersion}...`);
      const res = await fetch(`${API_BASE_URL}/route-points?version=${currentVersion}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.update_required && data.route_points) {
          routeFile.write(JSON.stringify(data.route_points, null, 2));

          if (data.wpi_buildings) {
            buildingsFile.write(JSON.stringify(data.wpi_buildings, null, 2));
          }
          setDebugStatus(`Updated successfully to v${data.current_version}!`);
          return true;
        } else {
          setDebugStatus(`Server replied: Up to date (v${data.current_version}). No update needed.`);
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

  // Verify stored sessions and dynamically sync map data on startup
  useEffect(() => {
    const loadSessionAndSync = async () => {
      try {
        const msSession = await SecureStore.getItemAsync(AUTH_STORAGE_KEY);
        if (msSession) {
          setIsAuthenticated(true);
          
          // Ensure backend access token exists for restored Microsoft session
          let accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
          if (!accessToken && API_BASE_URL) {
            try {
              const parsedMs = JSON.parse(msSession);
              const sessionRes = await fetch(`${API_BASE_URL}/auth/microsoft-session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: parsedMs.accessToken ?? 'wpi_user@wpi.edu' }),
              });
              if (sessionRes.ok) {
                const sessionData = await sessionRes.json();
                if (sessionData.access_token) {
                  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, sessionData.access_token);
                }
              }
            } catch (e) {
              console.error('Failed to restore backend session for MS user:', e);
            }
          }

          // Now safely sync map data with a valid token
          await syncMapData();
          setAuthLoaded(true);
          return;
        }

        const savedTempCode = await SecureStore.getItemAsync(TEMP_CODE_STORAGE_KEY);
        if (savedTempCode) {
          if (!API_BASE_URL) {
            setIsAuthenticated(false);
          } else {
            try {
              const res = await fetch(`${API_BASE_URL}/auth/temp-login/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: savedTempCode }),
              });

              if (res.ok) {
                const data = await res.json();
                if (data.access_token) {
                  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, data.access_token);
                }
                setIsAuthenticated(true);
                // Sync map data after verifying temp code
                await syncMapData();
              } else {
                await SecureStore.deleteItemAsync(TEMP_CODE_STORAGE_KEY);
                await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
                setIsAuthenticated(false);
              }
            } catch (error) {
              await SecureStore.deleteItemAsync(TEMP_CODE_STORAGE_KEY);
              await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
              setIsAuthenticated(false);
            }
          }
        } else {
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error('Failed to load session and sync:', error);
      } finally {
        setAuthLoaded(true);
      }
    };

    void loadSessionAndSync();
  }, []);

  // Verify stored sessions and dynamically sync map data on startup
  useEffect(() => {
    const loadSessionAndSync = async () => {
      try {
        // Await map data check/download first to see if network sync is needed
        await syncMapData();

        const msSession = await SecureStore.getItemAsync(AUTH_STORAGE_KEY);
        if (msSession) {
          setIsAuthenticated(true);
          setAuthLoaded(true);
          return;
        }

        const savedTempCode = await SecureStore.getItemAsync(TEMP_CODE_STORAGE_KEY);
        if (savedTempCode) {
          if (!API_BASE_URL) {
            setIsAuthenticated(false);
          } else {
            try {
              const res = await fetch(`${API_BASE_URL}/auth/temp-login/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: savedTempCode }),
              });

              if (res.ok) {
                const data = await res.json();
                if (data.access_token) {
                  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, data.access_token);
                }
                setIsAuthenticated(true);
              } else {
                await SecureStore.deleteItemAsync(TEMP_CODE_STORAGE_KEY);
                await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
                setIsAuthenticated(false);
              }
            } catch (error) {
              await SecureStore.deleteItemAsync(TEMP_CODE_STORAGE_KEY);
              await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
              setIsAuthenticated(false);
            }
          }
        } else {
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error('Failed to load session and sync:', error);
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

        if (API_BASE_URL) {
          try {
            const sessionRes = await fetch(`${API_BASE_URL}/auth/microsoft-session`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: tokenResponse.accessToken ?? 'wpi_user@wpi.edu' }),
            });
            if (sessionRes.ok) {
              const sessionData = await sessionRes.json();
              if (sessionData.access_token) {
                await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, sessionData.access_token);
              }
            }
          } catch (e) {
            console.error('Failed to obtain backend session token:', e);
          }
        }

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
  }, [prepareAndContinue, discovery, redirectUri, request, response]);

  const handleCodeLogin = async () => {
    if (isLockedOut || verificationCode.length !== 6 || isVerifyingCode) return;

    if (!API_BASE_URL) {
      Alert.alert('Server Configuration Missing', 'SERVER_IP and PORT are not defined in the .env file.');
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
        const now = Date.now();
        let expiresAtMs = now + 60 * 60 * 1000;

        if (data.expires_at) {
          expiresAtMs = new Date(data.expires_at).getTime();
        }

        await Promise.all([
          SecureStore.setItemAsync(TEMP_CODE_STORAGE_KEY, verificationCode),
          SecureStore.setItemAsync(TEMP_CODE_EXPIRES_AT_KEY, expiresAtMs.toString()),
          ...(data.access_token ? [SecureStore.setItemAsync(ACCESS_TOKEN_KEY, data.access_token)] : []),
        ]);

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

    if (!settingsLoaded || !authLoaded) {
      return () => { pulseLoop.stop(); };
    }

    // If map sync & auth checking finished instantly without a map update download,
    // skip the duration timer and proceed immediately!
    if (!isAuthenticatedRef.current) {
      setShowLogin(true);
      pulseLoop.stop();
      return;
    }

    const timer = setTimeout(() => {
      continueToAppRef.current();
    }, duration);

    return () => {
      pulseLoop.stop();
      clearTimeout(timer);
    };
  }, [
    duration,
    pulseAnim,
    opacityAnim,
    settingsLoaded,
    authLoaded,
  ]);

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
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  centerWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  imageGroup: { alignItems: 'center', justifyContent: 'center', rowGap: 16 },
  squareImage: { width: MAX_IMAGE_WIDTH, height: MAX_IMAGE_WIDTH, aspectRatio: 1 },
  spinnerWrapper: { position: 'absolute', bottom: 60, left: 0, right: 0, alignItems: 'center' },
  loginOverlay: { ...StyleSheet.absoluteFill, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(255, 255, 255, 0.96)' },
  loginCard: { width: '100%', maxWidth: 420, alignSelf: 'center', padding: 24, borderRadius: 18, backgroundColor: '#FFFFFF', shadowColor: '#000000', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 5 },
  loginTitle: { color: '#1A1A1A', fontSize: 24, fontWeight: '700', textAlign: 'center' },
  loginMessage: { color: '#4A4A4A', fontSize: 15, lineHeight: 22, marginTop: 8, textAlign: 'center' },
  loginButton: { alignItems: 'center', backgroundColor: '#1464A5', borderRadius: 10, marginTop: 22, paddingVertical: 14 },
  loginButtonPressed: { opacity: 0.8 },
  loginButtonDisabled: { opacity: '0.5' as any },
  loginButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  orText: { color: '#666666', fontSize: 14, marginVertical: 18, textAlign: 'center' },
  codeInput: { borderColor: '#B8B8B8', borderRadius: 10, borderWidth: 1, color: '#1A1A1A', fontSize: 18, letterSpacing: 3, paddingHorizontal: 14, paddingVertical: 12, textAlign: 'center' },
  codeInputDisabled: { backgroundColor: '#F3F3F3', borderColor: '#D0D0D0', color: '#A0A0A0' },
  lockoutText: { color: '#D9534F', fontSize: 13, fontWeight: '600', marginTop: 8, textAlign: 'center' },
  attemptsText: { color: '#888888', fontSize: 13, marginTop: 8, textAlign: 'center' },
  codeButton: { alignItems: 'center', borderColor: '#1464A5', borderRadius: 10, borderWidth: 1, marginTop: 12, paddingVertical: 12 },
  codeButtonPressed: { opacity: 0.8 },
  codeButtonDisabled: { borderColor: '#B8B8B8', opacity: 0.55 },
  codeButtonText: { color: '#1464A5', fontSize: 15, fontWeight: '700' },
});