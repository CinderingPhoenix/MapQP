import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import {
  exchangeCodeAsync,
  makeRedirectUri,
  ResponseType,
  useAuthRequest,
  useAutoDiscovery,
} from 'expo-auth-session';
import { useLocationWarmup } from '../hooks/use-location-warmup';
import { useSettings } from '../context/settings-context';

const AUTH_STORAGE_KEY = '@mapqp_microsoft_session';
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
  const pulseAnim = useRef(new Animated.Value(0.96)).current;
  const opacityAnim = useRef(new Animated.Value(0.75)).current;
  const [authLoaded, setAuthLoaded] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const discovery = useAutoDiscovery(DISCOVERY_ISSUER);
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

  useEffect(() => {
    const loadSession = async () => {
      try {
        const savedSession = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
        setIsAuthenticated(Boolean(savedSession));
      } catch (error) {
        console.error('Failed to load Microsoft session:', error);
      } finally {
        setAuthLoaded(true);
      }
    };

    void loadSession();
  }, []);

  useEffect(() => {
    if (
      AUTH_CONFIGURATION_MISSING ||
      response?.type !== 'success' ||
      !response.params.code ||
      !request ||
      !discovery
    ) {
      if (response?.type === 'error') {
        Alert.alert(
          'WPI login failed',
          response.error?.message ?? 'Microsoft could not complete the login.'
        );
      }
      return;
    }

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

        await AsyncStorage.setItem(
          AUTH_STORAGE_KEY,
          JSON.stringify(tokenResponse)
        );
        setIsAuthenticated(true);
        setShowLogin(false);
        continueToApp();
      } catch (error) {
        console.error('Failed to complete Microsoft login:', error);
        Alert.alert(
          'WPI login failed',
          'The login response could not be verified. Please try again.'
        );
      }
    };

    void exchangeCode();
  }, [continueToApp, discovery, redirectUri, request, response]);

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

    // Trigger redirection upon completion
    if (!settingsLoaded || !authLoaded || AUTH_CONFIGURATION_MISSING) {
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
              Sign in with your WPI Microsoft account to continue.
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={!request}
              onPress={() => void promptAsync()}
              style={({ pressed }) => [
                styles.loginButton,
                pressed && styles.loginButtonPressed,
                !request && styles.loginButtonDisabled,
              ]}
            >
              <Text style={styles.loginButtonText}>Log in with WPI</Text>
            </Pressable>
            <Text style={styles.orText}>Or enter your 6-character code</Text>
            <TextInput
              accessibilityLabel="WPI six-character code"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              onChangeText={(text) =>
                setVerificationCode(text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())
              }
              placeholder="ABC123"
              style={styles.codeInput}
              value={verificationCode}
            />
            <Pressable
              accessibilityRole="button"
              disabled={verificationCode.length !== 6}
              onPress={() =>
                Alert.alert(
                  'Code login unavailable',
                  'A WPI code verification service is not configured yet. Use WPI login instead.'
                )
              }
              style={[
                styles.codeButton,
                verificationCode.length !== 6 && styles.codeButtonDisabled,
              ]}
            >
              <Text style={styles.codeButtonText}>Continue with code</Text>
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

      {showSpinner && !showLogin && !AUTH_CONFIGURATION_MISSING && (
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
  codeButton: {
    alignItems: 'center',
    borderColor: '#1464A5',
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 12,
    paddingVertical: 12,
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