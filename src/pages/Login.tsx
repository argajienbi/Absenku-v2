import { useState, useEffect, useRef, useCallback } from "react";
import Webcam from "react-webcam";
import { auth, db, handleFirestoreError, OperationType } from "../lib/firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import { useSettings } from "../lib/settingsObject";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { LogIn, UserPlus, Fingerprint, Eye, EyeOff, Camera, RefreshCw } from "lucide-react";

export default function Login() {
  const { user } = useAuth();
  const settings = useSettings();
  const [view, setView] = useState<"splash" | "login" | "register">("splash");

  // Form states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState<"staff" | "crew">("staff");
  const [waNumber, setWaNumber] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  
  const webcamRef = useRef<Webcam>(null);
  
  const capturePhoto = useCallback(() => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        setAvatarUrl(imageSrc);
      }
    }
  }, [webcamRef]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setView("login");
    }, 2500); // 2.5s splash
    return () => clearTimeout(timer);
  }, []);

  if (user && view !== "splash") {
    if (["superadmin", "admin"].includes(user.role)) {
      return <Navigate to="/dashboard" />;
    }
    return <Navigate to="/app" />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Silakan isi email dan kata sandi");
      return;
    }
    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, email, password);
      // Wait context to navigate
    } catch (error: any) {
      toast.error(error.message || "Gagal masuk");
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !waNumber || !password || !confirmPassword) {
      toast.error("Silakan lengkapi semua data");
      return;
    }
    if (!avatarUrl) {
      toast.error("Silakan ambil foto wajah terlebih dahulu (Ketuk area gambar/kamera)");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Konfirmasi sandi tidak cocok");
      return;
    }
    try {
      setLoading(true);
      const res = await createUserWithEmailAndPassword(auth, email, password);
      const fbUser = res.user;

      // Save custom fields
      const userRef = doc(db, "users", fbUser.uid);
      const newUserData = {
        email: fbUser.email || email,
        name: name,
        role: role,
        waNumber: waNumber,
        createdAt: Date.now(),
        avatarUrl: avatarUrl,
      };
      await setDoc(userRef, newUserData);
      
      toast.success("Pendaftaran berhasil!");
      // Automatic navigation will occur provided by AuthContext
    } catch (error: any) {
      setLoading(false);
      
      if (error.code === 'auth/email-already-in-use') {
        toast.error("Email ini sudah terdaftar. Silakan gunakan email lain atau masuk.");
      } else {
        toast.error(error.message || "Gagal mendaftar");
      }

      if (!error.code?.startsWith('auth/')) {
        handleFirestoreError(error, OperationType.CREATE, "users");
      }
    }
  };

  if (view === "splash") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-teal-500 dark:bg-teal-900 transition-colors duration-500 overflow-hidden relative">
        <div className="absolute inset-0 z-0">
          <svg viewBox="0 0 1440 320" className="absolute bottom-0 w-full h-auto opacity-30 mix-blend-overlay" preserveAspectRatio="none">
              <path fill="currentColor" className="text-white" d="M0,192L48,208C96,224,192,256,288,245.3C384,235,480,181,576,176C672,171,768,213,864,229.3C960,245,1056,235,1152,208C1248,181,1344,139,1392,117.3L1440,96L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
          </svg>
        </div>
        <div className="z-10 animate-in fade-in zoom-in duration-1000 flex flex-col items-center space-y-4">
           {settings?.appLogoUrl ? (
             <img src={settings.appLogoUrl} alt="App Logo" className="w-24 h-24 object-contain drop-shadow-xl" />
           ) : (
             <div className="w-24 h-24 bg-white/20 backdrop-blur-md rounded-3xl flex items-center justify-center border-4 border-white shadow-xl">
               <Fingerprint className="w-12 h-12 text-white" />
             </div>
           )}
           <h1 className="text-4xl font-black text-white tracking-widest drop-shadow-md">{settings?.appName || "ABSENKU"}</h1>
           <p className="text-teal-100 font-medium tracking-widest uppercase text-xs">Employee Management</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-4 sm:p-8 animate-in fade-in duration-500 relative">
      <Card className="w-full max-w-sm sm:max-w-md bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl rounded-3xl border-0 shadow-2xl overflow-hidden p-0 relative z-10">
        
        {view === "login" ? (
          <div>
            <CardHeader className="text-center space-y-2 bg-slate-50 border-b border-slate-200 dark:bg-gray-800/50 dark:border-gray-700 pb-8 mb-6 pt-10">
              <CardTitle className="text-3xl font-black text-teal-600 dark:text-teal-400 tracking-tight flex items-center justify-center gap-3">
                 {settings?.appLogoUrl ? (
                   <img src={settings.appLogoUrl} alt="App Logo" className="w-8 h-8 object-contain" />
                 ) : (
                   <Fingerprint className="w-8 h-8" />
                 )}
                 {settings?.appName || "ABSENKU"}
              </CardTitle>
              <CardDescription className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-gray-400">Portal Akses Pegawai</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 px-8 pb-8">
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-xs font-bold text-slate-500 dark:text-gray-400 uppercase tracking-widest">Alamat Email</Label>
                  <Input id="email" type="email" required placeholder="nama@email.com" className="border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900 h-12 rounded-xl px-4" value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2 relative">
                  <Label htmlFor="password" className="text-xs font-bold text-slate-500 dark:text-gray-400 uppercase tracking-widest">Kata Sandi</Label>
                  <div className="relative">
                    <Input id="password" type={showPassword ? "text" : "password"} required placeholder="••••••••" className="border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900 h-12 rounded-xl px-4 pr-10" value={password} onChange={e => setPassword(e.target.value)} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-gray-500 dark:hover:text-gray-300">
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                
                <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600 h-12 rounded-xl text-sm font-bold text-white shadow-lg mt-2 transition-transform active:scale-95" disabled={loading}>
                  {loading ? <span className="animate-pulse">MEMPROSES...</span> : <><LogIn className="w-5 h-5 mr-2" /> MASUK</>}
                </Button>
              </form>
              
              <div className="relative pt-4 text-center">
                 <p className="text-xs text-slate-500 dark:text-gray-400 font-medium">Belum punya akun? <button onClick={() => setView("register")} className="font-bold text-teal-600 dark:text-teal-400 hover:underline">Daftar sekarang</button></p>
              </div>
            </CardContent>
          </div>
        ) : (
          <div>
            <CardHeader className="text-center space-y-1 bg-slate-50 border-b border-slate-200 dark:bg-gray-800/50 dark:border-gray-700 pb-6 mb-4 pt-8">
              <CardTitle className="text-2xl font-black text-teal-600 dark:text-teal-400 tracking-tight">
                 BUAT AKUN
              </CardTitle>
              <CardDescription className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-gray-400">Daftar sebagai pegawai baru</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-8 pb-8">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="flex flex-col items-center justify-center space-y-3 mb-2">
                   {!avatarUrl ? (
                      <div className="relative w-24 h-24 rounded-full overflow-hidden border-4 border-teal-100 dark:border-teal-900 bg-slate-100 dark:bg-gray-800 shadow-inner flex items-center justify-center cursor-pointer group" onClick={capturePhoto}>
                         <Webcam
                            audio={false}
                            ref={webcamRef}
                            screenshotFormat="image/jpeg"
                            screenshotQuality={0.7}
                            videoConstraints={{ facingMode: "user", width: 320, height: 320 }}
                            className="w-full h-full object-cover"
                         />
                         <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Camera className="w-6 h-6 text-white" />
                         </div>
                      </div>
                   ) : (
                      <div className="relative w-24 h-24 rounded-full overflow-hidden border-4 border-teal-500 shadow-md group">
                         <img src={avatarUrl} alt="Preview" className="w-full h-full object-cover" />
                         <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" onClick={() => setAvatarUrl("")}>
                            <RefreshCw className="w-6 h-6 text-white" />
                         </div>
                      </div>
                   )}
                   <div className="text-center">
                     <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{avatarUrl ? "Foto Berhasil Diambil" : "Klik untuk Ambil Foto Wajah"}</p>
                   </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reg-name" className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-widest">Nama Lengkap</Label>
                  <Input id="reg-name" type="text" required placeholder="John Doe" className="border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900 h-10 text-sm rounded-lg px-3" value={name} onChange={e => setName(e.target.value)} />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="reg-role" className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-widest">Jabatan</Label>
                    <select 
                      id="reg-role" 
                      className="flex h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:border-gray-700 dark:bg-gray-900 dark:ring-offset-gray-950 dark:focus-visible:ring-teal-400"
                      value={role} 
                      onChange={(e) => setRole(e.target.value as any)}
                    >
                      <option value="staff">Staff</option>
                      <option value="crew">Crew</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-wa" className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-widest">WhatsApp</Label>
                    <Input id="reg-wa" type="tel" required placeholder="0812..." className="border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900 h-10 text-sm rounded-lg px-3" value={waNumber} onChange={e => setWaNumber(e.target.value)} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reg-email" className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-widest">Email Aktif</Label>
                  <Input id="reg-email" type="email" required placeholder="nama@email.com" className="border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900 h-10 text-sm rounded-lg px-3" value={email} onChange={e => setEmail(e.target.value)} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2 relative">
                     <Label htmlFor="reg-pass" className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-widest">Sandi</Label>
                     <div className="relative">
                       <Input id="reg-pass" type={showPassword ? "text" : "password"} required className="border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900 h-10 text-sm rounded-lg px-3 pr-8" value={password} onChange={e => setPassword(e.target.value)} />
                       <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-gray-500 dark:hover:text-gray-300">
                         {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                       </button>
                     </div>
                   </div>
                   <div className="space-y-2 relative">
                     <Label htmlFor="reg-confirm" className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-widest">Konfirmasi Sandi</Label>
                     <div className="relative">
                       <Input id="reg-confirm" type={showPassword ? "text" : "password"} required className="border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900 h-10 text-sm rounded-lg px-3 pr-8" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                       <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-gray-500 dark:hover:text-gray-300">
                         {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                       </button>
                     </div>
                   </div>
                </div>
                
                <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600 h-12 rounded-xl text-sm font-bold text-white shadow-lg mt-4 transition-transform active:scale-95" disabled={loading}>
                  {loading ? <span className="animate-pulse">MEMPROSES...</span> : <><UserPlus className="w-5 h-5 mr-2" /> DAFTAR</>}
                </Button>
              </form>
              
              <div className="relative pt-4 text-center">
                 <p className="text-xs text-slate-500 dark:text-gray-400 font-medium">Sudah punya akun? <button onClick={() => setView("login")} className="font-bold text-teal-600 dark:text-teal-400 hover:underline">Masuk di sini</button></p>
              </div>
            </CardContent>
          </div>
        )}
      </Card>
      
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden mix-blend-multiply opacity-50 dark:mix-blend-lighten dark:opacity-20 transition-opacity">
         <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-teal-200 dark:bg-teal-900 blur-3xl opacity-50" />
         <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] rounded-full bg-blue-100 dark:bg-blue-900/50 blur-3xl opacity-50" />
      </div>
    </div>
  );
}

