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

const AUTH_STORAGE_KEY = 'mapqp_microsoft_session';
const TEMP_CODE_STORAGE_KEY = 'mapqp_temp_code_session';
const TEMP_CODE_EXPIRES_AT_KEY = 'mapqp_temp_code_expires_at';

// Strictly read environment variables without fallback address/port
const SERVER_IP =
  process.env.EXPO_PUBLIC_SERVER_IP ??
  Constants.expoConfig?.extra?.SERVER_IP ??
  process.env.SERVER_IP;

const PORT =
  process.env.EXPO_PUBLIC_PORT ??
  Constants.expoConfig?.extra?.PORT ??
  process.env.PORT;

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

  const img1 = firstImage ?? require('../../assets/images/wpi-logo.png');
  const img2 = secondImage ?? require('../../assets/images/splash-icon.png');

  // Sync route-points.json and wpi-buildings.json together on initial load
  useEffect(() => {
    const syncMapData = async () => {
      if (!API_BASE_URL) return;

      try {
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

        const res = await fetch(`${API_BASE_URL}/route-points?version=${currentVersion}`);
        if (res.ok) {
          const data = await res.json();
          if (data.update_required && data.route_points) {
            routeFile.write(JSON.stringify(data.route_points, null, 2));

            if (data.wpi_buildings) {
              buildingsFile.write(JSON.stringify(data.wpi_buildings, null, 2));
            }
          }
        }
      } catch (error) {
        console.error('Error syncing map data files:', error);
      }
    };

    void syncMapData();
  }, []);

  // Verify stored sessions (Microsoft OAuth or 6-Character Temp Code) on app startup
  useEffect(() => {
    const loadSession = async () => {
      try {
        const msSession = await SecureStore.getItemAsync(AUTH_STORAGE_KEY);
        if (msSession) {
          setIsAuthenticated(true);
          setAuthLoaded(true);
          return;
        }

        const savedTempCode = await SecureStore.getItemAsync(TEMP_CODE_STORAGE_KEY);
        if (savedTempCode) {
          if (!API_BASE_URL) {
            console.warn('Server configuration missing in .env file. Skipping temp code verification.');
            setIsAuthenticated(false);
          } else {
            try {
              const res = await fetch(`${API_BASE_URL}/auth/temp-login/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: savedTempCode }),
              });

              if (res.ok) {
                setIsAuthenticated(true);
              } else {
                await SecureStore.deleteItemAsync(TEMP_CODE_STORAGE_KEY);
                setIsAuthenticated(false);
              }
            } catch (error) {
              console.error('Failed to verify stored temp code on backend:', error);
              await SecureStore.deleteItemAsync(TEMP_CODE_STORAGE_KEY);
              setIsAuthenticated(false);
            }
          }
        } else {
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error('Failed to load authentication session:', error);
      } finally {
        setAuthLoaded(true);
      }
    };

    void loadSession();
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
        loginAttemptedRef.current = false;
        setIsAuthenticated(true);
        setShowLogin(false);
        continueToApp();
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
  }, [continueToApp, discovery, redirectUri, request, response]);

  // Handle 6-Character Temp Code submission with lockout protection
  const handleCodeLogin = async () => {
    if (isLockedOut || verificationCode.length !== 6 || isVerifyingCode) return;

    if (!API_BASE_URL) {
      Alert.alert(
        'Server Configuration Missing',
        'SERVER_IP and PORT are not defined in the .env file.'
      );
      return;
    }

    setIsVerifyingCode(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/temp-login/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: verificationCode }),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));

        // Calculate absolute epoch milliseconds expiration time
        const now = Date.now();
        let expiresAtMs: number;

        if (data.expires_at) {
          expiresAtMs = new Date(data.expires_at).getTime();
        } else if (data.expires_in) {
          expiresAtMs = now + Number(data.expires_in) * 1000;
        } else {
          // Fallback default duration (1 hour)
          expiresAtMs = now + 60 * 60 * 1000;
        }

        await Promise.all([
          SecureStore.setItemAsync(TEMP_CODE_STORAGE_KEY, verificationCode),
          SecureStore.setItemAsync(TEMP_CODE_EXPIRES_AT_KEY, expiresAtMs.toString()),
        ]);

        await registerSuccess();
        setIsAuthenticated(true);
        setShowLogin(false);
        continueToApp();
      } else {
        const { lockedOut, remaining } = await registerFailedAttempt();
        const errorData = await res.json().catch(() => ({}));

        if (lockedOut) {
          Alert.alert(
            'Account Locked',
            'You have entered 5 incorrect codes. Please wait 15 minutes before trying again.'
          );
        } else {
          Alert.alert(
            'Login Failed',
            `${errorData.detail ?? 'Invalid or expired temporary login code.'}\nYou have ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} remaining.`
          );
        }
      }
    } catch (error) {
      Alert.alert(
        'Connection Error',
        `Unable to reach backend server at ${API_BASE_URL}. Ensure the server is running and accessible.`
      );
    } finally {
      setIsVerifyingCode(false);
    }
  };

  useEffect(() => {
    // Pulse animation loop
    const pulseLoop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.02,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.96,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacityAnim, {
            toValue: 1.0,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0.75,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    pulseLoop.start();

    if (!settingsLoaded || !authLoaded) {
      return () => {
        pulseLoop.stop();
      };
    }

    const timer = setTimeout(() => {
      if (!isAuthenticated) {
        setShowLogin(true);
      } else {
        continueToApp();
      }
    }, duration);

    return () => {
      pulseLoop.stop();
      clearTimeout(timer);
    };
  }, [
    duration,
    hasSelectedMode,
    navigationMode,
    onFinish,
    pulseAnim,
    opacityAnim,
    settingsLoaded,
    authLoaded,
    isAuthenticated,
    continueToApp,
  ]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.centerWrapper}>
        <Animated.View
          style={[
            styles.imageGroup,
            {
              transform: [{ scale: pulseAnim }],
              opacity: opacityAnim,
            },
          ]}
        >
          <Image
            source={img1}
            style={styles.squareImage}
            resizeMode="contain"
          />
          <Image
            source={img2}
            style={styles.squareImage}
            resizeMode="contain"
          />
        </Animated.View>
      </View>

      {showLogin && !isAuthenticated && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.loginOverlay}
        >
          <View style={styles.loginCard}>
            <Text style={styles.loginTitle}>WPI login required</Text>
            <Text style={styles.loginMessage}>
              Sign in with your WPI Microsoft account or enter a temporary code to continue.
            </Text>
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
              onChangeText={(text) =>
                setVerificationCode(text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())
              }
              placeholder={isLockedOut ? 'LOCKED' : 'ABC123'}
              style={[
                styles.codeInput,
                isLockedOut && styles.codeInputDisabled,
              ]}
              value={verificationCode}
            />

            {isLockedOut ? (
              <Text style={styles.lockoutText}>
                Too many incorrect attempts. Try again in {formattedRemainingTime}
              </Text>
            ) : (
              remainingAttempts < 5 && (
                <Text style={styles.attemptsText}>
                  Attempts remaining: {remainingAttempts}
                </Text>
              )
            )}

            <Pressable
              accessibilityRole="button"
              disabled={verificationCode.length !== 6 || isVerifyingCode || isLockedOut}
              onPress={handleCodeLogin}
              style={({ pressed }) => [
                styles.codeButton,
                (verificationCode.length !== 6 || isVerifyingCode || isLockedOut) &&
                  styles.codeButtonDisabled,
                pressed && styles.codeButtonPressed,
              ]}
            >
              {isVerifyingCode ? (
                <ActivityIndicator size="small" color="#1464A5" />
              ) : (
                <Text style={styles.codeButtonText}>Continue with code</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}

      {AUTH_CONFIGURATION_MISSING && (
        <View style={styles.loginOverlay}>
          <View style={styles.loginCard}>
            <Text style={styles.loginTitle}>Configuration not found</Text>
            <Text style={styles.loginMessage}>
              Microsoft login configuration could not be found. Please add the
              Expo public Microsoft environment variables and restart the app.
            </Text>
          </View>
        </View>
      )}

      {showSpinner && !showLogin && (
        <View style={styles.spinnerWrapper}>
          <ActivityIndicator size="small" color="#1A1A1A" />
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