import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useSettings, calculateDistance } from "../lib/settingsObject";
import { collection, query, where, onSnapshot, doc, setDoc } from "firebase/firestore";
import { auth, db, handleFirestoreError, OperationType } from "../lib/firebase";
import { sendPasswordResetEmail } from "firebase/auth";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { format, isSameDay, isWeekend } from "date-fns";
import { id } from "date-fns/locale";
import Webcam from "react-webcam";
import { Html5Qrcode } from "html5-qrcode";
import { useTheme } from "next-themes";
import { SHIFTS } from "../constants";
import { verifyFace } from "../lib/faceVerification";
import * as faceapi from "face-api.js";
import { QRCodeCanvas } from "qrcode.react";
import { toPng, toBlob } from "html-to-image";
import {
  MapPin, LogOut, Code, UserSquare2, Fingerprint, CalendarDays,
  Home, User, Settings as SettingsIcon, Sun, Moon, Briefcase, ArrowLeft,
  Share2, Download, Check, AlertCircle, Activity, ChevronRight, Printer, Camera, Key, Phone, Edit, IdCard
} from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Calendar } from "../components/ui/calendar";

export default function UserApp() {
  const { user } = useAuth();
  const settings = useSettings();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  const [currentTime, setCurrentTime] = useState(new Date());
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [isWithinRadius, setIsWithinRadius] = useState(false);
  const [locationError, setLocationError] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"home" | "absen" | "history" | "profile" | "izin_menu">("home");
  const [profileTab, setProfileTab] = useState<"menu" | "edit-profile" | "id-card">("menu");
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editFaceBase64, setEditFaceBase64] = useState<string | null>(null);
  const [showFaceUpdateCam, setShowFaceUpdateCam] = useState(false);
  const editWebcamRef = useRef<Webcam>(null);
  const [isEditSaving, setIsEditSaving] = useState(false);

  const [isFaceDetected, setIsFaceDetected] = useState(false);
  const [isModelsLoaded, setIsModelsLoaded] = useState(false);
  const [autoCaptureActive, setAutoCaptureActive] = useState(false);
  const [confirmData, setConfirmData] = useState<{ method: "selfie" | "qr" | "rfid"; photoBase64: string | null; extraData?: string } | null>(null);
  
  // Home states
  const [type, setType] = useState<"in" | "out" | "overtime_in" | "overtime_out" | "sick" | "permit" | "cuti" | "melahirkan" | "meninggal">("in");
  const [activeAbsenTab, setActiveAbsenTab] = useState("selfie");
  const webcamRef = useRef<Webcam>(null);
  const idCardRef = useRef<HTMLDivElement>(null);
  const [rfidInput, setRfidInput] = useState("");

  // History states
  const [myHistory, setMyHistory] = useState<any[]>([]);

  const getStatusForDate = React.useCallback((date: Date) => {
    const isToday = isSameDay(date, new Date());
    const isFuture = date > new Date() && !isToday;
    
    // User shift settings
    const shiftId = user?.shiftId as keyof typeof SHIFTS || "shift1";
    const shiftConfig = SHIFTS[shiftId] || SHIFTS.shift1;
    const dayOfWeek = date.getDay();
    const dayShift = shiftConfig.workDays[dayOfWeek as keyof typeof shiftConfig.workDays];
    const isOffDay = !dayShift;

    if (isFuture) return null;

    const dayLogs = myHistory.filter(log => isSameDay(new Date(log.timestamp), date));
    
    const sickLog = dayLogs.find(l => l.type === 'sick');
    if (sickLog) return 'sick';
    const permitLog = dayLogs.find(l => ['permit', 'cuti', 'melahirkan', 'meninggal'].includes(l.type));
    if (permitLog) return 'permit'; 

    const inLogs = dayLogs.filter(l => l.type === 'in');
    const outLogs = dayLogs.filter(l => l.type === 'out');

    if (inLogs.length === 0 && outLogs.length === 0) {
        if (!isOffDay && !isToday) return 'alpa'; 
        return null;
    }

    if (inLogs.length > 0) {
        const sortedIn = [...inLogs].sort((a,b) => a.timestamp - b.timestamp);
        const firstInLog = sortedIn[0];
        
        let isLate = false;
        if (firstInLog.status === 'pending_approval' || firstInLog.status === 'rejected') {
          isLate = true; 
        } else if (!firstInLog.status || firstInLog.status === 'approved') {
          const firstInDate = new Date(firstInLog.timestamp);
          const shiftStartStr = dayShift?.start || settings?.shiftStart || "09:00";
          const [startHour, startMin] = shiftStartStr.split(':').map(Number);
          isLate = (firstInDate.getHours() > startHour) || (firstInDate.getHours() === startHour && firstInDate.getMinutes() > startMin);
        }

        if (outLogs.length === 0 && !isToday && !isOffDay) {
            return 'lupa_pulang';
        }

        if (isLate) return 'telat';
        return 'hadir'; 
    }

    return null;
  }, [myHistory, settings, user]);

  const pendingCount = myHistory.filter(log => log.status === 'pending_approval').length;

  const summary = React.useMemo(() => {
     let telatCount = 0;
     let ijinCount = 0;
     let alpaCount = 0;
     let lemburHours = 0;
     
     const now = new Date();
     for (let i = 1; i <= now.getDate(); i++) {
        const date = new Date(now.getFullYear(), now.getMonth(), i);
        const status = getStatusForDate(date);
        
        if (status === 'telat') telatCount++;
        if (status === 'sick' || status === 'permit') ijinCount++;
        if (status === 'alpa') alpaCount++;
        
        const dayLogs = myHistory.filter(log => isSameDay(new Date(log.timestamp), date));
        const lemburIn = dayLogs.filter(l => l.type === 'overtime_in').sort((a,b) => a.timestamp - b.timestamp);
        const lemburOut = dayLogs.filter(l => l.type === 'overtime_out').sort((a,b) => b.timestamp - a.timestamp);
        
        if (lemburIn.length > 0 && lemburOut.length > 0) {
            const mSecs = lemburOut[0].timestamp - lemburIn[0].timestamp;
            if (mSecs > 0) {
               lemburHours += mSecs / (1000 * 60 * 60);
            }
        }
     }
     
     return { telatCount, ijinCount, alpaCount, lemburHours };
  }, [myHistory, getStatusForDate]);

  const todayStatusText = React.useMemo(() => {
    const todayLogs = myHistory.filter(log => isSameDay(new Date(log.timestamp), new Date()));
    if (todayLogs.length === 0) return "Belum Absen Hari Ini";
    
    const hasOut = todayLogs.some(log => log.type === 'out');
    if (hasOut) return "Sudah Absen Pulang";
    
    const hasLemburOut = todayLogs.some(log => log.type === 'overtime_out');
    if (hasLemburOut) return "Sudah Lembur Pulang";

    const hasLemburIn = todayLogs.some(log => log.type === 'overtime_in');
    if (hasLemburIn) return "Sedang Lembur Masuk";

    const hasIn = todayLogs.some(log => log.type === 'in');
    
    const sickOrPermit = todayLogs.find(log => ['sick', 'permit', 'cuti', 'melahirkan', 'meninggal'].includes(log.type));
    if (sickOrPermit) {
       if (sickOrPermit.type === 'sick') return "Status: Sakit";
       if (sickOrPermit.type === 'cuti') return "Status: Cuti";
       if (sickOrPermit.type === 'melahirkan') return "Status: Melahirkan";
       if (sickOrPermit.type === 'meninggal') return "Status: Berduka";
       return "Status: Izin";
    }

    if (hasIn) return "Sudah Absen Masuk";
    
    return "Sudah Absen";
  }, [myHistory]);

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour >= 5 && hour < 12) return "Selamat Pagi";
    if (hour >= 12 && hour < 15) return "Selamat Siang";
    if (hour >= 15 && hour < 18) return "Selamat Sore";
    return "Selamat Malam";
  };

  useEffect(() => {
    if (user && profileTab === 'edit-profile') {
      setEditName(user.name || "");
      setEditPhone(user.waNumber || "");
      setEditFaceBase64(null);
      setShowFaceUpdateCam(false);
    }
  }, [user, profileTab]);

  useEffect(() => {
    let timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "attendance"), where("userId", "==", user.uid));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a: any, b: any) => b.timestamp - a.timestamp);
      setMyHistory(data);
    }, (error) => {
      console.error("Error fetching personal history", error);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!settings) return;

    if (!settings.geofenceEnabled) {
      setIsWithinRadius(true);
      // We can still try to get the location, but it's not strictly required for within radius
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocationError(false);
          const { latitude, longitude } = position.coords;
          setLocation({ lat: latitude, lng: longitude });
          const dist = calculateDistance(latitude, longitude, settings.officeLat, settings.officeLng);
          setDistance(dist);
          if (settings.geofenceEnabled) {
             setIsWithinRadius(dist <= settings.radiusMeters);
          }
        },
        (err) => {
          console.error("Geolocation error:", err);
          setLocationError(true);
          if (settings.geofenceEnabled) {
            setIsWithinRadius(false);
          }
        },
        { enableHighAccuracy: true }
      );
    } else {
      setLocationError(true);
      if (settings.geofenceEnabled) {
         setIsWithinRadius(false);
      }
    }
  }, [settings]);

  useEffect(() => {
    let ht5Qrcode: Html5Qrcode | null = null;
    let isMounted = true;
    let timer: any;
    
    if (view === "absen" && activeAbsenTab === "qr") {
      const startScanner = async () => {
        try {
          ht5Qrcode = new Html5Qrcode("qr-reader");
          await ht5Qrcode.start(
            { facingMode: "environment" },
            {
               fps: 10,
               qrbox: { width: 250, height: 250 }
            },
            (decodedText) => {
               if (ht5Qrcode && ht5Qrcode.isScanning) {
                  ht5Qrcode.stop().then(() => {
                      ht5Qrcode?.clear();
                      if (isMounted) checkPendingAndStartAttendance("qr", decodedText);
                  }).catch(console.error);
               }
            },
            () => {} // ignore scan failures
          );
          
          // If component unmounted while starting camera
          if (!isMounted && ht5Qrcode && ht5Qrcode.isScanning) {
             ht5Qrcode.stop().then(() => ht5Qrcode?.clear()).catch(console.error);
          }
        } catch (e) {
          console.error("QR scanner start error: ", e);
        }
      };

      // Delay start to allow Webcam component to release the camera fully
      timer = setTimeout(() => {
        if (isMounted) {
          startScanner();
        }
      }, 500);

      return () => { 
        isMounted = false;
        clearTimeout(timer);
        if (ht5Qrcode && ht5Qrcode.isScanning) {
           ht5Qrcode.stop().then(() => {
              ht5Qrcode?.clear();
           }).catch(console.error);
        }
      };
    }
  }, [view, activeAbsenTab, type]);

  useEffect(() => {
    const loadModels = async () => {
      try {
        const MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        ]);
        setIsModelsLoaded(true);
      } catch (e) {
        console.error("Failed to load faceapi models", e);
      }
    };
    loadModels();
  }, []);

  useEffect(() => {
    let interval: any;
    if (view === "absen" && activeAbsenTab === "selfie" && isModelsLoaded && !loading) {
      interval = setInterval(async () => {
        if (webcamRef.current && webcamRef.current.video && webcamRef.current.video.readyState === 4) {
          const video = webcamRef.current.video;
          const detections = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions());
          
          const hasFace = !!detections;
          setIsFaceDetected(hasFace);
          
          if (hasFace && !autoCaptureActive && !loading) {
             // Auto-capture logic could go here if we want it ultra-responsive
             // For now, just visual feedback
          }
        }
      }, 500); // Check every 500ms
    } else {
      setIsFaceDetected(false);
    }
    return () => clearInterval(interval);
  }, [view, activeAbsenTab, isModelsLoaded, loading, autoCaptureActive]);

  const checkPendingAndStartAttendance = async (method: "selfie" | "qr" | "rfid", extraData?: string) => {
    if (!user) return;

    // Check for pending approval of the same type today
    const todayLogs = myHistory.filter(log => isSameDay(new Date(log.timestamp), new Date()));
    const hasPendingThisType = todayLogs.some(log => log.type === type && log.status === 'pending_approval');
    
    if (hasPendingThisType) {
      toast.error(`Anda masih memiliki absen ${type === 'in' ? 'masuk' : type === 'out' ? 'pulang' : type.replace('_', ' ')} yang menunggu persetujuan. Tidak bisa melakukan absen berulang.`);
      return;
    }
    
    const isDocumentCapture = ['sick', 'permit', 'cuti', 'melahirkan', 'meninggal'].includes(type);

    if (settings?.geofenceEnabled && !isWithinRadius && !isDocumentCapture) {
      toast.error("Anda berada di luar radius kantor!");
      return;
    }

    setLoading(true);
    let photoBase64 = null;
    try {
      if (method === "selfie") {
        photoBase64 = webcamRef.current?.getScreenshot();
        if (!photoBase64) {
          toast.error("Gagal mengambil foto. Pastikan kamera diizinkan dan siap digunakan.");
          setLoading(false);
          return;
        }
        
        if (!isDocumentCapture) {
          if (user.avatarUrl) {
            try {
               toast.info("Memverifikasi wajah...");
               const isSamePerson = await verifyFace(photoBase64, user.avatarUrl);
               if (!isSamePerson) {
                  toast.error("Verifikasi Wajah Gagal. Wajah tidak cocok dengan profil Anda.");
                  setLoading(false);
                  return;
               }
            } catch (e) {
               console.error("Verification failed", e);
               toast.error("Gagal verifikasi wajah, melanjutkan dengan absen biasa.");
            }
          } else {
             toast.error("Profil Anda tidak memiliki foto. Tidak dapat memverifikasi wajah.");
             setLoading(false);
             return;
          }
        }
      }

      setConfirmData({ method, photoBase64, extraData });
    } catch (error) {
       console.error("Error preparing attendance:", error);
       toast.error("Terjadi kesalahan saat memproses absensi.");
    } finally {
       setLoading(false);
    }
  };

  const submitAttendance = async () => {
    if (!user || !confirmData) return;
    
    setLoading(true);
    try {
      const now = new Date();
      let status = "approved"; // default OK
      
      const shiftId = user.shiftId as keyof typeof SHIFTS || "shift1";
      const shift = SHIFTS[shiftId];
      const todayWork = shift?.workDays[now.getDay() as keyof typeof shift.workDays];

      // Logic check for telat (late) / early leave based on shift
      if (type === "in" && todayWork) {
        const [startHour, startMin] = todayWork.start.split(':').map(Number);
        const isLate = (now.getHours() > startHour) || (now.getHours() === startHour && now.getMinutes() > startMin);
        if (isLate) {
          status = "pending_approval";
          toast.warning(`Anda terlambat untuk ${shift.name}. Absensi memerlukan approval.`);
        }
      } else if (type === "out" && todayWork) {
        const [endHour, endMin] = todayWork.end.split(':').map(Number);
        const isEarlyLeave = (now.getHours() < endHour) || (now.getHours() === endHour && now.getMinutes() < endMin);
        if (isEarlyLeave) {
          status = "pending_approval";
          toast.warning(`Anda pulang lebih awal dari jadwal ${shift.name}.`);
        }
      } else if (type === "overtime_in" || type === "overtime_out") {
        status = "pending_approval"; // Lembur perlu approval admin
      } else if (['sick', 'permit', 'cuti', 'melahirkan', 'meninggal'].includes(type)) {
        status = "pending_approval"; // Document captures selalu perlu approval admin
      }

      if (confirmData.method === "qr") {
        status = "pending_approval"; // QR code attendance always requires approval
      }

      const attendanceId = `att_${Date.now()}_${user.uid}`;
      await setDoc(doc(db, "attendance", attendanceId), {
        userId: user.uid,
        timestamp: Date.now(),
        type,
        method: confirmData.method,
        photoBase64: confirmData.photoBase64 || "",
        location: location || { lat: 0, lng: 0 },
        withinRadius: isWithinRadius,
        extraData: confirmData.extraData || "",
        status
      });

      const formatTypeRaw = (t: string) => {
        if (t === 'in') return 'Masuk';
        if (t === 'out') return 'Pulang';
        if (t === 'overtime_in') return 'Lembur Masuk';
        if (t === 'overtime_out') return 'Lembur Pulang';
        if (t === 'sick') return 'Sakit';
        if (t === 'permit') return 'Izin Biasa';
        if (t === 'cuti') return 'Cuti';
        if (t === 'melahirkan') return 'Cuti Melahirkan';
        if (t === 'meninggal') return 'Izin Berduka';
        return 'Lainnya';
      };

      toast.success(`Berhasil Absen ${formatTypeRaw(type)}${status === "pending_approval" ? " (Menunggu Approval Admin)" : ""}`);
      if (confirmData.method === 'rfid') setRfidInput("");
      setConfirmData(null);
      if (view === 'absen') setView('home');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `attendance`);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadIDCard = async () => {
    if (!idCardRef.current) return;
    try {
      const url = await toPng(idCardRef.current, { cacheBust: true, pixelRatio: 3 });
      const a = document.createElement("a");
      a.href = url;
      a.download = `IDCard_${user?.name?.replace(/\s+/g, '_') || 'Karyawan'}.png`;
      a.click();
    } catch (e) {
      console.error("Failed to download ID Card", e);
      toast.error("Gagal mengunduh kartu ID");
    }
  };

  const handleShareIDCard = async () => {
    if (!idCardRef.current) return;
    try {
      const blob = await toBlob(idCardRef.current, { cacheBust: true, pixelRatio: 3 });
      if (!blob) return;
      const file = new File([blob], `IDCard_${user?.name?.replace(/\s+/g, '_') || 'Karyawan'}.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `ID Card - ${user?.name}`,
          text: "Kartu QR Code Karyawan",
          files: [file]
        });
      } else {
         handleDownloadIDCard(); // fallback
      }
    } catch (e) {
      console.error("Failed to share ID Card", e);
      toast.error("Gagal membagikan kartu ID");
    }
  };

  const handlePrintIDCard = async () => {
    if (!idCardRef.current) return;
    toast.info("Menyiapkan dokumen cetak...");
    try {
      const url = await toPng(idCardRef.current, { cacheBust: true, pixelRatio: 3 });
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>Print ID Card - ${user?.name}</title>
              <style>
                @media print {
                  @page { margin: 0; size: auto; }
                  body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: white; }
                  img { max-height: 95vh; max-width: 95vw; border-radius: 20px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
                }
                body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f3f4f6; }
                img { max-height: 90vh; max-width: 90vw; border-radius: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); }
              </style>
            </head>
            <body>
              <img src="${url}" />
              <script>
                window.onload = () => {
                  setTimeout(() => {
                    window.print();
                    // Optional: window.close() after print if needed
                  }, 250);
                };
              </script>
            </body>
          </html>
        `);
        printWindow.document.close();
      } else {
         toast.error("Pop-up diblokir. Izinkan pop-up untuk mencetak.");
      }
    } catch (e) {
      console.error("Failed to print ID Card", e);
      toast.error("Gagal mencetak kartu ID");
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    if (!editName.trim()) {
      toast.error("Nama tidak boleh kosong");
      return;
    }
    
    setIsEditSaving(true);
    try {
      const updateData: any = {
        name: editName,
        waNumber: editPhone
      };
      
      if (editFaceBase64) {
         updateData.avatarUrl = editFaceBase64;
      }
      
      await setDoc(doc(db, "users", user.uid), updateData, { merge: true });
      toast.success("Profil berhasil diperbarui");
      setProfileTab("menu");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, "users");
    } finally {
      setIsEditSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!user || !user.email) {
      toast.error("Email tidak ditemukan");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, user.email);
      toast.success(`Tautan reset password telah dikirim ke ${user.email}`);
    } catch (error) {
      console.error("Reset password error", error);
      toast.error("Gagal mengirim tautan reset password");
    }
  };

  const captureEditFace = () => {
    if (editWebcamRef.current) {
      const src = editWebcamRef.current.getScreenshot();
      if (src) {
        setEditFaceBase64(src);
        setShowFaceUpdateCam(false);
      } else {
        toast.error("Gagal mengambil foto");
      }
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden font-sans relative">
      <div className="flex-1 overflow-y-auto pb-24 relative">
        {/* Header */}
        <div className="relative bg-teal-500 pb-20 pt-8 px-6 dark:bg-teal-800 shrink-0">
          <div className="absolute bottom-0 left-0 w-full overflow-hidden leading-none transform translate-y-[1px]">
            <svg viewBox="0 0 1440 320" className="w-full h-12 md:h-16" preserveAspectRatio="none">
              <path fill="currentColor" className="text-gray-50 dark:text-gray-900" d="M0,192L48,208C96,224,192,256,288,245.3C384,235,480,181,576,176C672,171,768,213,864,229.3C960,245,1056,235,1152,208C1248,181,1344,139,1392,117.3L1440,96L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
            </svg>
          </div>
          <div className="relative z-10 flex justify-between items-center text-white">
             <div>
                <p className="text-teal-100 dark:text-teal-200 text-xs uppercase tracking-wider font-semibold">{getGreeting()},</p>
                <h1 className="text-2xl font-bold tracking-tight mb-1.5">{user?.name}</h1>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 text-white text-[9px] uppercase font-bold tracking-wider shadow-sm">
                   <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${todayStatusText.includes('Belum') ? 'bg-rose-400' : 'bg-teal-300'}`}></div>
                   {todayStatusText}
                </div>
             </div>
             {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="avatar" className="w-12 h-12 rounded-full border-2 border-white object-cover shadow-sm bg-teal-600" />
             ) : (
                <div className="w-12 h-12 rounded-full bg-teal-600 border-2 border-white flex items-center justify-center font-bold shadow-sm">{user?.name?.[0]}</div>
             )}
          </div>
        </div>

        {/* Content Area overlapped */}
        <div className="relative z-20 px-4 -mt-12 space-y-6 max-w-lg mx-auto">
           {view === "home" && (
             <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                {pendingCount > 0 && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700/50 text-yellow-800 dark:text-yellow-400 px-4 py-3 rounded-2xl flex items-center justify-between shadow-sm animate-in fade-in">
                    <div className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-yellow-500 animate-pulse shrink-0 drop-shadow-sm"></div>
                      <span className="text-xs font-medium">Anda memiliki <b>{pendingCount} absen menuggu approval.</b></span>
                    </div>
                  </div>
                )}
                
                <Card className="bg-white dark:bg-gray-800 shadow-lg shadow-teal-500/5 dark:shadow-none rounded-2xl border-0 overflow-hidden text-center p-6">
                  <h2 className="text-4xl font-bold text-gray-800 dark:text-gray-100 tracking-tight leading-none mb-1">
                    {format(currentTime, "HH:mm:ss")}
                  </h2>
                  <p className="text-gray-500 dark:text-gray-400 font-medium text-sm mt-1">
                    {format(currentTime, "EEEE, dd MMMM yyyy", { locale: id })}
                  </p>
                  
                  {/* Shift Info */}
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 flex flex-col items-center">
                    {(() => {
                       const shiftId = user?.shiftId as keyof typeof SHIFTS || "shift1";
                       const shift = SHIFTS[shiftId];
                       const todayWork = shift?.workDays[currentTime.getDay() as keyof typeof shift.workDays];
                       
                       return (
                         <>
                           <div className="flex items-center gap-2 mb-1">
                             <span className="px-2 py-0.5 bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 text-[10px] font-black uppercase tracking-wider rounded-md">
                               {shift?.name || "Shift 1"}
                             </span>
                             <span className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Jadwal Hari Ini:</span>
                           </div>
                           <p className="text-lg font-black text-slate-800 dark:text-white-100">
                             {todayWork ? `${todayWork.start} - ${todayWork.end}` : "LIBUR"}
                           </p>
                         </>
                       )
                    })()}
                  </div>
                  
                  <div className="mt-6 flex flex-col items-center">
                    <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-700 px-4 py-2 rounded-full border border-gray-100 dark:border-gray-600">
                      <MapPin className={`w-4 h-4 ${(settings?.geofenceEnabled && !isWithinRadius) ? 'text-red-500' : 'text-teal-500'}`} />
                      <span className={`text-xs font-bold uppercase tracking-wider ${(settings?.geofenceEnabled && !isWithinRadius) ? 'text-red-500' : 'text-teal-600 dark:text-teal-400'}`}>
                        {!settings?.geofenceEnabled 
                          ? (location && distance !== null ? `Jarak: ${Math.round(distance)}m (Bebas)` : "Geofence Nonaktif")
                          : (locationError ? "Gagal Mendapatkan Lokasi" : (location ? (distance !== null ? `Jarak: ${Math.round(distance)}m` : "Menghitung...") : "Mencari lokasi..."))}
                      </span>
                    </div>
                  </div>
                </Card>

                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => { setType("in"); setView("absen"); }}
                    className="p-6 bg-teal-500 hover:bg-teal-600 dark:bg-teal-600 dark:hover:bg-teal-700 text-white rounded-2xl flex flex-col items-center justify-center font-bold shadow-lg transition-transform active:scale-95"
                  >
                    <Briefcase className="w-8 h-8 mb-2 opacity-80" />
                    <span className="text-sm">Absen Masuk</span>
                  </button>
                  <button 
                    onClick={() => { setType("out"); setView("absen"); }}
                    className="p-6 bg-purple-500 hover:bg-purple-600 dark:bg-purple-600 dark:hover:bg-purple-700 text-white rounded-2xl flex flex-col items-center justify-center font-bold shadow-lg transition-transform active:scale-95"
                  >
                    <LogOut className="w-8 h-8 mb-2 opacity-80" />
                    <span className="text-sm">Absen Pulang</span>
                  </button>
                  <button 
                    onClick={() => { setType("overtime_in"); setView("absen"); }}
                    className="p-6 bg-amber-500 hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-700 text-white rounded-2xl flex flex-col items-center justify-center font-bold shadow-lg transition-transform active:scale-95"
                  >
                    <Briefcase className="w-8 h-8 mb-2 opacity-80" />
                    <span className="text-sm">Lembur Masuk</span>
                  </button>
                  <button 
                    onClick={() => { setType("overtime_out"); setView("absen"); }}
                    className="p-6 bg-rose-500 hover:bg-rose-600 dark:bg-rose-600 dark:hover:bg-rose-700 text-white rounded-2xl flex flex-col items-center justify-center font-bold shadow-lg transition-transform active:scale-95"
                  >
                    <LogOut className="w-8 h-8 mb-2 opacity-80" />
                    <span className="text-sm">Lembur Pulang</span>
                  </button>
                  <button 
                    onClick={() => { setView("izin_menu"); }}
                    className="p-6 bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-2xl flex flex-col items-center justify-center font-bold shadow-lg transition-transform active:scale-95 col-span-2"
                  >
                    <CalendarDays className="w-8 h-8 mb-2 opacity-80" />
                    <span className="text-sm">Lapor Izin / Sakit / Cuti</span>
                  </button>
                </div>
             </div>
           )}

           {view === "izin_menu" && (
             <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex items-center mb-6 px-2">
                   <button onClick={() => setView('home')} className="p-2 -ml-2 rounded-full text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 dark:text-gray-300">
                      <ArrowLeft className="w-5 h-5" />
                   </button>
                   <h2 className="text-xl font-bold ml-2 dark:text-gray-100">Pilih Jenis Laporan</h2>
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                  <button 
                    onClick={() => { setType("sick"); setView("absen"); setActiveAbsenTab("selfie"); }}
                    className="p-5 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:border-teal-500 hover:bg-teal-50 dark:hover:bg-gray-700 rounded-2xl flex items-center justify-between font-bold shadow-sm transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center">
                        <UserSquare2 className="w-6 h-6" />
                      </div>
                      <div className="text-left">
                        <p className="text-gray-900 dark:text-gray-100 font-bold">Sakit</p>
                        <p className="text-xs text-gray-500 font-medium mt-0.5">Wajib lapirkan surat dokter</p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </button>

                  <button 
                    onClick={() => { setType("permit"); setView("absen"); setActiveAbsenTab("selfie"); }}
                    className="p-5 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:border-teal-500 hover:bg-teal-50 dark:hover:bg-gray-700 rounded-2xl flex items-center justify-between font-bold shadow-sm transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600 dark:text-cyan-400 rounded-xl flex items-center justify-center">
                        <CalendarDays className="w-6 h-6" />
                      </div>
                      <div className="text-left">
                        <p className="text-gray-900 dark:text-gray-100 font-bold">Izin Biasa</p>
                        <p className="text-xs text-gray-500 font-medium mt-0.5">Keperluan pribadi / mendesak</p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </button>

                  <button 
                    onClick={() => { setType("cuti"); setView("absen"); setActiveAbsenTab("selfie"); }}
                    className="p-5 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:border-teal-500 hover:bg-teal-50 dark:hover:bg-gray-700 rounded-2xl flex items-center justify-between font-bold shadow-sm transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center">
                        <CalendarDays className="w-6 h-6" />
                      </div>
                      <div className="text-left">
                        <p className="text-gray-900 dark:text-gray-100 font-bold">Cuti Tahunan</p>
                        <p className="text-xs text-gray-500 font-medium mt-0.5">Libur terencana tahunan</p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </button>

                  <button 
                    onClick={() => { setType("melahirkan"); setView("absen"); setActiveAbsenTab("selfie"); }}
                    className="p-5 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:border-teal-500 hover:bg-teal-50 dark:hover:bg-gray-700 rounded-2xl flex items-center justify-between font-bold shadow-sm transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-pink-100 dark:bg-pink-900/40 text-pink-600 dark:text-pink-400 rounded-xl flex items-center justify-center">
                        <UserSquare2 className="w-6 h-6" />
                      </div>
                      <div className="text-left">
                        <p className="text-gray-900 dark:text-gray-100 font-bold">Cuti Melahirkan</p>
                        <p className="text-xs text-gray-500 font-medium mt-0.5">Wajib lampirkan surat RS</p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </button>

                  <button 
                    onClick={() => { setType("meninggal"); setView("absen"); setActiveAbsenTab("selfie"); }}
                    className="p-5 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:border-teal-500 hover:bg-teal-50 dark:hover:bg-gray-700 rounded-2xl flex items-center justify-between font-bold shadow-sm transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl flex items-center justify-center">
                        <UserSquare2 className="w-6 h-6" />
                      </div>
                      <div className="text-left">
                        <p className="text-gray-900 dark:text-gray-100 font-bold">Izin Berduka / Meninggal</p>
                        <p className="text-xs text-gray-500 font-medium mt-0.5">Keluarga inti meninggal</p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </button>
                </div>
             </div>
           )}

           {view === "absen" && (
             <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex items-center mb-2 px-2">
                   <button onClick={() => setView('home')} className="p-2 -ml-2 rounded-full text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 dark:text-gray-300">
                      <ArrowLeft className="w-5 h-5" />
                   </button>
                   <h2 className="text-xl font-bold ml-2 dark:text-gray-100">
                      Proses Absen {type === 'in' ? 'Masuk' : type === 'out' ? 'Pulang' : type === 'overtime_in' ? 'Lembur Masuk' : type === 'overtime_out' ? 'Lembur Pulang' : type === 'sick' ? 'Sakit' : 'Izin'}
                   </h2>
                </div>

                <Card className="bg-white dark:bg-gray-800 shadow-md rounded-2xl border-0">
                  <CardContent className="p-4">
                    <Tabs value={activeAbsenTab} onValueChange={setActiveAbsenTab} className="w-full">
                      <TabsList className="grid w-full grid-cols-3 mb-6 bg-gray-50 dark:bg-gray-700/50 p-1 rounded-lg h-auto">
                        <TabsTrigger value="selfie" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-[9px] sm:text-[10px] font-semibold py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-600"><UserSquare2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span>Selfie</span></TabsTrigger>
                        <TabsTrigger value="qr" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-[9px] sm:text-[10px] font-semibold py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-600"><Code className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span>QR Scan</span></TabsTrigger>
                        <TabsTrigger value="rfid" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-[9px] sm:text-[10px] font-semibold py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-600"><Fingerprint className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span>RFID</span></TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="selfie" className="space-y-4">
                        <div className="aspect-square sm:aspect-video bg-gray-900 rounded-2xl overflow-hidden relative shadow-2xl border-4 border-white dark:border-gray-800">
                          {activeAbsenTab === 'selfie' && (
                            <Webcam
                              key={['sick', 'permit', 'cuti', 'melahirkan', 'meninggal'].includes(type) ? 'env' : 'user'}
                              audio={false}
                              ref={webcamRef}
                              screenshotFormat="image/jpeg"
                              className={`w-full h-full object-cover ${['sick', 'permit', 'cuti', 'melahirkan', 'meninggal'].includes(type) ? '' : 'scale-x-[-1]'}`}
                              videoConstraints={{ facingMode: ['sick', 'permit', 'cuti', 'melahirkan', 'meninggal'].includes(type) ? "environment" : "user" }}
                            />
                          )}
                          
                          {/* Face Guide Overlay */}
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            {['sick', 'permit', 'cuti', 'melahirkan', 'meninggal'].includes(type) ? (
                              <div className="w-64 h-80 sm:w-80 sm:h-96 rounded-xl border-4 transition-colors duration-300 border-teal-400 border-dashed bg-white/5 flex items-center justify-center relative shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                                 <div className="absolute bottom-6 left-0 right-0 text-center mx-auto w-[90%]">
                                     <p className="text-white text-[11px] font-bold drop-shadow-md bg-black/60 py-2 px-4 rounded-full inline-block">
                                        Posisikan dokumen dalam bingkai
                                     </p>
                                 </div>
                              </div>
                            ) : (
                              <div className={`w-64 h-64 sm:w-48 sm:h-48 rounded-full border-2 transition-colors duration-300 ${isFaceDetected ? 'border-teal-400 bg-teal-400/10' : 'border-white/30'} shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] flex items-center justify-center`}>
                               {isFaceDetected ? (
                                 <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="w-full h-full rounded-full border-4 border-teal-400 animate-ping opacity-30"></div>
                                    <div className="bg-teal-500 text-white p-2 rounded-full shadow-lg">
                                       <Check className="w-8 h-8" />
                                    </div>
                                 </div>
                               ) : (
                                 <div className="absolute inset-0 animate-[pulse_2s_infinite]">
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[105%] h-[105%] rounded-full border border-teal-400/30"></div>
                                 </div>
                               )}
                               
                               <div className={`text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full backdrop-blur-md transform translate-y-32 sm:translate-y-28 transition-all duration-300 ${isFaceDetected ? 'bg-teal-500 text-white' : 'bg-gray-900/60 text-white/70'}`}>
                                  {isFaceDetected ? "WAJAH TERDETEKSI" : "POSISIKAN WAJAH"}
                               </div>
                            </div>
                            )}
                            
                            {/* Scanning Line only when no face detected */}
                            {!isDocumentCapture && !isFaceDetected && (
                              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 sm:w-56 sm:h-56 pointer-events-none overflow-hidden rounded-full">
                                <div className="absolute left-0 w-full h-1 bg-gradient-to-r from-transparent via-teal-400 to-transparent shadow-[0_0_15px_rgba(45,212,191,0.5)] animate-[scan_3s_linear_infinite]" style={{ top: '-10%' }}></div>
                              </div>
                            )}
                          </div>
                        </div>

                        <style>{`
                          @keyframes scan {
                            0% { top: -10%; opacity: 0; }
                            10% { opacity: 1; }
                            90% { opacity: 1; }
                            100% { top: 110%; opacity: 0; }
                          }
                        `}</style>

                        <Button 
                          className={`w-full text-xs font-black uppercase tracking-[0.2em] h-12 shadow-xl rounded-2xl text-white transform active:scale-95 transition-all ${type === 'in' ? 'bg-teal-600 hover:bg-teal-700 shadow-teal-500/20' : type === 'overtime_in' ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-500/20' : type === 'overtime_out' ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/20' : type === 'sick' ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20' : type === 'permit' ? 'bg-cyan-600 hover:bg-cyan-700 shadow-cyan-500/20' : 'bg-purple-600 hover:bg-purple-700 shadow-purple-500/20'}`} 
                          onClick={() => checkPendingAndStartAttendance("selfie")} 
                          disabled={loading || (settings?.geofenceEnabled && !isWithinRadius && !['sick', 'permit', 'cuti', 'melahirkan', 'meninggal'].includes(type))}
                        >
                          {loading ? (
                            <span className="flex items-center gap-2">
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                              PROSES VERIFIKASI...
                            </span>
                          ) : (
                            <span className="flex items-center gap-2">
                              {['sick', 'permit', 'cuti', 'melahirkan', 'meninggal'].includes(type) ? <Check className="w-4 h-4" /> : isFaceDetected ? <Check className="w-4 h-4" /> : <UserSquare2 className="w-4 h-4" />}
                              {['sick', 'permit', 'cuti', 'melahirkan', 'meninggal'].includes(type) ? 'KIRIM DOKUMEN & LAPOR' : `ABSEN & ${type.includes('in') ? 'MASUK' : type.includes('out') ? 'PULANG' : 'LAPOR'}`}
                            </span>
                          )}
                        </Button>
                      </TabsContent>

                      <TabsContent value="qr" className="space-y-4">
                        <style>{`
                          @keyframes qr-scan {
                            0% { top: 0%; opacity: 0; }
                            10% { opacity: 1; }
                            90% { opacity: 1; }
                            100% { top: 100%; opacity: 0; }
                          }
                        `}</style>
                        <div className="relative w-full max-w-sm mx-auto rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 aspect-square flex flex-col items-center justify-center">
                          <div className="absolute inset-0 z-0 flex flex-col items-center justify-center gap-2 text-gray-400">
                             <Code className="w-10 h-10 animate-pulse" />
                             <span className="text-xs font-medium">Menyalakan kamera...</span>
                          </div>
                          
                          <div id="qr-reader" className="w-full h-full relative z-10 [&>video]:object-cover [&>video]:w-full [&>video]:h-full border-none"></div>
                          
                          <div className="absolute inset-8 border-2 border-teal-500/50 rounded-lg pointer-events-none z-20 overflow-hidden shadow-[inset_0_0_0_999px_rgba(0,0,0,0.3)]">
                            <div className="absolute left-0 w-full h-0.5 bg-teal-400 shadow-[0_0_8px_2px_rgba(45,212,191,0.7)]" style={{ animation: 'qr-scan 2.5s ease-in-out infinite' }}></div>
                          </div>
                        </div>
                        <p className="text-center text-xs text-gray-500 dark:text-gray-400">Posisikan QR Code persis di dalam kotak pindaian.</p>
                      </TabsContent>

                      <TabsContent value="rfid" className="space-y-4 py-8">
                        <div className="text-center space-y-4 max-w-[250px] mx-auto">
                          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Fingerprint className="w-8 h-8 text-gray-400 animate-pulse" />
                          </div>
                          <h3 className="font-medium text-gray-700 dark:text-gray-200 text-sm">Scan Kartu RFID Anda</h3>
                          <Input 
                            autoFocus 
                            type="password" 
                            placeholder="Tap kartu ke reader..." 
                            value={rfidInput}
                            className="text-center bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                            onChange={(e) => setRfidInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") checkPendingAndStartAttendance("rfid", rfidInput);
                            }}
                          />
                        </div>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
             </div>
           )}

           {view === "history" && (
             <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <h2 className="text-xl font-bold px-2 flex items-center gap-2 dark:text-gray-100">
                  <CalendarDays className="w-5 h-5 text-teal-600 dark:text-teal-400" /> Rekap Kehadiran
                </h2>
                
                <h2 className="text-xl font-bold px-2 flex items-center gap-2 dark:text-gray-100 mb-2 mt-4">
                  <CalendarDays className="w-5 h-5 text-teal-600 dark:text-teal-400" /> Ringkasan Bulan Ini
                </h2>
                <div className="grid grid-cols-4 gap-2 mb-4">
                   <div className="bg-yellow-50 dark:bg-yellow-900/40 p-3 rounded-2xl text-center flex flex-col items-center shadow-sm">
                      <span className="text-lg font-bold text-yellow-600 dark:text-yellow-400">{summary.telatCount}</span>
                      <span className="text-[9px] uppercase tracking-wider font-bold text-yellow-700/60 dark:text-yellow-500">Telat</span>
                   </div>
                   <div className="bg-blue-50 dark:bg-blue-900/40 p-3 rounded-2xl text-center flex flex-col items-center shadow-sm">
                      <span className="text-lg font-bold text-blue-600 dark:text-blue-400">{summary.ijinCount}</span>
                      <span className="text-[9px] uppercase tracking-wider font-bold text-blue-700/60 dark:text-blue-500">Ijin</span>
                   </div>
                   <div className="bg-red-50 dark:bg-red-900/40 p-3 rounded-2xl text-center flex flex-col items-center shadow-sm">
                      <span className="text-lg font-bold text-red-600 dark:text-red-400">{summary.alpaCount}</span>
                      <span className="text-[9px] uppercase tracking-wider font-bold text-red-700/60 dark:text-red-500">Alpa</span>
                   </div>
                   <div className="bg-amber-50 dark:bg-amber-900/40 p-3 rounded-2xl text-center flex flex-col items-center shadow-sm">
                      <span className="text-lg font-bold text-amber-600 dark:text-amber-400">{summary.lemburHours.toFixed(1)}</span>
                      <span className="text-[9px] uppercase tracking-wider font-bold text-amber-700/60 dark:text-amber-500">Jam Lmbr</span>
                   </div>
                </div>

                <Card className="bg-white dark:bg-gray-800 shadow-sm border-0 pt-2 pb-4">
                   <div className="flex justify-center">
                     <Calendar
                        mode="single"
                        locale={id}
                        defaultMonth={new Date()}
                        // selected removed so user doesn't get confused by the black square
                        className="p-3"
                        modifiers={{
                           hadir: (day) => getStatusForDate(day) === 'hadir',
                           telat: (day) => getStatusForDate(day) === 'telat',
                           lupa_pulang: (day) => getStatusForDate(day) === 'lupa_pulang',
                           alpa: (day) => getStatusForDate(day) === 'alpa',
                           sick: (day) => getStatusForDate(day) === 'sick',
                           permit: (day) => getStatusForDate(day) === 'permit'
                        }}
                        modifiersClassNames={{
                           hadir: "after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:bg-teal-500 after:rounded-full",
                           telat: "after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:bg-yellow-500 after:rounded-full",
                           lupa_pulang: "after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:bg-orange-500 after:rounded-full",
                           alpa: "after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:bg-red-500 after:rounded-full",
                           sick: "after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:bg-blue-500 after:rounded-full",
                           permit: "after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:bg-blue-300 after:rounded-full"
                        }}
                     />
                   </div>
                   
                   <div className="flex flex-wrap items-center justify-center gap-3 mt-4 text-[10px] uppercase font-bold text-gray-500 px-4">
                      <div className="flex gap-1.5 items-center"><span className="w-2 h-2 rounded-full bg-teal-500"></span> Tepat</div>
                      <div className="flex gap-1.5 items-center"><span className="w-2 h-2 rounded-full bg-yellow-500"></span> Telat</div>
                      <div className="flex gap-1.5 items-center"><span className="w-2 h-2 rounded-full bg-orange-500"></span> Tdk Pulang</div>
                      <div className="flex gap-1.5 items-center"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Sakit/Ijin</div>
                      <div className="flex gap-1.5 items-center"><span className="w-2 h-2 rounded-full bg-red-500"></span> Alpa</div>
                   </div>
                </Card>

                {myHistory.length === 0 ? (
                  <Card className="bg-white dark:bg-gray-800 shadow-sm border-0">
                    <CardContent className="p-8 text-center text-gray-500 dark:text-gray-400">
                       Belum ada riwayat absensi.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3 pb-8">
                    {myHistory.map((log) => (
                      <Card key={log.id} className="bg-white dark:bg-gray-800 border-0 shadow-sm rounded-xl overflow-hidden">
                        <div className="flex p-4 items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${log.type === 'in' ? 'bg-teal-50 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400' : log.type === 'overtime_in' ? 'bg-amber-50 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400' : log.type === 'overtime_out' ? 'bg-rose-50 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400' : ['sick', 'permit', 'cuti', 'melahirkan', 'meninggal'].includes(log.type) ? 'bg-cyan-50 dark:bg-cyan-900/40 text-cyan-600 dark:text-cyan-400' : 'bg-purple-50 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400'}`}>
                              {['sick', 'permit', 'cuti', 'melahirkan', 'meninggal'].includes(log.type) ? <UserSquare2 className="w-5 h-5"/> : (log.type === 'in' || log.type === 'overtime_in') ? <Briefcase className="w-5 h-5"/> : <LogOut className="w-5 h-5"/>}
                            </div>
                            <div>
                               <p className="font-bold text-gray-800 dark:text-gray-100 text-sm">
                                 {log.type === 'in' ? 'Masuk' : log.type === 'out' ? 'Pulang' : log.type === 'overtime_in' ? 'Lembur Msk' : log.type === 'overtime_out' ? 'Lembur Plg' : log.type === 'sick' ? 'Sakit' : log.type === 'permit' ? 'Izin Biasa' : log.type === 'cuti' ? 'Cuti' : log.type === 'melahirkan' ? 'Cuti Hamil' : log.type === 'meninggal' ? 'Berduka' : log.type}
                               </p>
                               <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5">{format(new Date(log.timestamp), "dd MMM yyyy")}</p>
                            </div>
                          </div>
                          <div className="text-right flex flex-col items-end">
                             <p className="text-lg font-bold text-gray-800 dark:text-gray-100 tracking-tight">{format(new Date(log.timestamp), "HH:mm")}</p>
                             <div className="flex items-center gap-1 mt-1">
                               {log.status === "pending_approval" && <span className="inline-block px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 text-[8px] uppercase font-bold">Pending</span>}
                               {log.status === "rejected" && <span className="inline-block px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[8px] uppercase font-bold">Ditolak</span>}
                               <span className="inline-block px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-[9px] uppercase font-bold text-gray-600 dark:text-gray-300">
                                  {log.method}
                               </span>
                             </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
             </div>
           )}

           {view === "profile" && (
             <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                {profileTab === "menu" && (
                  <>
                    <h2 className="text-xl font-bold px-2 dark:text-gray-100 flex items-center gap-2">
                      <User className="w-5 h-5 text-teal-600 dark:text-teal-400" /> Profil Saya
                    </h2>

                    <Card className="bg-white dark:bg-gray-800 border-0 shadow-sm rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-700/50">
                       <button 
                         onClick={() => setProfileTab('edit-profile')}
                         className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                       >
                         <div className="flex items-center gap-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
                            <div className="w-8 h-8 rounded-full bg-teal-50 dark:bg-teal-900/40 flex items-center justify-center text-teal-600 dark:text-teal-400">
                               <Edit className="w-4 h-4" />
                            </div>
                            Edit Profil & Wajah
                         </div>
                         <ChevronRight className="w-4 h-4 text-gray-400" />
                       </button>

                       <button 
                         onClick={() => setProfileTab('id-card')}
                         className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                       >
                         <div className="flex items-center gap-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
                            <div className="w-8 h-8 rounded-full bg-purple-50 dark:bg-purple-900/40 flex items-center justify-center text-purple-600 dark:text-purple-400">
                               <IdCard className="w-4 h-4" />
                            </div>
                            ID Card Karyawan
                         </div>
                         <ChevronRight className="w-4 h-4 text-gray-400" />
                       </button>
                    </Card>

                    <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-2 py-1 mt-4">Pengaturan</div>
                    <Card className="bg-white dark:bg-gray-800 border-0 shadow-sm rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-700/50">
                       <button 
                         onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                         className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                       >
                         <div className="flex items-center gap-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
                            <div className="w-8 h-8 rounded-full bg-amber-50 dark:bg-amber-900/40 flex items-center justify-center text-amber-600 dark:text-amber-400">
                               {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4 text-indigo-500" />}
                            </div>
                            {theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}
                         </div>
                       </button>

                       {(user?.role === 'admin' || user?.role === 'superadmin') && (
                         <button 
                           onClick={() => navigate('/dashboard')}
                           className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                         >
                           <div className="flex items-center gap-3 text-sm font-semibold text-teal-600 dark:text-teal-400">
                              <div className="w-8 h-8 rounded-full bg-teal-50 dark:bg-teal-900/40 flex items-center justify-center">
                                 <SettingsIcon className="w-4 h-4" />
                              </div>
                              Admin Dashboard
                           </div>
                         </button>
                       )}

                       <button 
                         onClick={() => auth.signOut()}
                         className="w-full flex items-center justify-between p-4 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                       >
                         <div className="flex items-center gap-3 text-sm font-semibold text-red-500">
                            <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center text-red-500">
                               <LogOut className="w-4 h-4" />
                            </div>
                            Keluar
                         </div>
                       </button>
                    </Card>
                  </>
                )}

                {profileTab === "id-card" && (
                  <div className="space-y-4 animate-in fade-in">
                    <div className="flex items-center mb-4 px-2">
                       <button onClick={() => setProfileTab('menu')} className="p-2 -ml-2 rounded-full text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 dark:text-gray-300">
                          <ArrowLeft className="w-5 h-5" />
                       </button>
                       <h2 className="text-xl font-bold ml-2 dark:text-gray-100">ID Card Karyawan</h2>
                    </div>

                    {/* Portrait Name Tag ID Card */}
                    <div className="relative mx-auto rounded-[2rem] overflow-hidden shadow-2xl bg-white w-full max-w-[320px] aspect-[1/1.5] border-2 border-slate-100" ref={idCardRef}>
                      {/* Tosca Abstract Wave Background */}
                      <div className="absolute inset-0 bg-gradient-to-b from-teal-50 to-white"></div>
                      <svg viewBox="0 0 1440 320" className="absolute top-0 left-0 w-full z-0 opacity-20 pointer-events-none text-teal-500" xmlns="http://www.w3.org/2000/svg">
                        <path fill="currentColor" d="M0,224L48,202.7C96,181,192,139,288,144C384,149,480,203,576,197.3C672,192,768,128,864,122.7C960,117,1056,171,1152,192C1248,213,1344,203,1392,197.3L1440,192L1440,0L1392,0C1344,0,1248,0,1152,0C1056,0,960,0,864,0C768,0,672,0,576,0C480,0,384,0,288,0C192,0,96,0,48,0L0,0Z"></path>
                      </svg>
                      <svg viewBox="0 0 1440 320" className="absolute bottom-0 left-0 w-full z-0 opacity-10 pointer-events-none text-teal-600 rotate-180" xmlns="http://www.w3.org/2000/svg">
                        <path fill="currentColor" d="M0,96L48,112C96,128,192,160,288,160C384,160,480,128,576,122.7C672,117,768,139,864,138.7C960,139,1056,117,1152,112C1248,107,1344,117,1392,122.7L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
                      </svg>

                      <div className="relative z-10 w-full h-full flex flex-col items-center p-6 text-center">
                         {/* Header Logo */}
                         <div className="mb-6 flex items-center justify-center gap-2 mt-4">
                           {settings?.appLogoUrl ? (
                              <img src={settings.appLogoUrl} alt="Logo" className="w-10 h-10 object-contain drop-shadow-sm" />
                           ) : (
                              <Activity className="w-10 h-10 text-teal-600 drop-shadow-md" />
                           )}
                           <span className="text-xl font-black text-teal-900 tracking-tighter uppercase">{settings?.appName || "ABSENKU"}</span>
                         </div>

                         {/* Photo */}
                         <div className="relative mb-6">
                            <div className="absolute inset-0 bg-teal-400 rounded-[2rem] blur-md opacity-30 transform translate-y-2"></div>
                            <div className="relative w-32 h-32 rounded-[2rem] bg-white border-4 border-white shadow-xl overflow-hidden flex items-center justify-center">
                               {user?.avatarUrl ? (
                                  <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                               ) : (
                                  <span className="font-black text-teal-300 text-6xl">{user?.name?.[0]}</span>
                               )}
                            </div>
                         </div>

                         {/* Info */}
                         <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight leading-none mb-2">{user?.name}</h2>
                         <p className="text-[12px] font-bold text-teal-600 uppercase tracking-[0.2em] mb-1">{user?.role}</p>
                         <div className="flex items-center justify-center gap-1.5 mb-8">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: user?.shiftId ? SHIFTS[user.shiftId as keyof typeof SHIFTS]?.color || '#94a3b8' : '#94a3b8' }}></div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                               {user?.shiftId ? SHIFTS[user.shiftId as keyof typeof SHIFTS]?.name || "CUSTOM" : "NO SHIFT"}
                            </p>
                         </div>

                         {/* QR Code footer */}
                         <div className="mt-auto bg-white p-2.5 rounded-2xl shadow-lg border-2 border-teal-50 flex flex-col items-center">
                            <QRCodeCanvas value={user?.uid || "unknown"} size={80} level="M" className="mb-2" />
                            <p className="text-[7px] font-black text-slate-300 uppercase tracking-[0.25em]">SCAN TO VERIFY</p>
                         </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2 pt-4 px-2">
                       <Button variant="outline" className="flex flex-col h-auto py-3 gap-1.5 rounded-2xl font-semibold border-teal-100 text-teal-700 bg-teal-50 hover:bg-teal-100 dark:bg-gray-800 dark:border-gray-700 dark:text-teal-400" onClick={handleShareIDCard}>
                          <Share2 className="w-5 h-5" /> <span className="text-[10px] uppercase tracking-wider">Bagikan</span>
                       </Button>
                       <Button variant="outline" className="flex flex-col h-auto py-3 gap-1.5 rounded-2xl font-semibold border-purple-100 text-purple-700 bg-purple-50 hover:bg-purple-100 dark:bg-gray-800 dark:border-gray-700 dark:text-purple-400" onClick={handleDownloadIDCard}>
                          <Download className="w-5 h-5" /> <span className="text-[10px] uppercase tracking-wider">Unduh</span>
                       </Button>
                       <Button variant="outline" className="flex flex-col h-auto py-3 gap-1.5 rounded-2xl font-semibold border-blue-100 text-blue-700 bg-blue-50 hover:bg-blue-100 dark:bg-gray-800 dark:border-gray-700 dark:text-blue-400" onClick={handlePrintIDCard}>
                          <Printer className="w-5 h-5" /> <span className="text-[10px] uppercase tracking-wider">Cetak</span>
                       </Button>
                    </div>
                  </div>
                )}

                {profileTab === "edit-profile" && (
                  <div className="space-y-6 animate-in fade-in">
                    <div className="flex items-center mb-2 px-2">
                       <button onClick={() => setProfileTab('menu')} className="p-2 -ml-2 rounded-full text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 dark:text-gray-300">
                          <ArrowLeft className="w-5 h-5" />
                       </button>
                       <h2 className="text-xl font-bold ml-2 dark:text-gray-100">Edit Profilku</h2>
                    </div>

                    <Card className="bg-white dark:bg-gray-800 border-0 shadow-sm rounded-2xl p-5 space-y-5">
                       {/* Face / Avatar Update */}
                       <div className="flex flex-col items-center">
                          {showFaceUpdateCam ? (
                            <div className="w-full flex flex-col items-center gap-3">
                               <div className="w-48 h-48 rounded-full overflow-hidden border-4 border-teal-500 relative">
                                  <Webcam
                                    audio={false}
                                    ref={editWebcamRef}
                                    screenshotFormat="image/jpeg"
                                    className="w-full h-full object-cover scale-x-[-1]"
                                    videoConstraints={{ facingMode: "user" }}
                                  />
                               </div>
                               <div className="flex gap-2 w-full">
                                  <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowFaceUpdateCam(false)}>Batal</Button>
                                  <Button className="flex-1 rounded-xl bg-teal-600 hover:bg-teal-700 text-white" onClick={captureEditFace}>Ambil Foto</Button>
                               </div>
                            </div>
                          ) : (
                            <div className="relative group cursor-pointer" onClick={() => setShowFaceUpdateCam(true)}>
                               <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white shadow-xl bg-teal-100 flex items-center justify-center">
                                  {editFaceBase64 ? (
                                    <img src={editFaceBase64} alt="New Avatar" className="w-full h-full object-cover" />
                                  ) : user?.avatarUrl ? (
                                    <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="font-black text-teal-400 text-3xl">{user?.name?.[0]}</span>
                                  )}
                               </div>
                               <div className="absolute bottom-0 right-0 w-8 h-8 bg-teal-500 text-white rounded-full flex items-center justify-center shadow-lg border-2 border-white pointer-events-none">
                                  <Camera className="w-4 h-4" />
                               </div>
                            </div>
                          )}
                          {!showFaceUpdateCam && <p className="text-xs text-gray-500 font-medium mt-3 text-center">Ketuk foto untuk memperbarui<br/>verifikasi wajah Anda.</p>}
                       </div>

                       <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                          <div className="space-y-1.5">
                             <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Nama Lengkap</label>
                             <Input 
                               value={editName}
                               onChange={(e) => setEditName(e.target.value)}
                               className="h-12 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-xl"
                               placeholder="Masukkan nama"
                             />
                          </div>

                          <div className="space-y-1.5">
                             <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1 flex items-center gap-1.5">
                                <Phone className="w-3.5 h-3.5" /> Nomor WhatsApp
                             </label>
                             <Input 
                               value={editPhone}
                               onChange={(e) => setEditPhone(e.target.value)}
                               className="h-12 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-xl"
                               placeholder="081234567890"
                               type="tel"
                             />
                          </div>
                          
                          <div className="pt-2">
                             <Button 
                               variant="outline" 
                               onClick={handleResetPassword}
                               className="w-full h-12 rounded-xl border-dashed border-orange-200 text-orange-600 hover:bg-orange-50 hover:text-orange-700 items-center justify-start gap-3 px-4 font-semibold"
                             >
                                <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                                   <Key className="w-3 h-3" />
                                </div>
                                Reset Password
                             </Button>
                             <p className="text-[10px] text-gray-400 mt-1.5 pl-1 leading-tight text-center">Tautan untuk membuat ulang password akan dikirimkan ke email <b>{user?.email}</b></p>
                          </div>
                       </div>

                       <Button 
                         className="w-full h-14 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm shadow-xl shadow-teal-500/20 mt-6"
                         onClick={handleSaveProfile}
                         disabled={isEditSaving}
                       >
                         {isEditSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
                       </Button>
                    </Card>
                  </div>
                )}
             </div>
           )}
        </div>
      </div>

      {confirmData && (
        <div className="absolute inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
           <Card className="w-full max-w-sm bg-white dark:bg-gray-800 shadow-2xl rounded-3xl overflow-hidden border-0 animate-in slide-in-from-bottom-8 zoom-in-95 duration-300">
              <div className="p-6 text-center">
                 <div className="w-16 h-16 bg-teal-100 dark:bg-teal-900/40 rounded-full flex items-center justify-center mx-auto mb-4 text-teal-600 dark:text-teal-400">
                    <UserSquare2 className="w-8 h-8" />
                 </div>
                 <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Konfirmasi Absen</h3>
                 <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 font-medium">Apakah Anda yakin ingin mengirim absen {type === 'in' ? 'Masuk' : type === 'out' ? 'Pulang' : type.replace('_', ' ')} ini ke server?</p>
                 
                 {confirmData.photoBase64 && (
                   <div className="mb-6 rounded-xl overflow-hidden border-2 border-gray-100 dark:border-gray-700 shadow-inner">
                      <img src={confirmData.photoBase64} alt="Captured Selfie" className="w-full h-auto" />
                   </div>
                 )}

                 <div className="flex gap-3">
                    <Button 
                      variant="outline" 
                      className="flex-1 rounded-xl h-12 text-sm font-bold bg-white dark:bg-gray-800"
                      onClick={() => setConfirmData(null)}
                      disabled={loading}
                    >
                      Batal
                    </Button>
                    <Button 
                      className="flex-1 rounded-xl h-12 text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white border-0 shadow-lg shadow-teal-500/30"
                      onClick={submitAttendance}
                      disabled={loading}
                    >
                      {loading ? 'Mengirim...' : 'Kirim Absen'}
                    </Button>
                 </div>
              </div>
           </Card>
        </div>
      )}

      {/* Bottom Navigation */}
      <div className="absolute bottom-0 left-0 w-full bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-800 flex justify-around py-2 px-2 z-50 pb-[env(safe-area-inset-bottom,0.5rem)] shadow-[0_-4px_15px_rgba(0,0,0,0.03)] dark:shadow-[0_-4px_15px_rgba(0,0,0,0.2)]">
        <button onClick={() => setView('home')} className={`flex flex-col flex-1 items-center gap-1.5 p-2 rounded-xl transition-colors ${view === 'home' ? 'text-teal-600 dark:text-teal-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}>
          <Home className="w-5 h-5" />
          <span className="text-[10px] font-bold tracking-wide">Home</span>
        </button>
        <button onClick={() => setView('history')} className={`flex flex-col flex-1 items-center gap-1.5 p-2 rounded-xl transition-colors ${view === 'history' ? 'text-teal-600 dark:text-teal-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}>
          <CalendarDays className="w-5 h-5" />
          <span className="text-[10px] font-bold tracking-wide">Riwayat</span>
        </button>
        <button onClick={() => { setView('profile'); setProfileTab('menu'); }} className={`flex flex-col flex-1 items-center gap-1.5 p-2 rounded-xl transition-colors ${view === 'profile' ? 'text-teal-600 dark:text-teal-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}>
          <User className="w-5 h-5" />
          <span className="text-[10px] font-bold tracking-wide">Profil</span>
        </button>
      </div>
    </div>
  );
}
