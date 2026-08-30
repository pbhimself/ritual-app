import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

const fontBodyBold = 'PlusJakartaSans_600SemiBold';
const fontSerifSemi = 'Fraunces_600SemiBold';

type LaunchSplashProps = {
  reduceMotion: boolean;
  onSkip?: () => void;
  message?: string;
  fontsReady?: boolean;
};

export default function LaunchSplash({
  reduceMotion,
  onSkip,
  message = 'Loading your rituals...',
  fontsReady = true,
}: LaunchSplashProps) {
  const opacity = useRef(new Animated.Value(1)).current;
  const copy = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(copy, {
      toValue: 1,
      delay: reduceMotion ? 0 : 500,
      duration: reduceMotion ? 1 : 360,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [copy, reduceMotion]);

  const dismiss = () => {
    if (!onSkip) {
      return;
    }
    Animated.timing(opacity, {
      toValue: 0,
      duration: reduceMotion ? 1 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(onSkip);
  };

  return (
    <Animated.View style={[styles.launchSplash, { opacity }]}>
      {onSkip ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Skip launch animation" onPress={dismiss} style={styles.launchSkip}>
          <Text style={styles.launchSkipText}>Skip</Text>
        </Pressable>
      ) : null}
      <View style={styles.launchMarkWrap}>
        <RitualsMarkSvg color="#F4F8FF" />
      </View>
      <Animated.View
        style={[
          styles.launchCopy,
          {
            opacity: copy,
            transform: [{ translateY: copy.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
          },
        ]}
      >
        <Text style={[styles.launchTitle, !fontsReady && styles.launchTitleSystem]}>Rituals</Text>
        <Text style={[styles.launchTagline, !fontsReady && styles.launchTextSystem]}>Small rituals - Steady flow</Text>
      </Animated.View>
      <View style={styles.launchLoadingRow}>
        <View style={styles.launchSpinnerMark}>
          <RitualsMarkSvg color="#7C8AA6" />
        </View>
        <Text style={[styles.launchLoadingText, !fontsReady && styles.launchTextSystem]}>{message}</Text>
      </View>
    </Animated.View>
  );
}

function RitualsMarkSvg({ color }: { color: string }) {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 200 214" fill="none">
      <Path d="M 83,27 A 82,82 0 1 1 72,184" stroke={color} strokeWidth="7" strokeLinecap="round" fill="none" />
      <Path d="M 65,181 A 82,82 0 0 1 35,158" stroke={color} strokeWidth="7" strokeLinecap="round" fill="none" />
      <Circle cx="100" cy="107" r="68" stroke={color} strokeWidth="7" fill="none" />
      <Path
        d="M 40,107 C 60,80 80,80 100,107 C 120,134 140,134 160,107"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
        fill="none"
      />
      <Circle cx="40" cy="107" r="5" fill={color} />
      <Circle cx="160" cy="107" r="5" fill={color} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  launchSplash: {
    flex: 1,
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 100,
    backgroundColor: '#0B1330',
    alignItems: 'center',
    justifyContent: 'center',
  },
  launchSkip: {
    position: 'absolute',
    top: 24,
    right: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  launchSkipText: {
    fontFamily: fontBodyBold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.56)',
  },
  launchMarkWrap: {
    width: 180,
    height: 193,
    alignItems: 'center',
    justifyContent: 'center',
  },
  launchCopy: {
    alignItems: 'center',
    marginTop: 22,
  },
  launchTitle: {
    fontFamily: fontSerifSemi,
    fontSize: 30,
    color: '#F4F8FF',
  },
  launchTitleSystem: {
    fontFamily: Platform.select({ default: 'sans-serif-medium', ios: 'System' }),
  },
  launchTagline: {
    fontFamily: fontBodyBold,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: '#8FA0C4',
    marginTop: 8,
  },
  launchLoadingRow: {
    position: 'absolute',
    bottom: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  launchSpinnerMark: {
    width: 18,
    height: 19,
  },
  launchLoadingText: {
    fontFamily: fontBodyBold,
    fontSize: 11,
    color: '#7C8AA6',
  },
  launchTextSystem: {
    fontFamily: Platform.select({ default: 'sans-serif', ios: 'System' }),
  },
});
