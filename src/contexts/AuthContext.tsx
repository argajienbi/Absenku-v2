import React, { createContext, useContext, useEffect, useState } from "react";
import { User as FirebaseUser } from "firebase/auth";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { auth, db, handleFirestoreError, OperationType } from "../lib/firebase";

interface AppUser {
  uid: string;
  email: string;
  name: string;
  role: "superadmin" | "admin" | "staff" | "crew";
  avatarUrl?: string;
  rfid?: string;
  shiftId?: string;
  waNumber?: string;
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

  useEffect(() => {
    let unsubscribeSnap: (() => void) | null = null;

    const unsubscribeAuth = auth.onAuthStateChanged(async (fbUser) => {
      setFirebaseUser(fbUser);
      
      if (unsubscribeSnap) {
        unsubscribeSnap();
        unsubscribeSnap = null;
      }

      if (fbUser) {
        const userRef = doc(db, "users", fbUser.uid);
        
        unsubscribeSnap = onSnapshot(userRef, async (userSnap) => {
          if (userSnap.exists()) {
            setUser({ uid: fbUser.uid, ...userSnap.data() } as AppUser);
            setLoading(false);
          } else {
            // Create new user if doesn't exist
            const newUserData = {
              email: fbUser.email || "",
              name: fbUser.displayName || fbUser.email?.split("@")[0] || "User",
              role: fbUser.email === "armin.gandi@gmail.com" ? "superadmin" : "staff",
              createdAt: Date.now(),
              avatarUrl: fbUser.photoURL || "",
              shiftId: "shift1", // Default shift
            };
            await setDoc(userRef, newUserData);
            // onSnapshot will trigger again for the selection above
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, "users");
          setLoading(false);
        });
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnap) unsubscribeSnap();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, refreshUser: async () => {} }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
