import React, { useEffect, useRef } from 'react';
import {
  View,
  Image,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Dimensions,
  ImageSourcePropType,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useLocationWarmup } from '../hooks/use-location-warmup';
import { useSettings } from '../context/settings-context';

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

  const img1 = firstImage ?? require('../../assets/images/wpi-logo.png');
  const img2 = secondImage ?? require('../../assets/images/splash-icon.png');

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
    if (!settingsLoaded) {
      return () => {
        pulseLoop.stop();
      };
    }

    const timer = setTimeout(() => {
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

      {showSpinner && (
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 16,
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
});