import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, Switch, TextInput, ActivityIndicator, Alert, Dimensions, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/hooks/useAuth';
import apiClient from '@/constants/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Redirect, useFocusEffect } from 'expo-router';

const { width } = Dimensions.get('window');

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Input states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Loading states
  const [updatingName, setUpdatingName] = useState(false);
  const [updatingEmail, setUpdatingEmail] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  // Sync state on load and focus
  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      const loadTheme = async () => {
        try {
          const saved = await AsyncStorage.getItem('IS_DARK_MODE');
          if (saved !== null && isMounted) {
            setIsDarkMode(JSON.parse(saved));
          } else if (user?.role === 'student' && isMounted) {
            setIsDarkMode(true);
          }
        } catch (e) {}
      };
      loadTheme();
      if (user) {
        setName(user.name || '');
        setEmail(user.email || '');
      }
      return () => { isMounted = false; };
    }, [user])
  );

  if (!user) {
    return <Redirect href="/login" />;
  }

  const toggleDarkMode = async () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await AsyncStorage.setItem('IS_DARK_MODE', JSON.stringify(newMode));
    } catch (e) {
      console.warn('Save theme error', e);
    }
  };

  const handleUpdateEmail = async () => {
    if (!email.trim() || !email.includes('@')) {
      Alert.alert('Thông báo', 'Vui lòng nhập email hợp lệ');
      return;
    }
    try {
      setUpdatingEmail(true);
      await apiClient.post('/api/user/update-info', { user_id: user?.id, email });
      Alert.alert('Thành công', 'Đã cập nhật email thành công!');
    } catch (error: any) {
      Alert.alert('Lỗi', error.response?.data?.message || 'Không thể cập nhật email');
    } finally {
      setUpdatingEmail(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!oldPassword || !newPassword || !confirmPassword) {
      Alert.alert('Thông báo', 'Vui lòng điền đầy đủ thông tin mật khẩu');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Thông báo', 'Mật khẩu mới xác nhận không khớp');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Thông báo', 'Mật khẩu mới phải có ít nhất 6 ký tự');
      return;
    }

    try {
      setUpdatingPassword(true);
      await apiClient.post('/api/user/change-password', {
        user_id: user?.id,
        old_password: oldPassword,
        new_password: newPassword
      });
      Alert.alert('Thành công', 'Đổi mật khẩu thành công!');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      Alert.alert('Lỗi', error.response?.data?.message || 'Không thể đổi mật khẩu. Kiểm tra lại mật khẩu cũ.');
    } finally {
      setUpdatingPassword(false);
    }
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Bạn có chắc chắn muốn đăng xuất khỏi ứng dụng không?')) {
        logout();
      }
    } else {
      Alert.alert(
        'Đăng xuất',
        'Bạn có chắc chắn muốn đăng xuất khỏi ứng dụng?',
        [
          { text: 'Hủy', style: 'cancel' },
          { text: 'Đăng xuất', style: 'destructive', onPress: logout }
        ]
      );
    }
  };

  // Dynamic theme colors
  const themeBg = isDarkMode ? '#030f16' : '#f8fafc';
  const themeCardBg = isDarkMode ? '#081a24' : '#ffffff';
  const themeBorder = isDarkMode ? '#122c3b' : '#e2e8f0';
  const themeText = isDarkMode ? '#ffffff' : '#0f172a';
  const themeSubText = isDarkMode ? '#94a3b8' : '#64748b';
  const themePrimary = isDarkMode ? '#00f5d4' : '#4f46e5';

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case 'admin': return { label: 'QUẢN TRỊ VIÊN HỆ THỐNG', bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' };
      case 'advisor': return { label: 'GIÁO VIÊN CHỦ NHIỆM', bg: 'rgba(16, 185, 129, 0.15)', color: '#10b981' };
      case 'teacher':
      case 'lecturer': return { label: 'GIẢNG VIÊN HƯỚNG DẪN', bg: 'rgba(79, 70, 229, 0.15)', color: '#4f46e5' };
      default: return { label: 'SINH VIÊN', bg: 'rgba(0, 245, 212, 0.15)', color: '#00f5d4' };
    }
  };

  const roleBadge = getRoleBadge(user?.role);

  return (
    <ScrollView style={[styles.container, { backgroundColor: themeBg }]}>
      {/* CARD HỒ SƠ CÁ NHÂN */}
      <View style={[styles.profileHeaderCard, { backgroundColor: themeCardBg, borderColor: themeBorder }]}>
        <View style={styles.avatarRow}>
          <View style={[styles.avatarCircle, { borderColor: themePrimary }]}>
            <ThemedText style={[styles.avatarText, { color: themePrimary }]}>
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </ThemedText>
          </View>
          <View style={{ flex: 1, marginLeft: 15 }}>
            <ThemedText style={[styles.profileName, { color: themeText }]}>{user?.name || 'Người dùng'}</ThemedText>
            <ThemedText style={[styles.profileUsername, { color: themeSubText }]}>@{user?.username || 'user'}</ThemedText>
            <View style={[styles.roleBadge, { backgroundColor: roleBadge.bg, marginTop: 6 }]}>
              <ThemedText style={[styles.roleBadgeText, { color: roleBadge.color }]}>{roleBadge.label}</ThemedText>
            </View>
          </View>
        </View>

        <View style={[styles.infoDivider, { backgroundColor: themeBorder }]} />

        <View style={styles.infoRow}>
          <Ionicons name="mail-outline" size={16} color={themeSubText} />
          <ThemedText style={[styles.infoText, { color: themeText }]}>{user?.email || '---'}</ThemedText>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="card-outline" size={16} color={themeSubText} />
          <ThemedText style={[styles.infoText, { color: themeText }]}>Mã số: {user?.user_code || user?.username || '---'}</ThemedText>
        </View>
      </View>

      {/* CÁ NHÂN HOÁ (THEME MODE) */}
      <View style={styles.section}>
        <ThemedText style={[styles.sectionTitle, { color: themeText }]}>Giao diện & Cài đặt hệ thống</ThemedText>
        <TouchableOpacity 
          style={[styles.card, { backgroundColor: themeCardBg, borderColor: themeBorder }]}
          activeOpacity={0.8}
          onPress={toggleDarkMode}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <View style={[styles.iconBox, { backgroundColor: isDarkMode ? 'rgba(0,245,212,0.1)' : 'rgba(79,70,229,0.1)' }]}>
                <Ionicons name={isDarkMode ? "moon" : "sunny"} size={20} color={themePrimary} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <ThemedText style={[styles.cardTitle, { color: themeText }]}>Chế độ giao diện tối</ThemedText>
                <ThemedText style={[styles.cardSubTitle, { color: themeSubText }]}>Bật tông màu tối bảo vệ mắt</ThemedText>
              </View>
            </View>
            <View pointerEvents="none">
              <Switch
                value={isDarkMode}
                trackColor={{ false: isDarkMode ? '#122c3b' : '#cbd5e1', true: themePrimary }}
                thumbColor={isDarkMode ? '#fff' : '#64748b'}
              />
            </View>
          </View>
        </TouchableOpacity>
      </View>

      {/* THÔNG TIN CÁ NHÂN (CẬP NHẬT EMAIL) */}
      <View style={styles.section}>
        <ThemedText style={[styles.sectionTitle, { color: themeText }]}>Cập nhật thông tin</ThemedText>

        {/* EMAIL */}
        <View style={[styles.card, { backgroundColor: themeCardBg, borderColor: themeBorder }]}>
          <ThemedText style={[styles.inputLabel, { color: themeSubText }]}>Địa chỉ Email</ThemedText>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, { backgroundColor: isDarkMode ? '#0f172a' : '#f8fafc', color: themeText, borderColor: themeBorder }]}
              value={email}
              onChangeText={setEmail}
              placeholder="Nhập email"
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderTextColor={themeSubText}
            />
            <TouchableOpacity 
              style={[styles.saveBtn, { backgroundColor: themePrimary }]}
              onPress={handleUpdateEmail}
              disabled={updatingEmail}
            >
              {updatingEmail ? (
                <ActivityIndicator size="small" color={isDarkMode ? '#030f16' : '#fff'} />
              ) : (
                <ThemedText style={[styles.saveBtnText, { color: isDarkMode ? '#030f16' : '#fff' }]}>Lưu</ThemedText>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ĐỔI MẬT KHẨU */}
      <View style={styles.section}>
        <ThemedText style={[styles.sectionTitle, { color: themeText }]}>Đổi mật khẩu</ThemedText>
        <View style={[styles.card, { backgroundColor: themeCardBg, borderColor: themeBorder }]}>
          <ThemedText style={[styles.inputLabel, { color: themeSubText }]}>Mật khẩu hiện tại</ThemedText>
          <TextInput
            style={[styles.fullInput, { backgroundColor: isDarkMode ? '#0f172a' : '#f8fafc', color: themeText, borderColor: themeBorder }]}
            value={oldPassword}
            onChangeText={setOldPassword}
            secureTextEntry
            placeholder="Nhập mật khẩu hiện tại"
            placeholderTextColor={themeSubText}
          />

          <ThemedText style={[styles.inputLabel, { color: themeSubText, marginTop: 12 }]}>Mật khẩu mới</ThemedText>
          <TextInput
            style={[styles.fullInput, { backgroundColor: isDarkMode ? '#0f172a' : '#f8fafc', color: themeText, borderColor: themeBorder }]}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            placeholder="Nhập mật khẩu mới (tối thiểu 6 ký tự)"
            placeholderTextColor={themeSubText}
          />

          <ThemedText style={[styles.inputLabel, { color: themeSubText, marginTop: 12 }]}>Xác nhận mật khẩu mới</ThemedText>
          <TextInput
            style={[styles.fullInput, { backgroundColor: isDarkMode ? '#0f172a' : '#f8fafc', color: themeText, borderColor: themeBorder }]}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            placeholder="Nhập lại mật khẩu mới"
            placeholderTextColor={themeSubText}
          />

          <TouchableOpacity 
            style={[styles.fullSubmitBtn, { backgroundColor: '#4f46e5', marginTop: 16 }]}
            onPress={handleUpdatePassword}
            disabled={updatingPassword}
          >
            {updatingPassword ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.fullSubmitBtnText}>ĐỔI MẬT KHẨU</ThemedText>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ĐĂNG XUẤT */}
      <View style={[styles.section, { marginBottom: 40 }]}>
        <TouchableOpacity 
          style={styles.logoutBtn}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
          <ThemedText style={styles.logoutBtnText}>ĐĂNG XUẤT TÀI KHOẢN</ThemedText>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  profileHeaderCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    marginBottom: 20,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(79, 70, 229, 0.1)',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '900',
  },
  profileName: {
    fontSize: 18,
    fontWeight: '800',
  },
  profileUsername: {
    fontSize: 12,
    marginTop: 2,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  infoDivider: {
    height: 1,
    marginVertical: 14,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    marginLeft: 10,
    fontWeight: '500',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  cardSubTitle: {
    fontSize: 11,
    marginTop: 2,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
    marginRight: 10,
  },
  saveBtn: {
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '800',
  },
  fullInput: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  fullSubmitBtn: {
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullSubmitBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  logoutBtn: {
    backgroundColor: '#ef4444',
    height: 48,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
