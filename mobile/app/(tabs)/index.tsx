import React, { useEffect, useState, useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { StyleSheet, View, ScrollView, RefreshControl, Dimensions, TouchableOpacity, Image, Modal, ActivityIndicator, Switch, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import apiClient, { getFullUrl } from '@/constants/api';
import { useAuth } from '@/hooks/useAuth';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { LineChart, StackedBarChart } from 'react-native-chart-kit';
import Svg, { Circle, Path, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { NotificationModal, NotificationItem } from '@/components/NotificationModal';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

interface StudentDetail {
  id: number;
  name: string;
  code: string;
}

interface RedListDetail {
  name: string;
  code: string;
  days: number;
  errors: number;
}

interface DashboardData {
  session_title: string;
  total_students: number;
  students_list: StudentDetail[];
  weekly_violations: number;
  red_list_count: number;
  red_list_details: RedListDetail[];
  live_rooms?: any[];
  latest_events?: any[];
  active_rooms_count?: number | string;
  active_rooms_sub?: string;
  today_events_count?: number;
  pending_warnings_count?: number;
  total_users?: number;
  total_classes?: number;
  total_sections?: number;
  active_sessions?: number;
  active_rooms?: number;
  today_events?: number;
  warning_logs?: any[];
}

interface TrendData {
    labels: string[];
    focused: number[];
    unfocused: number[];
}

interface RoomAnalytics {
    labels: string[];
    legend: string[];
    data: number[][];
}

interface Violation {
  id: string | number;
  behavior: string;
  space_name: string;
  image_path: string;
  time?: string;
  student_name?: string;
  student_code?: string;
}

interface GroupedViolation {
  space_name: string;
  items: Violation[];
}

interface StudentPortalData {
  student_info: {
    id: number;
    name: string;
    code: string;
    email: string;
  };
  overall_focus_score: number;
  violations_history: {
    behavior: string;
    session: string;
    time: string;
  }[];
  email_history: {
    subject: string;
    status: string;
    time: string;
  }[];
}

export default function DashboardScreen() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [recentViolations, setRecentViolations] = useState<Violation[]>([]);
  const [trend, setTrend] = useState<TrendData | null>(null);
  const [roomStats, setRoomStats] = useState<RoomAnalytics | null>(null);
  const [studentData, setStudentData] = useState<StudentPortalData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { logout, user } = useAuth();
  
  // Modal states
  const [selectedRoom, setSelectedRoom] = useState<GroupedViolation | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  
  const [showStudentsModal, setShowStudentsModal] = useState(false);
  const [showSectionsModal, setShowSectionsModal] = useState(false);
  const [showCoursesModal, setShowCoursesModal] = useState(false);
  const [showClassesModal, setShowClassesModal] = useState(false);
  const [classesList, setClassesList] = useState<any[]>([]);
  const [coursesList, setCoursesList] = useState<any[]>([]);
  const [sectionsList, setSectionsList] = useState<any[]>([]);

  
  
  useEffect(() => {
    if (showClassesModal) {
      apiClient.get('/api/admin/classes')
        .then(res => {
          if (Array.isArray(res.data) && res.data.length > 0) {
            setClassesList(res.data);
          }
        })
        .catch(err => console.warn('Error fetching classes:', err?.message || err));
    }
  }, [showClassesModal]);

  useEffect(() => {
    if (showCoursesModal) {
      apiClient.get('/api/admin/courses')
        .then(res => {
          if (Array.isArray(res.data) && res.data.length > 0) {
            setCoursesList(res.data);
          }
        })
        .catch(err => console.warn('Error fetching courses:', err?.message || err));
    }
  }, [showCoursesModal]);

  useEffect(() => {
    if (showSectionsModal) {
      apiClient.get('/api/admin/sections')
        .then(res => {
          if (Array.isArray(res.data) && res.data.length > 0) {
            setSectionsList(res.data);
          }
        })
        .catch(err => console.warn('Error fetching sections:', err?.message || err));
    }
  }, [showSectionsModal]);
  const [showRedListModal, setShowRedListModal] = useState(false);
  const [showEmailLogsModal, setShowEmailLogsModal] = useState(false);
  
  // Student Portal Tabs & Limits
  const [activeStudentTab, setActiveStudentTab] = useState<'logs' | 'emails'>('logs');
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [showAllEmails, setShowAllEmails] = useState(false);

  // Student Portal Notification States
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [hasNewNotifications, setHasNewNotifications] = useState(false);

  // Student Portal Settings Modal States
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsName, setSettingsName] = useState('');
  const [settingsEmail, setSettingsEmail] = useState('');
  const [settingsOldPassword, setSettingsOldPassword] = useState('');
  const [settingsNewPassword, setSettingsNewPassword] = useState('');
  const [settingsConfirmPassword, setSettingsConfirmPassword] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(true); // default true for student dark theme
  const [updatingName, setUpdatingName] = useState(false);
  const [updatingEmail, setUpdatingEmail] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  // Load saved theme preference on start and tab focus
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
        } catch (e) {
          console.warn('Load theme error', e);
        }
      };
      loadTheme();
      return () => { isMounted = false; };
    }, [user])
  );

  const toggleDarkMode = async () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await AsyncStorage.setItem('IS_DARK_MODE', JSON.stringify(newMode));
    } catch (e) {
      console.error('Save theme error', e);
    }
  };

  // Sync name & email input with student info
  useEffect(() => {
    if (studentData?.student_info?.name) {
      setSettingsName(studentData.student_info.name);
    } else if (user?.name) {
      setSettingsName(user.name);
    }

    if (studentData?.student_info?.email) {
      setSettingsEmail(studentData.student_info.email);
    } else if (user?.email) {
      setSettingsEmail(user.email);
    }
  }, [studentData, user]);

  const handleUpdateName = async () => {
    if (!settingsName.trim()) {
      Alert.alert('Lỗi', 'Họ và tên không được để trống');
      return;
    }
    setUpdatingName(true);
    try {
      const response = await apiClient.post('/api/profile/update_name', {
        user_id: user?.id,
        name: settingsName.trim()
      });
      if (response.data.status === 'ok') {
        Alert.alert('Thành công', 'Cập nhật họ và tên thành công!');
        fetchStudentPortal();
      } else {
        Alert.alert('Lỗi', response.data.error || 'Có lỗi xảy ra');
      }
    } catch (e: any) {
      Alert.alert('Lỗi', e.response?.data?.error || 'Không thể cập nhật họ và tên');
    } finally {
      setUpdatingName(false);
    }
  };

  const handleUpdateEmail = async () => {
    if (!settingsEmail.trim()) {
      Alert.alert('Lỗi', 'Email không được để trống');
      return;
    }
    setUpdatingEmail(true);
    try {
      const response = await apiClient.post('/api/profile/update_email', {
        user_id: user?.id,
        email: settingsEmail.trim()
      });
      if (response.data.status === 'ok') {
        Alert.alert('Thành công', 'Cập nhật email nhận thông báo thành công!');
        fetchStudentPortal();
      } else {
        Alert.alert('Lỗi', response.data.error || 'Có lỗi xảy ra');
      }
    } catch (e: any) {
      Alert.alert('Lỗi', e.response?.data?.error || 'Không thể cập nhật email');
    } finally {
      setUpdatingEmail(false);
    }
  };

  const handleChangePassword = async () => {
    if (!settingsOldPassword || !settingsNewPassword || !settingsConfirmPassword) {
      Alert.alert('Lỗi', 'Vui lòng điền đầy đủ các trường mật khẩu');
      return;
    }
    if (settingsNewPassword !== settingsConfirmPassword) {
      Alert.alert('Lỗi', 'Mật khẩu mới và xác nhận mật khẩu không khớp');
      return;
    }
    setUpdatingPassword(true);
    try {
      const response = await apiClient.post('/api/profile/change_password', {
        user_id: user?.id,
        old_password: settingsOldPassword,
        new_password: settingsNewPassword
      });
      if (response.data.status === 'ok') {
        Alert.alert('Thành công', 'Đổi mật khẩu thành công!');
        setSettingsOldPassword('');
        setSettingsNewPassword('');
        setSettingsConfirmPassword('');
      } else {
        Alert.alert('Lỗi', response.data.error || 'Có lỗi xảy ra');
      }
    } catch (e: any) {
      Alert.alert('Lỗi', e.response?.data?.error || 'Không thể đổi mật khẩu');
    } finally {
      setUpdatingPassword(false);
    }
  };

  // Polling for notifications (only for student/lecturer roles)
  useEffect(() => {
    if (!user) return;

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
              if (!showNotificationsModal) {
                setHasNewNotifications(true);
                // Trigger haptic feedback for new notification
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              }
            }
            return mapped;
          });
        }
      } catch (e) {
        console.error('Student notifications polling error', e);
      }
    };

    poll(); // Call immediately
    const timer = setInterval(poll, 5000);
    return () => clearInterval(timer);
  }, [user, showNotificationsModal]);

  const openStudentNotifications = () => {
    setShowNotificationsModal(true);
    setHasNewNotifications(false);
  };

  const fetchDashboard = async () => {
    try {
      const response = await apiClient.get(`/api/mobile/dashboard?user_id=${user?.id}`);
      setData(response.data);

      const violationsRes = await apiClient.get(`/api/violations/recent?user_id=${user?.id}`);
      setRecentViolations(violationsRes.data);

      const trendRes = await apiClient.get(`/api/dashboard/trend?user_id=${user?.id}`);
      setTrend(trendRes.data);

      const roomRes = await apiClient.get(`/api/analytics/rooms?user_id=${user?.id}`);
      setRoomStats(roomRes.data);
    } catch (error) {
      console.warn('Fetch dashboard error:', error?.message || error);
    }
  };

  const fetchStudentPortal = async () => {
    try {
      const response = await apiClient.get(`/api/student/portal?student_id=${user?.id}`);
      setStudentData(response.data);
    } catch (error) {
      console.warn('Fetch student portal error:', error?.message || error);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (user?.role === 'student') {
      await fetchStudentPortal();
    } else {
      await fetchDashboard();
    }
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    if (user) {
      if (user.role === 'student') {
        fetchStudentPortal();
        const interval = setInterval(fetchStudentPortal, 15000);
        return () => clearInterval(interval);
      } else {
        fetchDashboard();
        const interval = setInterval(fetchDashboard, 15000);
        return () => clearInterval(interval);
      }
    }
  }, [user]);

  if (!user) {
    return <Redirect href="/login" />;
  }

  const sInfo: any = studentData?.student_info || user;

  if (user?.role === 'student') {
    const avatarChar = (sInfo.name || sInfo.username || '?')[0].toUpperCase();
    const focusScore = studentData?.overall_focus_score || 85.5;
    
    // Dynamic Theme colors based on isDarkMode setting
    const themeBg = isDarkMode ? '#030f16' : '#f8fafc';
    const themeCardBg = isDarkMode ? '#081a24' : '#ffffff';
    const themeBorder = isDarkMode ? '#122c3b' : '#e2e8f0';
    const themeText = isDarkMode ? '#ffffff' : '#0f172a';
    const themeTextSecondary = isDarkMode ? '#64748b' : '#475569';
    const themeStatusBg = isDarkMode ? 'rgba(18, 44, 59, 0.4)' : 'rgba(241, 245, 249, 0.8)';
    
    // Circular progress math
    const strokeWidth = 8;
    const radius = 46;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (circumference * focusScore) / 100;

    const themePrimary = isDarkMode ? '#00f5d4' : '#4f46e5';

    return (
      <>
      <ScrollView 
        style={[styles.container, styles.studentScrollContainer, { backgroundColor: themeBg }]} 
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* PROFILE HEADER */}
        <View style={[styles.studentHeader, { backgroundColor: themeCardBg, borderBottomColor: themeBorder }]}>
          <View style={styles.studentProfileRow}>
            <View style={[styles.studentAvatarOutline, { borderColor: themePrimary }]}>
              <View style={[styles.studentAvatarInner, { backgroundColor: themeBorder }]}>
                <ThemedText style={[styles.studentAvatarInitials, { color: themePrimary }]}>{avatarChar}</ThemedText>
              </View>
              <View style={styles.studentStatusDot} />
            </View>
            <View style={styles.studentProfileInfo}>
              <ThemedText style={styles.studentGreetingText}>Xin chào,</ThemedText>
              <ThemedText style={[styles.studentNameHeader, { color: themeText }]}>{sInfo.name || sInfo.username}</ThemedText>
              <View style={[styles.studentUsernameBadge, { backgroundColor: themeBorder, borderColor: themeBorder }]}>
                <ThemedText style={styles.studentUsernameText}>@{sInfo.username || 'username'}</ThemedText>
                <TouchableOpacity onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}>
                  <Ionicons name="copy-outline" size={12} color="#64748b" style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.studentHeaderActions}>
              <TouchableOpacity onPress={openStudentNotifications} style={[styles.studentHeaderIconBtn, { backgroundColor: themeBorder, borderColor: themeBorder }]}>
                <Ionicons name="notifications-outline" size={20} color={themeText} />
                {hasNewNotifications && <View style={styles.studentNotificationBadge} />}
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.studentProfileDetailsGrid, { borderTopColor: themeBorder, flexDirection: 'column', alignItems: 'flex-start' }]}>
            <View style={[styles.studentDetailGridItem, { marginBottom: 8 }]}>
              <Ionicons name="card-outline" size={14} color={themePrimary} />
              <ThemedText style={styles.studentDetailGridLabel}>MSSV: </ThemedText>
              <ThemedText style={[styles.studentDetailGridVal, { color: themeText }]}>{sInfo.code || '---'}</ThemedText>
            </View>
            <View style={styles.studentDetailGridItem}>
              <Ionicons name="mail-outline" size={14} color={themePrimary} />
              <ThemedText style={styles.studentDetailGridLabel}>Email: </ThemedText>
              <ThemedText style={[styles.studentDetailGridVal, { color: themeText }]} numberOfLines={1}>{sInfo.email || '---'}</ThemedText>
            </View>
          </View>
        </View>

        {/* FOCUS OVERVIEW BLOCK */}
        <View style={styles.studentStatsOverviewContainer}>
          {/* Left Column: Focus Progress */}
          <View style={[styles.studentFocusLeftCard, { backgroundColor: themeCardBg, borderColor: themeBorder }]}>
            <ThemedText style={[styles.studentStatsCardTitle, { color: themePrimary }]}>ĐIỂM TẬP TRUNG</ThemedText>
            
            <View style={styles.studentCircularProgressWrapper}>
              <Svg width={120} height={120} viewBox="0 0 120 120">
                <Defs>
                  <LinearGradient id="tealGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <Stop offset="0%" stopColor={isDarkMode ? '#00f2fe' : '#4f46e5'} />
                    <Stop offset="100%" stopColor={isDarkMode ? '#00f5d4' : '#06b6d4'} />
                  </LinearGradient>
                </Defs>
                <Circle
                  cx="60"
                  cy="60"
                  r={radius}
                  stroke={themeBorder}
                  strokeWidth={strokeWidth}
                  fill="transparent"
                />
                <Circle
                  cx="60"
                  cy="60"
                  r={radius}
                  stroke="url(#tealGrad)"
                  strokeWidth={strokeWidth}
                  fill="transparent"
                  strokeDasharray={`${circumference} ${circumference}`}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  transform="rotate(-90 60 60)"
                />
              </Svg>
              <View style={styles.studentCircularProgressTextContainer}>
                <ThemedText style={[styles.studentCircularProgressVal, { color: themeText }]}>{focusScore}%</ThemedText>
                <ThemedText style={[styles.studentCircularProgressLabel, { color: themePrimary }]}>
                  {focusScore >= 80 ? 'Tập trung tốt' : focusScore >= 50 ? 'Trung bình' : 'Cần chú ý'}
                </ThemedText>
              </View>
            </View>
          </View>

          {/* Right Column: Stats Grid */}
          <View style={styles.studentStatsRightCol}>
            <View style={[styles.studentTrendsRow, { backgroundColor: themeCardBg, borderColor: themeBorder }]}>
              <ThemedText style={styles.studentTrendsLabel}>Xu hướng tuần này</ThemedText>
              <ThemedText style={styles.studentTrendsValue}>↗ 5.6%</ThemedText>
            </View>

            <View style={styles.studentMiniGrid}>
              {/* Buổi học */}
              <View style={[styles.studentMiniCard, { backgroundColor: themeCardBg, borderColor: themeBorder }]}>
                <View style={styles.studentMiniCardHeader}>
                  <View style={[styles.studentMiniIconBox, { backgroundColor: isDarkMode ? 'rgba(0, 245, 212, 0.1)' : 'rgba(79, 70, 229, 0.1)' }]}>
                    <Ionicons name="school" size={14} color={themePrimary} />
                  </View>
                  <ThemedText style={[styles.studentMiniCardVal, { color: themeText }]}>15</ThemedText>
                </View>
                <ThemedText style={styles.studentMiniCardLabel}>Buổi học</ThemedText>
              </View>

              {/* Cảnh báo */}
              <View style={[styles.studentMiniCard, { backgroundColor: themeCardBg, borderColor: themeBorder }]}>
                <View style={styles.studentMiniCardHeader}>
                  <View style={[styles.studentMiniIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
                    <Ionicons name="warning" size={14} color="#ef4444" />
                  </View>
                  <ThemedText style={[styles.studentMiniCardVal, { color: themeText }]}>
                    {studentData?.email_history?.length || 0}
                  </ThemedText>
                </View>
                <ThemedText style={styles.studentMiniCardLabel}>Cảnh báo</ThemedText>
              </View>
            </View>

            {/* Nhật ký hành vi */}
            <View style={[styles.studentMiniCard, { width: '100%', marginTop: 8, backgroundColor: themeCardBg, borderColor: themeBorder }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={[styles.studentMiniIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.1)', marginRight: 10 }]}>
                  <Ionicons name="phone-portrait" size={14} color="#3b82f6" />
                </View>
                <View>
                  <ThemedText style={[styles.studentMiniCardVal, { color: themeText }]}>
                    {studentData?.violations_history?.length || 0}
                  </ThemedText>
                  <ThemedText style={styles.studentMiniCardLabel}>Nhật ký hành vi</ThemedText>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* TAB CONTROLS */}
        <View style={[styles.studentTabContainer, { backgroundColor: themeCardBg, borderColor: themeBorder }]}>
          <TouchableOpacity 
            style={[styles.studentTabButton, activeStudentTab === 'logs' && [styles.studentTabButtonActive, { backgroundColor: themePrimary }]]} 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveStudentTab('logs');
            }}
          >
            <Ionicons name="time-outline" size={18} color={activeStudentTab === 'logs' ? (isDarkMode ? '#030f16' : '#fff') : '#64748b'} />
            <ThemedText style={[styles.studentTabText, activeStudentTab === 'logs' && [styles.studentTabTextActive, { color: isDarkMode ? '#030f16' : '#fff' }]]}>
              Nhật ký ({studentData?.violations_history?.length || 0})
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.studentTabButton, activeStudentTab === 'emails' && [styles.studentTabButtonActive, { backgroundColor: themePrimary }]]} 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveStudentTab('emails');
            }}
          >
            <Ionicons name="mail-outline" size={18} color={activeStudentTab === 'emails' ? (isDarkMode ? '#030f16' : '#fff') : '#64748b'} />
            <ThemedText style={[styles.studentTabText, activeStudentTab === 'emails' && [styles.studentTabTextActive, { color: isDarkMode ? '#030f16' : '#fff' }]]}>
              Cảnh báo ({studentData?.email_history?.length || 0})
            </ThemedText>
          </TouchableOpacity>
        </View>

        {/* RECENT ACTIVITY TIMELINE */}
        <View style={styles.studentSection}>
          <View style={styles.studentSectionHeader}>
            <Ionicons name="flash-outline" size={20} color={themePrimary} />
            <ThemedText style={[styles.studentSectionTitle, { color: themeText }]}>Hoạt động gần đây</ThemedText>
          </View>

          {activeStudentTab === 'logs' ? (
            <View style={[styles.studentCardList, { backgroundColor: themeCardBg, borderColor: themeBorder }]}>
              {studentData?.violations_history && studentData.violations_history.length > 0 ? (
                <View style={styles.timelineWrapper}>
                  {/* Vertical line connector */}
                  <View style={[styles.timelineLine, { backgroundColor: themeBorder }]} />
                  
                  {(showAllLogs ? studentData.violations_history : studentData.violations_history.slice(0, 3)).map((item, idx) => (
                    <View key={idx} style={styles.studentTimelineItem}>
                      <View style={[
                        styles.timelineIconCircle, 
                        { backgroundColor: item.behavior === 'using_phone' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)', borderColor: themeCardBg }
                      ]}>
                        <Ionicons 
                          name={item.behavior === 'using_phone' ? 'phone-portrait-outline' : 'moon-outline'} 
                          size={18} 
                          color={item.behavior === 'using_phone' ? '#f59e0b' : '#ef4444'} 
                        />
                      </View>
                      <View style={[styles.timelineContent, { backgroundColor: themeStatusBg, borderColor: themeBorder }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <ThemedText style={[styles.timelineBehaviorText, { color: themeText }]}>
                            {item.behavior === 'using_phone' ? 'Sử dụng điện thoại' : 'Ngủ gật / Cúi đầu'}
                          </ThemedText>
                          <View style={styles.timelineStatusBadge}>
                            <ThemedText style={styles.timelineStatusText}>Đã ghi nhận</ThemedText>
                          </View>
                        </View>
                        <ThemedText style={[styles.timelineSessionText, { color: themeTextSecondary }]}>{item.session}</ThemedText>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                          <Ionicons name="time-outline" size={12} color="#64748b" style={{ marginRight: 4 }} />
                          <ThemedText style={styles.timelineTimeText}>{item.time}</ThemedText>
                        </View>
                      </View>
                    </View>
                  ))}
                  
                  {studentData.violations_history.length > 3 && (
                    <TouchableOpacity 
                      style={[styles.studentShowMoreBtn, { backgroundColor: themeBorder, borderColor: themeBorder }]} 
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        setShowAllLogs(!showAllLogs);
                      }}
                    >
                      <ThemedText style={[styles.studentShowMoreText, { color: themePrimary }]}>
                        {showAllLogs ? 'Thu gọn bớt' : `Xem thêm ${studentData.violations_history.length - 3} nhật ký`}
                      </ThemedText>
                      <Ionicons name={showAllLogs ? 'chevron-up' : 'chevron-down'} size={16} color={themePrimary} />
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <View style={styles.studentEmptyState}>
                  <Ionicons name="checkmark-circle-outline" size={40} color="#10b981" />
                  <ThemedText style={styles.studentEmptyText}>Tuyệt vời! Không bị nhắc nhở.</ThemedText>
                </View>
              )}
            </View>
          ) : (
            <View style={[styles.studentCardList, { backgroundColor: themeCardBg, borderColor: themeBorder }]}>
              {studentData?.email_history && studentData.email_history.length > 0 ? (
                <View style={styles.timelineWrapper}>
                  <View style={[styles.timelineLine, { backgroundColor: themeBorder }]} />
                  
                  {(showAllEmails ? studentData.email_history : studentData.email_history.slice(0, 3)).map((item, idx) => (
                    <View key={idx} style={styles.studentTimelineItem}>
                      <View style={[styles.timelineIconCircle, { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: themeCardBg }]}>
                        <Ionicons name="mail-unread-outline" size={18} color="#ef4444" />
                      </View>
                      <View style={[styles.timelineContent, { backgroundColor: themeStatusBg, borderColor: themeBorder }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <ThemedText style={[styles.timelineBehaviorText, { flex: 1, marginRight: 8, color: themeText }]} numberOfLines={1}>
                            {item.subject}
                          </ThemedText>
                          <View style={[styles.timelineStatusBadge, { backgroundColor: 'rgba(239, 68, 68, 0.2)' }]}>
                            <ThemedText style={[styles.timelineStatusText, { color: '#f43f5e' }]}>Cảnh báo</ThemedText>
                          </View>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                          <View style={[
                            styles.statusIndicator, 
                            { backgroundColor: item.status === 'success' ? '#10b981' : '#f59e0b', width: 6, height: 6 }
                          ]} />
                          <ThemedText style={[styles.timelineSessionText, { color: themeTextSecondary }]}>
                            Trạng thái: {item.status === 'success' ? 'Đã gửi thành công' : 'Đang xử lý'}
                          </ThemedText>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                          <Ionicons name="time-outline" size={12} color="#64748b" style={{ marginRight: 4 }} />
                          <ThemedText style={styles.timelineTimeText}>{item.time}</ThemedText>
                        </View>
                      </View>
                    </View>
                  ))}
                  
                  {studentData.email_history.length > 3 && (
                    <TouchableOpacity 
                      style={[styles.studentShowMoreBtn, { backgroundColor: themeBorder, borderColor: themeBorder }]} 
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        setShowAllEmails(!showAllEmails);
                      }}
                    >
                      <ThemedText style={[styles.studentShowMoreText, { color: themePrimary }]}>
                        {showAllEmails ? 'Thu gọn bớt' : `Xem thêm ${studentData.email_history.length - 3} thư nhắc nhở`}
                      </ThemedText>
                      <Ionicons name={showAllEmails ? 'chevron-up' : 'chevron-down'} size={16} color={themePrimary} />
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <View style={styles.studentEmptyState}>
                  <Ionicons name="mail-outline" size={40} color="#64748b" style={{ opacity: 0.5 }} />
                  <ThemedText style={styles.studentEmptyText}>Không nhận bất kỳ thư cảnh báo nào.</ThemedText>
                </View>
              )}
            </View>
          )}
        </View>



        <View style={{ height: 60 }} />
      </ScrollView>
      <NotificationModal 
        visible={showNotificationsModal} 
        onClose={() => setShowNotificationsModal(false)} 
        notifications={notifications} 
      />
      <Modal
        visible={showSettingsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSettingsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <ThemedView style={[styles.modalContent, styles.settingsModalContent, { backgroundColor: themeBg, borderColor: themeBorder }]}>
            <View style={styles.modalHeader}>
              <ThemedText style={[styles.modalTitle, { color: themeText }]}>Cài đặt hệ thống</ThemedText>
              <TouchableOpacity 
                onPress={() => setShowSettingsModal(false)} 
                style={[styles.closeBtn, { backgroundColor: themeBorder }]}
              >
                <Ionicons name="close" size={20} color={themePrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.settingsScrollContent} showsVerticalScrollIndicator={false}>
              {/* THÔNG TIN CÁ NHÂN */}
              <View style={styles.settingsSection}>
                <ThemedText style={styles.settingsSectionTitle}>Thông tin cá nhân</ThemedText>
                <View style={[styles.settingsCard, { backgroundColor: themeCardBg, borderColor: themeBorder }]}>
                  <View style={styles.settingsInfoRow}>
                    <ThemedText style={styles.settingsInfoLabel}>Tên đăng nhập:</ThemedText>
                    <ThemedText style={[styles.settingsInfoVal, { color: themeText }]}>@{sInfo.username || '---'}</ThemedText>
                  </View>
                  <View style={styles.settingsInfoRow}>
                    <ThemedText style={styles.settingsInfoLabel}>MSSV:</ThemedText>
                    <ThemedText style={[styles.settingsInfoVal, { color: themeText }]}>{sInfo.code || '---'}</ThemedText>
                  </View>
                  
                  <View style={{ marginTop: 12 }}>
                    <ThemedText style={styles.settingsInfoLabel}>Họ và tên:</ThemedText>
                    <View style={{ flexDirection: 'row', marginTop: 6 }}>
                      <TextInput
                        style={[styles.settingsInput, { backgroundColor: themeBorder, borderColor: themeBorder, color: themeText }]}
                        value={settingsName}
                        onChangeText={setSettingsName}
                        placeholder="Nhập họ và tên..."
                        placeholderTextColor="#64748b"
                      />
                      <TouchableOpacity 
                        style={[styles.settingsActionBtn, { backgroundColor: themePrimary }]} 
                        onPress={handleUpdateName}
                        disabled={updatingName}
                      >
                        {updatingName ? (
                          <ActivityIndicator size="small" color={isDarkMode ? '#030f16' : '#fff'} />
                        ) : (
                          <ThemedText style={[styles.settingsActionBtnText, { color: isDarkMode ? '#030f16' : '#fff' }]}>Lưu</ThemedText>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>

              {/* CHẾ ĐỘ GIAO DIỆN */}
              <View style={styles.settingsSection}>
                <ThemedText style={styles.settingsSectionTitle}>Cá nhân hóa</ThemedText>
                <TouchableOpacity 
                  style={[styles.settingsCard, { backgroundColor: themeCardBg, borderColor: themeBorder }]}
                  activeOpacity={0.8}
                  onPress={toggleDarkMode}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <ThemedText style={styles.settingsInfoLabel}>Chế độ giao diện tối</ThemedText>
                      <ThemedText style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Sử dụng tông màu tối để bảo vệ mắt</ThemedText>
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

              {/* EMAIL NHẬN THÔNG BÁO */}
              <View style={styles.settingsSection}>
                <ThemedText style={styles.settingsSectionTitle}>Cấu hình thông báo</ThemedText>
                <View style={[styles.settingsCard, { backgroundColor: themeCardBg, borderColor: themeBorder }]}>
                  <View style={styles.settingsInfoRow}>
                    <ThemedText style={styles.settingsInfoLabel}>Email nhận cảnh báo:</ThemedText>
                    <ThemedText style={[styles.settingsInfoVal, { color: themeText }]}>{sInfo.email || '---'}</ThemedText>
                  </View>
                  <ThemedText style={{ fontSize: 11, color: '#64748b', marginTop: 8, fontStyle: 'italic' }}>
                    * Email được quản lý bởi hệ thống nhà trường, không thể tự chỉnh sửa.
                  </ThemedText>
                </View>
              </View>

              {/* ĐỔI MẬT KHẨU */}
              <View style={styles.settingsSection}>
                <ThemedText style={styles.settingsSectionTitle}>Bảo mật</ThemedText>
                <View style={[styles.settingsCard, { backgroundColor: themeCardBg, borderColor: themeBorder }]}>
                  <ThemedText style={styles.settingsInfoLabel}>Mật khẩu cũ:</ThemedText>
                  <TextInput
                    style={[styles.settingsInput, { width: '100%', marginTop: 6, marginBottom: 12, backgroundColor: themeBorder, borderColor: themeBorder, color: themeText }]}
                    value={settingsOldPassword}
                    onChangeText={setSettingsOldPassword}
                    secureTextEntry
                    placeholder="Nhập mật khẩu hiện tại..."
                    placeholderTextColor="#64748b"
                  />

                  <ThemedText style={styles.settingsInfoLabel}>Mật khẩu mới:</ThemedText>
                  <TextInput
                    style={[styles.settingsInput, { width: '100%', marginTop: 6, marginBottom: 12, backgroundColor: themeBorder, borderColor: themeBorder, color: themeText }]}
                    value={settingsNewPassword}
                    onChangeText={setSettingsNewPassword}
                    secureTextEntry
                    placeholder="Nhập mật khẩu mới..."
                    placeholderTextColor="#64748b"
                  />

                  <ThemedText style={styles.settingsInfoLabel}>Xác nhận mật khẩu mới:</ThemedText>
                  <TextInput
                    style={[styles.settingsInput, { width: '100%', marginTop: 6, marginBottom: 16, backgroundColor: themeBorder, borderColor: themeBorder, color: themeText }]}
                    value={settingsConfirmPassword}
                    onChangeText={setSettingsConfirmPassword}
                    secureTextEntry
                    placeholder="Nhập lại mật khẩu mới..."
                    placeholderTextColor="#64748b"
                  />

                  <TouchableOpacity 
                    style={[styles.settingsSubmitBtn, { backgroundColor: isDarkMode ? '#4f46e5' : '#4f46e5' }]} 
                    onPress={handleChangePassword}
                    disabled={updatingPassword}
                  >
                    {updatingPassword ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <ThemedText style={styles.settingsSubmitBtnText}>Đổi mật khẩu</ThemedText>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* ĐĂNG XUẤT */}
              <TouchableOpacity 
                style={styles.settingsLogoutBtn} 
                onPress={() => {
                  setShowSettingsModal(false);
                  logout();
                }}
              >
                <Ionicons name="log-out-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                <ThemedText style={styles.settingsLogoutBtnText}>Đăng xuất tài khoản</ThemedText>
              </TouchableOpacity>

              <View style={{ height: 40 }} />
            </ScrollView>
          </ThemedView>
        </View>
      </Modal>
      </>
    );
  }

  const studentViolations = recentViolations.filter(v => !(v.student_name || "").includes("Người lạ"));
  const strangerViolations = recentViolations.filter(v => (v.student_name || "").includes("Người lạ"));

  const groupByType = (list: Violation[]) => list.reduce((acc: GroupedViolation[], curr) => {
    const existing = acc.find(item => item.space_name === curr.space_name);
    if (existing) {
      existing.items.push(curr);
    } else {
      acc.push({ space_name: curr.space_name, items: [curr] });
    }
    return acc;
  }, []);

  const studentGroups = groupByType(studentViolations);
  const strangerGroups = groupByType(strangerViolations);

  const themeBg = isDarkMode ? '#030f16' : '#f8fafc';
  const themeCardBg = isDarkMode ? '#081a24' : '#ffffff';
  const themeBorder = isDarkMode ? '#122c3b' : '#e2e8f0';
  const themeText = isDarkMode ? '#ffffff' : '#0f172a';
  const themeTextSecondary = isDarkMode ? '#64748b' : '#475569';
  const themeStatusBg = isDarkMode ? 'rgba(18, 44, 59, 0.4)' : 'rgba(241, 245, 249, 0.8)';
  const themePrimary = isDarkMode ? '#00f5d4' : '#4f46e5';

  const currentChartConfig = {
      backgroundColor: themeCardBg,
      backgroundGradientFrom: themeCardBg,
      backgroundGradientTo: themeCardBg,
      decimalPlaces: 1,
      color: (opacity = 1) => isDarkMode ? `rgba(0, 245, 212, ${opacity})` : `rgba(79, 70, 229, ${opacity})`,
      labelColor: (opacity = 1) => isDarkMode ? `rgba(148, 163, 184, ${opacity})` : `rgba(100, 116, 139, ${opacity})`,
      style: {
          borderRadius: 16
      },
      propsForDots: {
          r: "5",
          strokeWidth: "2",
          stroke: themePrimary
      }
  };
  const renderAdminDashboard = () => {
    return (
      <View style={{ flex: 1, backgroundColor: themeBg }}>
        {/* HEADER QUẢN TRỊ VIÊN */}
        <View style={[styles.studentHeader, { backgroundColor: themeCardBg, borderBottomColor: themeBorder }]}>
          <View style={styles.studentProfileRow}>
            <View style={[styles.studentAvatarOutline, { borderColor: '#3b82f6' }]}>
              <View style={[styles.studentAvatarInner, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                <Ionicons name="shield-checkmark" size={32} color="#3b82f6" />
              </View>
            </View>
            <View style={styles.studentProfileInfo}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <ThemedText style={[styles.studentUsernameBadge, { backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }]}>
                  👑 QUẢN TRỊ VIÊN HỆ THỐNG
                </ThemedText>
              </View>
              <ThemedText style={[styles.studentNameHeader, { color: themeText }]}>
                {user?.name || 'Quản trị viên Hệ thống'}
              </ThemedText>
              <ThemedText style={[styles.welcomeText, { color: themeTextSecondary }]}>
                Mã quản trị: ADM_{user?.id || 1} • {user?.email || 'admin@nlu.edu.vn'}
              </ThemedText>
            </View>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {/* STATS METRIC CARDS */}
          <ThemedText style={[styles.adminSectionHeader, { color: themeText }]}>Tổng quan Hệ thống</ThemedText>
          
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
            {/* THẺ 1: TỔNG SINH VIÊN */}
            <TouchableOpacity onPress={() => setShowStudentsModal(true)} style={{ width: '48%', backgroundColor: themeCardBg, borderColor: themeBorder, borderWidth: 1, borderRadius: 20, padding: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <View style={[styles.iconContainer, { backgroundColor: 'rgba(59, 130, 246, 0.15)', marginBottom: 0, marginRight: 8, width: 38, height: 38, borderRadius: 12 }]}>
                  <Ionicons name="people" size={20} color="#3b82f6" />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={{ fontSize: 11, fontWeight: '700', color: themeTextSecondary }} numberOfLines={1}>Tổng sinh viên</ThemedText>
                  <ThemedText style={{ fontSize: 8, fontWeight: '800', color: '#3b82f6', marginTop: 1 }}>QUẢN LÝ</ThemedText>
                </View>
              </View>
              <ThemedText style={{ fontSize: 22, fontWeight: '900', color: themeText }}>{data?.total_students || 11}</ThemedText>
            </TouchableOpacity>

            {/* THẺ 2: PHÒNG ĐANG GIÁM SÁT */}
            <TouchableOpacity onPress={() => router.push('/monitoring')} style={{ width: '48%', backgroundColor: themeCardBg, borderColor: themeBorder, borderWidth: 1, borderRadius: 20, padding: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <View style={[styles.iconContainer, { backgroundColor: 'rgba(16, 185, 129, 0.15)', marginBottom: 0, marginRight: 8, width: 38, height: 38, borderRadius: 12 }]}>
                  <Ionicons name="videocam" size={20} color="#10b981" />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={{ fontSize: 11, fontWeight: '700', color: themeTextSecondary }} numberOfLines={1}>Phòng giám sát</ThemedText>
                  <ThemedText style={{ fontSize: 8, fontWeight: '800', color: '#10b981', marginTop: 1 }}>● LIVE</ThemedText>
                </View>
              </View>
              <ThemedText style={{ fontSize: 22, fontWeight: '900', color: themeText }}>{data?.active_rooms_count || data?.active_rooms || 3}</ThemedText>
            </TouchableOpacity>

            {/* THẺ 3: SỰ KIỆN HÔM NAY */}
            <TouchableOpacity onPress={() => router.push('/explore')} style={{ width: '48%', backgroundColor: themeCardBg, borderColor: themeBorder, borderWidth: 1, borderRadius: 20, padding: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <View style={[styles.iconContainer, { backgroundColor: 'rgba(168, 85, 247, 0.15)', marginBottom: 0, marginRight: 8, width: 38, height: 38, borderRadius: 12 }]}>
                  <Ionicons name="calendar" size={20} color="#a855f7" />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={{ fontSize: 11, fontWeight: '700', color: themeTextSecondary }} numberOfLines={1}>Sự kiện hôm nay</ThemedText>
                  <ThemedText style={{ fontSize: 8, fontWeight: '800', color: '#a855f7', marginTop: 1 }}>HÔM NAY</ThemedText>
                </View>
              </View>
              <ThemedText style={{ fontSize: 22, fontWeight: '900', color: themeText }}>{data?.today_events_count || data?.today_events || 128}</ThemedText>
            </TouchableOpacity>

            {/* THẺ 4: CẢNH BÁO CHƯA XỬ LÝ */}
            <TouchableOpacity onPress={() => setShowRedListModal(true)} style={{ width: '48%', backgroundColor: themeCardBg, borderColor: themeBorder, borderWidth: 1, borderRadius: 20, padding: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <View style={[styles.iconContainer, { backgroundColor: 'rgba(239, 68, 68, 0.15)', marginBottom: 0, marginRight: 8, width: 38, height: 38, borderRadius: 12 }]}>
                  <Ionicons name="warning" size={20} color="#ef4444" />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={{ fontSize: 11, fontWeight: '700', color: themeTextSecondary }} numberOfLines={1}>Cảnh báo Red List</ThemedText>
                  <ThemedText style={{ fontSize: 8, fontWeight: '800', color: '#ef4444', marginTop: 1 }}>CẦN CHÚ Ý</ThemedText>
                </View>
              </View>
              <ThemedText style={{ fontSize: 22, fontWeight: '900', color: '#ef4444' }}>{data?.red_list_count || 9}</ThemedText>
            </TouchableOpacity>
          </View>

          {/* QUICK ACTIONS GRID */}
          <ThemedText style={[styles.adminSectionHeader, { color: themeText, marginTop: 24 }]}>Thao tác Quản trị</ThemedText>
          <View style={styles.adminQuickActionsGrid}>
            <TouchableOpacity onPress={() => setShowClassesModal(true)} style={[styles.adminQuickActionBtn, { backgroundColor: themeCardBg, borderColor: themeBorder }]}>
              <View style={[styles.adminQuickActionIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                <Ionicons name="business" size={22} color="#10b981" />
              </View>
              <ThemedText style={[styles.adminQuickActionText, { color: themeText }]}>Lớp sinh hoạt</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setShowCoursesModal(true)} style={[styles.adminQuickActionBtn, { backgroundColor: themeCardBg, borderColor: themeBorder }]}>
              <View style={[styles.adminQuickActionIconBox, { backgroundColor: 'rgba(168, 85, 247, 0.15)' }]}>
                <Ionicons name="journal" size={22} color="#a855f7" />
              </View>
              <ThemedText style={[styles.adminQuickActionText, { color: themeText }]}>Danh mục môn học</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setShowSectionsModal(true)} style={[styles.adminQuickActionBtn, { backgroundColor: themeCardBg, borderColor: themeBorder }]}>
              <View style={[styles.adminQuickActionIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                <Ionicons name="book" size={22} color="#3b82f6" />
              </View>
              <ThemedText style={[styles.adminQuickActionText, { color: themeText }]}>Lớp học phần</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setShowRedListModal(true)} style={[styles.adminQuickActionBtn, { backgroundColor: themeCardBg, borderColor: themeBorder }]}>
              <View style={[styles.adminQuickActionIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                <Ionicons name="warning" size={22} color="#ef4444" />
              </View>
              <ThemedText style={[styles.adminQuickActionText, { color: themeText }]}>Danh sách Red List</ThemedText>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  };


    if (user?.role === 'admin') {
    return (
      <View style={{ flex: 1, backgroundColor: themeBg }}>
        {renderAdminDashboard()}

        
        {/* MODAL DANH SÁCH LỚP SINH HOẠT (ADMIN) */}
        <Modal visible={showClassesModal} animationType="slide" transparent={true} onRequestClose={() => setShowClassesModal(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: themeCardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, height: '80%', borderWidth: 1, borderColor: themeBorder }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="business-outline" size={24} color="#10b981" style={{ marginRight: 8 }} />
                  <ThemedText style={{ fontSize: 18, fontWeight: '800', color: themeText }}>Danh sách Lớp sinh hoạt</ThemedText>
                </View>
                <TouchableOpacity onPress={() => setShowClassesModal(false)}>
                  <Ionicons name="close-circle" size={26} color={themeTextSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {(classesList.length > 0 ? classesList : [
                  { class_name: '25TH01', advisor_name: 'Nguyễn Hữu Quyền', total_students: 35, academic_year: '2022-2026' },
                  { class_name: '22TH02', advisor_name: 'ThS. Phan Văn Lộc', total_students: 38, academic_year: '2022-2026' },
                  { class_name: '23TH01', advisor_name: 'ThS. Hà Văn Minh', total_students: 40, academic_year: '2023-2027' }
                ]).map((item, idx) => (
                  <View key={idx} style={{ backgroundColor: isDarkMode ? '#0f172a' : '#f8fafc', padding: 14, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: themeBorder }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <ThemedText style={{ fontSize: 15, fontWeight: '800', color: '#10b981' }}>{item.class_name || 'LỚP SH'}</ThemedText>
                      <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                        <ThemedText style={{ fontSize: 11, fontWeight: '700', color: '#10b981' }}>{item.total_students || 35} Sinh viên</ThemedText>
                      </View>
                    </View>
                    <ThemedText style={{ fontSize: 13, fontWeight: '700', color: themeText, marginBottom: 4 }}>📋 Cố vấn học tập: {item.advisor_name || 'Chưa phân công'}</ThemedText>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                      <ThemedText style={{ fontSize: 12, color: themeTextSecondary }}>Khóa học: {item.academic_year || '2022-2026'}</ThemedText>
                      <ThemedText style={{ fontSize: 12, color: '#3b82f6', fontWeight: '700' }}>Lớp Chủ nhiệm</ThemedText>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>


        {/* MODAL 0: DANH MỤC MÔN HỌC */}
        <Modal visible={showCoursesModal} animationType="slide" transparent={true} onRequestClose={() => setShowCoursesModal(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: themeCardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, height: '80%', borderWidth: 1, borderColor: themeBorder }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="journal-outline" size={24} color="#a855f7" style={{ marginRight: 8 }} />
                  <ThemedText style={{ fontSize: 18, fontWeight: '800', color: themeText }}>Danh mục Môn học</ThemedText>
                </View>
                <TouchableOpacity onPress={() => setShowCoursesModal(false)}>
                  <Ionicons name="close-circle" size={26} color={themeTextSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {(coursesList.length > 0 ? coursesList : [
                  { course_code: 'AI101', title: 'Trí tuệ nhân tạo & Thị giác máy tính', description: '3 tín chỉ' },
                  { course_code: 'MOB102', title: 'Lập trình di động đa nền tảng React Native', description: '3 tín chỉ' },
                  { course_code: 'DB103', title: 'Cơ sở dữ liệu nâng cao & MySQL', description: '3 tín chỉ' },
                  { course_code: 'WEB104', title: 'Phát triển ứng dụng Web Flask & React', description: '4 tín chỉ' }
                ]).map((item, idx) => (
                  <View key={idx} style={{ backgroundColor: isDarkMode ? '#0f172a' : '#f8fafc', padding: 14, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: themeBorder }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <ThemedText style={{ fontSize: 15, fontWeight: '800', color: '#a855f7' }}>{item.course_code || 'COURSE'}</ThemedText>
                      <View style={{ backgroundColor: 'rgba(168, 85, 247, 0.1)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                        <ThemedText style={{ fontSize: 11, fontWeight: '700', color: '#a855f7' }}>{item.description || '3 tín chỉ'}</ThemedText>
                      </View>
                    </View>
                    <ThemedText style={{ fontSize: 14, fontWeight: '700', color: themeText, marginBottom: 4 }}>{item.title || item.name || 'Môn học'}</ThemedText>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                      <ThemedText style={{ fontSize: 12, color: '#10b981', fontWeight: '700' }}>● Đang giảng dạy</ThemedText>
                      <ThemedText style={{ fontSize: 12, color: themeTextSecondary }}>Chương trình Đào tạo</ThemedText>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* MODAL 0: DANH SÁCH LỚP HỌC PHẦN */}
        <Modal visible={showSectionsModal} animationType="slide" transparent={true} onRequestClose={() => setShowSectionsModal(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: themeCardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, height: '80%', borderWidth: 1, borderColor: themeBorder }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="book-outline" size={24} color="#3b82f6" style={{ marginRight: 8 }} />
                  <ThemedText style={{ fontSize: 18, fontWeight: '800', color: themeText }}>Danh sách Lớp học phần</ThemedText>
                </View>
                <TouchableOpacity onPress={() => setShowSectionsModal(false)}>
                  <Ionicons name="close-circle" size={26} color={themeTextSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {(sectionsList.length > 0 ? sectionsList : [
                  { section_code: 'AI101_25TH01', course_name: 'Trí tuệ nhân tạo', lecturer_name: 'Dương Anh Tuấn', space_name: 'Phòng thực hành 01', semester: 'HK2_25-26' },
                  { section_code: 'CS102_25TH02', course_name: 'Lập trình Di động', lecturer_name: 'Phan Văn Lộc', space_name: 'Phòng thực hành 02', semester: 'HK2_25-26' }
                ]).map((item, idx) => (
                  <View key={idx} style={{ backgroundColor: isDarkMode ? '#0f172a' : '#f8fafc', padding: 14, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: themeBorder }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <ThemedText style={{ fontSize: 15, fontWeight: '800', color: '#3b82f6' }}>{item.section_code || item.name}</ThemedText>
                      <View style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                        <ThemedText style={{ fontSize: 11, fontWeight: '700', color: '#3b82f6' }}>{item.semester || 'HK2'}</ThemedText>
                      </View>
                    </View>
                    <ThemedText style={{ fontSize: 14, fontWeight: '700', color: themeText, marginBottom: 4 }}>{item.course_name || item.course || 'Trí tuệ nhân tạo'}</ThemedText>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                      <ThemedText style={{ fontSize: 12, color: themeTextSecondary }}>👨‍🏫 {item.lecturer_name || item.lecturer || 'Giảng viên'}</ThemedText>
                      <ThemedText style={{ fontSize: 12, color: themeTextSecondary }}>🏫 {item.space_name || item.space || 'Phòng máy'}</ThemedText>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* MODAL RED LIST */}
        <Modal visible={showRedListModal} animationType="slide" transparent={true} onRequestClose={() => setShowRedListModal(false)}>
          <View style={styles.modalOverlay}>
            <ThemedView style={[styles.modalContent, { backgroundColor: themeBg, borderColor: themeBorder }]}>
              <View style={styles.modalHeader}>
                <ThemedText style={[styles.modalTitle, { color: themeText }]}>⚠️ Khoanh vùng Học sinh cá biệt</ThemedText>
                <TouchableOpacity onPress={() => setShowRedListModal(false)} style={[styles.closeBtn, { backgroundColor: themeBorder }]}><Ionicons name="close" size={24} color={themePrimary} /></TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={styles.modalGrid} showsVerticalScrollIndicator={false}>
                <ThemedText style={{fontSize: 12, color: themeTextSecondary, fontStyle: 'italic', marginBottom: 16, textAlign: 'center'}}>Danh sách mất tập trung liên tục ghi nhận trong tuần</ThemedText>
                {data?.red_list_details?.map((r: any, i: number) => (
                  <View key={'st_'+i} style={{padding: 16, borderWidth: 1, borderColor: themeBorder, backgroundColor: themeCardBg, borderRadius: 20, marginBottom: 12}}>
                    <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                      <View>
                        <ThemedText style={{fontWeight: '900', color: themeText, fontSize: 16}}>{r.name || 'N/A'}</ThemedText>
                        <ThemedText style={{color: themeTextSecondary, fontSize: 11, fontWeight: '700'}}>MSSV: {r.code || '---'}</ThemedText>
                      </View>
                      <ThemedText style={{backgroundColor: 'rgba(79, 70, 229, 0.2)', color: isDarkMode ? '#00f5d4' : '#4338ca', fontSize: 9, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8}}>CẢNH CÁO</ThemedText>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </ThemedView>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <>
    <ScrollView 
      style={[styles.container, { backgroundColor: themeBg }]} 
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* PROFILE HEADER (Same premium style as student) */}
      <View style={[styles.studentHeader, { backgroundColor: themeCardBg, borderBottomColor: themeBorder, paddingBottom: 16 }]}>
        <View style={styles.studentProfileRow}>
          <View style={[styles.studentAvatarOutline, { borderColor: themePrimary }]}>
            <View style={[styles.studentAvatarInner, { backgroundColor: themeBorder }]}>
              <ThemedText style={[styles.studentAvatarInitials, { color: themePrimary }]}>
                {(sInfo.name || sInfo.username || 'G').charAt(0).toUpperCase()}
              </ThemedText>
            </View>
            <View style={styles.studentStatusDot} />
          </View>
          <View style={styles.studentProfileInfo}>
            <ThemedText style={styles.studentGreetingText}>Xin chào,</ThemedText>
            <ThemedText style={[styles.studentNameHeader, { color: themeText }]}>{sInfo.name || sInfo.username}</ThemedText>
            <View style={[styles.studentUsernameBadge, { backgroundColor: themeBorder, borderColor: themeBorder }]}>
              <ThemedText style={styles.studentUsernameText}>@{sInfo.username || 'username'}</ThemedText>
              <TouchableOpacity onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}>
                <Ionicons name="copy-outline" size={12} color="#64748b" style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.studentHeaderActions}>
            <TouchableOpacity onPress={openStudentNotifications} style={[styles.studentHeaderIconBtn, { backgroundColor: themeBorder, borderColor: themeBorder }]}>
              <Ionicons name="notifications-outline" size={20} color={themeText} />
              {hasNewNotifications && <View style={styles.studentNotificationBadge} />}
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.studentProfileDetailsGrid, { borderTopColor: themeBorder, flexDirection: 'column', alignItems: 'flex-start' }]}>
          <View style={[styles.studentDetailGridItem, { marginBottom: 8 }]}>
            <Ionicons name="shield-checkmark-outline" size={14} color={themePrimary} />
            <ThemedText style={styles.studentDetailGridLabel}>Quyền hạn: </ThemedText>
            <ThemedText style={[styles.studentDetailGridVal, { color: themeText, fontWeight: '900', textTransform: 'uppercase' }]}>
              {user?.role === 'admin' ? 'Quản trị viên' : user?.role === 'advisor' ? 'Giáo viên chủ nhiệm' : 'Giảng viên hướng dẫn'}
            </ThemedText>
          </View>
          <View style={[styles.studentDetailGridItem, { marginBottom: 8 }]}>
            <Ionicons name="card-outline" size={14} color={themePrimary} />
            <ThemedText style={styles.studentDetailGridLabel}>Mã số cán bộ: </ThemedText>
            <ThemedText style={[styles.studentDetailGridVal, { color: themeText }]}>{sInfo.code || '---'}</ThemedText>
          </View>
          <View style={styles.studentDetailGridItem}>
            <Ionicons name="mail-outline" size={14} color={themePrimary} />
            <ThemedText style={styles.studentDetailGridLabel}>Email: </ThemedText>
            <ThemedText style={[styles.studentDetailGridVal, { color: themeText }]} numberOfLines={1}>{sInfo.email || '---'}</ThemedText>
          </View>
        </View>

        {data?.session_title && data.session_title !== "N/A" && (
          <View style={[styles.activeSessionBadge, { marginTop: 12, marginLeft: 0 }]}>
            <View style={styles.livePulse} />
            <ThemedText style={styles.activeSessionText}>Đang dạy: {data.session_title}</ThemedText>
          </View>
        )}
      </View>

      {user?.role === 'admin' ? (
        <View style={styles.statsGrid}>
          <StatCard title="👥 Tổng người dùng" value={data?.total_users || 0} icon="people" color="#4f46e5" isDarkMode={isDarkMode} />
          <StatCard title="🏫 Lớp sinh hoạt" value={data?.total_classes || 0} icon="business" color="#10b981" isDarkMode={isDarkMode} />
          <StatCard title="📚 Lớp học phần" value={data?.total_sections || 0} icon="book" color="#f59e0b" isDarkMode={isDarkMode} />
          <StatCard title="🎥 Phiên giám sát active" value={data?.active_sessions || 0} icon="videocam" color="#ef4444" isDarkMode={isDarkMode} fullWidth />
        </View>
      ) : (
        <View style={styles.statsGrid}>
          <StatCard title="🎓 Sĩ số lớp (Nhấn xem)" value={data?.total_students || 0} icon="people" color="#4f46e5" onPress={() => setShowStudentsModal(true)} isDarkMode={isDarkMode} />
          <StatCard title="🚨 Lỗi trong tuần" value={data?.weekly_violations || 0} icon="alert-circle" color="#f59e0b" isDarkMode={isDarkMode} />
          <StatCard title="⚠️ Học sinh cá biệt (Nhấn xem ds)" value={data?.red_list_count || 0} icon="warning" color="#ef4444" onPress={() => setShowRedListModal(true)} isDarkMode={isDarkMode} />
          <StatCard title="📧 Nhật ký gửi thư (Nhấn xem)" value={data?.warning_logs?.length || 0} icon="mail" color="#10b981" onPress={() => setShowEmailLogsModal(true)} isDarkMode={isDarkMode} />
        </View>
      )}

      {/* 1. CHART TREND (LINE) */}
      <View style={styles.sectionHeader}>
        <ThemedText style={[styles.sectionTitle, { color: themeText }]}>Diễn biến tập trung (%)</ThemedText>
      </View>
      <View style={[styles.chartContainer, { backgroundColor: themeCardBg, borderColor: themeBorder }]}>
        {trend && trend.focused.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <LineChart
                    data={{
                        labels: trend.labels.map((lbl, i) => i % 2 === 0 ? lbl : ''),
                        datasets: [{ 
                            data: trend.focused.map(v => isNaN(Number(v)) ? 0 : Number(v)), 
                            color: (opacity = 1) => isDarkMode ? `rgba(0, 245, 212, ${opacity})` : `rgba(79, 70, 229, ${opacity})`, 
                            strokeWidth: 3 
                        }]
                    }}
                    width={Math.max(width - 40, trend.labels.length * 45)} 
                    height={280} 
                    yAxisLabel="" 
                    yAxisSuffix="%"
                    chartConfig={currentChartConfig} 
                    bezier 
                    style={styles.chartStyle}
                    verticalLabelRotation={60} 
                />
            </ScrollView>
        ) : (
            <View style={styles.noChart}><ActivityIndicator color={themePrimary} /><ThemedText style={[styles.noChartText, { color: themeTextSecondary }]}>Đang nạp diễn biến...</ThemedText></View>
        )}
      </View>

      {/* 2. CHART ROOM ANALYTICS (STACKED BAR) */}
      <View style={styles.sectionHeader}>
        <ThemedText style={[styles.sectionTitle, { color: themeText }]}>Phân tích mất tập trung theo phòng</ThemedText>
      </View>
      <View style={[styles.chartContainer, { backgroundColor: themeCardBg, borderColor: themeBorder }]}>
        {roomStats && roomStats.labels.length > 0 ? (
            <View style={styles.barChartBox}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <StackedBarChart
                        data={{
                            labels: roomStats.labels,
                            legend: roomStats.legend,
                            data: roomStats.data,
                            barColors: ["#f59e0b", "#ef4444"]
                        }}
                        width={Math.max(width - 50, roomStats.labels.length * 150)} // Nới rộng hẳn ra 150px mỗi phòng để không bị chạm chữ
                        height={220}
                        chartConfig={{
                            ...currentChartConfig,
                            backgroundGradientFrom: themeCardBg,
                            backgroundGradientTo: themeCardBg,
                            color: (opacity = 1) => themeText,
                        }}
                        style={styles.chartStyle}
                        hideLegend={false}
                    />
                </ScrollView>
            </View>
        ) : (
            <View style={styles.noChart}><ActivityIndicator color="#ef4444" /><ThemedText style={[styles.noChartText, { color: themeTextSecondary }]}>Đang nạp phân tích phòng...</ThemedText></View>
        )}
      </View>

      {/* PHẦN 3: ALBUM HỌC SINH */}
      <View style={styles.sectionHeader}>
        <ThemedText style={[styles.sectionTitle, { color: themeText }]}>📸 Album hình ảnh minh chứng sinh viên</ThemedText>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.albumScroll}>
        {studentGroups.map((group, index) => (
          <TouchableOpacity key={index} style={[styles.albumCard, { borderColor: themeBorder, borderWidth: 1 }]} onPress={() => { setSelectedRoom(group); setShowDetail(true); }}>
            <Image source={{ uri: getFullUrl(group.items[0].image_path) }} style={styles.albumImage} />
            {group.items.length > 1 && <View style={[styles.plusOverlay, { backgroundColor: themeBorder }]}><ThemedText style={[styles.plusText, { color: themeText }]}>+{group.items.length - 1}</ThemedText></View>}
            <View style={styles.albumOverlay}>
              <ThemedText style={styles.albumRoom}>{group.space_name}</ThemedText>
              <ThemedText style={styles.albumBehavior}>{group.items[0].behavior === 'using_phone' ? '📱 Điện thoại' : '😴 Ngủ gật'}</ThemedText>
            </View>
          </TouchableOpacity>
        ))}
        {studentGroups.length === 0 && <ThemedText style={[styles.noData, { color: themeTextSecondary }]}>Chưa ghi nhận hành vi mất tập trung của sinh viên</ThemedText>}
      </ScrollView>

      {/* PHẦN 4: ALBUM NGƯỜI LẠ */}
      <View style={styles.sectionHeader}>
        <ThemedText style={[styles.sectionTitle, {color: '#ef4444'}]}>🚨 Cảnh báo an ninh (Người lạ)</ThemedText>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.albumScroll}>
        {strangerGroups.map((group, index) => (
          <TouchableOpacity key={index} style={[styles.albumCard, {borderColor: '#ef4444', borderWidth: 1}]} onPress={() => { setSelectedRoom(group); setShowDetail(true); }}>
            <Image source={{ uri: getFullUrl(group.items[0].image_path) }} style={styles.albumImage} />
            {group.items.length > 1 && <View style={[styles.plusOverlay, {backgroundColor: '#ef4444'}]}><ThemedText style={[styles.plusText, {color: '#fff'}]}>+{group.items.length - 1}</ThemedText></View>}
            <View style={[styles.albumOverlay, {backgroundColor: 'rgba(239, 68, 68, 0.7)'}]}>
              <ThemedText style={styles.albumRoom}>{group.space_name}</ThemedText>
              <ThemedText style={[styles.albumBehavior, {color: '#fee2e2'}]}>Phát hiện người lạ</ThemedText>
            </View>
          </TouchableOpacity>
        ))}
        {strangerGroups.length === 0 && <ThemedText style={[styles.noData, {color: '#10b981'}]}>Hiện đang an toàn</ThemedText>}
      </ScrollView>

      <View style={{ height: 40 }} />
    </ScrollView>

    {/* MODAL CHI TIẾT CA HỌC */}
    <Modal visible={showDetail} animationType="slide" transparent={true} onRequestClose={() => setShowDetail(false)}>
      <View style={styles.modalOverlay}>
          <ThemedView style={[styles.modalContent, { backgroundColor: themeBg, borderColor: themeBorder }]}>
              <View style={styles.modalHeader}>
                  <ThemedText style={[styles.modalTitle, { color: themeText }]}>Mất tập trung tại {selectedRoom?.space_name}</ThemedText>
                  <TouchableOpacity onPress={() => setShowDetail(false)} style={[styles.closeBtn, { backgroundColor: themeBorder }]}><Ionicons name="close" size={24} color={themePrimary} /></TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={styles.modalGrid} showsVerticalScrollIndicator={false}>
                  {selectedRoom?.items.map((v, i) => {
                      const isStranger = v.student_name?.includes("Người lạ");
                      return (
                          <View key={i} style={[styles.modalEvidenceItem, { backgroundColor: themeCardBg, borderColor: themeBorder }, isStranger && { borderColor: '#ef4444', borderWidth: 1 }]}>
                              <Image source={{ uri: getFullUrl(v.image_path) }} style={styles.modalImg} />
                              <View style={styles.modalEvidenceInfo}>
                                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <ThemedText style={[styles.modalBehaviorText, { color: themeText }, isStranger && { color: '#ef4444' }]}>
                                          {v.behavior === 'using_phone' ? '📱 Điện thoại' : '😴 Ngủ gật'}
                                      </ThemedText>
                                      <ThemedText style={{ fontSize: 10, color: themeTextSecondary, fontWeight: 'bold' }}>{v.student_code || '---'}</ThemedText>
                                  </View>
                                  <ThemedText style={{ fontSize: 12, fontWeight: '900', color: themeText }} numberOfLines={1}>
                                      {v.student_name || 'N/A'}
                                  </ThemedText>
                                  <ThemedText style={[styles.modalTimeText, { color: themeTextSecondary }]}>{v.time || 'N/A'}</ThemedText>
                              </View>
                              {isStranger && (
                                  <View style={{ position: 'absolute', top: 5, right: 5, backgroundColor: '#ef4444', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 }}>
                                      <ThemedText style={{ color: 'white', fontSize: 8, fontWeight: 'bold' }}>NGƯỜI LẠ</ThemedText>
                                  </View>
                              )}
                          </View>
                      );
                  })}
              </ScrollView>
          </ThemedView>
      </View>
    </Modal>

    {/* MODAL 1: Sĩ số lớp */}
    <Modal visible={showStudentsModal} animationType="slide" transparent={true} onRequestClose={() => setShowStudentsModal(false)}>
      <View style={styles.modalOverlay}>
          <ThemedView style={[styles.modalContent, { backgroundColor: themeBg, borderColor: themeBorder }]}>
              <View style={styles.modalHeader}>
                  <ThemedText style={[styles.modalTitle, { color: themeText }]}>Danh sách lớp</ThemedText>
                  <TouchableOpacity onPress={() => setShowStudentsModal(false)} style={[styles.closeBtn, { backgroundColor: themeBorder }]}><Ionicons name="close" size={24} color={themePrimary} /></TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={styles.modalGrid} showsVerticalScrollIndicator={false}>
                  {data?.students_list?.map((s, i) => (
                      <View key={i} style={{flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderColor: themeBorder, backgroundColor: themeCardBg, borderRadius: 12, marginBottom: 8}}>
                          <ThemedText style={{fontWeight: '900', color: themeText}}>{s.name}</ThemedText>
                          <ThemedText style={{color: themeTextSecondary, fontWeight: 'bold'}}>{s.code}</ThemedText>
                      </View>
                  ))}
                  {(!data?.students_list || data.students_list.length === 0) && <ThemedText style={[styles.noData, { color: themeTextSecondary }]}>Lớp chưa có sinh viên nào.</ThemedText>}
              </ScrollView>
          </ThemedView>
      </View>
    </Modal>

    {/* MODAL 2: Danh sách đỏ */}
    <Modal visible={showRedListModal} animationType="slide" transparent={true} onRequestClose={() => setShowRedListModal(false)}>
      <View style={styles.modalOverlay}>
          <ThemedView style={[styles.modalContent, { backgroundColor: themeBg, borderColor: themeBorder }]}>
              <View style={styles.modalHeader}>
                  <ThemedText style={[styles.modalTitle, { color: themeText }]}>⚠️ Khoanh vùng Học sinh cá biệt</ThemedText>
                  <TouchableOpacity onPress={() => setShowRedListModal(false)} style={[styles.closeBtn, { backgroundColor: themeBorder }]}><Ionicons name="close" size={24} color={themePrimary} /></TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={styles.modalGrid} showsVerticalScrollIndicator={false}>
                  <ThemedText style={{fontSize: 12, color: themeTextSecondary, fontStyle: 'italic', marginBottom: 16, textAlign: 'center'}}>Danh sách mất tập trung liên tục ghi nhận trong tuần</ThemedText>
                  
                  {/* PHẦN 1: HỌC SINH */}
                  <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 12, marginTop: 8}}>
                      <View style={{width: 4, height: 16, backgroundColor: themePrimary, borderRadius: 2, marginRight: 8}} />
                      <ThemedText style={{fontSize: 14, fontWeight: '900', color: themeText, textTransform: 'uppercase'}}>Sinh viên cần hỗ trợ</ThemedText>
                  </View>
                  {data?.red_list_details?.filter(r => !(r.name || "").includes("Người lạ")).map((r, i) => (
                      <View key={'st_'+i} style={{padding: 16, borderWidth: 1, borderColor: themeBorder, backgroundColor: themeCardBg, borderRadius: 20, marginBottom: 12}}>
                          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                              <View>
                                  <ThemedText style={{fontWeight: '900', color: themeText, fontSize: 16}}>{r.name || 'N/A'}</ThemedText>
                                  <ThemedText style={{color: themeTextSecondary, fontSize: 11, fontWeight: '700'}}>MSSV: {r.code || '---'}</ThemedText>
                              </View>
                              <ThemedText style={{backgroundColor: 'rgba(79, 70, 229, 0.2)', color: isDarkMode ? '#00f5d4' : '#4338ca', fontSize: 9, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8}}>CẢNH CÁO</ThemedText>
                          </View>
                          <ThemedText style={{color: themeTextSecondary, marginTop: 8, fontWeight: '700', fontSize: 11}}>• Mất tập trung: {r.days || 0} ngày | {r.errors || 0} lỗi</ThemedText>
                      </View>
                  ))}
                  {data?.red_list_details?.filter(r => !(r.name || "").includes("Người lạ")).length === 0 && <ThemedText style={[styles.noData, { color: themeTextSecondary }]}>Không có sinh viên cần hỗ trợ đặc biệt.</ThemedText>}

                  {/* PHẦN 2: NGƯỜI LẠ */}
                  <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 12, marginTop: 24}}>
                      <View style={{width: 4, height: 16, backgroundColor: '#ef4444', borderRadius: 2, marginRight: 8}} />
                      <ThemedText style={{fontSize: 14, fontWeight: '900', color: '#ef4444', textTransform: 'uppercase'}}>Đối tượng chưa nhận diện</ThemedText>
                  </View>
                  {data?.red_list_details?.filter(r => (r.name || "").includes("Người lạ")).map((r, i) => (
                      <View key={'str_'+i} style={{padding: 16, borderWidth: 1, borderColor: '#fca5a5', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 20, marginBottom: 12}}>
                          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                              <View>
                                  <ThemedText style={{fontWeight: '900', color: '#ef4444', fontSize: 16}}>{r.name || 'Người lạ'}</ThemedText>
                                  <ThemedText style={{color: '#ef4444', fontSize: 11, fontWeight: '700'}}>ĐỐI TƯỢNG LẠ</ThemedText>
                              </View>
                              <ThemedText style={{backgroundColor: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8}}>KHẨN CẤP</ThemedText>
                          </View>
                          <ThemedText style={{color: '#ef4444', marginTop: 8, fontWeight: '700', fontSize: 11}}>• Số lượt quét được: {r.errors || 0} lượt</ThemedText>
                      </View>
                  ))}
                  {data?.red_list_details?.filter(r => (r.name || "").includes("Người lạ")).length === 0 && <ThemedText style={[styles.noData, {color: '#10b981'}]}>Khu vực hiện tại an toàn.</ThemedText>}
              </ScrollView>
          </ThemedView>
      </View>
    </Modal>

        {/* MODAL: Nhật ký gửi thư cảnh báo (Advisor Email Logs) */}
      <Modal visible={showEmailLogsModal} animationType="slide" transparent={true} onRequestClose={() => setShowEmailLogsModal(false)}>
        <View style={styles.modalOverlay}>
          <ThemedView style={[styles.modalContent, { backgroundColor: themeBg, borderColor: themeBorder }]}>
            <View style={styles.modalHeader}>
              <ThemedText style={[styles.modalTitle, { color: themeText }]}>📧 Nhật ký gửi thư cảnh báo</ThemedText>
              <TouchableOpacity onPress={() => setShowEmailLogsModal(false)} style={[styles.closeBtn, { backgroundColor: themeBorder }]}><Ionicons name="close" size={24} color={themePrimary} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalGrid} showsVerticalScrollIndicator={false}>
              <ThemedText style={{fontSize: 12, color: themeTextSecondary, fontStyle: 'italic', marginBottom: 16, textAlign: 'center'}}>Lịch sử gửi email cảnh báo tự động học vụ</ThemedText>
              
              {data?.warning_logs?.map((log: any, idx: number) => (
                <View key={'email_'+idx} style={{padding: 16, borderWidth: 1, borderColor: themeBorder, backgroundColor: themeCardBg, borderRadius: 20, marginBottom: 12}}>
                  <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <ThemedText style={{fontWeight: '900', color: themeText, fontSize: 16}}>{log.student_name || 'Sinh viên'}</ThemedText>
                      <ThemedText style={{color: themeTextSecondary, fontSize: 11, fontWeight: '700'}}>MSSV: {log.student_code || '---'}</ThemedText>
                      <ThemedText style={{color: themePrimary, fontSize: 12, fontWeight: '600', marginTop: 4}} numberOfLines={1}>Gửi tới: {log.recipient || '---'}</ThemedText>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <ThemedText style={{backgroundColor: '#10b981', color: '#fff', fontSize: 9, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8}}>SUCCESS</ThemedText>
                      <ThemedText style={{color: themeTextSecondary, fontSize: 10, fontWeight: 'bold', marginTop: 8}}>Lần gửi: {log.total_warnings || 1}</ThemedText>
                    </View>
                  </View>
                  <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 4}}>
                    <Ionicons name="time-outline" size={12} color={themeTextSecondary} />
                    <ThemedText style={{color: themeTextSecondary, fontSize: 11, fontWeight: '700'}}>Gửi lúc: {log.time}</ThemedText>
                  </View>
                </View>
              ))}
              {(!data?.warning_logs || data.warning_logs.length === 0) && (
                <ThemedText style={[styles.noData, { color: themeTextSecondary }]}>Chưa có email cảnh báo nào được gửi đi.</ThemedText>
              )}
            </ScrollView>
          </ThemedView>
        </View>
      </Modal>

  {/* MODAL 3: Cài đặt hệ thống */}
    <Modal
      visible={showSettingsModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowSettingsModal(false)}
    >
      <View style={styles.modalOverlay}>
        <ThemedView style={[styles.modalContent, styles.settingsModalContent, { backgroundColor: themeBg, borderColor: themeBorder }]}>
          <View style={styles.modalHeader}>
            <ThemedText style={[styles.modalTitle, { color: themeText }]}>Cài đặt hệ thống</ThemedText>
            <TouchableOpacity 
              onPress={() => setShowSettingsModal(false)} 
              style={[styles.closeBtn, { backgroundColor: themeBorder }]}
            >
              <Ionicons name="close" size={20} color={themePrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.settingsScrollContent} showsVerticalScrollIndicator={false}>
            {/* THÔNG TIN CÁ NHÂN */}
            <View style={styles.settingsSection}>
              <ThemedText style={styles.settingsSectionTitle}>Thông tin cá nhân</ThemedText>
              <View style={[styles.settingsCard, { backgroundColor: themeCardBg, borderColor: themeBorder }]}>
                <View style={styles.settingsInfoRow}>
                  <ThemedText style={styles.settingsInfoLabel}>Tên đăng nhập:</ThemedText>
                  <ThemedText style={[styles.settingsInfoVal, { color: themeText }]}>@{user.username || '---'}</ThemedText>
                </View>
                <View style={styles.settingsInfoRow}>
                  <ThemedText style={styles.settingsInfoLabel}>Mã số cán bộ:</ThemedText>
                  <ThemedText style={[styles.settingsInfoVal, { color: themeText }]}>{user.code || '---'}</ThemedText>
                </View>
                
                <View style={{ marginTop: 12 }}>
                  <ThemedText style={styles.settingsInfoLabel}>Họ và tên:</ThemedText>
                  <View style={{ flexDirection: 'row', marginTop: 6 }}>
                    <TextInput
                      style={[styles.settingsInput, { backgroundColor: themeBorder, borderColor: themeBorder, color: themeText }]}
                      value={settingsName}
                      onChangeText={setSettingsName}
                      placeholder="Nhập họ và tên..."
                      placeholderTextColor="#64748b"
                    />
                    <TouchableOpacity 
                      style={[styles.settingsActionBtn, { backgroundColor: themePrimary }]} 
                      onPress={handleUpdateName}
                      disabled={updatingName}
                    >
                      {updatingName ? (
                        <ActivityIndicator size="small" color={isDarkMode ? '#030f16' : '#fff'} />
                      ) : (
                        <ThemedText style={[styles.settingsActionBtnText, { color: isDarkMode ? '#030f16' : '#fff' }]}>Lưu</ThemedText>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>

            {/* CHẾ ĐỘ GIAO DIỆN */}
            <View style={styles.settingsSection}>
              <ThemedText style={styles.settingsSectionTitle}>Cá nhân hóa</ThemedText>
              <TouchableOpacity 
                style={[styles.settingsCard, { backgroundColor: themeCardBg, borderColor: themeBorder }]}
                activeOpacity={0.8}
                onPress={toggleDarkMode}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <ThemedText style={styles.settingsInfoLabel}>Chế độ giao diện tối</ThemedText>
                    <ThemedText style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Sử dụng tông màu tối để bảo vệ mắt</ThemedText>
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

            {/* EMAIL NHẬN THÔNG BÁO */}
            <View style={styles.settingsSection}>
              <ThemedText style={styles.settingsSectionTitle}>Cấu hình thông báo</ThemedText>
              <View style={[styles.settingsCard, { backgroundColor: themeCardBg, borderColor: themeBorder }]}>
                <View style={styles.settingsInfoRow}>
                  <ThemedText style={styles.settingsInfoLabel}>Email nhận cảnh báo:</ThemedText>
                  <ThemedText style={[styles.settingsInfoVal, { color: themeText }]}>{user.email || '---'}</ThemedText>
                </View>
                <ThemedText style={{ fontSize: 11, color: '#64748b', marginTop: 8, fontStyle: 'italic' }}>
                  * Email được quản lý bởi hệ thống nhà trường, không thể tự chỉnh sửa.
                </ThemedText>
              </View>
            </View>

            {/* ĐỔI MẬT KHẨU */}
            <View style={styles.settingsSection}>
              <ThemedText style={styles.settingsSectionTitle}>Bảo mật</ThemedText>
              <View style={[styles.settingsCard, { backgroundColor: themeCardBg, borderColor: themeBorder }]}>
                <ThemedText style={styles.settingsInfoLabel}>Mật khẩu cũ:</ThemedText>
                <TextInput
                  style={[styles.settingsInput, { width: '100%', marginTop: 6, marginBottom: 12, backgroundColor: themeBorder, borderColor: themeBorder, color: themeText }]}
                  value={settingsOldPassword}
                  onChangeText={setSettingsOldPassword}
                  secureTextEntry
                  placeholder="Nhập mật khẩu hiện tại..."
                  placeholderTextColor="#64748b"
                />

                <ThemedText style={styles.settingsInfoLabel}>Mật khẩu mới:</ThemedText>
                <TextInput
                  style={[styles.settingsInput, { width: '100%', marginTop: 6, marginBottom: 12, backgroundColor: themeBorder, borderColor: themeBorder, color: themeText }]}
                  value={settingsNewPassword}
                  onChangeText={setSettingsNewPassword}
                  secureTextEntry
                  placeholder="Nhập mật khẩu mới..."
                  placeholderTextColor="#64748b"
                />

                <ThemedText style={styles.settingsInfoLabel}>Xác nhận mật khẩu mới:</ThemedText>
                <TextInput
                  style={[styles.settingsInput, { width: '100%', marginTop: 6, marginBottom: 16, backgroundColor: themeBorder, borderColor: themeBorder, color: themeText }]}
                  value={settingsConfirmPassword}
                  onChangeText={setSettingsConfirmPassword}
                  secureTextEntry
                  placeholder="Nhập lại mật khẩu mới..."
                  placeholderTextColor="#64748b"
                />

                <TouchableOpacity 
                  style={[styles.settingsSubmitBtn, { backgroundColor: isDarkMode ? '#4f46e5' : '#4f46e5' }]} 
                  onPress={handleChangePassword}
                  disabled={updatingPassword}
                >
                  {updatingPassword ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <ThemedText style={styles.settingsSubmitBtnText}>Đổi mật khẩu</ThemedText>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* ĐĂNG XUẤT */}
            <TouchableOpacity 
              style={styles.settingsLogoutBtn} 
              onPress={() => {
                setShowSettingsModal(false);
                logout();
              }}
            >
              <Ionicons name="log-out-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
              <ThemedText style={styles.settingsLogoutBtnText}>Đăng xuất tài khoản</ThemedText>
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        </ThemedView>
      </View>
    </Modal>

    <NotificationModal 
      visible={showNotificationsModal} 
      onClose={() => setShowNotificationsModal(false)} 
      notifications={notifications} 
    />
    </>
  );
}

function StatCard({ title, value, icon, color, onPress, fullWidth, isDarkMode }: { title: string; value: number | string; icon: any; color: string; onPress?: () => void; fullWidth?: boolean; isDarkMode?: boolean; }) {
  const cardBg = isDarkMode ? '#081a24' : '#ffffff';
  const cardBorder = isDarkMode ? '#122c3b' : '#f1f5f9';
  const textColor = isDarkMode ? '#ffffff' : '#1e293b';

  const content = (
    <>
      <View style={[styles.iconContainer, { backgroundColor: color + '15' }]}><Ionicons name={icon} size={22} color={color} /></View>
      <ThemedText style={[styles.cardTitle, { color: isDarkMode ? '#94a3b8' : '#64748b' }]}>{title}</ThemedText>
      <View style={styles.valueRow}>
        <ThemedText style={[styles.cardValue, { color: textColor }]}>{value}</ThemedText>
      </View>
    </>
  );
  
  if (onPress) {
      return <TouchableOpacity style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }, fullWidth && { width: '100%' }]} onPress={onPress} activeOpacity={0.7}>{content}</TouchableOpacity>;
  }
  return <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }, fullWidth && { width: '100%' }]}>{content}</View>;
}

const chartConfig = {
    backgroundColor: "#fff",
    backgroundGradientFrom: "#fff",
    backgroundGradientTo: "#fff",
    decimalPlaces: 1,
    color: (opacity = 1) => `rgba(79, 70, 229, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(100, 116, 139, ${opacity})`,
    propsForDots: { r: "4", strokeWidth: "2", stroke: "#4f46e5" },
    fillShadowGradient: "#4f46e5",
    fillShadowGradientOpacity: 0.1,
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { padding: 24, paddingTop: 60, backgroundColor: '#fff' },
  welcomeText: { color: '#64748b', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  headerTitle: { color: '#1e293b', fontSize: 26, fontWeight: '900', marginTop: 4 },
  activeSessionBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ecfdf5', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, marginTop: 12, borderWidth: 1, borderColor: '#10b98130' },
  livePulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10b981', marginRight: 8 },
  activeSessionText: { color: '#065f46', fontSize: 12, fontWeight: '800' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 16, justifyContent: 'space-between' },
  card: { width: '48%', backgroundColor: '#fff', borderRadius: 24, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#f1f5f9', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  iconContainer: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 11, fontWeight: '700', color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase' },
  valueRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  cardValue: { fontSize: 20, fontWeight: '900', color: '#1e293b' },
  cardPercentage: { fontSize: 11, fontWeight: '800', marginBottom: 3 },
  sectionHeader: { paddingHorizontal: 24, marginVertical: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: '#1e293b', textTransform: 'uppercase', letterSpacing: 0.5 },
  chartContainer: { paddingHorizontal: 20, marginBottom: 10, paddingBottom: 40 },
  chartStyle: { marginVertical: 8, borderRadius: 24 },
  barChartBox: { backgroundColor: '#fff', borderRadius: 24, padding: 10, borderWidth: 1, borderColor: '#f1f5f9' },
  noChart: { height: 180, backgroundColor: '#fff', borderRadius: 24, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#f1f5f9' },
  noChartText: { marginTop: 10, fontSize: 12, color: '#94a3b8', fontWeight: '600' },
  statusBox: { marginHorizontal: 24, padding: 20, backgroundColor: '#fff', borderRadius: 24, flexDirection: 'row', alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#f1f5f9' },
  statusIndicator: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  statusText: { fontSize: 15, fontWeight: '800', color: '#1e293b' },
  albumScroll: { paddingLeft: 24, marginBottom: 20 },
  albumCard: { width: 220, height: 150, marginRight: 16, borderRadius: 24, overflow: 'hidden', backgroundColor: '#000' },
  albumImage: { width: '100%', height: '100%', opacity: 0.7 },
  plusOverlay: { position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(255,255,255,0.9)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, zIndex: 10 },
  plusText: { color: '#1e293b', fontSize: 12, fontWeight: '900' },
  albumOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: 'rgba(0,0,0,0.6)' },
  albumRoom: { color: '#fff', fontSize: 16, fontWeight: '900' },
  albumBehavior: { color: '#cbd5e1', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginTop: 2 },
  noData: { opacity: 0.4, fontStyle: 'italic', paddingVertical: 20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', height: '80%', borderTopLeftRadius: 36, borderTopRightRadius: 36, padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#1e293b' },
  closeBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
  modalGrid: { paddingBottom: 40 },
  modalEvidenceItem: { marginBottom: 20, backgroundColor: '#f8fafc', borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: '#f1f5f9' },
  modalImg: { width: '100%', height: 200, objectFit: 'cover' },
  modalEvidenceInfo: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalBehaviorText: { fontSize: 14, fontWeight: '800', color: '#1e293b' },
  modalTimeText: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  studentScrollContainer: {
    backgroundColor: '#030f16',
  },
  studentHeader: {
    backgroundColor: '#081a24',
    borderBottomWidth: 1,
    borderBottomColor: '#122c3b',
    padding: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    marginBottom: 16,
  },
  studentProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  studentAvatarOutline: {
    position: 'relative',
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#00f5d4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  studentAvatarInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#122c3b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  studentAvatarInitials: {
    fontSize: 22,
    fontWeight: '900',
    color: '#00f5d4',
  },
  studentStatusDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10b981',
    borderWidth: 2,
    borderColor: '#081a24',
  },
  studentProfileInfo: {
    flex: 1,
  },
  studentGreetingText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  studentNameHeader: {
    fontSize: 20,
    fontWeight: '900',
    color: '#fff',
    marginTop: 2,
  },
  studentUsernameBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(18, 44, 59, 0.6)',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#122c3b',
  },
  studentUsernameText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  studentHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  studentHeaderIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#122c3b',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
    position: 'relative',
    borderWidth: 1,
    borderColor: '#1e3e52',
  },
  studentNotificationBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  studentProfileDetailsGrid: {
    flexDirection: 'row',
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#122c3b',
    paddingTop: 16,
  },
  studentDetailGridItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  studentDetailGridLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    marginLeft: 6,
  },
  studentDetailGridVal: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
  studentStatsOverviewContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  studentFocusLeftCard: {
    flex: 1.1,
    backgroundColor: '#081a24',
    borderWidth: 1,
    borderColor: '#122c3b',
    borderRadius: 24,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  studentStatsCardTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#00f5d4',
    letterSpacing: 1,
    marginBottom: 8,
  },
  studentCircularProgressWrapper: {
    position: 'relative',
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  studentCircularProgressTextContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  studentCircularProgressVal: {
    fontSize: 24,
    fontWeight: '900',
    color: '#fff',
  },
  studentCircularProgressLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#00f5d4',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  studentStatsRightCol: {
    flex: 1,
    justifyContent: 'space-between',
  },
  studentTrendsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#081a24',
    borderWidth: 1,
    borderColor: '#122c3b',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
  },
  studentTrendsLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
  },
  studentTrendsValue: {
    fontSize: 10,
    fontWeight: '800',
    color: '#10b981',
  },
  studentMiniGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  studentMiniCard: {
    width: '48%',
    backgroundColor: '#081a24',
    borderWidth: 1,
    borderColor: '#122c3b',
    borderRadius: 16,
    padding: 10,
  },
  studentMiniCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  studentMiniIconBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  studentMiniCardVal: {
    fontSize: 16,
    fontWeight: '900',
    color: '#fff',
  },
  studentMiniCardLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 4,
  },
  studentMiniChartContainer: {
    marginTop: 6,
    height: 15,
    overflow: 'hidden',
  },
  studentSection: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  studentSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  studentSectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.5,
    marginLeft: 8,
  },
  studentCardList: {
    backgroundColor: '#081a24',
    borderWidth: 1,
    borderColor: '#122c3b',
    borderRadius: 24,
    padding: 16,
  },
  timelineWrapper: {
    position: 'relative',
    paddingLeft: 12,
  },
  timelineLine: {
    position: 'absolute',
    left: 20,
    top: 15,
    bottom: 15,
    width: 2,
    backgroundColor: '#122c3b',
  },
  studentTimelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 18,
    position: 'relative',
  },
  timelineIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: '#081a24',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    zIndex: 2,
  },
  timelineContent: {
    flex: 1,
    backgroundColor: 'rgba(18, 44, 59, 0.4)',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#122c3b',
  },
  timelineBehaviorText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  timelineStatusBadge: {
    backgroundColor: 'rgba(0, 245, 212, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  timelineStatusText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#00f5d4',
  },
  timelineSessionText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 4,
  },
  timelineTimeText: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '700',
  },
  studentRecommendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#081a24',
    borderWidth: 1,
    borderColor: 'rgba(0, 245, 212, 0.3)',
    borderRadius: 24,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 24,
  },
  studentRecommendLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  studentRecommendIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 245, 212, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  studentRecommendTextCol: {
    flex: 1,
  },
  studentRecommendTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#00f5d4',
    textTransform: 'uppercase',
  },
  studentRecommendSub: {
    fontSize: 14,
    fontWeight: '900',
    color: '#fff',
    marginTop: 2,
  },
  studentRecommendDesc: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 4,
  },
  studentRecommendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 245, 212, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  studentTabContainer: {
    flexDirection: 'row',
    backgroundColor: '#081a24',
    borderRadius: 16,
    padding: 4,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#122c3b',
  },
  studentTabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
  },
  studentTabButtonActive: {
    backgroundColor: '#00f5d4',
    shadowColor: '#00f5d4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  studentTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    marginLeft: 6,
  },
  studentTabTextActive: {
    color: '#030f16',
  },
  studentShowMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#122c3b',
    borderRadius: 12,
    backgroundColor: '#122c3b',
  },
  studentShowMoreText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#00f5d4',
    marginRight: 4,
  },
  studentEmptyState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  studentEmptyText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '700',
    marginTop: 10,
  },
  settingsModalContent: {
    backgroundColor: '#030f16',
    borderWidth: 1,
    borderColor: '#122c3b',
    height: '90%',
  },
  settingsScrollContent: {
    paddingBottom: 40,
  },
  settingsSection: {
    marginBottom: 20,
  },
  settingsSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#00f5d4',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  settingsCard: {
    backgroundColor: '#081a24',
    borderWidth: 1,
    borderColor: '#122c3b',
    borderRadius: 16,
    padding: 16,
  },
  settingsInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(18, 44, 59, 0.4)',
  },
  settingsInfoLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  settingsInfoVal: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
  },
  settingsInput: {
    flex: 1,
    height: 44,
    backgroundColor: '#122c3b',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e3e52',
    color: '#fff',
    paddingHorizontal: 12,
    fontSize: 13,
    fontWeight: '600',
  },
  settingsActionBtn: {
    backgroundColor: '#00f5d4',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginLeft: 10,
    height: 44,
  },
  settingsActionBtnText: {
    color: '#030f16',
    fontSize: 13,
    fontWeight: '900',
  },
  settingsSubmitBtn: {
    backgroundColor: '#4f46e5',
    borderRadius: 8,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  settingsSubmitBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
  },
  settingsLogoutBtn: {
    flexDirection: 'row',
    backgroundColor: '#ef4444',
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  settingsLogoutBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  adminHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 55,
    paddingBottom: 15,
    borderBottomWidth: 1,
  },
  adminMenuBtn: {
    marginRight: 15,
  },
  adminHeaderTitleBox: {
    flex: 1,
  },
  adminHeaderGreeting: {
    fontSize: 18,
    fontWeight: '900',
  },
  adminHeaderSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  adminNotificationBtn: {
    position: 'relative',
    padding: 4,
  },
  adminNotificationBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#ef4444',
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  adminNotificationBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
  },
  adminMetricsScroll: {
    marginTop: 5,
  },
  adminMetricCard: {
    width: 145,
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    justifyContent: 'space-between',
  },
  adminMetricIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  adminMetricLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  adminMetricValue: {
    fontSize: 22,
    fontWeight: '900',
    marginVertical: 4,
  },
  adminMetricTrendGreen: {
    color: '#10b981',
    fontSize: 10,
    fontWeight: '800',
  },
  adminMetricTrendOrange: {
    color: '#f59e0b',
    fontSize: 10,
    fontWeight: '800',
  },
  adminMetricTrendRed: {
    color: '#ef4444',
    fontSize: 10,
    fontWeight: '800',
  },
  adminSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 25,
    marginBottom: 15,
  },
  adminSectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  adminLiveRoomsScroll: {
    paddingBottom: 5,
  },
  adminLiveRoomCard: {
    width: 280,
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  adminLiveRoomImgContainer: {
    position: 'relative',
    height: 150,
  },
  adminLiveRoomImg: {
    width: '100%',
    height: '100%',
  },
  adminLiveRoomBadgeRow: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  adminLiveRoomBadgeActive: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.95)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  adminLiveRoomBadgeDot: {
    display: 'none',
  },
  adminLiveRoomBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
  },
  adminLiveRoomBadgeCount: {
    backgroundColor: 'rgba(3, 15, 22, 0.7)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  adminLiveRoomBadgeCountText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  adminLiveRoomInfo: {
    padding: 16,
  },
  adminLiveRoomCode: {
    fontSize: 18,
    fontWeight: '900',
  },
  adminLiveRoomStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  adminLiveRoomStatLabel: {
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  adminLiveRoomStatVal: {
    fontSize: 12,
    fontWeight: '800',
  },
  adminLiveRoomUpdateTime: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 10,
    textAlign: 'right',
  },
  adminEventsList: {
    marginHorizontal: 16,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  adminEventItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  adminEventTimeBox: {
    width: 48,
  },
  adminEventTimeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  adminEventIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  adminEventContent: {
    flex: 1,
  },
  adminEventTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  adminEventSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  adminEventRoom: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  adminEventStatusBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  adminEventStatusBadgeText: {
    color: '#10b981',
    fontSize: 10,
    fontWeight: '800',
  },
  adminEventThumb: {
    width: 50,
    height: 34,
    borderRadius: 6,
    backgroundColor: '#122c3b',
  },
  adminQuickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    gap: 10,
    marginTop: 5,
  },
  adminQuickActionBtn: {
    width: '48%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    alignItems: 'center',
  },
  adminQuickActionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  adminQuickActionText: {
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 16,
  },
});