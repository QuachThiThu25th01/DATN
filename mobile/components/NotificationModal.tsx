import React from 'react';
import {
  StyleSheet,
  View,
  Modal,
  TouchableOpacity,
  FlatList,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

const { height } = Dimensions.get('window');

export interface NotificationItem {
  id: string;
  message: string;
  roomName: string;
  time: string;
  type: 'phone' | 'sleep';
}

interface NotificationModalProps {
  visible: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
}

export function NotificationModal({ visible, onClose, notifications }: NotificationModalProps) {
  const renderItem = ({ item }: { item: NotificationItem }) => (
    <View style={styles.notificationItem}>
      <View style={[styles.iconContainer, { backgroundColor: item.type === 'phone' ? '#f59e0b20' : '#f43f5e20' }]}>
        <Ionicons 
          name={item.type === 'phone' ? 'phone-portrait-outline' : 'moon-outline'} 
          size={20} 
          color={item.type === 'phone' ? '#f59e0b' : '#f43f5e'} 
        />
      </View>
      <View style={styles.content}>
        <ThemedText style={styles.message}>{item.message}</ThemedText>
        <View style={styles.footer}>
          <ThemedText style={styles.roomName}>{item.roomName}</ThemedText>
          <ThemedText style={styles.time}>{item.time}</ThemedText>
        </View>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <ThemedView style={styles.modalContent}>
          <View style={styles.header}>
            <ThemedText type="defaultSemiBold" style={styles.title}>Cảnh báo hành vi cần chú ý</ThemedText>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#687076" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={notifications}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="notifications-off-outline" size={48} color="#ccc" />
                <ThemedText style={styles.emptyText}>Chưa có thông báo nào</ThemedText>
              </View>
            }
          />
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    height: height * 0.7,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,128,0.1)',
  },
  title: {
    fontSize: 18,
    flex: 1,
  },
  closeButton: {
    padding: 5,
  },
  listContent: {
    paddingBottom: 40,
  },
  notificationItem: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(128,128,128,0.05)',
    marginBottom: 12,
    alignItems: 'center',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  message: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roomName: {
    fontSize: 12,
    color: '#0a7ea4',
    fontWeight: '700',
    flex: 1,
  },
  time: {
    fontSize: 11,
    opacity: 0.5,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
  },
  emptyText: {
    marginTop: 10,
    opacity: 0.5,
  },
});
