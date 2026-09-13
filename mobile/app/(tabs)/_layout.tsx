import { Tabs, Redirect } from 'expo-router';
import React from 'react';
import { Platform, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { HapticTab } from '@/components/haptic-tab';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/hooks/useAuth';
import { NotificationModal, NotificationItem } from '@/components/NotificationModal';
import apiClient from '@/constants/api';
import { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { logout, user } = useAuth();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [hasNew, setHasNew] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Polling for notifications
  useEffect(() => {
    if (!user || user.role === 'student') return;

    const poll = async () => {
      try {
        const response = await apiClient.get(`/api/notifications/list?user_id=${user?.id}`);
        const data = response.data;
        
        if (Array.isArray(data) && data.length > 0) {
          const mapped: NotificationItem[] = data.map((n: any) => ({
            id: String(n.id),
            message: n.message,
            roomName: n.space_name || 'Hệ thống',
            time: n.time,
            type: n.behavior === 'using_phone' ? 'phone' : 'sleep'
          }));

          setNotifications(prev => {
            if (mapped.length > 0 && (prev.length === 0 || mapped[0].id !== prev[0].id)) {
              if (!showModal) {
                setHasNew(true);
                // Trigger haptic feedback for new notification
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              }
            }
            return mapped;
          });
        }
      } catch (e) {
        console.error('Polling error', e);
      }
    };

    poll(); // Gọi ngay lập tức
    const timer = setInterval(poll, 5000);
    return () => clearInterval(timer);
  }, [user, showModal]);

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const saved = await AsyncStorage.getItem('IS_DARK_MODE');
        if (saved !== null) {
          setIsDarkMode(JSON.parse(saved));
        } else if (user?.role === 'student') {
          setIsDarkMode(true);
        }
      } catch (e) {}
    };
    loadTheme();
    const interval = setInterval(loadTheme, 1000);
    return () => clearInterval(interval);
  }, [user]);

  if (!user) {
    return <Redirect href="/login" />;
  }

  const openNotifications = () => {
    setShowModal(true);
    setHasNew(false);
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Bạn có chắc chắn muốn đăng xuất không?')) {
        logout();
      }
    } else {
      Alert.alert(
        'Đăng xuất',
        'Bạn có chắc chắn muốn đăng xuất không?',
        [
          { text: 'Hủy', style: 'cancel' },
          { text: 'Đăng xuất', style: 'destructive', onPress: logout },
        ]
      );
    }
  };

  const isDark = isDarkMode || user?.role === 'student';

  return (
    <>
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: isDark ? '#00f5d4' : '#4f46e5',
        tabBarInactiveTintColor: isDark ? '#64748b' : '#94a3b8',
        headerShown: true,
        headerStyle: {
          backgroundColor: isDark ? '#081a24' : '#ffffff',
          shadowColor: 'transparent',
          elevation: 0,
        },
        headerTitleStyle: {
          color: isDark ? '#ffffff' : '#0f172a',
          fontWeight: '700',
        },
        tabBarButton: HapticTab,
        headerRight: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 15 }}>
            {user?.role !== 'student' && (
              <TouchableOpacity onPress={openNotifications} style={{ marginRight: 20, position: 'relative' }}>
                <Ionicons name="notifications-outline" size={24} color={isDark ? '#ffffff' : '#0f172a'} />
                {hasNew && (
                  <View style={{ 
                    position: 'absolute', 
                    top: -2, 
                    right: -2, 
                    backgroundColor: '#ef4444', 
                    width: 10, 
                    height: 10, 
                    borderRadius: 5,
                    borderWidth: 2,
                    borderColor: isDark ? '#081a24' : '#fff'
                  }} />
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={24} color={isDark ? '#ffffff' : '#0f172a'} />
            </TouchableOpacity>
          </View>
        ),
        tabBarStyle: {
          backgroundColor: isDark ? '#081a24' : '#ffffff',
          borderTopColor: isDark ? '#122c3b' : '#e2e8f0',
          height: Platform.OS === 'ios' ? 85 : 65,
          paddingBottom: Platform.OS === 'ios' ? 25 : 6,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginBottom: 2,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Tổng quan',
          tabBarIcon: ({ color }) => <Ionicons size={22} name="grid-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="monitoring"
        options={{
          title: 'Giám sát',
          href: null,
          tabBarIcon: ({ color }) => <Ionicons size={22} name="videocam-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Lịch sử',
          tabBarIcon: ({ color }) => <Ionicons size={22} name="time-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Cài đặt',
          tabBarIcon: ({ color }) => <Ionicons size={22} name="settings-outline" color={color} />,
        }}
      />
    </Tabs>
    {user?.role !== 'student' && (
      <NotificationModal 
        visible={showModal} 
        onClose={() => setShowModal(false)} 
        notifications={notifications} 
      />
    )}
    </>
  );
}
