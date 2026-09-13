import React, { useState } from 'react';
import {
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/hooks/useAuth';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const { width } = Dimensions.get('window');

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [secureText, setSecureText] = useState(true);
  const { login, isLoading } = useAuth();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert('Lỗi', 'Vui lòng nhập đầy đủ thông tin');
      return;
    }

    try {
      await login(username, password);
      router.replace('/(tabs)');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Sai tài khoản hoặc mật khẩu';
      Alert.alert('Đăng nhập thất bại', message);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: isDark ? '#0f172a' : '#f8fafc' }]}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ThemedView style={[styles.header, { backgroundColor: 'transparent' }]}>
          <View style={[styles.logoContainer, { backgroundColor: isDark ? '#1e293b' : '#eef2ff', borderColor: isDark ? '#334155' : '#c7d2fe' }]}>
            <Ionicons name="shield-checkmark" size={60} color="#4f46e5" />
          </View>
          <ThemedText type="title" style={[styles.title, { color: isDark ? '#fff' : '#0f172a' }]}>
            Focus System
          </ThemedText>
          <ThemedText style={[styles.subtitle, { color: isDark ? '#94a3b8' : '#64748b' }]}>
            Hệ thống giám sát tập trung học tập
          </ThemedText>
        </ThemedView>

        <View style={styles.form}>
          <View style={[styles.inputContainer, { backgroundColor: isDark ? '#1e293b' : '#fff', borderColor: isDark ? '#334155' : '#e2e8f0' }]}>
            <Ionicons name="person-outline" size={20} color="#4f46e5" style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: isDark ? '#fff' : '#0f172a' }]}
              placeholder="Tên đăng nhập"
              placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
            />
          </View>

          <View style={[styles.inputContainer, { backgroundColor: isDark ? '#1e293b' : '#fff', borderColor: isDark ? '#334155' : '#e2e8f0' }]}>
            <Ionicons name="lock-closed-outline" size={20} color="#4f46e5" style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: isDark ? '#fff' : '#0f172a' }]}
              placeholder="Mật khẩu"
              placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={secureText}
            />
            <TouchableOpacity onPress={() => setSecureText(!secureText)} style={styles.eyeBtn}>
              <Ionicons 
                name={secureText ? "eye-off-outline" : "eye-outline"} 
                size={20} 
                color={isDark ? '#64748b' : '#94a3b8'} 
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.loginButton, { shadowColor: '#4f46e5' }]}
            onPress={handleLogin}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.loginButtonText}>Đăng nhập</ThemedText>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.forgotPassword} activeOpacity={0.7} onPress={() => Alert.alert('Thông báo', 'Vui lòng liên hệ quản trị viên hệ thống để khôi phục mật khẩu.')}>
            <ThemedText style={styles.forgotPasswordText}>Quên mật khẩu?</ThemedText>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <ThemedText style={[styles.footerText, { color: isDark ? '#64748b' : '#94a3b8' }]}>
            © 2026 Hệ thống Giám sát Học tập của Sinh viên
          </ThemedText>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    width: 110,
    height: 110,
    borderRadius: 55,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  form: {
    gap: 16,
    paddingHorizontal: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 1,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  eyeBtn: {
    padding: 4,
  },
  loginButton: {
    backgroundColor: '#4f46e5',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  forgotPassword: {
    alignItems: 'center',
    marginTop: 8,
  },
  forgotPasswordText: {
    color: '#4f46e5',
    fontSize: 13,
    fontWeight: '700',
  },
  footer: {
    marginTop: 48,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
