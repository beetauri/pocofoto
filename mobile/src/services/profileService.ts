import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { doc, updateDoc } from '@react-native-firebase/firestore';
import { deleteObject, getDownloadURL, listAll, putFile, ref } from '@react-native-firebase/storage';
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
  // Best-effort prune of older profile-* uploads so repeated changes don't leak Storage objects.
  await pruneOldProfilePhotos(userId, storageRef.fullPath).catch(() => undefined);
  return profilePic;
}

export async function removeProfilePhoto(userId: string, fallbackProfilePic: string) {
  // Best-effort: delete stored profile-* files (ignore missing); Firestore stays authoritative.
  await pruneOldProfilePhotos(userId, null).catch(() => undefined);
  await updateDoc(doc(firestoreClient, 'users', userId), {
    profilePic: fallbackProfilePic,
    updatedAt: new Date().toISOString()
  });
}

async function pruneOldProfilePhotos(userId: string, keepFullPath: string | null) {
  const directoryRef = ref(storageClient, `users/${userId}`);
  const listing = await listAll(directoryRef);
  await Promise.all(
    listing.items
      .filter((item) => item.name.startsWith('profile-') && item.fullPath !== keepFullPath)
      .map((item) => deleteObject(item).catch(() => undefined))
  );
}
