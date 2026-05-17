import { View, ViewStyle } from 'react-native';
import Svg, { Rect, Path, Line } from 'react-native-svg';

// Brand mark. The two hex literals (#B91C1C, #F2EDE3) are the intentional
// brand definition — the only place these raw hex values are allowed in the
// native app. Mirrors src/components/LogoMark.tsx in the web app.

const BRAND_RED = '#B91C1C';
const BRAND_CREAM = '#F2EDE3';

type LogoMarkProps = {
  size?: number;
  glow?: boolean;
  style?: ViewStyle;
};

export default function LogoMark({ size = 30, glow = false, style }: LogoMarkProps) {
  const shadowStyle: ViewStyle | null = glow
    ? {
        shadowColor: BRAND_RED,
        shadowOpacity: 0.55,
        shadowRadius: size * 0.4,
        shadowOffset: { width: 0, height: 0 },
        elevation: 12,
      }
    : null;

  return (
    <View style={[{ width: size, height: size }, shadowStyle, style]}>
      <Svg width={size} height={size} viewBox="0 0 30 30">
        <Rect width={30} height={30} rx={7} fill={BRAND_RED} />
        <Path
          d="M8.5 7.5H15a5 5 0 0 1 0 10H8.5V7.5Z"
          stroke={BRAND_CREAM}
          strokeWidth={1.7}
          fill="none"
          strokeLinejoin="round"
        />
        <Line x1={8.5} y1={12.5} x2={17} y2={12.5} stroke={BRAND_CREAM} strokeWidth={1.7} strokeLinecap="round" />
        <Line x1={14.5} y1={17.5} x2={21.5} y2={23} stroke={BRAND_CREAM} strokeWidth={1.8} strokeLinecap="round" />
      </Svg>
    </View>
  );
}
