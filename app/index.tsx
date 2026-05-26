import { StyleSheet, View } from 'react-native';
import { theme } from '../lib/theme';
import { ReidLogo } from '../components/shared/ReidLogo';

/**
 * The bare entry route. The root layout immediately redirects based on verified
 * auth + onboarding state, so this only ever shows for a frame — kept on-brand
 * to avoid any flash.
 */
export default function Index() {
  return (
    <View style={styles.container}>
      <ReidLogo size={56} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
