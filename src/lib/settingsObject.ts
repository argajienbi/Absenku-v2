import { useState, useEffect } from "react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";

export interface SystemSettings {
  geofenceEnabled: boolean;
  officeLat: number;
  officeLng: number;
  radiusMeters: number;
  shiftStart: string; // HH:mm format
  shiftEnd: string; // HH:mm format
  appName?: string;
  appLogoUrl?: string;
}

export function useSettings() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "settings", "global"),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as SystemSettings;
          setSettings({
            ...data,
            shiftStart: data.shiftStart || "09:00",
            shiftEnd: data.shiftEnd || "17:00",
            appName: data.appName || "ABSENKU",
            appLogoUrl: data.appLogoUrl || ""
          });
        } else {
           // Provide safe defaults if no settings are configured yet
           setSettings({
             geofenceEnabled: false,
             officeLat: -6.2088,
             officeLng: 106.8456,
             radiusMeters: 100,
             shiftStart: "09:00",
             shiftEnd: "17:00",
             appName: "ABSENKU",
             appLogoUrl: ""
           });
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "settings/global");
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (settings?.appName) {
      document.title = settings.appName;
    }
  }, [settings?.appName]);

  return settings;
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // metres
  const φ1 = (lat1 * Math.PI) / 180; // φ, λ in radians
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const d = R * c; // in metres
  return d;
}
