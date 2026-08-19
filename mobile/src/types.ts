import type { User } from '@react-native-firebase/auth';

export type NativePhoto = {
  id: string;
  photoUrl?: string;
  thumbnailUrl?: string | null;
  timestamp?: string | { toDate?: () => Date } | null;
  senderId?: string | null;
  coupleId?: string | null;
  liked?: boolean;
  caption?: { type: 'text'; text: string } | null;
  localOnly?: boolean;
  localStatus?: 'pending' | 'uploading' | 'failed';
  localError?: string;
};

export type MobileUser = User;

export type UserProfile = {
  uid?: string;
  displayName?: string;
  email?: string;
  normalizedEmail?: string;
  profilePic?: string;
  photoURL?: string;
  coupleId?: string | null;
};

export type PairingRequest = {
  id: string;
  senderId?: string;
  recipientId?: string;
  status?: string;
  sender?: UserProfile;
  recipient?: UserProfile;
};
