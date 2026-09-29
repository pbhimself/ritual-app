import { Component, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RefreshCw } from 'lucide-react-native';

export default class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={styles.root}>
        <Text accessibilityRole="header" style={styles.title}>Unable to open this screen</Text>
        <Text style={styles.message}>Please try again. Your saved rituals are still available.</Text>
        <Pressable accessibilityRole="button" onPress={() => this.setState({ failed: false })} style={styles.button}>
          <RefreshCw size={18} color="#FFFFFF" />
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EFF3FA', justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  title: { fontSize: 22, fontWeight: '600', color: '#1C2B49', textAlign: 'center' },
  message: { fontSize: 15, color: '#60708F', textAlign: 'center', maxWidth: 420 },
  button: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 20, borderRadius: 8, backgroundColor: '#1568C9' },
  buttonText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
});
