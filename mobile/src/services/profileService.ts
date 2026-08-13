import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { doc, updateDoc } from '@react-native-firebase/firestore';
import { getDownloadURL, putFile, ref } from '@react-native-firebase/storage';
import { updateProfile, type User } from '@react-native-firebase/auth';
import { firestoreClient, storageClient } from './firebase';

export async function updateDisplayName(user: User, displayName: string) {
  await updateDoc(doc(firestoreClient, 'users', user.uid), {
    displayName,
    updatedAt: new Date().toISOString()
  });
  await updateProfile(user, { displayName });
}

export async function uploadProfilePhoto(userId: string, uri: string) {
  const compressed = await manipulateAsync(uri, [{ resize: { width: 512 } }], {
    compress: 0.88,
    format: SaveFormat.JPEG
  });
  const storageRef = ref(storageClient, `users/${userId}/profile-${Date.now()}.jpg`);
  await putFile(storageRef, compressed.uri, { contentType: 'image/jpeg' });
  const profilePic = await getDownloadURL(storageRef);
  await updateDoc(doc(firestoreClient, 'users', userId), {
    profilePic,
    updatedAt: new Date().toISOString()
  });
  return profilePic;
}

export async function removeProfilePhoto(userId: string, fallbackProfilePic: string) {
  await updateDoc(doc(firestoreClient, 'users', userId), {
    profilePic: fallbackProfilePic,
    updatedAt: new Date().toISOString()
  });
}
