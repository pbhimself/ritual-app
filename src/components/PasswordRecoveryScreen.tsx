import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LockKeyhole } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function PasswordRecoveryScreen({ onSave, onCancel }: {
  onSave: (password: string) => Promise<void>;
  onCancel: () => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const submit = async () => {
    if (pending.current) return;
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    pending.current = true;
    setBusy(true);
    setError('');
    try { await onSave(password); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update your password. Try again.'); }
    finally { pending.current = false; setBusy(false); }
  };
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.form}>
          <LockKeyhole size={32} color="#1568C9" />
          <Text style={styles.title}>New password</Text>
          <Text style={styles.label}>Password</Text>
          <TextInput accessibilityLabel="New password" secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" value={password} onChangeText={setPassword} style={styles.input} />
          <Text style={styles.label}>Confirm password</Text>
          <TextInput accessibilityLabel="Confirm new password" secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" value={confirm} onChangeText={setConfirm} style={styles.input} onSubmitEditing={submit} returnKeyType="done" />
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Pressable accessibilityRole="button" disabled={busy} onPress={submit} style={[styles.button, busy && styles.disabled]}>
            <Text style={styles.buttonText}>{busy ? 'Updating...' : 'Update password'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void onCancel().catch(() => setError('Could not sign out. Try again.')); }} style={styles.cancel}>
            <Text style={styles.label}>Back to sign in</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EFF3FA' },
  content: { flexGrow: 1, paddingHorizontal: 24, justifyContent: 'center' },
  form: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: 12 },
  title: { fontFamily: 'Fraunces_600SemiBold', fontSize: 28, color: '#1C2B49', marginBottom: 12 },
  label: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 14, color: '#1C2B49' },
  input: { minHeight: 50, paddingHorizontal: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CCD8E8', borderRadius: 8, fontSize: 16 },
  error: { color: '#A92939', fontSize: 14 },
  button: { minHeight: 50, borderRadius: 8, backgroundColor: '#1568C9', alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  buttonText: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15 },
  disabled: { opacity: 0.6 },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
});
