import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, {
  Circle,
  Path,
} from 'react-native-svg';

const fontBodyBold = 'PlusJakartaSans_600SemiBold';
const fontSerifSemi = 'Fraunces_600SemiBold';
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

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
      delay: reduceMotion ? 0 : 1650,
      duration: reduceMotion ? 1 : 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [copy, reduceMotion]);

  const dismiss = () => {
    if (!onSkip) {
      return;
    }
    Animated.timing(opacity, {
      toValue: 0,
      duration: reduceMotion ? 1 : 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start(onSkip);
  };

  return (
    <Animated.View style={[styles.launchSplash, { opacity }]}>
      {onSkip ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Skip launch animation" onPress={dismiss} style={styles.launchSkip}>
          <Text style={styles.launchSkipText}>Skip</Text>
        </Pressable>
      ) : null}
      <RitualsMark size={180} color="#F4F8FF" mode="launch" reduceMotion={reduceMotion} style={styles.launchMarkWrap} />
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
        <RitualsMark size={18} color="#7C8AA6" mode="spinner" reduceMotion={reduceMotion} />
        <Text style={[styles.launchLoadingText, !fontsReady && styles.launchTextSystem]}>{message}</Text>
      </View>
    </Animated.View>
  );
}

function RitualsMark({
  size,
  color,
  mode,
  reduceMotion,
  style,
}: {
  size: number;
  color: string;
  mode: 'launch' | 'spinner' | 'static';
  reduceMotion: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  if (Platform.OS === 'web') {
    return (
      <View style={[{ width: size, height: Math.round(size * 1.07) }, style]}>
        <RitualsMarkSvg color={color} />
      </View>
    );
  }

  const circleDash = useRef(new Animated.Value(mode === 'launch' && !reduceMotion ? 430 : 0)).current;
  const coilLongDash = useRef(new Animated.Value(mode === 'launch' && !reduceMotion ? 520 : 0)).current;
  const coilStubDash = useRef(new Animated.Value(mode === 'launch' && !reduceMotion ? 90 : 0)).current;
  const waveDash = useRef(new Animated.Value(mode === 'launch' && !reduceMotion ? 190 : 0)).current;
  const dotOpacity = useRef(new Animated.Value(mode === 'launch' && !reduceMotion ? 0 : 1)).current;
  const breathe = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    circleDash.stopAnimation();
    coilLongDash.stopAnimation();
    coilStubDash.stopAnimation();
    waveDash.stopAnimation();
    dotOpacity.stopAnimation();
    breathe.stopAnimation();

    if (reduceMotion || mode === 'static') {
      circleDash.setValue(0);
      coilLongDash.setValue(0);
      coilStubDash.setValue(0);
      waveDash.setValue(0);
      dotOpacity.setValue(1);
      breathe.setValue(1);
      return undefined;
    }

    const flowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(waveDash, {
          toValue: -6,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(waveDash, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
      ]),
    );

    if (mode === 'spinner') {
      circleDash.setValue(0);
      coilLongDash.setValue(0);
      coilStubDash.setValue(0);
      waveDash.setValue(0);
      dotOpacity.setValue(1);
      flowLoop.start();
      return () => flowLoop.stop();
    }

    circleDash.setValue(430);
    coilLongDash.setValue(520);
    coilStubDash.setValue(90);
    waveDash.setValue(190);
    dotOpacity.setValue(0);
    breathe.setValue(1);

    const draw = Animated.parallel([
      Animated.timing(circleDash, {
        toValue: 0,
        duration: 900,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: false,
      }),
      Animated.timing(coilLongDash, {
        toValue: 0,
        delay: 250,
        duration: 800,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: false,
      }),
      Animated.timing(coilStubDash, {
        toValue: 0,
        delay: 950,
        duration: 400,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: false,
      }),
      Animated.timing(waveDash, {
        toValue: 0,
        delay: 700,
        duration: 900,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: false,
      }),
      Animated.timing(dotOpacity, {
        toValue: 1,
        delay: 1550,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]);

    const breatheLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1.035,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(breathe, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]),
    );

    draw.start(() => {
      flowLoop.start();
      breatheLoop.start();
    });

    return () => {
      flowLoop.stop();
      breatheLoop.stop();
    };
  }, [breathe, circleDash, coilLongDash, coilStubDash, dotOpacity, mode, reduceMotion, waveDash]);

  return (
    <Animated.View style={[{ width: size, height: Math.round(size * 1.07), transform: [{ scale: breathe }] }, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 200 214" fill="none">
        <AnimatedPath
          d="M 83,27 A 82,82 0 1 1 72,184"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={520}
          strokeDashoffset={coilLongDash as unknown as number}
        />
        <AnimatedPath
          d="M 65,181 A 82,82 0 0 1 35,158"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={90}
          strokeDashoffset={coilStubDash as unknown as number}
        />
        <AnimatedCircle
          cx="100"
          cy="107"
          r="68"
          stroke={color}
          strokeWidth="7"
          fill="none"
          strokeDasharray={430}
          strokeDashoffset={circleDash as unknown as number}
        />
        <AnimatedPath
          d="M 40,107 C 60,80 80,80 100,107 C 120,134 140,134 160,107"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={190}
          strokeDashoffset={waveDash as unknown as number}
        />
        <AnimatedCircle cx="40" cy="107" r="5" fill={color} opacity={dotOpacity as unknown as number} />
        <AnimatedCircle cx="160" cy="107" r="5" fill={color} opacity={dotOpacity as unknown as number} />
      </Svg>
    </Animated.View>
  );
}

function RitualsMarkSvg({ color }: { color: string }) {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 200 214" fill="none">
      <Path
        d="M 83,27 A 82,82 0 1 1 72,184"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M 65,181 A 82,82 0 0 1 35,158"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
        fill="none"
      />
      <Circle
        cx="100"
        cy="107"
        r="68"
        stroke={color}
        strokeWidth="7"
        fill="none"
      />
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
    elevation: 100,
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
  launchLoadingText: {
    fontFamily: fontBodyBold,
    fontSize: 11,
    color: '#7C8AA6',
  },
  launchTextSystem: {
    fontFamily: Platform.select({ default: 'sans-serif', ios: 'System' }),
  },
});
