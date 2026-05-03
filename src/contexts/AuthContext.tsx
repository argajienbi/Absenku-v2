import React, { createContext, useContext, useEffect, useState } from "react";
import { User as FirebaseUser } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db, handleFirestoreError, OperationType } from "../lib/firebase";

interface AppUser {
  uid: string;
  email: string;
  name: string;
  role: "superadmin" | "admin" | "staff" | "crew";
  avatarUrl?: string;
  rfid?: string;
}

interface AuthContextType {
  user: AppUser | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  firebaseUser: null,
  loading: true,
  refreshUser: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserDocument = async (fbUser: FirebaseUser) => {
    try {
      const userRef = doc(db, "users", fbUser.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        setUser({ uid: fbUser.uid, ...userSnap.data() } as AppUser);
      } else {
        // Create new user block
        const newUserData = {
          email: fbUser.email || "",
          name: fbUser.displayName || fbUser.email?.split("@")[0] || "User",
          role: fbUser.email === "armin.gandi@gmail.com" ? "superadmin" : "staff",
          createdAt: Date.now(),
          avatarUrl: fbUser.photoURL || "",
        };
        await setDoc(userRef, newUserData);
        setUser({ uid: fbUser.uid, ...newUserData } as AppUser);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, "users");
    }
  };

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        await fetchUserDocument(fbUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, refreshUser: async () => { if (firebaseUser) await fetchUserDocument(firebaseUser); } }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
